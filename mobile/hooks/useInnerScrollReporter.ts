import { useCallback, useMemo, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  type PanGestureConfig,
  useNativeGesture,
  usePanGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import { type InnerEdgePageDirection, resolveInnerEdgePageGesture } from '../lib/inner-scroll-edge';
import { readableScrollOffset } from '../lib/scroll-consumption';

/**
 * Tell the pager above that this page ate part of a swipe.
 *
 * A page taller than the screen scrolls its own text first and hands what is
 * left of the gesture upward. The parent list receives that remainder with no
 * touch-down and no fling, so it cannot tell an inherited tail from a real page
 * turn — and `useVerticalPager` needs to, or it turns a page the reader was only
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
  onInnerEdgePage?: (index: number, direction: Exclude<InnerEdgePageDirection, 0>) => void,
  edgePagingEnabled = true,
  onReadingScrollStart?: () => void,
) {
  const startY = useRef(0);
  const offsetY = useRef(0);
  const maxOffsetY = useRef(0);
  const gestureStartY = useRef(0);
  const gestureMaxOffsetY = useRef(0);
  const gestureTranslationY = useRef(0);
  const gestureVelocityY = useRef(0);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const consumed = useRef(false);
  const dragging = useRef(false);

  const updateBounds = useCallback(() => {
    maxOffsetY.current = Math.max(0, contentHeight.current - viewportHeight.current);
    offsetY.current = readableScrollOffset(
      offsetY.current,
      contentHeight.current,
      viewportHeight.current,
    );
  }, []);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportHeight.current = e.nativeEvent.layout.height;
      updateBounds();
    },
    [updateBounds],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      updateBounds();
    },
    [updateBounds],
  );

  const onScrollBeginDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      dragging.current = true;
      startY.current = readableScrollOffset(
        contentOffset.y,
        contentSize.height,
        layoutMeasurement.height,
      );
      offsetY.current = startY.current;
      maxOffsetY.current = Math.max(0, contentSize.height - layoutMeasurement.height);
      consumed.current = false;
      onReadingScrollStart?.();
    },
    [onReadingScrollStart],
  );

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
      offsetY.current = readableY;
      maxOffsetY.current = Math.max(0, contentSize.height - layoutMeasurement.height);
      if (!dragging.current || consumed.current || Math.abs(readableY - startY.current) <= 1)
        return;
      consumed.current = true;
      onInnerScrollConsumed?.(index);
    },
    [index, onInnerScrollConsumed],
  );

  const edgePanConfig = useMemo<PanGestureConfig>(
    () => ({
      enabled: edgePagingEnabled && !!onInnerEdgePage,
      runOnJS: true,
      // This recognizer observes the swipe; the native ScrollView still owns
      // the actual content movement. Without these, activating the pan can
      // cancel the very scroll it is meant to accompany.
      cancelsTouchesInView: false,
      cancelsJSResponder: false,
      activeOffsetY: [-5, 5],
      failOffsetX: [-16, 16],
      onBegin: () => {
        gestureStartY.current = offsetY.current;
        gestureMaxOffsetY.current = maxOffsetY.current;
        gestureTranslationY.current = 0;
        gestureVelocityY.current = 0;
      },
      // A native ScrollView is allowed to interrupt this observer. RNGH 3's
      // onDeactivate only covers a Pan that reached ACTIVE, while onFinalize
      // also covers the cancellation/failure path. That path matters here:
      // the child can hand a partial tail to the parent at the same moment the
      // Native gesture cancels this observer. Dropping the final event leaves
      // the pager between pages. The edge + distance/velocity checks below
      // remain the authority, so a cancelled tap or sideways drag is inert.
      // RNGH 3 types finalization with base Pan data, so retain the last full
      // update rather than relying on platform-specific end-event fields.
      onUpdate: ({ translationY, velocityY }) => {
        gestureTranslationY.current = translationY;
        gestureVelocityY.current = velocityY;
      },
      onFinalize: () => {
        const direction = resolveInnerEdgePageGesture({
          startOffset: gestureStartY.current,
          maxOffset: gestureMaxOffsetY.current,
          translationY: gestureTranslationY.current,
          velocityY: gestureVelocityY.current,
        });
        if (direction !== 0) onInnerEdgePage?.(index, direction);
      },
    }),
    [edgePagingEnabled, index, onInnerEdgePage],
  );
  const nativeGesture = useNativeGesture({
    enabled: edgePagingEnabled && !!onInnerEdgePage,
  });
  const edgePan = usePanGesture(edgePanConfig);
  const edgeGesture = useSimultaneousGestures(nativeGesture, edgePan);

  return {
    onScrollBeginDrag,
    onScrollEndDrag,
    onScroll,
    onLayout,
    onContentSizeChange,
    edgeGesture,
  };
}
