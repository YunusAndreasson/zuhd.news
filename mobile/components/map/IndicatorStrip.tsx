import { memo, useCallback, useState } from 'react';
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { MASTHEAD_ROW } from '../../lib/deck-layout';
import type { StripItem } from '../../lib/now';
import { DeltaChip } from '../DeltaChip';
import { Icon, Pressable, Text } from '../primitives';

/**
 * The gauges above the earth, swiped sideways across `MapHeader`.
 *
 * The brief was "keep the indicators of whether things are going up and down
 * on the markets and straits, but put them at the top" — and then, having
 * lived with three fixed slots, "the rail should be swipeable, with markets,
 * straits and currencies all there, the most dramatic change at the left".
 *
 * **Every reading that moved this week, largest move first.** Every slot is
 * one quantity, the move over the past seven days (`gaugeMove`), so the sort is
 * a comparison. It used to sort each card's own delta, which put a strait's gap
 * from its 90-day normal beside an index's four sessions beside a currency's
 * whole series. A glance at the carets and their colour is
 * the whole read; the number is there for whoever stops.
 *
 * Slots grow to fit the full label and percentage without wrapping. A partial
 * slot at the edge signals that the row continues.
 *
 * **Still no marquee.** The row moves when a finger moves it. A ticker moves
 * when nothing has happened, which is the engagement mechanic `foundation.md`
 * names in the list of things this is not.
 *
 * Each slot carries its label and week's percentage move on one line.
 * Absolute readings and graphs live in the detail sheet. Accessibility
 * speaks the common seven-day window per item without taking space in the row.
 *
 * **`all →` ends the row.** The instruments without a move — the nisab, the
 * contracts, the dates — and the full ranked list live in `InstrumentsSheet`,
 * and the end of a row that is sorted from loudest to quietest is where a
 * reader who wants more has already arrived. It used to sit under the NOW
 * block in the news sheet, which is for news.
 *
 * Tapping a slot turns the planet to that mark and opens its card. That is
 * also how a reader learns the globe is addressable at all — the mapping is
 * created by the action, since nothing about a dot on a sphere announces it.
 * The slot stays marked, and the globe rings the place, for as long as its card
 * is open, so the reader can see which gauge the ring belongs to.
 */

/** The mark under the slot whose card is open. Reserved on every slot, so
 *  selecting one does not move the row. */
const SELECTED_BAR = 2;
/** What the selection mark adds to a gauge's height, for `MapHeader`, which
 *  holds the row at a gauge's height before the gauges arrive. */
export const GAUGE_EXTRA = SPACING.xxs + SELECTED_BAR;

/** Minimum slot width rhythm; labels and moves may widen individual slots. */
const VISIBLE_SLOTS = 3.4;

const Slot = memo(function Slot({
  item,
  width,
  selected,
  onPress,
}: {
  item: StripItem;
  width: number;
  selected: boolean;
  onPress: (item: StripItem) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  // Spoken as one sentence. A screen reader landing on separate numbers with
  // no subject is the strip's version of the globe's lottery-country problem,
  // and unlike the globe this one is cheap to fix.
  const spoken = [
    item.label,
    item.reading,
    item.readingNote,
    item.delta.direction !== 'flat'
      ? `${item.delta.direction} ${item.delta.magnitude}`
      : 'unchanged',
    item.delta.window,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={handlePress}
      haptic="none"
      style={[styles.slot, { minWidth: width }]}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected }}
      accessibilityHint="Turns the globe to this and opens its card"
    >
      <View style={styles.value}>
        <Text
          variant="labelXsTight"
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
        >
          {item.short}
        </Text>
        <DeltaChip delta={item.delta} window={false} scale={1} colorBy="direction" />
      </View>
      <View
        style={[
          styles.selected,
          { backgroundColor: selected ? colors.textEmphasis : 'transparent' },
        ]}
      />
    </Pressable>
  );
});

export const IndicatorStrip = memo(function IndicatorStrip({
  items,
  onSelect,
  onAll,
  selectedId = null,
  initialViewport,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  /** Opens every instrument as one ranked list. */
  onAll: () => void;
  /** The gauge whose card is open. */
  selectedId?: string | null;
  /** The room the bar will leave, computed by the bar before layout, so the
   *  slots are not laid out at a guess and then resized once measured. */
  initialViewport?: number;
}) {
  // Sized from the room the bar actually leaves; `initialViewport` is the
  // bar's own arithmetic, and the layout pass only corrects it.
  const { width: screenWidth } = useWindowDimensions();
  const [viewport, setViewport] = useState(initialViewport ?? screenWidth / 2);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setViewport((prev) => (prev === next ? prev : next));
  }, []);
  const slotWidth = Math.round((viewport - SPACING.md * Math.floor(VISIBLE_SLOTS)) / VISIBLE_SLOTS);

  // Nothing to show is not a reason to draw an empty band over the globe. On
  // a cold launch, before trends and chokepoints resolve, the earth simply
  // starts clean.
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A flung row that runs past its end and springs back is the row
      // performing; it stops where the finger leaves it.
      bounces={false}
      overScrollMode="never"
      onLayout={handleLayout}
      contentContainerStyle={styles.row}
      accessibilityLabel="Markets, straits and currencies, largest move over seven days first"
    >
      {items.map((item) => (
        <Slot
          key={item.id}
          item={item}
          width={slotWidth}
          selected={item.id === selectedId}
          onPress={onSelect}
        />
      ))}
      <Pressable
        onPress={onAll}
        haptic="none"
        style={styles.all}
        accessibilityRole="button"
        accessibilityLabel="All instruments"
        accessibilityHint="Opens every market, strait, currency and contract as a ranked list"
      >
        <View style={styles.allRow}>
          <Text variant="labelXsTight" maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
            all
          </Text>
          <Icon name="chevron-forward" size="sm" tone="secondary" />
        </View>
      </Pressable>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    // The row runs to the screen's right edge; its content stops on the column.
    paddingRight: SPACING.articlePadding,
    gap: SPACING.md,
  },
  slot: { minHeight: MASTHEAD_ROW, justifyContent: 'center' },
  value: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  selected: { height: SELECTED_BAR, marginTop: SPACING.xxs, borderRadius: SELECTED_BAR / 2 },
  // Match the single-line gauges, reserving their selection-bar space.
  all: { minHeight: MASTHEAD_ROW, justifyContent: 'center', paddingBottom: GAUGE_EXTRA },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
