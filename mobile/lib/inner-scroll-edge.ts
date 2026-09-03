export type InnerEdgePageDirection = -1 | 0 | 1;

interface InnerEdgePageGesture {
  startOffset: number;
  maxOffset: number;
  translationY: number;
  velocityY: number;
}

/**
 * Turn an outward swipe that began at an inner scroll view's real edge into a
 * page request. iOS does not reliably hand a same-axis UIScrollView gesture to
 * its parent FlatList, so without this decision an overflowing page can trap
 * every later vertical swipe even after the reader reaches its last line.
 *
 * The edge is sampled at touch-down, not at release. A swipe that starts in
 * the middle is allowed to reveal the remaining prose and stops there; only a
 * new, deliberate swipe from the edge changes page.
 */
export function resolveInnerEdgePageGesture({
  startOffset,
  maxOffset,
  translationY,
  velocityY,
}: InnerEdgePageGesture): InnerEdgePageDirection {
  const edgeSlop = 2;
  const distance = 36;
  const velocity = 650;
  const upward = translationY <= -distance || velocityY <= -velocity;
  const downward = translationY >= distance || velocityY >= velocity;

  if (maxOffset > edgeSlop && startOffset >= maxOffset - edgeSlop && upward) return 1;
  if (startOffset <= edgeSlop && downward) return -1;
  return 0;
}
