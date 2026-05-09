/**
 * Night-side city-light point set. Sourced from `shared/data/capitals-50m.json`
 * (Natural Earth admin-0 capitals, ~190 entries) so every populated nation
 * shows at least one light when its longitude rotates into shadow. Capitals
 * give global geographic coverage; population-weighted metro distribution
 * (e.g. NYC/Mumbai/São Paulo lighting up brighter than DC/Delhi/Brasília)
 * could come later from `ne_50m_populated_places_simple` if the visual
 * sparsity ever reads as artificial.
 *
 * Two flat typed arrays are baked at module load:
 *   • `CITY_LIGHT_COORDS`  — Float64 [lng, lat, lng, lat, …] for proj()
 *   • `CITY_LIGHT_UNITS`   — Float32 [x, y, z, x, y, z, …] cartesian on the
 *     unit sphere, used both for camera-hemisphere culling (dot vs camera
 *     axis) and sun-overhead scoring (dot vs sun axis). Precomputing means
 *     the per-frame loop is two dot products per city plus an optional
 *     proj() call — no trig.
 *
 * The rendering side buckets each visible city into a deep-night vs civil-
 * twilight tier using the sun-overhead dot product:
 *   sunDot = unit · sunUnit
 *   sunDot >  0     → day side, skip
 *   sunDot ∈ (-0.10, 0]  → twilight tier (half-bright)
 *   sunDot ≤ -0.10  → deep-night tier (full-bright)
 * The 0.10 threshold corresponds to ~5.7° sun-depression — civil twilight,
 * the canonical "lights starting to come on" boundary.
 */

import capitals from '../../../shared/data/capitals-50m.json';

interface CapitalEntry {
  name: string;
  lat: number;
  lng: number;
}

const entries = Object.values(capitals as Record<string, CapitalEntry>);

const DEG2RAD = Math.PI / 180;

/** Number of city-light points. */
export const CITY_LIGHT_COUNT = entries.length;

/** Flat [lng, lat, lng, lat, …]. Indexed as `i*2`, `i*2+1`. */
export const CITY_LIGHT_COORDS = new Float64Array(CITY_LIGHT_COUNT * 2);

/** Flat unit-sphere cartesian [x, y, z, x, y, z, …]. Indexed as `i*3 .. +2`. */
export const CITY_LIGHT_UNITS = new Float32Array(CITY_LIGHT_COUNT * 3);

for (let i = 0; i < CITY_LIGHT_COUNT; i++) {
  const e = entries[i];
  if (!e) continue;
  CITY_LIGHT_COORDS[i * 2] = e.lng;
  CITY_LIGHT_COORDS[i * 2 + 1] = e.lat;
  const latR = e.lat * DEG2RAD;
  const lngR = e.lng * DEG2RAD;
  const cosLat = Math.cos(latR);
  CITY_LIGHT_UNITS[i * 3] = cosLat * Math.cos(lngR);
  CITY_LIGHT_UNITS[i * 3 + 1] = cosLat * Math.sin(lngR);
  CITY_LIGHT_UNITS[i * 3 + 2] = Math.sin(latR);
}

/** Sun-depression threshold dividing civil twilight from deep night.
 *  cos(90° + 5.7°) ≈ -0.10. Below this → deep-night tier. */
export const CITY_LIGHT_DEEP_NIGHT_DOT = -0.1;

/** Per-light circle radius in projected pixels. Tuned so the dots read as
 *  pinpricks rather than as marker glyphs at 1× ambient zoom — anything
 *  larger competes with the editorial story dot's silhouette. */
export const CITY_LIGHT_RADIUS = 0.9;
