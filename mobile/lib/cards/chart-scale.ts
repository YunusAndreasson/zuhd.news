import { movesInPoints } from './format';

/**
 * The range a chart's height stands for.
 *
 * Drawn to its own lowest and highest value, every series fills its box: the
 * yuan's 0.3% month was as tall as the peso's 7.8%, a central bank's one cut
 * of a tenth of a point ran from the top of its chart to the bottom, and a
 * contract that sat between 7% and 14% drew the same zigzag as one that went
 * from 31% to 85%. The height then says nothing, and a card's chart disagrees
 * with the flat line the menu draws for the same thing (`sparkPoints`).
 *
 * - **A quiet series looks quiet.** The range is never narrower than
 *   `QUIET_SPAN_PCT` of the level, or `QUIET_SPAN_POINTS` for a series already
 *   in per cent. A narrower series is centred in it.
 * - **A quantity with a scale of its own is drawn on it** (`domain`): a
 *   chance runs from 0 to 100.
 * - **A quantity that cannot go below nothing keeps its floor there.**
 */

/** The least a chart's height stands for, in per cent of the level: the menu's
 *  small line and a card's chart alike. */
export const QUIET_SPAN_PCT = 6;

/** The same floor for a series in per cent, in percentage points: a rate's
 *  move is a difference, never a share of itself (`movesInPoints`). */
export const QUIET_SPAN_POINTS = 1;

export interface ChartScale {
  /** The values at the plot's foot and head. */
  lo: number;
  hi: number;
  /** The lowest and highest value drawn, which the range may reach past. */
  min: number;
  max: number;
}

export function chartScale({
  values,
  unit,
  domain,
}: {
  /** Every value the chart draws: each line, and the level a rule marks. */
  values: readonly number[];
  unit?: string;
  /** The quantity's own scale, where it has one. */
  domain?: readonly [number, number];
}): ChartScale {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min > max) return { lo: 0, hi: 1, min: 0, max: 0 };
  // A value outside its own scale is still drawn: the scale gives way.
  if (domain && domain[1] > domain[0]) {
    return { lo: Math.min(domain[0], min), hi: Math.max(domain[1], max), min, max };
  }
  const centre = (min + max) / 2;
  const least = movesInPoints(unit) ? QUIET_SPAN_POINTS : (Math.abs(centre) * QUIET_SPAN_PCT) / 100;
  let lo = min;
  let hi = max;
  if (hi - lo < least) {
    lo = centre - least / 2;
    hi = centre + least / 2;
    if (min >= 0 && lo < 0) {
      hi -= lo;
      lo = 0;
    }
  }
  // A series level at nothing has no level to take a share of.
  if (hi === lo) hi = lo + 1;
  return { lo, hi, min, max };
}

/**
 * Where two labels stand beside the rules they name, as the y of each one's
 * middle: on its rule, until the rules come within a label's height of each
 * other. Then the two part around the pair's middle, the upper one above and
 * the lower below, and stay inside `top` and `bottom`.
 *
 * A quiet series' high and low are a few points apart on the canvas, and two
 * numbers printed on their own rules there are one smudge.
 */
export function partLabels(
  upper: number,
  lower: number,
  height: number,
  top: number,
  bottom: number,
): [upper: number, lower: number] {
  if (lower - upper >= height) return [upper, lower];
  const middle = (upper + lower) / 2;
  const first = top + height / 2;
  const last = bottom - height / 2;
  let a = middle - height / 2;
  let b = middle + height / 2;
  if (a < first) {
    b += first - a;
    a = first;
  }
  if (b > last) {
    a = Math.max(first, a - (b - last));
    b = last;
  }
  return [a, b];
}
