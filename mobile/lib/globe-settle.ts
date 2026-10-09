/** Springs finish on their exact target, including Reduce Motion jumps.
 * Waiting for it avoids recording a costly near-final frame and then another
 * at the endpoint. Share this boundary with reaction invalidation so numeric
 * epsilon and frame-rate throttling cannot swallow the final detailed frame. */
export function isStorySettled(fraction: number): boolean {
  'worklet';
  return fraction === 0 || fraction === 1;
}

/** A delayed pinch release may wake the normal camera reaction, never force
 * a detailed frame. A newer gesture or flight invalidates that release. */
export function requestGlobeSettle(
  expectedEpoch: number,
  epoch: { value: number },
  retick: { value: number },
): void {
  'worklet';
  if (expectedEpoch === epoch.value) retick.value += 1;
}
