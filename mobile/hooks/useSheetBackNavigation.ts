import { useEffect, useMemo } from 'react';
import { BackHandler } from 'react-native';
import { type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import type { BottomSheetMethodsRef } from '../components/SheetLayout';
import { IS_ANDROID } from '../constants/platform';

interface SheetBackNavigation {
  /** Whether the sheet is currently presented — gates the Android back handler
   *  so a backgrounded sheet doesn't swallow the system back button. */
  isOpen: boolean;
  /** True when a sub-page is showing (pop it); false at the root (dismiss). */
  canGoBack: boolean;
  /** Pop one sub-page back toward the sheet's root. */
  onBack: () => void;
  sheetRef: React.RefObject<BottomSheetMethodsRef | null>;
}

/** Multi-page-sheet back navigation, shared verbatim by MenuSheet and
 *  CountrySheet (DESIGN.md §Sheets): Android hardware-back pops a sub-page or
 *  dismisses at the root, and a left-edge swipe pops a sub-page. Returns the
 *  swipe-back pan gesture to attach via `GestureDetector`. The 20/±10/80/800
 *  thresholds live here so both sheets can't drift apart. */
export function useSheetBackNavigation({
  isOpen,
  canGoBack,
  onBack,
  sheetRef,
}: SheetBackNavigation) {
  useEffect(() => {
    if (!IS_ANDROID || !isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        onBack();
        return true;
      }
      sheetRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, canGoBack, onBack, sheetRef]);

  // The config object is memoized, not the gesture. Under the v3 hook API the
  // handler tag is stable for the component's lifetime — that is what the hook
  // owns, and it is why there is no longer a gesture object to keep identical.
  // The config still has to be, though: `usePanGesture` re-pushes it to the
  // native side whenever its identity changes, and an inline object literal
  // with an inline worklet is a fresh identity on every render.
  const config = useMemo<PanGestureConfig>(
    () => ({
      enabled: canGoBack,
      activeOffsetX: 20,
      failOffsetY: [-10, 10],
      onDeactivate: ({ translationX, velocityX }) => {
        'worklet';
        if (translationX > 80 || velocityX > 800) {
          scheduleOnRN(onBack);
        }
      },
    }),
    [canGoBack, onBack],
  );
  return usePanGesture(config);
}
