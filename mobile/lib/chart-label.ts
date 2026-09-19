/**
 * Where the label for a horizontal rule on a chart goes, so that no line on
 * the chart runs through it.
 *
 * Both charts label a rule: `TrendBlock` a card's reference ("normal 10.2",
 * "since Aug 3 88.9"), `TrajectoryChart` a country's thresholds ("replacement"
 * on fertility). Each used to pin the label at the left end, and a series that
 * sat on the rule there printed straight across it — the Hormuz curve under
 * its normal, Russia's 1960s fertility over `replace`. One search, used by
 * both, so they cannot drift apart.
 */

export interface ChartPoint {
  x: number;
  y: number;
}

export interface LabelSpotInput {
  /** Every line drawn on the chart, as its points in drawing order. */
  lines: readonly (readonly ChartPoint[])[];
  /** The rule's y. */
  ruleY: number;
  labelWidth: number;
  labelHeight: number;
  /** The leftmost and rightmost x the label may occupy. */
  minLeft: number;
  maxRight: number;
  /** How far to move right between tries. */
  step: number;
  /** Air to keep between the label's box and any line, on every side. A
   *  box measured to the text's line leaves its descenders on the line. */
  clearance?: number;
}

/**
 * The first stretch from the left, `step` at a time, that every line leaves
 * clear for the label — above the rule by preference, below it otherwise.
 * With `clearance`, a stretch with that much air comes first and a stretch
 * that is merely clear second. When no stretch is clear, the one the fewest
 * segments cross: a fixed default put the label straight back on the line
 * that had ruled out everything else.
 *
 * Segments, not points: a steep daily descent steps clean over a 14pt band
 * between two readings, which is how the first version of this missed the
 * Hormuz curve it was written for.
 */
export function clearLabelSpot(input: LabelSpotInput): { left: number; above: boolean } | null {
  const clearance = input.clearance ?? 0;
  if (clearance > 0) {
    const aired = search(input, clearance);
    if (aired.crossings === 0) return aired.spot;
  }
  return search(input, 0).spot;
}

function search(
  { lines, ruleY, labelWidth, labelHeight, minLeft, maxRight, step }: LabelSpotInput,
  clearance: number,
): { spot: { left: number; above: boolean } | null; crossings: number } {
  const crossings = (x0: number, x1: number, top: number, bottom: number) => {
    let n = 0;
    for (const points of lines) {
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        if (!a || !b || b.x < x0 - clearance || a.x > x1 + clearance) continue;
        if (Math.max(a.y, b.y) >= top - clearance && Math.min(a.y, b.y) <= bottom + clearance) {
          n += 1;
        }
      }
    }
    return n;
  };
  let best: { spot: { left: number; above: boolean } | null; crossings: number } = {
    spot: null,
    crossings: Number.POSITIVE_INFINITY,
  };
  const lastLeft = Math.max(minLeft, maxRight - labelWidth);
  for (const above of [true, false]) {
    const top = above ? ruleY - labelHeight : ruleY;
    const bottom = above ? ruleY : ruleY + labelHeight;
    for (let left = minLeft; left <= lastLeft; left += step) {
      const n = crossings(left, left + labelWidth, top, bottom);
      if (n === 0) return { spot: { left, above }, crossings: 0 };
      if (n < best.crossings) best = { spot: { left, above }, crossings: n };
    }
  }
  return best;
}
