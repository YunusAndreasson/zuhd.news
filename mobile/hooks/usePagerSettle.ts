import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { type InnerConsumedMark, resolveSettle } from '../lib/pager-settle';

/**
 * Land a vertically-paged list on a page, always — even when the gesture that
 * moved it was never the list's own.
 *
 * `pagingEnabled` snaps what the list received. A page taller than the screen
 * scrolls its own last inch first and hands the remainder up, so the list moves
 * with no touch-down and no fling and stops between two pages, both of them
 * half-faded, with no gesture that recovers. This is the correction for that,
 * and it is a hook rather than a copy because the article river had the
 * identical bug for as long as the card deck had the fix.
 *
 * The correction must not run at the *end of the drag*, which is the obvious
 * place to put it and is wrong. A flick lifts the finger early and lets
 * momentum carry the page: the drag ends 40% of the way across, and a
 * correction there rounds that to zero and drags the reader back to the page
 * they just left, cancelling a fling that was about to land correctly. So a
 * drag end only *arms* the check, momentum starting disarms it, and momentum
 * ending runs it immediately. What is left for the timer is exactly the case it
 * is for: a scroll that stopped dead somewhere between two pages.
 *
 * The scroll-worklet side is deliberately NOT in here. Each caller keeps its
 * own four-line throttle inside its own `useAnimatedScrollHandler` and hops out
 * with `scheduleOnRN(armSettleFromScroll)`. Hoisting a worklet across a hook
 * boundary to save those lines is how this codebase has twice earned a launch
 * SIGABRT; the arithmetic that actually carries the rules lives in
 * `resolveSettle`, where a test can reach it.
 */

/** Minimal surface this needs from a list ref — structural so it accepts a
 *  Reanimated `useAnimatedRef` without importing the list's element type. */
interface Scrollable {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
}

interface PagerSettleOptions {
  listRef: { current: Scrollable | null };
  scrollY: SharedValue<number>;
  itemHeight: number;
  count: number;
  /** Live page index. A ref because every consumer here is a callback that
   *  must not be rebuilt on each snap. */
  currentIndexRef: { current: number };
  /** Called only when the settle actually changes page — haptics, hint state
   *  and any per-surface bookkeeping belong to the caller, not to this. */
  onSettled: (index: number) => void;
}

/** Long enough that a fling has begun and disarmed this, short enough that a
 *  dead stop does not read as the app having frozen. */
const AFTER_DRAG_MS = 120;
/** The scroll-armed variant waits slightly longer: it fires mid-motion, so it
 *  must let the list actually come to rest first. */
const AFTER_SCROLL_MS = 140;
/** If the child consumed the gesture without handing anything to the parent, no
 *  parent settle event will clear the mark. Expire it so a later swipe from the
 *  child's edge can page normally. */
const MARK_EXPIRY_MS = 700;

export function usePagerSettle({
  listRef,
  scrollY,
  itemHeight,
  count,
  currentIndexRef,
  onSettled,
}: PagerSettleOptions) {
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const innerConsumedRef = useRef<InnerConsumedMark | null>(null);
  const innerConsumedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Whether a gesture the list itself received currently owns it. The
   *  scroll-armed settle must never fire under the reader's finger, and must
   *  never cut a fling short — both would yank the page out from under a
   *  deliberate movement. Refs, not state: nothing here renders. */
  const draggingRef = useRef(false);
  const momentumRef = useRef(false);

  const clearSettle = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const clearMarkTimer = useCallback(() => {
    if (innerConsumedTimer.current) {
      clearTimeout(innerConsumedTimer.current);
      innerConsumedTimer.current = null;
    }
  }, []);

  const settleToPage = useCallback(
    (y: number) => {
      const decision = resolveSettle({
        y,
        itemHeight,
        count,
        currentIndex: currentIndexRef.current,
        innerConsumed: innerConsumedRef.current,
        now: Date.now(),
      });
      if (decision.clearMark) innerConsumedRef.current = null;
      if (decision.clearMarkTimer) clearMarkTimer();
      if (decision.scroll) {
        listRef.current?.scrollToOffset({
          offset: decision.target,
          animated: decision.animated,
        });
      }
      if (decision.index === currentIndexRef.current) return;
      // Publish synchronously before the caller's state update. A second
      // queued settle must observe this decision immediately rather than
      // dispatching the same page change again against a stale render ref.
      currentIndexRef.current = decision.index;
      onSettled(decision.index);
    },
    [clearMarkTimer, count, currentIndexRef, itemHeight, listRef, onSettled],
  );

  const handleBeginDrag = useCallback(() => {
    draggingRef.current = true;
    clearSettle();
  }, [clearSettle]);

  const handleEndDrag = useCallback(
    (_e: NativeSyntheticEvent<NativeScrollEvent>) => {
      draggingRef.current = false;
      clearSettle();
      settleTimer.current = setTimeout(() => {
        if (draggingRef.current || momentumRef.current) return;
        // The list may keep moving after onScrollEndDrag even without a
        // momentum-begin event. Read the live offset when the correction
        // actually runs so congestion cannot snap from a stale coordinate.
        settleToPage(scrollY.value);
      }, AFTER_DRAG_MS);
    },
    [clearSettle, scrollY, settleToPage],
  );

  const handleMomentumBegin = useCallback(() => {
    momentumRef.current = true;
    clearSettle();
  }, [clearSettle]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      momentumRef.current = false;
      clearSettle();
      settleToPage(e.nativeEvent.contentOffset.y);
    },
    [clearSettle, settleToPage],
  );

  /**
   * The correction for a scroll that no gesture on this list produced.
   *
   * Called from the caller's scroll worklet (throttled there), and it declines
   * whenever a drag or a fling owns the list — those already end in
   * `handleEndDrag` or `handleMomentumEnd`, which are better informed than a
   * timer. What is left is the case neither of those can see: an inner scroll
   * reaching its end and handing the remainder of the swipe up to this list,
   * which then stops between two pages having never been dragged.
   *
   * The offset is read at fire time rather than captured when armed, because
   * the list has usually kept moving in the intervening frames.
   */
  const armSettleFromScroll = useCallback(() => {
    if (draggingRef.current || momentumRef.current) return;
    clearSettle();
    settleTimer.current = setTimeout(() => {
      if (draggingRef.current || momentumRef.current) return;
      settleToPage(scrollY.value);
    }, AFTER_SCROLL_MS);
  }, [clearSettle, settleToPage, scrollY]);

  /** A page reporting that it ate part of a gesture before the rest arrived
   *  here. Only the page the reader is on can claim one. */
  const handleInnerScrollConsumed = useCallback(
    (index: number) => {
      if (index !== currentIndexRef.current) return;
      innerConsumedRef.current = { index, at: Date.now() };
      clearMarkTimer();
      innerConsumedTimer.current = setTimeout(() => {
        innerConsumedRef.current = null;
        innerConsumedTimer.current = null;
      }, MARK_EXPIRY_MS);
    },
    [clearMarkTimer, currentIndexRef],
  );

  useEffect(
    () => () => {
      clearSettle();
      clearMarkTimer();
    },
    [clearSettle, clearMarkTimer],
  );

  return {
    handleBeginDrag,
    handleEndDrag,
    handleMomentumBegin,
    handleMomentumEnd,
    armSettleFromScroll,
    handleInnerScrollConsumed,
  };
}
