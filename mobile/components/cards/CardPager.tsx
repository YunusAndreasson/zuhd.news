import { memo, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useScrollState } from '../../hooks/useScrollState';
import { useVerticalPager, VERTICAL_PAGER_PROPS } from '../../hooks/useVerticalPager';
import type { SwipeCard } from '../../lib/cards/rank';
import { hapticTick } from '../../lib/haptics';
import { markHintDone } from '../../lib/onboarding-store';
import { EmptyState } from '../EmptyState';
import { CardView } from './CardView';

const cardKey = (card: SwipeCard) => card.id;

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
  /** Clears transient teaching UI as soon as the reader starts moving content. */
  onReadingScrollStart?: () => void;
  ref?: React.Ref<CardPagerRef>;
}

export const CardPager = memo(function CardPager({
  cards,
  viewportHeight,
  sectionIndex,
  progressesSV,
  emptyMessage,
  emptyHint,
  onReadingScrollStart,
  ref,
}: CardPagerProps) {
  const insets = useSafeAreaInsets();
  const listRef = useAnimatedRef<Animated.FlatList<SwipeCard>>();
  const { scrollY, currentIndex, setCurrentIndex } = useScrollState();
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const itemHeight = viewportHeight;
  const count = cards.length;
  const [resetScrollKey, setResetScrollKey] = useState(0);
  // Memoized for the same reason `ArticleList` memoizes its own: an inline
  // element remounts the footer on every render of a paging list.
  const safeAreaFooter = useMemo(() => <View style={{ height: insets.bottom }} />, [insets.bottom]);

  const handleSnap = useCallback(
    (index: number) => {
      hapticTick();
      // The reader has performed the lesson on a data deck. The onboarding
      // store historically counted article snaps only, so the swipe hint
      // returned over Markets/Shipping/Outlook after a successful page turn.
      markHintDone('swipe');
      setCurrentIndex(index);
    },
    [setCurrentIndex],
  );

  /**
   * The whole settle machinery — timers, drag/momentum ownership, the mark an
   * inner scroll leaves behind — lives in `useVerticalPager`, shared with the
   * article river, which had this same bug for as long as this deck had the
   * fix. `onSettled` fires only when the page actually changes.
   */
  const {
    handlePagerBeginDrag,
    handleEndDrag,
    handleMomentumBegin,
    handleMomentumEnd,
    armSettleFromScroll,
    handleInnerScrollConsumed,
    getItemLayout,
    resetToTop,
  } = useVerticalPager({
    listRef,
    scrollY,
    itemHeight,
    count,
    currentIndexRef,
    onSettled: handleSnap,
    onReadingScrollStart,
    items: cards,
    getItemKey: cardKey,
    onItemsReordered: setCurrentIndex,
  });

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      resetToTop();
      setResetScrollKey((key) => key + 1);
    },
  }));

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

  const renderItem = useCallback(
    ({ item, index }: { item: SwipeCard; index: number }) => (
      <CardView
        card={item}
        itemHeight={itemHeight}
        index={index}
        scrollY={scrollY}
        onInnerScrollConsumed={handleInnerScrollConsumed}
        onReadingScrollStart={onReadingScrollStart}
        hasNext={index < count - 1}
        resetScrollKey={resetScrollKey}
      />
    ),
    [count, handleInnerScrollConsumed, itemHeight, onReadingScrollStart, scrollY, resetScrollKey],
  );

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
      keyExtractor={cardKey}
      getItemLayout={getItemLayout}
      snapToInterval={itemHeight}
      {...VERTICAL_PAGER_PROPS}
      onScroll={scrollHandler}
      onScrollBeginDrag={handlePagerBeginDrag}
      onMomentumScrollBegin={handleMomentumBegin}
      onMomentumScrollEnd={handleMomentumEnd}
      onScrollEndDrag={handleEndDrag}
      maxToRenderPerBatch={2}
      ListFooterComponent={safeAreaFooter}
    />
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
});
