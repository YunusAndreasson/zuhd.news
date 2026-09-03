/**
 * Where a paging list belongs once it has stopped moving.
 *
 * Native list snapping handles a gesture the list itself received. It does not snap
 * one that arrives some other way: a page taller than the screen scrolls its
 * own last inch first, and what is left of that swipe reaches the list with no
 * touch-down and no fling, so the list moves part of a page and stops there.
 * Both pages then sit at partial opacity — the arrival animation is driven off
 * this offset — and the reader is looking at two half-visible screens with
 * nothing to tell them which swipe gets out of it.
 *
 * The arithmetic lived inside `CardPager` as a closure over four refs, which
 * is why the identical bug on the article river went unnoticed for so long:
 * there was nothing to reuse and nothing to compare against. It is a pure
 * function here for the same reason `orderNewsRiver` is one — so the rules can
 * be stated once and pinned by a test rather than re-derived per surface.
 */

/** A page that consumed part of a gesture before handing the rest upward. */
export interface InnerConsumedMark {
  index: number;
  at: number;
}

export interface SettleInput {
  /** Offset the list came to rest at. */
  y: number;
  itemHeight: number;
  count: number;
  currentIndex: number;
  innerConsumed: InnerConsumedMark | null;
  now: number;
}

export interface SettleDecision {
  /** Page to land on. */
  index: number;
  /** Offset of that page. */
  target: number;
  /** Whether the list needs moving at all. */
  scroll: boolean;
  /** A correction against inherited momentum must pin, not animate: animating
   *  lets the two motions fight and can leave the list between pages again. */
  animated: boolean;
  clearMark: boolean;
  clearMarkTimer: boolean;
}

/** How long an inner page's consumed gesture stays attributable to it. */
export const INHERITED_GESTURE_MS = 1000;

/** A point of slack. A list resting exactly on a page reports a sub-pixel
 *  offset often enough that correcting it would fight the reader's own scroll
 *  on every single swipe. */
const SLACK = 1;

export function resolveSettle({
  y,
  itemHeight,
  count,
  currentIndex,
  innerConsumed,
  now,
}: SettleInput): SettleDecision {
  const currentPageY = currentIndex * itemHeight;
  const inherited =
    innerConsumed?.index === currentIndex && now - innerConsumed.at < INHERITED_GESTURE_MS;

  // The child actually moved, so this gesture belongs to the child: return the
  // parent to the page it was already on rather than letting the leftover
  // count as a page turn.
  const correcting = inherited && Math.abs(y - currentPageY) > SLACK;

  const index = correcting
    ? currentIndex
    : Math.max(0, Math.min(Math.round(y / itemHeight), count - 1));
  const target = index * itemHeight;

  // Above the first page there is nothing to correct, and something else is
  // already holding the list there: a pull-to-refresh control, or the
  // platform's own bounce. Pinning to 0 here would collapse a refresh spinner
  // under the reader's finger — the article river has a `RefreshControl` the
  // card decks never did, so this guard has no history in `CardPager`.
  const inTopOverscroll = y < 0;

  return {
    index,
    target,
    scroll: !inTopOverscroll && Math.abs(y - target) > SLACK,
    animated: !correcting,
    // Keep the mark while a correction settles: native paging momentum can
    // emit another end event after the first correction was armed.
    clearMark: !correcting,
    // If the child consumed the gesture without handing anything to the parent,
    // only the mark's own expiry clears it — leave that timer alone.
    clearMarkTimer: inherited && !correcting,
  };
}
