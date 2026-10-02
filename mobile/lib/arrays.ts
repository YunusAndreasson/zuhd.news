/**
 * Two pieces of list arithmetic the app had written out for itself five times:
 * which of a list of positions is nearest a point — the time track's scrub, a
 * chart's, the gauge row coming to rest — and whether a list just rebuilt says
 * anything its predecessor did not.
 */

/**
 * The index of the value nearest `x`: the first of a tie, and 0 for an empty
 * list. Values need not be sorted, so both ends clamp for free. A worklet,
 * because a finger asks it on the UI thread; called from JS it is a plain
 * function.
 */
export function nearestIndex(values: readonly number[], x: number): number {
  'worklet';
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const distance = Math.abs((values[i] ?? 0) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** The same items in the same order, by `===`: whether a list rebuilt on every
 *  layout or render is worth handing on as a new one. */
export function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
