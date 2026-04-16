import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

/**
 * Manages scroll-derived state for ArticleList and resets it all
 * atomically when the FlatList remounts (resetKey change).
 *
 * Extracted so the reset logic is independently testable — the original
 * bug was a stale scrollY causing the first article to render at opacity 0
 * after a background refresh.
 */
interface ScrollState {
  scrollY: SharedValue<number>;
  currentIndex: number;
  setCurrentIndex: (value: number) => void;
  overscrollFired: SharedValue<boolean>;
  caughtUpFired: RefObject<boolean>;
  overscrollTimer: RefObject<ReturnType<typeof setTimeout> | undefined>;
}

export function useScrollState(
  resetKey: number | undefined,
  catIndex: number,
  progressesSV: SharedValue<number[]>,
): ScrollState {
  const scrollY = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const overscrollFired = useSharedValue(false);
  const caughtUpFired = useRef(false);
  const overscrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset all scroll-derived state when FlatList remounts (e.g. after background refresh)
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the intentional trigger for remount reset
  useEffect(() => {
    scrollY.value = 0;
    setCurrentIndex(0);
    overscrollFired.value = false;
    caughtUpFired.current = false;
    if (overscrollTimer.current) clearTimeout(overscrollTimer.current);
    progressesSV.modify((arr) => {
      'worklet';
      arr[catIndex] = 0;
      return arr;
    });
  }, [resetKey, scrollY, overscrollFired, progressesSV, catIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overscrollTimer.current) clearTimeout(overscrollTimer.current);
    };
  }, []);

  return {
    scrollY,
    currentIndex,
    setCurrentIndex,
    overscrollFired,
    caughtUpFired,
    overscrollTimer,
  };
}
