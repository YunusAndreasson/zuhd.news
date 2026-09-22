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
 *  Android's dialog consumes Back before React Native's BackHandler. Sheets
 *  with sub-pages must also pass their active back callback to SheetLayout's
 *  native onBackPress prop. This hook handles the horizontal gesture only. */
export function useSheetBackNavigation({ canGoBack, onBack }: SheetBackNavigation) {
  // The swipe pops a sub-page only. A sheet at its root is dismissed by the
  // platform's own downward drag, not by a horizontal one.
  return useSwipeBackGesture({ enabled: canGoBack, onBack });
}
