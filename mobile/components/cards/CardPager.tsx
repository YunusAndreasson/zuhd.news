import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useScrollState } from '../../hooks/useScrollState';
import type { SwipeCard } from '../../lib/cards/rank';
import { hapticTick } from '../../lib/haptics';
import { EmptyState } from '../EmptyState';
import { CardView } from './CardView';

/**
 * A column of full-screen cards, paged vertically.
 *
 * The same two axes the app has always had: horizontal moves between sections,
 * vertical moves between things inside one. This is `ArticleList`'s scroll
 * mechanics — snap paging, `getItemLayout` off a uniform height, a tick on
 * every snap, progress written into the shared value the section rail reads —
 * with a `Card` in place of an `Article` and no globe behind it.
 *
 * It deliberately does not carry `ArticleList`'s other machinery: no pull to
 * refresh (these payloads refresh on resume, not on demand), no caught-up
 * boundary (there is nothing here to have already seen), no overscroll toast.
 */

export interface CardPagerRef {
  scrollToTop: () => void;
}

interface CardPagerProps {
  cards: SwipeCard[];
  viewportHeight: number;
  /** Index of this section in the horizontal pager — the slot it owns in
   *  `progressesSV`, which drives the rail's fill. */
  sectionIndex: number;
  progressesSV: SharedValue<number[]>;
  /** Shown when the section has no cards — a failed fetch, or a snapshot the
   *  pipeline has not written yet. */
  emptyMessage: string;
  emptyHint?: string;
  ref?: React.Ref<CardPagerRef>;
}

