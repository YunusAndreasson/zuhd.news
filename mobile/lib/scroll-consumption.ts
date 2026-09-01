/**
 * The readable vertical offset of a scroll view.
 *
 * Native scroll views can report a transient offset outside their content
 * bounds while the edge effect is active (negative at the top, greater than
 * `contentHeight - viewportHeight` at the bottom). That movement is bounce,
 * not content consumption, and must not be attributed to an inner scroller in
 * a pager: doing so suppresses the page turn that the edge gesture intended.
 */
export function readableScrollOffset(
  offsetY: number,
  contentHeight: number,
  viewportHeight: number,
): number {
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  return Math.max(0, Math.min(offsetY, maxOffset));
}
