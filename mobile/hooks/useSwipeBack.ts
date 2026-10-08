import { useEffect, useMemo } from 'react';
import { BackHandler } from 'react-native';
import { type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  type SharedValue,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { IS_ANDROID } from '../constants/platform';
import { ANIMATION, KEEP_MOTION } from '../constants/theme';
import { swipeBackCommits } from '../lib/deck-swipe';

/**
 * Going back, as one gesture and one set of numbers.
 *
 * The multi-page sheets (`useSheetBackNavigation`) share these thresholds so
 * no two surfaces can drift apart.
 *
 * `failOffsetY` is what keeps this off the vertical axis: a sheet's content
 * scrolls vertically, and a back swipe that competed with it would take the
 * scroll. A horizontal swipe steals nothing.
 *
 * **The page follows the finger** (`drag`, drawn by `SheetPager`). It used to
 * answer only at the lift: the finger moved and nothing did, and a drag past
 * the bar went back even when it was let go coming home.
 */

/** Travel before the pan claims the touch. */
const ACTIVE_OFFSET_X = 20;
/** Vertical slop beyond which this is a scroll, not a back-swipe. */
const FAIL_OFFSET_Y: [number, number] = [-10, 10];
/** How far out the page must be heading to rest for a release to go back
 *  (`swipeBackCommits`): a deliberate drag, or a flick from a short one. */
const COMMIT_DISTANCE = 80;
/** How a page let go on its way back coasts until the page before it arrives:
 *  the deck's own rate (`lib/deck-swipe.ts`). */
const COAST_DECELERATION = 0.997;

export function useSwipeBackGesture({
  enabled,
  onBack,
  drag,
}: {
  enabled: boolean;
  /** Must change the page: `SheetPager` puts a dragged page home when it does. */
  onBack: () => void;
  /** How far the page has been pulled toward the one before it, in points. */
  drag: SharedValue<number>;
}) {
  /** Where the page was when the pan claimed it, and the finger's travel then. */
  const start = useSharedValue(0);
  const startX = useSharedValue(0);
  // The config object is memoized, not the gesture. Under the v3 hook API the
  // handler tag is stable for the component's lifetime — that is what the hook
  // owns, and it is why there is no longer a gesture object to keep identical.
  // The config still has to be, though: `usePanGesture` re-pushes it to the
  // native side whenever its identity changes, and an inline object literal
  // with an inline worklet is a fresh identity on every render.
  const config = useMemo(
    (): PanGestureConfig => ({
      enabled,
      activeOffsetX: ACTIVE_OFFSET_X,
      failOffsetY: FAIL_OFFSET_Y,
      onActivate: (e) => {
        'worklet';
        // Catch a page still springing home where it is.
        cancelAnimation(drag);
        start.value = drag.value;
        // From the claim's threshold, not from touch-down: the page would
        // jump the 20 pt the claim waits for. Only the slop is discounted, so
        // a claim that arrives late keeps the drag already made.
        startX.value = Math.min(e.translationX, ACTIVE_OFFSET_X);
      },
      onUpdate: (e) => {
        'worklet';
        const next = start.value + e.translationX - startX.value;
        drag.value = next < 0 ? 0 : next;
      },
      onDeactivate: (e) => {
        'worklet';
        // Deactivation also reports a cancelled gesture; only a released
        // swipe goes back.
        if (!e.canceled && swipeBackCommits(drag.value, e.velocityX, COMMIT_DISTANCE)) {
          // On its way out until the page before it arrives and the pager
          // puts it home: a page that stopped dead at the lift read as a stall.
          drag.value = withDecay({
            velocity: e.velocityX < 0 ? 0 : e.velocityX,
            deceleration: COAST_DECELERATION,
            ...KEEP_MOTION,
          });
          scheduleOnRN(onBack);
          return;
        }
        // The continuation of a hand, so it keeps its physics under Reduce
        // Motion. Velocity pointing away from home is dropped by the spring.
        drag.value = withSpring(0, {
          ...ANIMATION.springSheet,
          ...KEEP_MOTION,
          velocity: e.canceled ? 0 : e.velocityX,
        });
      },
    }),
    [drag, enabled, onBack, start, startX],
  );
  return usePanGesture(config);
}

/** Android's hardware back, gated so a surface that is not showing cannot
 *  swallow it. A no-op on iOS. */
export function useHardwareBack({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  useEffect(() => {
    if (!IS_ANDROID || !enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [enabled, onBack]);
}
