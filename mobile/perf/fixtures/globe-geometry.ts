/**
 * Reference geometry for the globe's tests and benches — none of it is drawn
 * by the app any more.
 *
 * The 110m land and border variants were computed in `components/globe/shared.ts`
 * at module load, on the JS thread, before the globe's first frame: a
 * Visvalingam pass over the whole topology and four meshes — ~100 ms on a
 * laptop's V8, several times that interpreted on a phone — for layers the
 * globe had stopped drawing when its geometry moved to the tiers in
 * `geography.ts`. The graticule and the polar circles are drawn in closed form
 * now (`sphere-circles.ts`); these are the d3 shapes they replaced, which the
 * cap-cull tests still use as awkward inputs (a meridian is a whole half great
 * circle, which no hemisphere-sized cap bounds).
 */

import countriesTopo from '@shared/data/countries-110m.json';
import { geoCircle } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { countries } from '../../components/globe/shared';
import {
  GRATICULE_CAP,
  GRATICULE_STEP,
  POLAR_CIRCLE_RADIUS,
} from '../../components/globe/sphere-circles';

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

const countriesData = countriesTopo as unknown as TopoWithObjects;
const countriesObj = countriesData.objects.countries;
const landObj = countriesData.objects.land;
if (!countriesObj || !landObj) throw new Error('missing topojson objects');

// One Visvalingam-Whyatt pass at weight 0.5: land 5127 → 2081 vertices,
// countries 10587 → 4079.
const simplifiedData = simplify(presimplify(countriesData), 0.5) as unknown as TopoWithObjects;
const landObjSimp = simplifiedData.objects.land;
const countriesObjSimp = simplifiedData.objects.countries;
if (!landObjSimp || !countriesObjSimp) throw new Error('missing simplified topojson objects');

/** The full 110m coastline. */
export const landFull = feature(countriesData, landObj);
/** Borders mesh of the full 110m topology. */
export const bordersMeshFull = mesh(countriesData, countriesObj, (a, b) => a !== b);
/** The 110m coastline after a 0.5-weight simplification. */
export const landSimplified = feature(simplifiedData, landObjSimp);
/** Borders mesh of the same simplified topology, sharing its arcs. */
export const bordersMeshSimplified = mesh(simplifiedData, countriesObjSimp, (a, b) => a !== b);
/** Antarctica and Greenland. */
export const iceSheets: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: countries.features.filter((f) => {
    const n = f.properties?.name;
    return n === 'Antarctica' || n === 'Greenland';
  }),
};

/** The grid as d3 drew it: meridians and parallels walked at 5°. */
export const GRATICULE_LINES: GeoJSON.MultiLineString = (() => {
  const walk = 5;
  const lines: [number, number][][] = [];
  for (let lng = -180; lng < 180; lng += GRATICULE_STEP) {
    const line: [number, number][] = [];
    for (let lat = -GRATICULE_CAP; lat <= GRATICULE_CAP; lat += walk) line.push([lng, lat]);
    lines.push(line);
  }
  for (let lat = -90 + GRATICULE_STEP; lat <= 90 - GRATICULE_STEP; lat += GRATICULE_STEP) {
    const line: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += walk) line.push([lng, lat]);
    lines.push(line);
  }
  return { type: 'MultiLineString', coordinates: lines };
})();
export const ARCTIC_CIRCLE = geoCircle().center([0, 90]).radius(POLAR_CIRCLE_RADIUS)();
export const ANTARCTIC_CIRCLE = geoCircle().center([0, -90]).radius(POLAR_CIRCLE_RADIUS)();
