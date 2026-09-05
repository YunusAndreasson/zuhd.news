import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SPACING } from '../../constants/theme';
import { useCardVisit } from '../../hooks/useCardVisit';
import { useScrollState } from '../../hooks/useScrollState';
import { useTheme } from '../../hooks/useTheme';
import { useVerticalPager, VERTICAL_PAGER_PROPS } from '../../hooks/useVerticalPager';
import { cardStatus, type DeckPage } from '../../lib/card-history';
import type { SwipeCard } from '../../lib/cards/rank';
import { hapticTick } from '../../lib/haptics';
import { markHintDone } from '../../lib/onboarding-store';
import { EmptyState } from '../EmptyState';
import { Text } from '../primitives';
import { CardView } from './CardView';

const cardKey = (card: DeckPage) => card.id;

/**
 * A column of full-screen cards, paged vertically.
 *
 * The same two axes the app has always had: horizontal moves between sections,
 * vertical moves between things inside one. This is `ArticleList`'s scroll
 * mechanics — snap paging, `getItemLayout` off a uniform height, a tick on
 * every snap, progress written into the shared value the section rail reads —
 * with a `Card` in place of an `Article` and no globe behind it.
 *
 * It deliberately does not carry `ArticleList`'s overscroll toast. It *does*
 * carry pull to refresh: the claim that "these payloads refresh on resume, not
 * on demand" was true of the mechanism and false about the reader, who has one
 * gesture for "get me the new thing" and found it working on one of four tabs.
 * `onRefresh` reaches the same `/api/meta.json` probe the feed uses, and a
 * changed build invalidates every snapshot at once, so a pull on Markets
 * refreshes the cards it is pulling on.
 *
 * A visit freezes unseen updates ahead of a caught-up boundary and viewed cards.
 */

export interface CardPagerRef {
  scrollToTop: () => void;
}

interface CardPagerProps {
  cards: SwipeCard[];
  active: boolean;
  visible: boolean;
  section: string;
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
  /** Pull to refresh. Rejects to signal failure; the caller owns the toast, the
   *  same contract `ArticleList` has. Omit and the control is not rendered. */
  onRefresh?: () => Promise<void>;
  ref?: React.Ref<CardPagerRef>;
}

export const CardPager = memo(function CardPager({
  cards,
  active,
  visible,
  section,
  viewportHeight,
  sectionIndex,
  progressesSV,
  emptyMessage,
  emptyHint,
  onReadingScrollStart,
  onRefresh,
  ref,
}: CardPagerProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const listRef = useAnimatedRef<Animated.FlatList<DeckPage>>();
  const { scrollY, currentIndex, setCurrentIndex } = useScrollState();
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const itemHeight = viewportHeight;
  const [moving, setMoving] = useState(false);
  const { pages, history } = useCardVisit(section, cards, active, currentIndex, moving || !visible);
  const count = pages.length;
  const remaining = pages.filter(
    (page) => page.kind === 'card' && cardStatus(section, page.card, history) !== 'viewed',
  ).length;
  const [resetScrollKey, setResetScrollKey] = useState(0);
  // Memoized for the same reason `ArticleList` memoizes its own: an inline
  // element remounts the footer on every render of a paging list.
  const safeAreaFooter = useMemo(() => <View style={{ height: insets.bottom }} />, [insets.bottom]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    // try/catch and deliberately not try/finally — `ArticleList.handleRefresh`
    // documents why at length: React Compiler cannot lower a finalizer and
    // silently drops the whole file when one is present. The catch swallows, so
    // control always reaches the reset.
    try {
      await onRefresh();
    } catch {
      // The injected handler owns its own toast.
    }
    setRefreshing(false);
  }, [onRefresh]);

  /**
   * Referentially stable for the reason `ArticleList` spells out: rebuilding
   * this element makes Android rebuild the whole VirtualizedList subtree, and
   * this list re-renders on every snap.
   *
   * `undefined` when no handler was passed, so a caller that does not support
   * refreshing does not get a control that spins and does nothing.
   */
  const refreshControl = useMemo(
    () =>
      onRefresh ? (
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.textSecondary}
          progressBackgroundColor={colors.bg}
          colors={[colors.textSecondary]}
        />
      ) : undefined,
    [onRefresh, refreshing, handleRefresh, colors.textSecondary, colors.bg],
  );

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
    items: pages,
    getItemKey: cardKey,
    onItemsReordered: setCurrentIndex,
    preserveAtTop: false,
  });

  useEffect(() => {
    if (active && pages.length) {
      setMoving(false);
      resetToTop();
    }
  }, [active, pages, resetToTop]);

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
    ({ item, index }: { item: DeckPage; index: number }) =>
      item.kind === 'boundary' ? (
        <View style={[styles.boundary, { height: itemHeight }]}>
          <Text variant="title" accessibilityRole="header">
            {remaining === 0 ? 'You’re caught up' : 'End of updates'}
          </Text>
          <Text variant="body" tone="secondary">
            {remaining === 0
              ? 'You’ve viewed all the updates in this section.'
              : `${remaining} ${remaining === 1 ? 'update not viewed' : 'updates not viewed'}. Swipe back to review.`}
          </Text>
          {item.previouslyViewed > 0 ? (
            <Text variant="caption" tone="secondary">
              Previously viewed below · swipe up
            </Text>
          ) : null}
        </View>
      ) : (
        <CardView
          card={item.card}
          status={item.status}
          itemHeight={itemHeight}
          index={index}
          scrollY={scrollY}
          onInnerScrollConsumed={handleInnerScrollConsumed}
          onReadingScrollStart={onReadingScrollStart}
          hasNext={index < count - 1}
          resetScrollKey={resetScrollKey}
        />
      ),
    [
      count,
      handleInnerScrollConsumed,
      itemHeight,
      onReadingScrollStart,
      scrollY,
      resetScrollKey,
      remaining,
    ],
  );

  if (count === 0) {
    // A ScrollView rather than a View, purely so the empty state can be pulled.
    // This is the screen where a reader most wants to retry — "no market graphs
    // yet" is what a failed fetch looks like — and it was the one screen with
    // no gesture at all. `alwaysBounceVertical` because a page that exactly
    // fills its viewport has nothing to drag against on iOS.
    return (
      <ScrollView
        style={{ height: viewportHeight }}
        contentContainerStyle={{ height: viewportHeight }}
        refreshControl={refreshControl}
        alwaysBounceVertical={!!onRefresh}
        showsVerticalScrollIndicator={false}
      >
        <EmptyState message={emptyMessage} hint={emptyHint} />
      </ScrollView>
    );
  }

  return (
    <Animated.FlatList
      ref={listRef}
      style={styles.list}
      data={pages}
      renderItem={renderItem}
      keyExtractor={cardKey}
      getItemLayout={getItemLayout}
      snapToInterval={itemHeight}
      {...VERTICAL_PAGER_PROPS}
      refreshControl={refreshControl}
      onScroll={scrollHandler}
      onScrollBeginDrag={() => {
        setMoving(true);
        handlePagerBeginDrag();
      }}
      onMomentumScrollBegin={() => {
        setMoving(true);
        handleMomentumBegin();
      }}
      onMomentumScrollEnd={(event) => {
        handleMomentumEnd(event);
        setMoving(false);
      }}
      onScrollEndDrag={(event) => {
        handleEndDrag(event);
        setMoving(false);
      }}
      maxToRenderPerBatch={2}
      ListFooterComponent={safeAreaFooter}
    />
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
  boundary: { justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.md },
});
