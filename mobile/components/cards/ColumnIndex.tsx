import { memo, useEffect, useImperativeHandle, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING } from '../../constants/theme';
import { indexRow } from '../../lib/cards/row';
import type { Card } from '../../lib/cards/types';
import { EmptyState } from '../EmptyState';
import { IndicatorRow } from './IndicatorRow';

/**
 * A column, as one screen.
 *
 * `commodities`, `money` and `outlook` hold six cards each, and each card is a
 * screenful of prose — so answering "did anything move this morning?" used to
 * cost six swipes and six readings per column. Everything a reader needs for
 * that question is already computed and already coloured; it was just arriving
 * underneath four paragraphs.
 *
 * This is the front door now, and the card is what a tap opens. Nothing the
 * pipeline wrote is lost — the five parts, the `standing` paragraph, the chart
 * and the related stories are all one tap away, in `CardPager`, unchanged. The
 * rule that decides which cards exist at all is untouched too; what changed is
 * only which of them a reader meets first.
 *
 * ── Why a ScrollView and not a list ───────────────────────────────────────
 *
 * Six rows, nine on the busiest plausible day. Virtualisation buys nothing at
 * that size and costs the guarantee that matters here: the whole column is on
 * screen at once, measured in one pass, with no blank cells during a fling.
 *
 * It scrolls rather than compressing or folding when a day is busy. Hiding a
 * row to keep a one-screen promise would be the promise eating the content.
 */

export interface ColumnIndexRef {
  scrollToTop: () => void;
}

export const ColumnIndex = memo(function ColumnIndex({
  cards,
  viewportHeight,
  sectionIndex,
  progressesSV,
  emptyMessage,
  emptyHint,
  onCardPress,
  ref,
}: {
  cards: Card[];
  viewportHeight: number;
  /** This column's slot in the shared progress array the section rail reads. */
  sectionIndex: number;
  progressesSV: SharedValue<number[]>;
  emptyMessage: string;
  emptyHint?: string;
  onCardPress: (index: number) => void;
  ref?: React.Ref<ColumnIndexRef>;
}) {
  const insets = useSafeAreaInsets();
  const listRef = useAnimatedRef<Animated.ScrollView>();

  useImperativeHandle(ref, () => ({
    scrollToTop: () => listRef.current?.scrollTo({ y: 0, animated: true }),
  }));

  const rows = useMemo(() => cards.map(indexRow), [cards]);

  /**
   * The rail's fill belongs to whichever of the two views is on screen.
   *
   * `CardPager` leaves this column's slot wherever the reader stopped reading,
   * so returning to an index that fits on one screen would leave a fill under
   * a column with nothing to scroll. Zero it on mount, and on unmount so the
   * pager starts from its own first frame rather than from ours.
   */
  useEffect(() => {
    const reset = () => {
      progressesSV.modify((arr) => {
        'worklet';
        arr[sectionIndex] = 0;
        return arr;
      });
    };
    reset();
    return reset;
  }, [progressesSV, sectionIndex]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      // The scrollable distance, not the content height: a column that fits
      // reports zero and the rail draws no fill, which is the honest answer
      // when there is nothing below the fold.
      const total = Math.max(event.contentSize.height - event.layoutMeasurement.height, 1);
      const progress = Math.max(0, Math.min(y / total, 1));
      progressesSV.modify((arr) => {
        'worklet';
        arr[sectionIndex] = progress;
        return arr;
      });
    },
  });

  const contentStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + SPACING.xxl + SPACING.md }),
    [insets.bottom],
  );

  if (cards.length === 0) {
    return (
      <View style={{ height: viewportHeight }}>
        <EmptyState message={emptyMessage} hint={emptyHint} />
      </View>
    );
  }

  return (
    <Animated.ScrollView
      ref={listRef}
      style={styles.list}
      contentContainerStyle={[styles.content, contentStyle]}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {rows.map((row, i) => (
        <IndicatorRow key={row.id} row={row} index={i} onPress={onCardPress} />
      ))}
    </Animated.ScrollView>
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: SPACING.sm,
  },
});
