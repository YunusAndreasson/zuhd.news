import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { readableScrollOffset } from '../lib/scroll-consumption';

/**
 * Tell the pager above that this page ate part of a swipe.
 *
 * A page taller than the screen scrolls its own text first and hands what is
 * left of the gesture upward. The parent list receives that remainder with no
 * touch-down and no fling, so it cannot tell an inherited tail from a real page
 * turn — and `usePagerSettle` needs to, or it turns a page the reader was only
 * trying to read to the bottom of.
 *
 * "Consumed" is deliberately readable movement, not intent: a drag that never
 * actually moved the inner scroll (already at an end, or a stray pixel) has
 * taken nothing from the pager and must not suppress the page turn. Native
 * edge bounce is clamped away as well. Without that clamp an upward swipe from
 * the bottom of a long card reports a few points beyond its maximum as motion,
 * the pager pins the current card, and the inner view remounts at its top — so
 * leaving the card takes two swipes and loses the reader's place. One point of
 * slack absorbs sub-pixel scroll reporting. It fires at most once per drag.
 */
export function useInnerScrollReporter(
  index: number,
  onInnerScrollConsumed: ((index: number) => void) | undefined,
) {
  const startY = useRef(0);
  const consumed = useRef(false);
  const dragging = useRef(false);

  const onScrollBeginDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    dragging.current = true;
    startY.current = readableScrollOffset(
      contentOffset.y,
      contentSize.height,
      layoutMeasurement.height,
    );
    consumed.current = false;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const readableY = readableScrollOffset(
        contentOffset.y,
        contentSize.height,
        layoutMeasurement.height,
      );
      if (!dragging.current || consumed.current || Math.abs(readableY - startY.current) <= 1)
        return;
      consumed.current = true;
      onInnerScrollConsumed?.(index);
    },
    [index, onInnerScrollConsumed],
  );

  return { onScrollBeginDrag, onScrollEndDrag, onScroll };
}
