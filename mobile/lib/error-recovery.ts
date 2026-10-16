/**
 * What the error screen offers after the tree has thrown.
 *
 * A failure soon after `try again` is the same failure: rendering the tree
 * again throws again. The screen then offers a reload instead, which starts
 * the JavaScript afresh, on a newer update if one has downloaded (the cure for
 * a bad one). It never reloads by itself: a reload that failed the same way
 * would loop with no way out.
 */
export const REPEAT_FAILURE_MS = 10_000;

export type Recovery = 'retry' | 'reload';

export function recoveryFor(lastResetAt: number | null, failedAt: number): Recovery {
  return lastResetAt !== null && failedAt - lastResetAt < REPEAT_FAILURE_MS ? 'reload' : 'retry';
}
