import { useSwipeBackGesture } from './useSwipeBack';

interface SheetBackNavigation {
  /** True when a sub-page is showing (pop it); false at the root. */
  canGoBack: boolean;
  /** Pop one sub-page back toward the sheet's root. */
  onBack: () => void;
}

/** Multi-page-sheet back navigation, shared verbatim by MenuSheet and
 *  CountrySheet (DESIGN.md §Sheets): a left-edge swipe pops a sub-page.
 *  Returns the swipe-back pan gesture to attach via `GestureDetector`. The
 *  thresholds live in `useSwipeBack`, so no two surfaces can drift.
 *
 *  **Android's back key is the platform's, not ours.** A platform sheet on
 *  Android is a dialog window that takes key events and never forwards back:
 *  `@expo/ui` binds `shouldDismissOnBackPress` to `enablePanDownToClose`, so
 *  back closes the sheet from any page. The `BackHandler` that used to pop a
 *  page here could never fire, and closing a modal on back is what the
 *  platform does everywhere else, so it was removed rather than patched in. */
export function useSheetBackNavigation({ canGoBack, onBack }: SheetBackNavigation) {
  // The swipe pops a sub-page only. A sheet at its root is dismissed by the
  // platform's own downward drag, not by a horizontal one.
  return useSwipeBackGesture({ enabled: canGoBack, onBack });
}
