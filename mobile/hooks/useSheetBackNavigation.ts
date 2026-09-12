import { useCallback } from 'react';
import type { BottomSheetMethodsRef } from '../components/SheetLayout';
import { useHardwareBack, useSwipeBackGesture } from './useSwipeBack';

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
 *  swipe-back pan gesture to attach via `GestureDetector`. The thresholds live
 *  in `useSwipeBack`, which the reader shares, so no two surfaces can drift. */
export function useSheetBackNavigation({
  isOpen,
  canGoBack,
  onBack,
  sheetRef,
}: SheetBackNavigation) {
  const handleBack = useCallback(() => {
    if (canGoBack) {
      onBack();
      return;
    }
    sheetRef.current?.dismiss();
  }, [canGoBack, onBack, sheetRef]);

  useHardwareBack({ enabled: isOpen, onBack: handleBack });
  // The swipe pops a sub-page only. A sheet at its root is dismissed by the
  // platform's own downward drag, not by a horizontal one.
  return useSwipeBackGesture({ enabled: canGoBack, onBack });
}
