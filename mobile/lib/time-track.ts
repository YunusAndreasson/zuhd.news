import { HOUR_MS } from './time';

/**
 * The story track as a day: where each story sits on a track `width` points
 * wide, when the left end is now and the right end a day ago.
 *
 * It was one equal cell per story, which said what order the day came in and
 * nothing about when: twelve stories from one cycle and one from the quiet
 * hours took the same room, so "twelve hours ago" could be anywhere along it
 * (2026-09-23, the user's request). Now a story sits at its time, and the
 * hour marks say where the day is.
 *
 * Time alone cannot be the rule, because a cycle files a dozen stories within
 * minutes and each still needs a cell a finger can land on. So every story
 * gets at least `pitch` points, and a burst that does not fit spreads about
 * its own time — the least movement that makes room (pool-adjacent-violators
 * on the ideal positions), never past a neighbour and never off the track.
 * The hour marks are placed through the same mapping rather than at even
 * spacing, so a mark always falls between the stories either side of that
 * hour: a burst that straddles six hours ago pushes the mark along with it
 * instead of leaving an older story on the newer side of it.
 *
 * A cell is its story's share of the gap to each neighbour, up to `maxCell`:
 * where the day was busy the cells touch, as the old track's did, and a story
 * alone in a quiet stretch is a short dash with empty track either side.
 * That empty track is the point — it is what a quiet night looks like.
 */

/** How much time the track spans: the river's window (`RIVER_WINDOW_MS`). */
export const TRACK_SPAN_HOURS = 24;
/** The hour marks, every quarter of the day. */
export const TRACK_MARK_HOURS = [6, 12, 18] as const;
/** The least room a story gets, gap included: a cell a finger can find. */
export const TRACK_PITCH = 5;
/** The most room a story alone in a quiet stretch takes. */
export const TRACK_MAX_CELL = 10;
/** Between two cells, while there is room for one. */
export const TRACK_CELL_GAP = 1;

export interface TimeTrack {
  /** Each story's centre, in points from the left end, in river order. */
  centers: number[];
  /** Each story's drawn cell, gap already taken off. */
  cells: { left: number; width: number }[];
  /** Where each hour mark falls, in points. */
  marks: { hours: number; at: number }[];
}

/**
 * @param ages How long ago each story ran, in ms, one per story in river
 *   order. The river is not in time order — the day's top stories lead it
 *   (`leadWithTopStories`) — so stories are laid out by time and the result
 *   is handed back in river order: the deck's first swipes hop along the
 *   track to the top stories' own times, then it runs through the day.
 *   Older than the span sits at the right end.
 */
export function timeTrackLayout(
  ages: readonly number[],
  width: number,
  {
    pitch = TRACK_PITCH,
    maxCell = TRACK_MAX_CELL,
    spanHours = TRACK_SPAN_HOURS,
    markHours = TRACK_MARK_HOURS,
  }: {
    pitch?: number;
    maxCell?: number;
    spanHours?: number;
    markHours?: readonly number[];
  } = {},
): TimeTrack {
  const n = ages.length;
  const span = spanHours * HOUR_MS;
  if (n === 0 || width <= 0) return { centers: [], cells: [], marks: [] };

  // By time, ties in river order; inside the span.
  const clamped = ages.map((a) => Math.min(span, Math.max(0, a)));
  const order = clamped
    .map((_, i) => i)
    .sort((a, b) => (clamped[a] ?? 0) - (clamped[b] ?? 0) || a - b);
  const age = order.map((i) => clamped[i] ?? 0);
  const d = Math.min(pitch, width / n);
  const lo = d / 2;
  const hi = width - d / 2;

  // Pool adjacent violators: each block is a run of stories `d` apart, placed
  // where it sits nearest their times on average.
  const blocks: { start: number; count: number; sum: number }[] = [];
  for (let i = 0; i < n; i++) {
    let block = { start: i, count: 1, sum: ((age[i] ?? 0) / span) * width };
    for (;;) {
      const prev = blocks[blocks.length - 1];
      if (!prev) break;
      const prevLast = prev.sum / prev.count + (prev.count - 1) * d;
      if (block.sum / block.count >= prevLast + d) break;
      blocks.pop();
      // A member k places into the merged block's frame as ideal − k·d.
      block = {
        start: prev.start,
        count: prev.count + block.count,
        sum: prev.sum + block.sum - prev.count * d * block.count,
      };
    }
    blocks.push(block);
  }
  const x: number[] = new Array(n).fill(0);
  for (const b of blocks) {
    const first = b.sum / b.count;
    for (let k = 0; k < b.count; k++) x[b.start + k] = first + k * d;
  }
  // Onto the track: a forward pass holds the left end, a backward pass the
  // right. `n·d ≤ width`, so the second cannot undo the first.
  for (let i = 0; i < n; i++) {
    const floor = i > 0 ? (x[i - 1] ?? 0) + d : lo;
    x[i] = Math.max(x[i] ?? 0, floor);
  }
  for (let i = n - 1; i >= 0; i--) {
    const ceiling = i < n - 1 ? (x[i + 1] ?? 0) - d : hi;
    x[i] = Math.min(x[i] ?? 0, ceiling);
  }

  const gap = d >= 3 ? TRACK_CELL_GAP : 0;
  const cells: { left: number; width: number }[] = [];
  for (let i = 0; i < n; i++) {
    const c = x[i] ?? 0;
    const before = i > 0 ? (c + (x[i - 1] ?? 0)) / 2 : 0;
    const after = i < n - 1 ? (c + (x[i + 1] ?? 0)) / 2 : width;
    const left = Math.max(before, c - maxCell / 2);
    const right = Math.min(after, c + maxCell / 2);
    cells.push({ left: left + gap / 2, width: Math.max(1, right - left - gap) });
  }

  // Each mark on the piecewise-linear line through (0, 0), every story's
  // (age, x), and (span, width).
  const marks: { hours: number; at: number }[] = [];
  for (const hours of markHours) {
    const t = hours * HOUR_MS;
    let prevAge = 0;
    let prevX = 0;
    let at = width;
    for (let i = 0; i <= n; i++) {
      const a = i < n ? (age[i] ?? 0) : span;
      const p = i < n ? (x[i] ?? 0) : width;
      if (a >= t) {
        at = a === prevAge ? prevX : prevX + ((t - prevAge) / (a - prevAge)) * (p - prevX);
        break;
      }
      prevAge = a;
      prevX = p;
    }
    marks.push({ hours, at });
  }
  // Back into river order.
  const centers: number[] = new Array(n).fill(0);
  const byRiver: { left: number; width: number }[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const i = order[k] ?? k;
    centers[i] = x[k] ?? 0;
    byRiver[i] = cells[k] ?? { left: 0, width: 0 };
  }
  return { centers, cells: byRiver, marks };
}

/** The story whose centre is nearest `x` points along the track. */
export function nearestStory(centers: readonly number[], x: number): number {
  'worklet';
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < centers.length; i++) {
    const distance = Math.abs((centers[i] ?? 0) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
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
