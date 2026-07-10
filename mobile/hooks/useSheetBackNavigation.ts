import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { IS_ANDROID } from '../constants/platform';

interface SheetBackNavigation {
  /** Whether the sheet is currently presented — gates the Android back handler
   *  so a backgrounded sheet doesn't swallow the system back button. */
  isOpen: boolean;
  /** True when a sub-page is showing (pop it); false at the root (dismiss). */
  canGoBack: boolean;
  /** Pop one sub-page back toward the sheet's root. */
  onBack: () => void;
  sheetRef: React.RefObject<BottomSheetModal | null>;
}

/** Multi-page-sheet back navigation, shared verbatim by MenuSheet and
 *  CountrySheet (DESIGN.md §Sheets): Android hardware-back pops a sub-page or
 *  dismisses at the root, and a left-edge swipe pops a sub-page. Returns the
 *  swipe-back `Pan` gesture to attach via `GestureDetector`. The 20/±10/80/800
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

  return Gesture.Pan()
    .enabled(canGoBack)
    .activeOffsetX(20)
    .failOffsetY([-10, 10])
    .onEnd(({ translationX, velocityX }) => {
      'worklet';
      if (translationX > 80 || velocityX > 800) {
        scheduleOnRN(onBack);
      }
    });
}
