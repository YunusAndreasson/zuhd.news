import { type PrayerId, prayerRuns } from '@shared/prayer';

import { SCREEN_POINT, unit } from './sphere-circles';

/**
 * The five prayer lines on the globe: where Fajr, Dhuhr, Asr, Maghrib and Isha
 * are entering now, by the method the web map draws (`@shared/prayer`). The
 * curves are solved in latitude and longitude once a minute, the way the sun
 * is (`getSunPosition`), thinned (`thin`) and kept as unit vectors,
 * so a frame only rotates and places them, as it does every other point.
 */
export type PrayerLine = {
  id: PrayerId;
  name: string;
  /** Each run as unit vectors, `x, y, z` per sample. */
  runs: Float64Array[];
};

const REFRESH_MS = 60_000;
/** How far a dropped sample may lie from the chord that replaces it, in
 *  radians of the sphere: a pixel with the planet 6,000 px across, past the
 *  deepest story framing. The shared walk steps a degree of latitude and
 *  refines toward the poles for a flat map, about 200 samples a line; where a
 *  line runs straight most of them add nothing on a sphere, and every one
 *  dropped is one less placement and `lineTo` a frame. Where it bends, near
 *  its polar ends, they stay. */
const TOLERANCE_RAD = 1 / 3000;

/** The run's samples as unit vectors, keeping only those a chord cannot
 *  replace within `TOLERANCE_RAD`. Greedy: a chord grows while every sample it
 *  skips stays within tolerance of its great circle. */
function thin(units: readonly (readonly [number, number, number])[]): Float64Array {
  const kept: number[] = [];
  const first = units[0];
  if (!first) return new Float64Array(0);
  kept.push(...first);
  let anchor = 0;
  let i = 2;
  while (i < units.length) {
    const a = units[anchor];
    const b = units[i];
    if (!a || !b) break;
    const nx = a[1] * b[2] - a[2] * b[1];
    const ny = a[2] * b[0] - a[0] * b[2];
    const nz = a[0] * b[1] - a[1] * b[0];
    const len = Math.hypot(nx, ny, nz);
    let fits = len > 0;
    for (let k = anchor + 1; fits && k < i; k++) {
      const s = units[k];
      if (s && Math.abs(s[0] * nx + s[1] * ny + s[2] * nz) / len > TOLERANCE_RAD) fits = false;
    }
    if (fits) {
      i += 1;
      continue;
    }
    const prev = units[i - 1];
    if (prev) kept.push(...prev);
    anchor = i - 1;
    i = anchor + 2;
  }
  const last = units[units.length - 1];
  if (last && units.length > 1) kept.push(...last);
  return Float64Array.from(kept);
}

let cached: PrayerLine[] = [];
let cachedAt = Number.NEGATIVE_INFINITY;

/** The five lines for the current minute. */
export function prayerLinesNow(now = Date.now()): PrayerLine[] {
  if (now - cachedAt < REFRESH_MS) return cached;
  cachedAt = now;
  cached = prayerRuns(new Date(now)).map(({ id, name, runs }) => ({
    id,
    name,
    runs: runs.map((run) => thin(run.map((sample) => unit(sample.lng, sample.lat)))),
  }));
  return cached;
}

/** Recompute on the next call, with the sun (`invalidateSunCaches`). */
export function invalidatePrayerLines(): void {
  cachedAt = Number.NEGATIVE_INFINITY;
}

/** Where a line can be named: its points on screen, in the order walked. */
export type PrayerLabelCandidates = { id: PrayerId; name: string; points: number[] };

/**
 * Stroke the visible stretches of each line into `sink`, and return the
 * points a name could sit on. `project` places a unit vector in
 * `SCREEN_POINT` and says whether it is in view (`screenPoint` with the
 * frame's camera). A stretch ends at the last sample in view: samples are at
 * most two degrees apart, which at the limb is under a pixel.
 */
export function emitPrayerLines(
  lines: readonly PrayerLine[],
  project: (x: number, y: number, z: number) => boolean,
  sink: { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void },
): PrayerLabelCandidates[] {
  const out: PrayerLabelCandidates[] = [];
  for (const line of lines) {
    const points: number[] = [];
    for (const run of line.runs) {
      let drawing = false;
      for (let i = 0; i < run.length; i += 3) {
        if (!project(run[i] ?? 0, run[i + 1] ?? 0, run[i + 2] ?? 0)) {
          drawing = false;
          continue;
        }
        const x = SCREEN_POINT[0];
        const y = SCREEN_POINT[1];
        if (drawing) sink.lineTo(x, y);
        else sink.moveTo(x, y);
        drawing = true;
        points.push(x, y);
      }
    }
    if (points.length > 0) out.push({ id: line.id, name: line.name, points });
  }
  return out;
}

/**
 * Candidate anchors for one line's name, nearest the disc's centre first: a
 * name read near the limb is foreshortened and the first to collide. At most
 * `max`, spread along the line rather than bunched where it is densest.
 */
export function prayerLabelAnchors(
  points: readonly number[],
  cx: number,
  cy: number,
  max: number,
): { x: number; y: number }[] {
  const count = points.length / 2;
  if (count === 0) return [];
  const stride = Math.max(1, Math.floor(count / (max * 2)));
  const picks: { x: number; y: number; d: number }[] = [];
  for (let i = 0; i < count; i += stride) {
    const x = points[i * 2] ?? 0;
    const y = points[i * 2 + 1] ?? 0;
    picks.push({ x, y, d: (x - cx) * (x - cx) + (y - cy) * (y - cy) });
  }
  picks.sort((a, b) => a.d - b.d);
  return picks.slice(0, max).map(({ x, y }) => ({ x, y }));
}
