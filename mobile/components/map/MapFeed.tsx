import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { categoryMarkColor, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { StoryRow } from '../../lib/map-feed';
import type { NowItem } from '../../lib/now';
import { EmptyState } from '../EmptyState';
import { Text } from '../primitives';
import { FeedRow } from './FeedRow';

/**
 * The sheet's list: the news, newest first, with any live Red alert above it.
 *
 * ## Why the block is in the list header rather than in the data
 *
 * Every row the list scrolls is exactly `rowHeight` tall, because the globe's
 * camera finds the story under the reader by dividing scroll offset by row
 * height. A heading and a tail row are not that height and never will be, so
 * they live in `ListHeaderComponent` — outside the indexed data — and the
 * scroll handler subtracts the header's measured height before publishing.
 * The camera therefore sees a clean `0, 1, 2 …` over the stories alone.
 *
 * ## Why the NOW block holds no stories
 *
 * The river directly below it is strictly newest-first, so its first row *is*
 * the lead story. A block above that repeating it would be the one thing
 * `foundation.md` forbids outright. What the block carries is what the river
 * structurally cannot: a Red hazard with no article yet. See `lib/now.ts`.
 *
 * ## Why there are no instruments here
 *
 * The sheet is for news. Straits, markets, currencies and contracts are the
 * strip's — every one that moved is on it, and `all →` at its end opens the
 * rest — so a block of them here was the same subject in two places.
 */

interface MapFeedProps {
  rows: StoryRow[];
  now: NowItem[];
  rowHeight: number;
  scrollEnabled: boolean;
  /** Raw content offset, read by the sheet's pan to decide who owns a drag. */
  listOffset: SharedValue<number>;
  /** Content offset minus the header, published to the globe's camera. */
  cameraScrollY: SharedValue<number>;
  /** Measured header height, so the two offsets above can differ by it. */
  headerHeight: SharedValue<number>;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onDragStart: () => void;
  onStoryPress: (row: StoryRow) => void;
  onNowPress: (item: NowItem) => void;
  bottomInset: number;
  /** Stories the reader has opened; their rows drop to secondary ink. */
  found?: ReadonlySet<string>;
  /**
   * Where to put the list on mount. The sheet swaps this list for a story
   * preview and back, which remounts it; without this every return from a
   * preview would drop the reader at the top of the river.
   */
  initialOffset?: number;
}

const NowBlock = memo(function NowBlock({
  now,
  rowHeight,
  onNowPress,
}: {
  now: NowItem[];
  rowHeight: number;
  onNowPress: (item: NowItem) => void;
}) {
  if (now.length === 0) return null;
  return (
    <View>
      <Text variant="labelXs" tone="emphasis" style={styles.heading}>
        now
      </Text>
      {now.map((item) => (
        <NowRow key={item.id} item={item} rowHeight={rowHeight} onPress={onNowPress} />
      ))}
    </View>
  );
});

const NowRow = memo(function NowRow({
  item,
  rowHeight,
  onPress,
}: {
  item: NowItem;
  rowHeight: number;
  onPress: (item: NowItem) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  return (
    <FeedRow
      height={rowHeight}
      title={item.title}
      meta={item.kicker}
      // The same ink step a card uses, in the same slot: the alert is live,
      // and that is what a heading alone cannot say about an individual row.
      mark="current"
      onPress={handlePress}
      accessibilityLabel={`${item.title}, ${item.kicker}`}
      accessibilityHint="Opens the alert"
    />
  );
});

const StoryFeedRow = memo(function StoryFeedRow({
  row,
  rowHeight,
  found,
  onPress,
}: {
  row: StoryRow;
  rowHeight: number;
  found: boolean;
  onPress: (row: StoryRow) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress(row), [onPress, row]);
  return (
    <FeedRow
      height={rowHeight}
      title={row.title}
      meta={row.meta}
      mark={row.mark}
      odds={row.odds}
      found={found}
      hue={categoryMarkColor(row.article.category, colors)}
      onPress={handlePress}
      accessibilityLabel={found ? `${row.title}, found` : row.title}
      accessibilityHint={row.odds ? `Read the story. Traders price this at ${row.odds}` : 'Read'}
    />
  );
});

export const MapFeed = memo(function MapFeed({
  rows,
  now,
  rowHeight,
  scrollEnabled,
  listOffset,
  cameraScrollY,
  headerHeight,
  onHeaderLayout,
  onDragStart,
  onStoryPress,
  onNowPress,
  bottomInset,
  found,
  initialOffset = 0,
}: MapFeedProps) {
  const listRef = useAnimatedRef<Animated.FlatList<StoryRow>>();

  // Mount-only: the offset belongs to the moment the list came back.
  const initialOffsetRef = useRef(initialOffset);
  useEffect(() => {
    const offset = initialOffsetRef.current;
    if (offset <= 0) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [listRef]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      listOffset.value = y;
      // Negative while the header is still on screen. `MiniGlobe` clamps at
      // zero, so the camera simply rests on the first story until the reader
      // has scrolled past the block.
      cameraScrollY.value = y - headerHeight.value;
    },
    onBeginDrag: () => {
      'worklet';
      // A real finger on the list. This is what hands the camera back to the
      // scroll position after a drag on the globe or a selection took it —
      // `onScroll` alone would do it on programmatic scrolls too.
      //
      // `scheduleOnRN` with a named callback, never an inline arrow: an
      // inline function inside an auto-workletized body is serialized as a
      // Remote Function, and calling one synchronously on the UI runtime is
      // `std::terminate`. That shape aborted TestFlight builds 288/289/292.
      scheduleOnRN(onDragStart);
    },
  });

  const renderItem = useCallback(
    ({ item }: { item: StoryRow }) => (
      <StoryFeedRow
        row={item}
        rowHeight={rowHeight}
        found={found?.has(item.slug) ?? false}
        onPress={onStoryPress}
      />
    ),
    [found, onStoryPress, rowHeight],
  );

  const keyExtractor = useCallback((item: StoryRow) => item.slug, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<StoryRow> | null | undefined, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  const header = useMemo(
    () => (
      <View onLayout={onHeaderLayout}>
        <NowBlock now={now} rowHeight={rowHeight} onNowPress={onNowPress} />
      </View>
    ),
    [now, onHeaderLayout, onNowPress, rowHeight],
  );

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: bottomInset + SPACING.lg }),
    [bottomInset],
  );

  return (
    <Animated.FlatList
      ref={listRef}
      style={styles.list}
      data={rows}
      renderItem={renderItem}
      // A find re-renders the rows whose ink changed.
      extraData={found}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      ListHeaderComponent={header}
      ListEmptyComponent={EMPTY}
      contentContainerStyle={contentContainerStyle}
      scrollEnabled={scrollEnabled}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      // Rule 2 of the sheet's gesture ownership: a list that cannot bounce is
      // a list the sheet's pan can safely run beside at the top.
      bounces={false}
      overScrollMode="never"
      // No RefreshControl. Pulled down at the top this list belongs to the
      // sheet, which collapses; on Android a SwipeRefreshLayout took that drag
      // instead, and on iOS `bounces={false}` meant it could never fire. The
      // refresh is a pull on the sheet at rest — `MapSheet.onPullDown`.
      showsVerticalScrollIndicator={false}
    />
  );
});

const EMPTY = <EmptyState message="no stories yet" hint="New coverage arrives through the day" />;

const styles = StyleSheet.create({
  list: { flex: 1 },
  heading: {
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
});
