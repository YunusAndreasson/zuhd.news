// Zoom-gated extras for MiniGlobe. The underlying 50m JSON loads lazily via
// the getters in `../blocks/locations-geo`, so a reader who never zooms past
// `PLACES_APPEAR_CLIP` never pays the JSON.parse + topojson decode cost. The
// heavy centroid/midpoint precompute below runs once on first access via
// `getLakeLabels()` / `getRiverLabels()` / `getSeas()`.

import { geoArea, geoCentroid } from 'd3-geo';
import { getLakesHiRes, getRiversHiRes, getSeas as getSeasRaw } from '../blocks/locations-geo';

/** Cartesian unit vector on the unit sphere for a (lng, lat) pair. Shared
 *  with `shared.ts` in spirit but duplicated here to avoid a cross-module
 *  import cycle; all callers in this module are lazy so the duplication
 *  costs nothing at cold start. Standard lng/lat → (x, y, z) with Z at
 *  the north pole, so a hemisphere cull is `dot(unit, cameraUnit) > 0`. */
const DEG2RAD = Math.PI / 180;
function lngLatToUnit(lng: number, lat: number): [number, number, number] {
  const latR = lat * DEG2RAD;
  const lngR = lng * DEG2RAD;
  const cosLat = Math.cos(latR);
  return [cosLat * Math.cos(lngR), cosLat * Math.sin(lngR), Math.sin(latR)];
}

/** Label-ready named lake. `area` is the spherical area in steradians,
 *  kept so callers can filter to visually-significant lakes at globe
 *  scale (tiny lakes are invisible through a 110m coastline anyway).
 *  `unit` is the cartesian unit vector of `coords` so per-frame hemisphere
 *  culls can use a dot product instead of geoDistance haversine. */
export interface LakeLabel {
  name: string;
  coords: [number, number];
  unit: [number, number, number];
  area: number;
}

/** Label-ready named river. `coords` is the midpoint of the longest
 *  constituent linestring — not the spherical centroid — because a
 *  winding river's centroid usually lands miles from the channel.
 *  `unit` mirrors LakeLabel — enables cartesian hemisphere cull. */
export interface RiverLabel {
  name: string;
  coords: [number, number];
  unit: [number, number, number];
  rank: number;
}

/** Label-ready sea / bay / gulf. Shape matches the raw JSON plus a
 *  precomputed cartesian unit vector. */
export interface SeaLabel {
  name: string;
  lng: number;
  lat: number;
  rank: number;
  unit: [number, number, number];
}

let cachedLakes: LakeLabel[] | null = null;
let cachedRivers: RiverLabel[] | null = null;
const cachedMajorRiverFC = new Map<number, GeoJSON.FeatureCollection>();
let cachedLakeFill: GeoJSON.FeatureCollection | null = null;

/**
 * The smallest lake filled on the ground, in steradians (about 1,300 km²).
 *
 * The 110m coastline has no inland water at all, so Lake Chad, Lake Victoria
 * and Lake Eyre were land. Set just under Lake Chad, the smallest lake a reader
 * following Sahel news would expect to see. That keeps the great African,
 * Andean and Australian lakes and drops the reservoirs and ponds a planet-scale
 * view cannot resolve.
 */
export const LAKE_FILL_MIN_AREA = 3e-5;

/** A lake Natural Earth splits into halves, named as the whole lake. */
const LAKE_PART = / (North|South)$/;

export function getLakeLabels(): LakeLabel[] {
  if (cachedLakes) return cachedLakes;
  // Dedupe by name for the same reason as rivers — some named lakes (Great
  // Salt Lake, Salton Sea) ship as multiple polygons. The label sits on the
  // largest polygon, and the area is the whole lake's, so a lake Natural Earth
  // halves ("Lake Eyre North" and "Lake Eyre South") is one "Lake Eyre" that
  // clears the size floor, where each half alone fell under it and the lake
  // was never named.
  const bestByName = new Map<string, LakeLabel & { largest: number }>();
  for (const f of getLakesHiRes().features) {
    const raw = (f.properties as { name?: string } | undefined)?.name;
    if (!raw) continue;
    const name = raw.replace(LAKE_PART, '');
    try {
      const coords = geoCentroid(f) as [number, number];
      if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;
      const area = geoArea(f);
      const prev = bestByName.get(name);
      if (!prev) {
        bestByName.set(name, {
          name,
          coords,
          unit: lngLatToUnit(coords[0], coords[1]),
          area,
          largest: area,
        });
      } else if (area > prev.largest) {
        bestByName.set(name, {
          name,
          coords,
          unit: lngLatToUnit(coords[0], coords[1]),
          area: prev.area + area,
          largest: area,
        });
      } else {
        prev.area += area;
      }
    } catch {
      // Skip degenerate geometries silently — consistent with the rest of
      // the globe pipeline, which prefers missing data over a crash.
    }
  }
  cachedLakes = [...bestByName.values()].map(({ name, coords, unit, area }) => ({
    name,
    coords,
    unit,
    area,
  }));
  return cachedLakes;
}

