import { useEffect, useMemo } from 'react';
import { BackHandler } from 'react-native';
import { type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { IS_ANDROID } from '../constants/platform';

/**
 * Going back, as one gesture and one set of numbers.
 *
 * `useSheetBackNavigation` owned these thresholds so its two multi-page
 * sheets could not drift apart. The reader needs the same gesture — and on
 * the map screen the horizontal axis is free for the first time, because the
 * section rail that used to own it is gone — so the numbers move here rather
 * than being typed a third time.
 *
 * `failOffsetY` is what keeps this off the vertical axis. The reader is a
 * vertical pager over a prose scroller with three load-bearing nested-scroll
 * guards (`mobile/CLAUDE.md`), and a dismiss gesture that competed with those
 * would be re-opening a bug the app has already paid for twice. A horizontal
 * swipe steals nothing.
 */

/** Travel before the pan claims the touch. */
const ACTIVE_OFFSET_X = 20;
/** Vertical slop beyond which this is a scroll, not a back-swipe. */
const FAIL_OFFSET_Y: [number, number] = [-10, 10];
/** Either of these commits: a deliberate drag, or a flick. */
const COMMIT_DISTANCE = 80;
const COMMIT_VELOCITY = 800;

export function useSwipeBackGesture({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  // The config object is memoized, not the gesture. Under the v3 hook API the
  // handler tag is stable for the component's lifetime — that is what the hook
  // owns, and it is why there is no longer a gesture object to keep identical.
  // The config still has to be, though: `usePanGesture` re-pushes it to the
  // native side whenever its identity changes, and an inline object literal
  // with an inline worklet is a fresh identity on every render.
  const config = useMemo<PanGestureConfig>(
    () => ({
      enabled,
      activeOffsetX: ACTIVE_OFFSET_X,
      failOffsetY: FAIL_OFFSET_Y,
      onDeactivate: ({ translationX, velocityX }) => {
        'worklet';
        if (translationX > COMMIT_DISTANCE || velocityX > COMMIT_VELOCITY) {
          scheduleOnRN(onBack);
        }
      },
    }),
    [enabled, onBack],
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
