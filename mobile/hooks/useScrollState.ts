import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

/**
 * Bundles the scroll-derived state ArticleList tracks across renders.
 * Extracted so the FlatList stays focused on rendering. Cleanup of the
 * overscroll timer happens here.
 *
 * `initial` exists for a list that opens somewhere other than its first item.
 * It has to be seeded at the first render rather than in an effect: `CardFrame`
 * fades a card in off `scrollY` (a scroll-linked style, not a mount
 * animation), so a pager entered at index 3 with the offset still reading 0
 * computes that card's opacity as if it were three pages away and paints it
 * invisible. Seeding `currentIndex` with it also stops the first settle
 * reporting an index change that never happened, which would fire a haptic on
 * arrival.
 */
interface ScrollState {
  scrollY: SharedValue<number>;
  currentIndex: number;
  setCurrentIndex: (value: number) => void;
  overscrollFired: SharedValue<boolean>;
  caughtUpFired: RefObject<boolean>;
  overscrollTimer: RefObject<ReturnType<typeof setTimeout> | undefined>;
}

export function useScrollState(initial?: { offset: number; index: number }): ScrollState {
  const scrollY = useSharedValue(initial?.offset ?? 0);
  const [currentIndex, setCurrentIndex] = useState(initial?.index ?? 0);
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
