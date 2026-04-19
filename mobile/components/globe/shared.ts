import type { SkPath } from '@shopify/react-native-skia';
import { type GeoContext, geoArea, geoCentroid } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countriesTopo from '../../data/countries-110m.json';

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

// IMPORTANT: land and countries share the SAME topology. Earlier versions
// loaded `land` from a separate `world-110m.json` (a more aggressively
// simplified union) and `countries` from `countries-110m.json` — the two
// used different arc sets, so the country polygons didn't perfectly align
// with the land silhouette at zoom. Taking both from the single
// `countries-110m.json` topology guarantees coastline + country borders
// reference the same arcs, so they overlap exactly.
const countriesData = countriesTopo as unknown as TopoWithObjects;

const landObj = countriesData.objects.land;
const countriesObj = countriesData.objects.countries;
if (!landObj || !countriesObj) throw new Error('missing topojson objects');

export const land = feature(countriesData, landObj);
export const countries = feature(
  countriesData,
  countriesObj,
) as unknown as GeoJSON.FeatureCollection;

// Internal borders only (shared edges between countries, no coastlines — land
// already shows those). Single MultiLineString = much faster to project than
// 180 separate country polygons.
export const bordersMesh = mesh(countriesData, countriesObj, (a, b) => a !== b);

// Permanent land-based ice sheets — Antarctica (~98% ice year-round) and
// Greenland (~80%). Rendered as a white fill over the land silhouette so
// the globe reads climatologically correct without a second basemap.
export const iceSheets: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: countries.features.filter((f) => {
    const n = f.properties?.name;
    return n === 'Antarctica' || n === 'Greenland';
  }),
};

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

// Precomputed spherical areas (steradians) per country.
// Used to scale country highlight opacity so small nations are more visible.
export const countryAreas: Record<string, number> = {};
for (const f of countries.features) {
  const name = f.properties?.name;
  if (name) countryAreas[name] = geoArea(f);
}

// Precomputed spherical centroids (lng, lat) per country. Used by MiniGlobe
// to project neighbour-country labels when zoomed past PLACES_APPEAR_CLIP.
// One-time cost at module load; keeps the per-frame projection of ~20-40
// visible labels below a millisecond.
export const countryCentroids: Record<string, [number, number]> = {};
for (const f of countries.features) {
  const name = f.properties?.name;
  if (name) countryCentroids[name] = geoCentroid(f) as [number, number];
}

const DEG = 180 / Math.PI;

/** Skia path target bridged into d3-geo's `.context()` API. Extends GeoContext
 * so `pg.context(ctx)` accepts it without a cast; `setPath` retargets writes
 * to a different Skia path between draw calls. */
export interface SkiaGeoContext extends GeoContext {
  setPath(p: SkPath): void;
}

export function createSkiaPathContext(): SkiaGeoContext {
  let _path: SkPath | null = null;
  return {
    setPath(p: SkPath) {
      _path = p;
    },
    beginPath() {},
    moveTo(x: number, y: number) {
      _path?.moveTo(x, y);
    },
    lineTo(x: number, y: number) {
      _path?.lineTo(x, y);
    },
    arc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
      _path?.addArc(
        { x: x - r, y: y - r, width: r * 2, height: r * 2 },
        startAngle * DEG,
        (endAngle - startAngle) * DEG,
      );
    },
    closePath() {
      _path?.close();
    },
  };
}
