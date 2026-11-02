// The five prayer lines, as GeoJSON for the map.
//
// The arithmetic is shared with the app's globe and lives in
// `shared/prayer.ts`, with the reasons it is built the way it is. What stays
// here is what a flat map needs and a globe does not: the cut at the
// antimeridian, and the features MapLibre draws.

// Type-only, so esbuild erases it — see the same note in `solar.ts`.
import type { Feature, MultiLineString, Position } from 'geojson'
import { type PrayerParams, prayerRuns, type Sample, UMM_AL_QURA } from '@shared/prayer'

export {
  /** @knipignore asserted in map-geo.test.js, which reaches it through the esbuild bundle. */
  asrAltitude,
  PRAYER_NOTE,
  PRAYERS,
  type PrayerId,
  prayerInstantAt,
  type PrayerParams,
  UMM_AL_QURA,
} from '@shared/prayer'

/**
 * Cut a run wherever it crosses the antimeridian, landing a vertex on each
 * edge.
 *
 * These curves are functions of latitude, so unlike the terminator ring they do
 * cross ±180 — and `renderWorldCopies` is off, so an uncut segment is not drawn
 * the short way round, it is drawn straight back across the entire map as a
 * horizontal bar. The interpolated vertices are what make the two halves meet
 * the frame instead of stopping a degree short of it.
 */
function splitAtAntimeridian(run: Sample[]): Position[][] {
  const parts: Position[][] = []
  let part: Position[] = [[run[0].lng, run[0].lat]]

  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]
    const b = run[i]
    const d = b.lng - a.lng
    if (Math.abs(d) <= 180) {
      part.push([b.lng, b.lat])
      continue
    }
    // Unwrap b onto a's side, find where the straight run meets the edge.
    const edgeA = d > 180 ? -180 : 180
    const unwrapped = d > 180 ? b.lng - 360 : b.lng + 360
    const t = (edgeA - a.lng) / (unwrapped - a.lng)
    const lat = a.lat + t * (b.lat - a.lat)
    part.push([edgeA, lat])
    parts.push(part)
    part = [[-edgeA, lat], [b.lng, b.lat]]
  }

  parts.push(part)
  return parts.filter((p) => p.length > 1)
}

/**
 * The five prayer lines for an instant.
 *
 * One feature per prayer, `MultiLineString` because a curve can be broken twice
 * over — once by the antimeridian and once by a pole where the prayer has no
 * time. `properties.id` is what `promoteId` hangs feature state off, so hover
 * addresses a whole prayer rather than a segment of one.
 */
export function prayerLines(at: Date, params: PrayerParams = UMM_AL_QURA): Feature<MultiLineString>[] {
  const out: Feature<MultiLineString>[] = []

  for (const prayer of prayerRuns(at, params)) {
    const coordinates = prayer.runs.flatMap(splitAtAntimeridian)
    if (!coordinates.length) continue
    out.push({
      type: 'Feature',
      properties: { id: prayer.id, name: prayer.name },
      geometry: { type: 'MultiLineString', coordinates },
    })
  }

  return out
}