export function getRiverLabels(): RiverLabel[] {
  if (cachedRivers) return cachedRivers;
  // Dedupe by name — NE ships long rivers (Volga, Nile, Amazon…) as multiple
  // LineString reaches, each with the same `name`. Without dedupe the globe
  // would render multiple "Volga" labels stacked along the river. Keep the
  // longest reach per name, label its midpoint.
  const bestByName = new Map<string, { rank: number; line: GeoJSON.Position[] }>();
  for (const f of getRiversHiRes().features) {
    const props = f.properties as { name?: string; scalerank?: number } | undefined;
    const name = props?.name;
    const rank = props?.scalerank;
    // Rank ≤ 3 = major continental rivers (Amazon, Nile, Yangtze, Mississippi,
    // Volga, Danube, Ganges…). Anything finer adds label clutter without
    // editorial weight at globe scale.
    if (!name || typeof rank !== 'number' || rank > 3) continue;
    const geom = f.geometry;
    let longest: GeoJSON.Position[] = [];
    if (geom?.type === 'LineString') {
      longest = geom.coordinates;
    } else if (geom?.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        if (line.length > longest.length) longest = line;
      }
    }
    if (longest.length < 2) continue;
    const prev = bestByName.get(name);
    if (!prev || longest.length > prev.line.length) {
      bestByName.set(name, { rank, line: longest });
    }
  }
  const out: RiverLabel[] = [];
  for (const [name, { rank, line }] of bestByName) {
    const mid = line[Math.floor(line.length / 2)];
    if (!mid) continue;
    const lng = mid[0];
    const lat = mid[1];
    if (lng == null || lat == null) continue;
    out.push({ name, coords: [lng, lat], unit: lngLatToUnit(lng, lat), rank });
  }
  cachedRivers = out;
  return out;
}

/** GeoJSON FeatureCollection of the rivers at or under `maxRank`, suitable
 *  for passing to d3-geo's `pg.context()(...)` so MiniGlobe can draw the lines
 *  on the globe itself. Rank ≤ 3 when zoomed in; rank ≤ 2 (the Nile, the
 *  Niger, the Murray–Darling's trunk) at the resting framing. Built lazily per
 *  rank and cached. */
export function getMajorRiverFeatureCollection(maxRank = 3): GeoJSON.FeatureCollection {
  const cached = cachedMajorRiverFC.get(maxRank);
  if (cached) return cached;
  const features = getRiversHiRes().features.filter((f) => {
    const rank = (f.properties as { scalerank?: number } | undefined)?.scalerank;
    return typeof rank === 'number' && rank <= maxRank;
  });
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
  cachedMajorRiverFC.set(maxRank, fc);
  return fc;
}

/** The lakes filled on the ground (`LAKE_FILL_MIN_AREA`). Lazy and cached, so
 *  the 50m lake topology decodes on the first settled frame, not at launch. */
export function getLakeFillFeatureCollection(): GeoJSON.FeatureCollection {
  if (cachedLakeFill) return cachedLakeFill;
  const features = getLakesHiRes().features.filter((f) => {
    try {
      return geoArea(f) >= LAKE_FILL_MIN_AREA;
    } catch {
      return false;
    }
  });
  cachedLakeFill = { type: 'FeatureCollection', features };
  return cachedLakeFill;
}

/** Precomputed sea labels with unit vectors. The (54 × 4 trig ops) precompute
 *  runs once on first call and caches; the per-frame reproject loop in
 *  MiniGlobe then does a cheap dot product instead of calling geoDistance
 *  per sea. Lazy so the underlying 50m sea JSON only loads when zoom-detail
 *  actually fires. */
let _seas: SeaLabel[] | null = null;
export function getSeas(): SeaLabel[] {
  if (_seas) return _seas;
  _seas = getSeasRaw().map((s) => ({
    name: s.name,
    lng: s.lng,
    lat: s.lat,
    rank: s.rank,
    unit: lngLatToUnit(s.lng, s.lat),
  }));
  return _seas;
}
