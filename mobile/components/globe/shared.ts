import type { SkPath } from '@shopify/react-native-skia';
import { type GeoContext, geoArea } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countriesTopo from '../../data/countries-110m.json';
import worldTopo from '../../data/world-110m.json';

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

const world = worldTopo as unknown as TopoWithObjects;
const countriesData = countriesTopo as unknown as TopoWithObjects;

const landObj = world.objects.land;
const countriesObj = countriesData.objects.countries;
if (!landObj || !countriesObj) throw new Error('missing topojson objects');

export const land = feature(world, landObj);
export const countries = feature(
  countriesData,
  countriesObj,
) as unknown as GeoJSON.FeatureCollection;

// Internal borders only (shared edges between countries, no coastlines — land
// already shows those). Single MultiLineString = much faster to project than
// 180 separate country polygons.
export const bordersMesh = mesh(countriesData, countriesObj, (a, b) => a !== b);

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
