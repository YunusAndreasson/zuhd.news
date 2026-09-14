/** Springs finish on their exact target, including Reduce Motion jumps.
 * Waiting for it avoids recording a costly near-final frame and then another
 * at the endpoint. Share this boundary with reaction invalidation so numeric
 * epsilon and frame-rate throttling cannot swallow the final detailed frame. */
export function isStorySettled(fraction: number): boolean {
  'worklet';
  return fraction === 0 || fraction === 1;
}
