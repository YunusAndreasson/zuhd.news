import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Tell the pager above that this page ate part of a swipe.
 *
 * A page taller than the screen scrolls its own text first and hands what is
 * left of the gesture upward. The parent list receives that remainder with no
 * touch-down and no fling, so it cannot tell an inherited tail from a real page
 * turn — and `usePagerSettle` needs to, or it turns a page the reader was only
 * trying to read to the bottom of.
 *
 * "Consumed" is deliberately movement, not intent: a drag that never actually
 * moved the inner scroll (already at an end, or a stray pixel) has taken
 * nothing from the pager and must not suppress the page turn. One point of
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
    dragging.current = true;
    startY.current = e.nativeEvent.contentOffset.y;
    consumed.current = false;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (
        !dragging.current ||
        consumed.current ||
        Math.abs(e.nativeEvent.contentOffset.y - startY.current) <= 1
      )
        return;
      consumed.current = true;
      onInnerScrollConsumed?.(index);
    },
    [index, onInnerScrollConsumed],
  );

  return { onScrollBeginDrag, onScrollEndDrag, onScroll };
}
