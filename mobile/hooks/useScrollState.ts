import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

/**
 * Bundles the scroll-derived state ArticleList tracks across renders.
 * Extracted so the FlatList stays focused on rendering. Cleanup of the
 * overscroll timer happens here.
 */
interface ScrollState {
  scrollY: SharedValue<number>;
  currentIndex: number;
  setCurrentIndex: (value: number) => void;
  overscrollFired: SharedValue<boolean>;
  caughtUpFired: RefObject<boolean>;
  overscrollTimer: RefObject<ReturnType<typeof setTimeout> | undefined>;
}

export function useScrollState(): ScrollState {
  const scrollY = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const overscrollFired = useSharedValue(false);
  const caughtUpFired = useRef(false);
  const overscrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
