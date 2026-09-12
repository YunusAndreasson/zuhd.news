import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { SwipeCard } from '../lib/cards/rank';
import { DeltaChip } from './DeltaChip';
import { Pressable, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

/**
 * Every instrument, as one ranked list.
 *
 * The globe can only carry what has a place. Straits have one and the
 * exchanges the server flagged have one, but Brent is a grade of crude, the
 * gold-to-silver ratio is a division, the nisab is a threshold and a
 * prediction contract is a question — none of them are anywhere, and putting
 * Brent on the North Sea and gold in London would be inventing locations for
 * half the deck to avoid admitting the other half needs a list.
 *
 * So this is the list, and it is the reachability guarantee for the whole
 * data side of the app now that the three desks are gone: if it is an
 * instrument, it is here, in the order `lib/cards/rank.ts` puts it.
 *
 * Rows carry the reading *and* the delta with its window, unlike the strip
 * above the globe — there is no gauge row competing here, so the full chip
 * fits and the information appears in exactly one place on this surface.
 */

const Row = memo(function Row({
  card,
  onPress,
}: {
  card: SwipeCard;
  onPress: (card: SwipeCard) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress(card), [card, onPress]);

  const spoken = [
    card.kicker,
    card.title,
    card.reading,
    card.readingNote,
    card.delta && card.delta.direction !== 'flat'
      ? `${card.delta.direction} ${card.delta.magnitude}`
      : null,
    card.delta?.window,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the chart and the desk's analysis"
      style={[styles.row, { borderBottomColor: colors.rule }]}
    >
      <View style={styles.subject}>
        {/* `current` earns the same ink step it gets on a card and in the
            NOW block — a builder gated this row on its own data being new,
            and that is the one thing a ranked list cannot show by order. */}
        {card.lead ? (
          <Text variant="labelXs" tone="emphasis" numberOfLines={1}>
            current
          </Text>
        ) : null}
        <Text variant="title" numberOfLines={1}>
          {card.title}
        </Text>
        {card.kicker ? (
          <Text variant="labelXs" numberOfLines={1}>
            {card.kicker}
          </Text>
        ) : null}
      </View>
      <View style={styles.figures}>
        <Text variant="tabularEmphasis" scale={1.2} numberOfLines={1}>
          {card.reading}
        </Text>
        {card.delta ? <DeltaChip delta={card.delta} window={false} scale={1} /> : null}
      </View>
    </Pressable>
  );
});

interface InstrumentsSheetProps extends BaseSheetProps {
  cards: SwipeCard[];
  onSelect: (card: SwipeCard) => void;
}

export const InstrumentsSheet = memo(function InstrumentsSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  cards,
  onSelect,
}: InstrumentsSheetProps) {
  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle="instruments">
      <SheetScrollView bottomInset={bottomInset}>
        {cards.map((card) => (
          <Row key={card.id} card={card} onPress={onSelect} />
        ))}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.smPlus,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subject: { flex: 1, minWidth: 0 },
  // Right-aligned so a column of readings lines up and the eye can run down
  // the numbers without re-finding the edge on every row.
  figures: { alignItems: 'flex-end' },
});
