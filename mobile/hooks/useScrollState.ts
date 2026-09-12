import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

/**
 * Bundles the scroll-derived state ArticleList tracks across renders.
 * Extracted so the FlatList stays focused on rendering. Cleanup of the
 * overscroll timer happens here.
 *
 * `scrollY` may be supplied by the caller. The globe's camera reads one
 * offset, and two surfaces publish into it — the sheet's list and the
 * reader's pager — so the screen owns the value and hands it down rather
 * than each list owning its own and the globe having to choose between two
 * props whose identity changes as the reader opens and closes.
 */
interface ScrollState {
  scrollY: SharedValue<number>;
  currentIndex: number;
  setCurrentIndex: (value: number) => void;
  overscrollFired: SharedValue<boolean>;
  caughtUpFired: RefObject<boolean>;
  overscrollTimer: RefObject<ReturnType<typeof setTimeout> | undefined>;
}

export function useScrollState(external?: SharedValue<number>): ScrollState {
  const own = useSharedValue(0);
  const scrollY = external ?? own;
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
