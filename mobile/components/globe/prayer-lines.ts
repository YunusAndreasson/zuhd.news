import { type PrayerId, prayerRuns } from '@shared/prayer';

import { SCREEN_POINT, unit } from './sphere-circles';

/**
 * The five prayer lines on the globe: where Fajr, Dhuhr, Asr, Maghrib and Isha
 * are entering now, by the method the web map draws (`@shared/prayer`). The
 * curves are solved in latitude and longitude once a minute, the way the sun
 * is (`getSunPosition`), and kept as unit vectors, so a frame only rotates and
 * places them, as it does every other point on the globe.
 */
export type PrayerLine = {
  id: PrayerId;
  name: string;
  /** Each run as unit vectors, `x, y, z` per sample. */
  runs: Float64Array[];
};

const REFRESH_MS = 60_000;
let cached: PrayerLine[] = [];
let cachedAt = Number.NEGATIVE_INFINITY;

/** The five lines for the current minute. */
export function prayerLinesNow(now = Date.now()): PrayerLine[] {
  if (now - cachedAt < REFRESH_MS) return cached;
  cachedAt = now;
  cached = prayerRuns(new Date(now)).map(({ id, name, runs }) => ({
    id,
    name,
    runs: runs.map((run) => {
      const units = new Float64Array(run.length * 3);
      for (let i = 0; i < run.length; i++) {
        const sample = run[i];
        if (!sample) continue;
        const [x, y, z] = unit(sample.lng, sample.lat);
        units[i * 3] = x;
        units[i * 3 + 1] = y;
        units[i * 3 + 2] = z;
      }
      return units;
    }),
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
