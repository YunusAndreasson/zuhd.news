import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import type { StripItem } from '../../lib/now';
import { DeltaChip } from '../DeltaChip';
import { Icon, Pressable, Text } from '../primitives';

/**
 * The gauges above the earth, swiped sideways from beside `MapHeader`'s mark to
 * its listen button.
 *
 * The brief was "keep the indicators of whether things are going up and down
 * on the markets and straits, but put them at the top" — and then, having
 * lived with three fixed slots, "the rail should be swipeable, with markets,
 * straits and currencies all there, the most dramatic change at the left".
 *
 * **Every reading that moved, largest move first.** `buildNowSurfaces` sorts
 * by the unsigned size of each card's delta, so the first slot is the biggest
 * move of the day and a swipe runs down to the quiet ones. A glance at the
 * carets and their colour is the whole read; the number is there for whoever
 * stops.
 *
 * **The fourth slot is cut on purpose.** Slots are sized so three and a bit
 * fit the room between the mark and the listen button — the partial slot at
 * the edge is what says the row continues. No scroll indicator, no arrow, no dots.
 *
 * **Still no marquee.** The row moves when a finger moves it. A ticker moves
 * when nothing has happened, which is the engagement mechanic `foundation.md`
 * names in the list of things this is not.
 *
 * Each slot carries the reading *and* the move, not one or the other: a
 * strait's story is "−57%" and an index's is its level and "4.8%". The delta's
 * window is dropped — "vs its 90-day normal" does not fit a slot — and it is
 * on the card the slot opens.
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
 */

/** Slots visible across the row. Not a whole number, so one is always cut. */
const VISIBLE_SLOTS = 3.4;

function Slot({
  item,
  width,
  onPress,
}: {
  item: StripItem;
  width: number;
  onPress: (item: StripItem) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  // Spoken as one sentence. A screen reader landing on separate numbers with
  // no subject is the strip's version of the globe's lottery-country problem,
  // and unlike the globe this one is cheap to fix.
  const spoken = [
    item.label,
    item.reading,
    item.readingNote,
    item.delta && item.delta.direction !== 'flat'
      ? `${item.delta.direction} ${item.delta.magnitude}`
      : item.delta
        ? 'unchanged'
        : null,
    item.delta?.window,
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
      accessibilityHint="Turns the globe to this and opens its card"
    >
      {/* One line, never cut. A fixed-width slot either ellipsized the
          subject ("STRAIT OF HOR…", a number with no subject) or wrapped it,
          and a wrap made the whole strip two caps lines tall. So the subject
          takes its conventional short form (`stripLabel`) and a slot is as
          wide as its longest line, never narrower than the rhythm below. */}
      <Text
        variant="labelXsTight"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
        style={styles.label}
      >
        {item.short}
      </Text>
      <View style={styles.value}>
        <Text
          variant="tabularEmphasis"
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
        >
          {item.reading}
        </Text>
        {item.delta ? <DeltaChip delta={item.delta} window={false} scale={1} /> : null}
      </View>
    </Pressable>
  );
}

export const IndicatorStrip = memo(function IndicatorStrip({
  items,
  onSelect,
  onAll,
  resetKey = 0,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  /** Opens every instrument as one ranked list. */
  onAll: () => void;
  /** Changes when the row should scroll back to its first gauge. */
  resetKey?: number;
}) {
  // Sized from the room the bar actually leaves, which changes when the listen
  // button comes and goes; the window's width is only the first guess.
  const { width: screenWidth } = useWindowDimensions();
  const [viewport, setViewport] = useState(screenWidth / 2);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setViewport((prev) => (prev === next ? prev : next));
  }, []);
  const slotWidth = Math.round((viewport - SPACING.md * Math.floor(VISIBLE_SLOTS)) / VISIBLE_SLOTS);

  const scrollRef = useRef<ScrollView>(null);
  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstReset.current) return;
    scrollRef.current?.scrollTo({ x: 0, animated: true });
  }, [resetKey]);

  // Nothing to show is not a reason to draw an empty band over the globe. On
  // a cold launch, before trends and chokepoints resolve, the earth simply
  // starts clean.
  if (items.length === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // A flung row that runs past its end and springs back is the row
      // performing; it stops where the finger leaves it.
      bounces={false}
      overScrollMode="never"
      onLayout={handleLayout}
      contentContainerStyle={styles.row}
      accessibilityLabel="Markets, straits and currencies, largest move first"
    >
      {items.map((item) => (
        <Slot key={item.id} item={item} width={slotWidth} onPress={onSelect} />
      ))}
      <Pressable
        onPress={onAll}
        haptic="none"
        style={styles.all}
        accessibilityRole="button"
        accessibilityLabel="All instruments"
        accessibilityHint="Opens every market, strait, currency and contract as a ranked list"
      >
        <Text variant="labelXsTight" maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
          all
        </Text>
        <Icon name="chevron-forward" size="sm" tone="secondary" />
      </Pressable>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    // The row runs to the screen's right edge; its content stops on the column.
    paddingRight: SPACING.articlePadding,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
    gap: SPACING.md,
  },
  // Equal widths rather than content width: gauges that change size as the
  // day's figures change length are gauges you have to read before you can
  // find the one you wanted.
  // Bottom-aligned, so the readings share a line whether a label took one
  // line or two.
  slot: { justifyContent: 'flex-end' },
  label: { marginBottom: 1 },
  value: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  all: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
});
