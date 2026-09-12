import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import type { StripItem } from '../../lib/now';
import { DeltaChip } from '../DeltaChip';
import { Pressable, Text } from '../primitives';

/**
 * Three gauges above the earth.
 *
 * The brief was "keep the indicators of whether things are going up and down
 * on the markets and straits, but put them at the top", and the shape follows
 * from two constraints rather than from taste.
 *
 * **Three fixed slots, ranked contents.** Fixed so a reader learns where to
 * look and can check the row without reading it; ranked so what occupies them
 * is today's answer rather than a watchlist that can be entirely uninteresting
 * on the morning something else is screaming. `lib/cards/rank.ts` decides,
 * lexicographically, and `buildNowSurfaces` hands the first three here.
 *
 * **No marquee.** A ticker moves when nothing has happened, which is the
 * engagement mechanic `foundation.md` names in the list of things this is not.
 * These sit still until the day changes them.
 *
 * Each slot carries the reading *and* the move, not one or the other, because
 * the two kinds of card need different halves: a strait's story is "−57%" and
 * a contract's is "62%" — its own delta, "+14 points", means nothing without
 * the level. The delta's window is dropped: "vs its 90-day normal" does not
 * fit a third of a phone, and it is on the card this slot opens.
 *
 * Tapping a slot turns the planet to that mark and opens its card. That is
 * also how a reader learns the globe is addressable at all — the mapping is
 * created by the action, since nothing about a dot on a sphere announces it.
 */

function Slot({ item, onPress }: { item: StripItem; onPress: (item: StripItem) => void }) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  // Spoken as one sentence. A screen reader landing on three separate numbers
  // with no subject is the strip's version of the globe's lottery-country
  // problem, and unlike the globe this one is cheap to fix.
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
      style={styles.slot}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Turns the globe to this and opens its card"
    >
      <Text
        variant="labelXs"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
        style={styles.label}
      >
        {item.label}
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
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
}) {
  // Nothing to show is not a reason to draw an empty band over the globe. On
  // a cold launch, before trends and chokepoints resolve, the earth simply
  // starts clean.
  if (items.length === 0) return null;

  return (
    <View style={styles.row} accessibilityRole="summary" pointerEvents="box-none">
      {items.map((item) => (
        <Slot key={item.id} item={item} onPress={onSelect} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
    gap: SPACING.md,
  },
  // Equal thirds rather than content width: three gauges that jump sideways
  // as the day's figures change lengths are three gauges you have to read
  // before you can find the one you wanted.
  slot: { flex: 1, minWidth: 0 },
  label: { marginBottom: 1 },
  value: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
