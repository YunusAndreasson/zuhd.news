import { RUN_GAP_MS } from './news-order';

/**
 * The story track as the day's cycles, side by side: where each story sits on
 * a track `width` points wide, the newest cycle at the left end.
 *
 * It was the day to scale from 2026-09-23 — now at the left, a day ago at the
 * right, each story at its time. But zuhd publishes in cycles, and every story
 * of a cycle carries one time (`ranAt`), so a day to scale is five clumps with
 * hours of empty track between them in which nothing could ever sit: on
 * 2026-10-12, 41 stories held 205 of 350 points at the least pitch a finger
 * can find, and the rest was the gaps (the user's request to close them).
 *
 * So the hours between cycles get no room. Every story takes an equal share
 * of the track, a cycle's stories touch, and one fixed gap stands between two
 * cycles however long the wait was. When each cycle ran is said in words
 * under it (`runMarks`), not by its distance along the track.
 */

/** Between two cycles: room for a tick with air either side. */
export const TRACK_RUN_GAP = 8;
/** Between two cells, while there is room for one. */
export const TRACK_CELL_GAP = 1;

/** One cycle's stretch of the track. */
export interface TrackRun {
  /** The river index of the cycle's first story: the one that dates it. */
  first: number;
  left: number;
  width: number;
}

export interface TimeTrack {
  /** Each story's centre, in points from the left end, in river order. */
  centers: number[];
  /** Each story's drawn cell, gap already taken off. */
  cells: { left: number; width: number }[];
  /** The cycles, newest first. */
  runs: TrackRun[];
}

/**
 * @param ages How long ago each story ran, in ms, one per story in river
 *   order. Stories are laid out by time and the result is handed back in
 *   river order, so an order that is not strictly by time (the most reported
 *   first inside a run, `compareHeat`) still lands every story in its own
 *   cycle. Two stories further apart than `RUN_GAP_MS` are two cycles.
 */
export function timeTrackLayout(
  ages: readonly number[],
  width: number,
  { runGap = TRACK_RUN_GAP }: { runGap?: number } = {},
): TimeTrack {
  const n = ages.length;
  if (n === 0 || width <= 0) return { centers: [], cells: [], runs: [] };

  // By time, ties in river order.
  const order = ages.map((_, i) => i).sort((a, b) => (ages[a] ?? 0) - (ages[b] ?? 0) || a - b);
  // Which cycle each story is in, counted from the newest.
  const runOf: number[] = [];
  for (let k = 0; k < n; k++) {
    const apart = k > 0 ? (ages[order[k] ?? 0] ?? 0) - (ages[order[k - 1] ?? 0] ?? 0) : 0;
    runOf.push(k === 0 ? 0 : (runOf[k - 1] ?? 0) + (apart > RUN_GAP_MS ? 1 : 0));
  }
  const runCount = (runOf[n - 1] ?? 0) + 1;
  // However many cycles, the gaps between them take a quarter of the track
  // at most: the rest is the stories'.
  const between = runCount > 1 ? Math.min(runGap, width / (4 * (runCount - 1))) : 0;
  const d = (width - (runCount - 1) * between) / n;
  const gap = d >= 3 ? TRACK_CELL_GAP : 0;

  const centers: number[] = new Array(n).fill(0);
  const cells: { left: number; width: number }[] = new Array(n);
  const runs: TrackRun[] = [];
  for (let k = 0; k < n; k++) {
    const i = order[k] ?? k;
    const run = runOf[k] ?? 0;
    const left = k * d + run * between;
    centers[i] = left + d / 2;
    cells[i] = { left: left + gap / 2, width: Math.max(1, d - gap) };
    const open = runs[run];
    if (open) {
      open.first = Math.min(open.first, i);
      open.width += d;
    } else {
      runs.push({ first: i, left, width: d });
    }
  }
  return { centers, cells, runs };
}

/**
 * The track's ruler: a tick in the gap between two cycles, and under each
 * cycle's first cell the word for when it ran (`labelAt`, the card's own
 * time). A word that would run into the one before it is dropped, the newest
 * kept first; the oldest cycle's may end with the track instead of starting
 * with its cell. A cycle with no word (`''`) keeps its tick.
 */
export function runMarks(
  runs: readonly TrackRun[],
  width: number,
  labelAt: (index: number) => string,
  labelWidth: number,
  labelGap: number,
): { at: number; label?: string; bare?: boolean; end?: boolean }[] {
  const marks: { at: number; label?: string; bare?: boolean; end?: boolean }[] = [];
  // Where the next word may start.
  let free = 0;
  for (let k = 0; k < runs.length; k++) {
    const run = runs[k];
    if (!run) continue;
    const previous = runs[k - 1];
    if (previous) marks.push({ at: (previous.left + previous.width + run.left) / 2 });
    const label = labelAt(run.first);
    if (!label) continue;
    if (run.left >= free && run.left + labelWidth <= width) {
      marks.push({ at: run.left, label, bare: true });
      free = run.left + labelWidth + labelGap;
    } else if (k === runs.length - 1 && width - labelWidth >= free) {
      marks.push({ at: width, label, bare: true, end: true });
    }
  }
  return marks;
}

/** Where a float position in the river (`2.4`) sits along the track. */
export function positionAt(centers: readonly number[], position: number): number {
  'worklet';
  const n = centers.length;
  if (n === 0) return 0;
  if (position <= 0) return centers[0] ?? 0;
  if (position >= n - 1) return centers[n - 1] ?? 0;
  const i = Math.floor(position);
  const a = centers[i] ?? 0;
  const b = centers[i + 1] ?? a;
  return a + (position - i) * (b - a);
}

/**
 * The hour marks that get a word under them: the half-day first, then the
 * quarters, each only where it clears every word already kept by `minGap`
 * points. On an ordinary day all three fit; a burst that crowds two marks
 * together keeps `12h`, the one a reader goes looking for.
 */
export function labelledMarks(
  marks: readonly { hours: number; at: number }[],
  minGap: number,
): { at: number; label?: string }[] {
  const byPriority = [...marks].sort(
    (a, b) => Math.abs(a.hours - 12) - Math.abs(b.hours - 12) || a.hours - b.hours,
  );
  const kept: number[] = [];
  for (const mark of byPriority) {
    if (kept.every((at) => Math.abs(at - mark.at) >= minGap)) kept.push(mark.at);
  }
  return marks.map((mark) =>
    kept.includes(mark.at) ? { at: mark.at, label: `${mark.hours}h` } : { at: mark.at },
  );
}
