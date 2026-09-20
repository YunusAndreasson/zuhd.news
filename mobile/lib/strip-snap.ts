/**
 * Where the gauge row is allowed to come to rest.
 *
 * The row scrolled freely and stopped wherever the finger left it, which meant
 * a flung row routinely settled with its leftmost slot sliced in half — a
 * label cut mid-word against the reader column's inset, which reads as broken
 * rather than as a row with more in it.
 *
 * The row is sized for 3.4 slots across (`VISIBLE_SLOTS`, `IndicatorStrip`), so
 * a clean boundary at *both* edges is arithmetically impossible: four tenths of
 * a slot always falls somewhere. The left edge is the one that is guaranteed —
 * every rest position is a slot's own left edge, exactly where the first slot
 * sits at rest — and the four tenths stay at the right, where a partial slot is
 * the only sign the row continues.
 *
 * Slots are not a fixed pitch: a longer name widens its slot past the rhythm
 * rather than ellipsizing, so there is no interval to snap to. These are the
 * measured offsets, which the row already collects from each slot's layout.
 *
 * **The end of the row is the one rest position that is not a slot start.** It
 * has to be, or `all →` could never be reached: the last slots begin past the
 * furthest the row can scroll, so they are dropped and the content's end stands
 * in for them.
 */

/**
 * Every offset the row may settle on, in the order a scroll view wants them:
 * ascending, deduplicated, starting at 0 and ending at the furthest the row can
 * scroll. A row that fits its viewport snaps nowhere and returns nothing.
 */
export function stripSnapOffsets(
  starts: readonly number[],
  contentWidth: number,
  viewport: number,
): number[] {
  if (!(viewport > 0) || !(contentWidth > viewport)) return [];
  const max = Math.round(contentWidth - viewport);
  const kept = new Set<number>([0]);
  for (const start of starts) {
    if (!Number.isFinite(start)) continue;
    const x = Math.round(start);
    // A start at or past the end is unreachable; the end offset stands in.
    if (x <= 0 || x >= max) continue;
    kept.add(x);
  }
  const offsets = [...kept].sort((a, b) => a - b);
  if (max > 0) offsets.push(max);
  return offsets;
}

/**
 * Which offset the row is resting on — the settle tick's only question. Offsets
 * are ascending, so the nearer of the two neighbours wins and both ends clamp.
 */
export function nearestOffsetIndex(offsets: readonly number[], x: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < offsets.length; i++) {
    const distance = Math.abs((offsets[i] ?? 0) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Whether two offset lists say the same thing, so the row hands the scroll
 *  view a new array only when the geometry actually moved. */
export function sameOffsets(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
