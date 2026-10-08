import { useSharedValue } from 'react-native-reanimated';
import { useSwipeBackGesture } from './useSwipeBack';

interface SheetBackNavigation {
  /** True when a sub-page is showing (pop it); false at the root. */
  canGoBack: boolean;
  /** Pop one sub-page back toward the sheet's root. */
  onBack: () => void;
}

/** Multi-page-sheet back navigation, shared verbatim by MenuSheet and
 *  CountrySheet (DESIGN.md §Sheets): a rightward swipe pops a sub-page, and
 *  the page follows the finger on its way. Returns the swipe-back pan gesture
 *  to attach via `GestureDetector`, and `drag` to hand to the sheet's
 *  `SheetPager`, which draws it. The thresholds live in `useSwipeBack`, so no
 *  two surfaces can drift.
 *
 *  Android's dialog consumes Back before React Native's BackHandler. Sheets
 *  with sub-pages must also pass their active back callback to SheetLayout's
 *  native onBackPress prop. This hook handles the horizontal gesture only. */
export function useSheetBackNavigation({ canGoBack, onBack }: SheetBackNavigation) {
  const drag = useSharedValue(0);
  // The swipe pops a sub-page only. A sheet at its root is dismissed by the
  // platform's own downward drag, not by a horizontal one.
  const gesture = useSwipeBackGesture({ enabled: canGoBack, onBack, drag });
  return { gesture, drag };
}
