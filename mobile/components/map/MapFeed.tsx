import { memo, useCallback, useMemo } from 'react';
import { type LayoutChangeEvent, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { StoryRow } from '../../lib/map-feed';
import type { NowItem } from '../../lib/now';
import { EmptyState } from '../EmptyState';
import { Icon, Pressable, Text } from '../primitives';
import { FeedRow } from './FeedRow';

/**
 * The sheet's list: what is flashing, then the day.
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
 * structurally cannot: instruments and live hazards. See `lib/now.ts`.
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
  onInstrumentsPress: () => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  bottomInset: number;
}

const NowBlock = memo(function NowBlock({
  now,
  rowHeight,
  onNowPress,
  onInstrumentsPress,
}: {
  now: NowItem[];
  rowHeight: number;
  onNowPress: (item: NowItem) => void;
  onInstrumentsPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View>
      {now.length > 0 ? (
        <>
          <Text variant="labelXs" tone="emphasis" style={styles.heading}>
            now
          </Text>
          {now.map((item) => (
            <NowRow key={item.id} item={item} rowHeight={rowHeight} onPress={onNowPress} />
          ))}
        </>
      ) : null}

      {/* Always present, block or no block. It is the only route to Brent,
          gold, the ten-year, the nisab, the currency movers and every
          contract — none of which are anywhere on the earth — so it cannot
          be conditional on a quiet day. */}
      <Pressable
        onPress={onInstrumentsPress}
        accessibilityRole="button"
        accessibilityLabel="All instruments"
        accessibilityHint="Opens every market, strait and contract as a ranked list"
        style={[styles.tail, { borderBottomColor: colors.rule }]}
      >
        <Text variant="labelXs">all instruments</Text>
        <Icon name="chevron-forward" size="sm" tone="secondary" />
      </Pressable>
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
      // The same ink step a card and an instruments row use, in the same
      // slot. A row is in this block because its data is new, and that is
      // the one thing a heading alone cannot say about an individual row.
      mark="current"
      onPress={handlePress}
      accessibilityLabel={`${item.title}, ${item.kicker}`}
      accessibilityHint={
        item.kind === 'hazard' ? 'Opens the alert' : "Opens the chart and the desk's analysis"
      }
    />
  );
});

const StoryFeedRow = memo(function StoryFeedRow({
  row,
  rowHeight,
  onPress,
}: {
  row: StoryRow;
  rowHeight: number;
  onPress: (row: StoryRow) => void;
}) {
  const handlePress = useCallback(() => onPress(row), [onPress, row]);
  return (
    <FeedRow
      height={rowHeight}
      title={row.title}
      meta={row.meta}
      mark={row.mark}
      odds={row.odds}
      onPress={handlePress}
      accessibilityLabel={row.title}
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
  onInstrumentsPress,
  onRefresh,
  refreshing,
  bottomInset,
}: MapFeedProps) {
  const { colors } = useTheme();
  const listRef = useAnimatedRef<Animated.FlatList<StoryRow>>();

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
      <StoryFeedRow row={item} rowHeight={rowHeight} onPress={onStoryPress} />
    ),
    [onStoryPress, rowHeight],
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
        <NowBlock
          now={now}
          rowHeight={rowHeight}
          onNowPress={onNowPress}
          onInstrumentsPress={onInstrumentsPress}
        />
      </View>
    ),
    [now, onHeaderLayout, onInstrumentsPress, onNowPress, rowHeight],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.textSecondary}
      />
    ),
    [colors.textSecondary, onRefresh, refreshing],
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
      refreshControl={refreshControl}
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
  tail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.articlePadding,
    paddingVertical: SPACING.smPlus,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
