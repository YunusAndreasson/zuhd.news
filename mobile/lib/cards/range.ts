/**
 * A reading with the range it probably lies in, as a mark on a scale a whole
 * list shares.
 *
 * An AI lab's score comes with a likely range, and the list's own note says a
 * few points apart is within the margin. A column of ten numbers cannot show
 * that: 167.3 over 166.5 reads as first and second, where the two ranges are
 * nearly one. Drawn on one scale, ranges that overlap are seen to, and a lab
 * that stands apart is seen to as well. A row's order was never the claim.
 */

/** A reading and the range around it. */
export interface Range {
  low: number;
  high: number;
  /** The reading itself. */
  at: number;
}

/** The scale a list's ranges are drawn on. */
export interface RangeScale {
  lo: number;
  hi: number;
}

/** A range on the scale, as shares of its width. */
export interface RangeMarks {
  /** Where the range starts and how far it runs. */
  from: number;
  length: number;
  /** Where the reading is. */
  at: number;
}

const usable = ({ low, high, at }: Range): boolean =>
  Number.isFinite(low) && Number.isFinite(high) && Number.isFinite(at) && high >= low;

/**
 * One scale for every row: from the lowest low to the highest high, so two
 * rows' marks are compared by where they stand. Null with fewer than two
 * usable ranges, or with none wider than a point: a scale is for comparing.
 */
export function rangeScale(ranges: readonly Range[]): RangeScale | null {
  const all = ranges.filter(usable);
  if (all.length < 2) return null;
  const lo = Math.min(...all.map((range) => Math.min(range.low, range.at)));
  const hi = Math.max(...all.map((range) => Math.max(range.high, range.at)));
  return hi > lo ? { lo, hi } : null;
}

const share = (value: number, { lo, hi }: RangeScale): number =>
  Math.max(0, Math.min(1, (value - lo) / (hi - lo)));

/** Where a row's range and reading fall on the list's scale. Null for a range
 *  that is not one. */
export function rangeMarks(range: Range, scale: RangeScale): RangeMarks | null {
  if (!usable(range) || !(scale.hi > scale.lo)) return null;
  const from = share(range.low, scale);
  return { from, length: share(range.high, scale) - from, at: share(range.at, scale) };
}