export const CardPager = memo(function CardPager({
  cards,
  viewportHeight,
  sectionIndex,
  progressesSV,
  emptyMessage,
  emptyHint,
  ref,
}: CardPagerProps) {
  const insets = useSafeAreaInsets();
  const listRef = useAnimatedRef<Animated.FlatList<SwipeCard>>();
  const { scrollY, currentIndex, setCurrentIndex } = useScrollState();
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const itemHeight = viewportHeight;
  const count = cards.length;
  // Memoized for the same reason `ArticleList` memoizes its own: an inline
  // element remounts the footer on every render of a paging list.
  const safeAreaFooter = useMemo(() => <View style={{ height: insets.bottom }} />, [insets.bottom]);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
  }));

  // A refresh can legitimately reorder the deck as a new event, a stronger
  // news tie or an unusual move arrives. Keep the reader on the same card by
  // stable id instead of silently replacing the page under them.
  const previousIdsRef = useRef<string[]>([]);
  useLayoutEffect(() => {
    const nextIds = cards.map((card) => card.id);
    const previousIds = previousIdsRef.current;
    previousIdsRef.current = nextIds;
    if (previousIds.length === 0 || nextIds.length === 0) return;
    const previousId = previousIds[currentIndexRef.current];
    if (!previousId) return;
    const nextIndex = nextIds.indexOf(previousId);
    if (nextIndex < 0 || nextIndex === currentIndexRef.current) return;
    listRef.current?.scrollToOffset({ offset: nextIndex * itemHeight, animated: false });
    setCurrentIndex(nextIndex);
  }, [cards, itemHeight, listRef, setCurrentIndex]);

  /**
   * Land on a page, always — but only once the list has actually stopped.
   *
   * `pagingEnabled` snaps a gesture the list itself received. It does not snap
   * one that arrives some other way: a card taller than the screen scrolls its
   * own last inch first, and what is left of that swipe reaches the list with
   * no touch-down and no fling, so the list moves part of a page and stops
   * there. Both cards then sit at partial opacity — `CardFrame`'s arrival
   * animation is driven off this offset — and the reader is looking at two
   * half-visible screens with nothing to tell them which swipe gets out of it.
   *
   * The correction must not run at the *end of the drag*, which is the obvious
   * place to put it and is wrong. A flick lifts the finger early and lets
   * momentum carry the page: the drag ends 40% of the way across, and a
   * correction there rounds that to zero and drags the reader back to the page
   * they just left, cancelling a fling that was about to land correctly. So a
   * drag end only *arms* the check, momentum starting disarms it, and momentum
   * ending runs it immediately. What is left for the timer is exactly the case
   * it is for: a scroll that stopped dead somewhere between two pages.
   */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settleToPage = useCallback(
    (y: number) => {
      const idx = Math.max(0, Math.min(Math.round(y / itemHeight), count - 1));
      const target = idx * itemHeight;
      // A point of slack: a list resting exactly on a page reports a
      // sub-pixel offset often enough that correcting it would fight the
      // reader's own scroll on every single swipe.
      if (Math.abs(y - target) > 1) {
        listRef.current?.scrollToOffset({ offset: target, animated: true });
      }
      if (idx === currentIndexRef.current) return;
      hapticTick();
      setCurrentIndex(idx);
    },
    [count, itemHeight, listRef, setCurrentIndex],
  );

  const clearSettle = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  /** Whether a gesture the list itself received currently owns it. The
   *  scroll-armed settle below must never fire under the reader's finger, and
   *  must never cut a fling short — both would yank the page out from under a
   *  deliberate movement. Refs, not state: nothing here renders. */
  const draggingRef = useRef(false);
  const momentumRef = useRef(false);

  const handleBeginDrag = useCallback(() => {
    draggingRef.current = true;
    clearSettle();
  }, [clearSettle]);

  const handleEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      draggingRef.current = false;
      clearSettle();
      // Long enough that a fling has begun and disarmed this, short enough
      // that a dead stop does not read as the app having frozen.
      settleTimer.current = setTimeout(() => settleToPage(y), 120);
    },
    [clearSettle, settleToPage],
  );

  const handleMomentumBegin = useCallback(() => {
    momentumRef.current = true;
    clearSettle();
  }, [clearSettle]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      momentumRef.current = false;
      clearSettle();
      settleToPage(e.nativeEvent.contentOffset.y);
    },
    [clearSettle, settleToPage],
  );

  /**
   * The correction for a scroll that no gesture on this list produced.
   *
   * Called from the scroll worklet (throttled there), and it declines whenever
   * a drag or a fling owns the list — those already end in `handleEndDrag` or
   * `handleMomentumEnd`, which are better informed than a timer. What is left
   * is the case neither of those can see: an inner card scroll reaching its
   * end and handing the remainder of the swipe up to this list, which then
   * stops between two pages having never been dragged.
   *
   * The offset is read at fire time rather than captured when armed, because
   * the list has usually kept moving in the intervening frames.
   */
  const armSettleFromScroll = useCallback(() => {
    if (draggingRef.current || momentumRef.current) return;
    clearSettle();
    settleTimer.current = setTimeout(() => {
      if (draggingRef.current || momentumRef.current) return;
      settleToPage(scrollY.value);
    }, 140);
  }, [clearSettle, settleToPage, scrollY]);

  useEffect(() => clearSettle, [clearSettle]);

  /** Throttle clock for the settle-arm hop below. Shared rather than a ref
   *  because only the UI thread reads or writes it. */
  const lastArmAt = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      scrollY.value = y;
      const total = Math.max((count - 1) * itemHeight, 1);
      const progress = Math.max(0, Math.min(y / total, 1));
      progressesSV.modify((arr) => {
        'worklet';
        arr[sectionIndex] = progress;
        return arr;
      });

      // Arm the settle from the scroll itself, not only from a drag ending.
      //
      // `onScrollEndDrag` was the sole trigger, and it cannot fire for the one
      // arrival that needs correcting most: a card taller than the page hands
      // its leftover overscroll to this list, so the list moves having never
      // been touched. No drag end, no momentum end, nothing to snap — and it
      // parks between two pages with one card faded out and the next at half
      // opacity, which is precisely the state `nestedScrollEnabled` was once
      // disabled to avoid. It is cheaper to catch the landing than to forbid
      // the handoff, because forbidding it silently truncated the card.
      //
      // Only when off-page, and at most ten times a second: a hop per frame
      // would put 60 JS tasks a second behind every scroll.
      const off = y % itemHeight;
      const offPage = Math.min(off, itemHeight - off) > 1;
      const now = Date.now();
      if (offPage && now - lastArmAt.value > 100) {
        lastArmAt.value = now;
        scheduleOnRN(armSettleFromScroll);
      }
    },
  });

  const getItemLayout = useCallback(
    (_: ArrayLike<SwipeCard> | null | undefined, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    }),
    [itemHeight],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SwipeCard; index: number }) => (
      <CardView card={item} itemHeight={itemHeight} index={index} scrollY={scrollY} />
    ),
    [itemHeight, scrollY],
  );

  const keyExtractor = useCallback((item: SwipeCard) => item.id, []);

  if (count === 0) {
    return (
      <View style={{ height: viewportHeight }}>
        <EmptyState message={emptyMessage} hint={emptyHint} />
      </View>
    );
  }

  return (
    <Animated.FlatList
      ref={listRef}
      style={styles.list}
      data={cards}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      onScrollBeginDrag={handleBeginDrag}
      onMomentumScrollBegin={handleMomentumBegin}
      onMomentumScrollEnd={handleMomentumEnd}
      onScrollEndDrag={handleEndDrag}
      scrollEventThrottle={16}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={3}
      ListFooterComponent={safeAreaFooter}
    />
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
});
