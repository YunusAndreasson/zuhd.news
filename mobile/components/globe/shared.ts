import countriesTopo from '@shared/data/countries-110m.json';
import type { SkPathBuilder } from '@shopify/react-native-skia';
import { type GeoContext, geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countryMetrics from '../../assets/geo/country-metrics.json';
import type { ConicSink } from './sphere-circles';

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

// The 110m countries: point-in-country lookup, areas and label centroids.
// The globe draws its land, borders and highlight from the tiers in
// `geography.ts`; the 110m land and border meshes that used to be built here
// at module load are test and bench fixtures now (`perf/fixtures`).
const countriesData = countriesTopo as unknown as TopoWithObjects;

const countriesObj = countriesData.objects.countries;
if (!countriesObj) throw new Error('missing topojson objects');

export const countries = feature(
  countriesData,
  countriesObj,
) as unknown as GeoJSON.FeatureCollection;

// Precomputed bounding boxes for fast point-in-country pre-filtering.
// [minLng, minLat, maxLng, maxLat] per feature — avoids expensive
// geoContains polygon tests for points clearly outside.
export const countryBboxes: [number, number, number, number][] = countries.features.map((f) => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const walk = (coords: number[] | number[][] | number[][][] | number[][][][]) => {
    if (typeof coords[0] === 'number') {
      const lng = coords[0] as number;
      const lat = coords[1] as number;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) walk(c as number[] | number[][] | number[][][]);
    }
  };
  if (f.geometry) walk((f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
  return [minLng, minLat, maxLng, maxLat] as [number, number, number, number];
});

/** Centroid intended for label placement. Plain `geoCentroid` averages
 *  across every part of a MultiPolygon, so a country with far-flung
 *  territories (France's French Guiana, Norway's Svalbard, USA's Alaska
 *  + Hawaii, UK's overseas territories, Spain's Canaries, Portugal's
 *  Azores, Denmark's Greenland — though Greenland is its own feature
 *  here, …) lands its label off the mainland: France's full centroid
 *  resolves to [-6.8°, 43.1°] in the Bay of Biscay just above Spain's
 *  north coast, which projects on top of Spain at globe scale. Picking
 *  the largest polygon by spherical area keeps the label on the country's
 *  primary landmass where readers expect it. Singular-polygon features
 *  fall through to plain `geoCentroid`. */
export function countryLabelCentroid(f: GeoJSON.Feature): [number, number] {
  const g = f.geometry;
  if (g?.type !== 'MultiPolygon' || g.coordinates.length <= 1) {
    return geoCentroid(f) as [number, number];
  }
  let bestArea = -Infinity;
  let bestPoly: GeoJSON.Position[][] | null = null;
  for (const poly of g.coordinates) {
    if (!poly) continue;
    const a = geoArea({ type: 'Polygon', coordinates: poly });
    if (a > bestArea) {
      bestArea = a;
      bestPoly = poly;
    }
  }
  if (!bestPoly) return geoCentroid(f) as [number, number];
  return geoCentroid({ type: 'Polygon', coordinates: bestPoly }) as [number, number];
}

// Spherical area (steradians) and label centroid (lng, lat) per country. The
// area scales the country highlight so small nations stay visible; the
// centroid is `countryLabelCentroid`'s. Both are baked by
// `scripts/generate-country-metrics.mjs` — computed here at module load they
// were a `geoArea` over every ring of every country, plus one per part of
// each multi-part country, on the JS thread before the globe's first frame.
// A country the file does not carry is computed as before, and
// `__tests__/country-metrics.test.ts` holds the file to the computation.
const BAKED_METRICS = countryMetrics as unknown as Record<string, [number, number, number]>;
export const countryAreas: Record<string, number> = {};
export const countryCentroids: Record<string, [number, number]> = {};
for (const f of countries.features) {
  const name = f.properties?.name;
  if (!name) continue;
  const baked = BAKED_METRICS[name];
  if (baked) {
    countryAreas[name] = baked[0];
    countryCentroids[name] = [baked[1], baked[2]];
  } else {
    countryAreas[name] = geoArea(f);
    countryCentroids[name] = countryLabelCentroid(f);
  }
}

// Cartesian unit vector form of each centroid. Lets the per-frame hemisphere
// cull use a dot product against the camera axis (3 muls + 2 adds) instead
// of `geoDistance` haversine (~5 trig ops). Across 177 countries this moves
// ~900 trig calls per frame off the JS thread during zoomed scroll.
// Parallel array to centroid names so callers can iterate in index order.
//
// Iteration order is spherical-area DESC. The MiniGlobe label packer is
// greedy AABB sweep (first-pushed wins collisions), so iterating large-
// first means a busy cluster (Central Europe at 1×, the Levant at 2×)
// surfaces the geographically/visually-dominant member rather than the
// arbitrary topology winner. Free at module load, zero per-frame cost.
export const countryCentroidNames: string[] = [];
export const countryCentroidPoints: [number, number][] = [];
export const countryCentroidUnits: [number, number, number][] = [];
{
  const DEG2RAD = Math.PI / 180;
  const sortedNames = Object.keys(countryCentroids).sort(
    (a, b) => (countryAreas[b] ?? 0) - (countryAreas[a] ?? 0),
  );
  for (const name of sortedNames) {
    const c = countryCentroids[name];
    if (!c) continue;
    const latR = c[1] * DEG2RAD;
    const lngR = c[0] * DEG2RAD;
    const cosLat = Math.cos(latR);
    countryCentroidNames.push(name);
    countryCentroidPoints.push(c);
    countryCentroidUnits.push([cosLat * Math.cos(lngR), cosLat * Math.sin(lngR), Math.sin(latR)]);
  }
}

const RAD2DEG = 180 / Math.PI;

/** Skia path target bridged into d3-geo's `.context()` API. Extends GeoContext
 * so `pg.context(ctx)` accepts it without a cast; `setPath` retargets writes
 * to a different Skia path between draw calls. It is also the `ConicSink` the
 * closed-form circles in `sphere-circles.ts` draw through. */
export interface SkiaGeoContext extends GeoContext, ConicSink {
  setPath(p: SkPathBuilder): void;
}

type PathStep = (this: SkPathBuilder, x: number, y: number) => SkPathBuilder;
type PathConic = (
  this: SkPathBuilder,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
) => SkPathBuilder;

/**
 * Reading a method off a Skia object is itself a JSI call: the host object
 * copies the property name to UTF-8 and searches two maps for it before the
 * call it returns has run. It cost more than the call — 1.8 µs per `lineTo`
 * against 0.53 µs with the function held (20k calls, Hermes, emulator) — and
 * d3 streams one `lineTo` per projected point, ~4k a moving frame and ~30k a
 * settled one. So each builder's methods are read once, when it becomes the
 * target. They are bound to their builder natively but read `this` for their
 * return value, which is why they are invoked through `.call`.
 */
export function createSkiaPathContext(): SkiaGeoContext {
  let _path: SkPathBuilder | null = null;
  let _moveTo: PathStep | null = null;
  let _lineTo: PathStep | null = null;
  let _conicTo: PathConic | null = null;
  return {
    setPath(p: SkPathBuilder) {
      _path = p;
      _moveTo = p.moveTo;
      _lineTo = p.lineTo;
      _conicTo = p.conicTo;
    },
    beginPath() {},
    moveTo(x: number, y: number) {
      if (_path) _moveTo?.call(_path, x, y);
    },
    lineTo(x: number, y: number) {
      if (_path) _lineTo?.call(_path, x, y);
    },
    conicTo(x1: number, y1: number, x2: number, y2: number, w: number) {
      if (_path) _conicTo?.call(_path, x1, y1, x2, y2, w);
    },
    arc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
      _path?.addArc(
        { x: x - r, y: y - r, width: r * 2, height: r * 2 },
        startAngle * RAD2DEG,
        (endAngle - startAngle) * RAD2DEG,
      );
    },
    closePath() {
      _path?.close();
    },
    close() {
      _path?.close();
    },
  };
}
