// Zoom-gated extras for MiniGlobe. The underlying 50m JSON is already bundled
// (LocationsBlock imports it), so this module has zero cold-start cost when
// MiniGlobe first mounts — the heavy centroid/midpoint precompute runs only
// on first access via `getLakeLabels()` / `getRiverLabels()`. Triggered
// from `callReproject` the first time `clipAngle < PLACES_APPEAR_CLIP`,
// so a reader who never zooms never pays the cost.

import { geoArea, geoCentroid } from 'd3-geo';
import { lakesHiRes, riversHiRes, SEAS } from '../blocks/locations-geo';

/** Label-ready named lake. `area` is the spherical area in steradians,
 *  kept so callers can filter to visually-significant lakes at globe
 *  scale (tiny lakes are invisible through a 110m coastline anyway). */
export interface LakeLabel {
  name: string;
  coords: [number, number];
  area: number;
}

/** Label-ready named river. `coords` is the midpoint of the longest
 *  constituent linestring — not the spherical centroid — because a
 *  winding river's centroid usually lands miles from the channel. */
export interface RiverLabel {
  name: string;
  coords: [number, number];
  rank: number;
}

let cachedLakes: LakeLabel[] | null = null;
let cachedRivers: RiverLabel[] | null = null;
let cachedMajorRiverFC: GeoJSON.FeatureCollection | null = null;

export function getLakeLabels(): LakeLabel[] {
  if (cachedLakes) return cachedLakes;
  // Dedupe by name for the same reason as rivers — some named lakes (Great
  // Salt Lake, Salton Sea) ship as multiple polygons. Keep the largest one
  // per name so labels are never stacked.
  const bestByName = new Map<string, LakeLabel>();
  for (const f of lakesHiRes.features) {
    const name = (f.properties as { name?: string } | undefined)?.name;
    if (!name) continue;
    try {
      const coords = geoCentroid(f) as [number, number];
      if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;
      const area = geoArea(f);
      const prev = bestByName.get(name);
      if (!prev || area > prev.area) {
        bestByName.set(name, { name, coords, area });
      }
    } catch {
      // Skip degenerate geometries silently — consistent with the rest of
      // the globe pipeline, which prefers missing data over a crash.
    }
  }
  cachedLakes = [...bestByName.values()];
  return cachedLakes;
}

export function getRiverLabels(): RiverLabel[] {
  if (cachedRivers) return cachedRivers;
  // Dedupe by name — NE ships long rivers (Volga, Nile, Amazon…) as multiple
  // LineString reaches, each with the same `name`. Without dedupe the globe
  // would render multiple "Volga" labels stacked along the river. Keep the
  // longest reach per name, label its midpoint.
  const bestByName = new Map<string, { rank: number; line: GeoJSON.Position[] }>();
  for (const f of riversHiRes.features) {
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
    out.push({ name, coords: [lng, lat], rank });
  }
  cachedRivers = out;
  return out;
}

/** GeoJSON FeatureCollection of the major rivers that get labels (rank
 *  ≤ 3), suitable for passing to d3-geo's `pg.context()(...)` so MiniGlobe
 *  can draw the lines on the globe itself when zoomed. Built lazily on
 *  first access so a reader who never zooms pays no cost. */
export function getMajorRiverFeatureCollection(): GeoJSON.FeatureCollection {
  if (cachedMajorRiverFC) return cachedMajorRiverFC;
  const features = riversHiRes.features.filter((f) => {
    const rank = (f.properties as { scalerank?: number } | undefined)?.scalerank;
    return typeof rank === 'number' && rank <= 3;
  });
  cachedMajorRiverFC = { type: 'FeatureCollection', features };
  return cachedMajorRiverFC;
}

export { SEAS };
