import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { SwipeCard } from '../lib/cards/rank';
import { gaugeMove } from '../lib/cards/week-move';
import { rowKicker } from '../lib/now';
import { DeltaChip } from './DeltaChip';
import { Pressable, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';
import { Sparkline } from './Sparkline';

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
 * Rows read the way the gauges above the globe do: the reading, the move over
 * the past seven days and the week's line (`gaugeMove`), so a row and its gauge
 * never print two different numbers for one instrument. An instrument with no
 * seven-day move (a monthly series, a contract, a date) keeps its card's own
 * chip, and its window is spoken.
 *
 * **Title first**, allowed two lines, then `current · kicker` on one line under it.
 * This list used to print `current` above the title and the kicker below it,
 * which spent a line on every row and cut every contract's question — the
 * one kind of title that is a whole sentence — to "Iran-Oman Hormuz pact…".
 * The rows here are not indexed by a camera, so a second line costs nothing.
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
  const kicker = rowKicker(card);
  const move = useMemo(() => gaugeMove(card), [card]);
  const delta = move?.delta ?? card.delta;

  const spoken = [
    kicker,
    card.title,
    card.reading,
    card.readingNote,
    delta && delta.direction !== 'flat' ? `${delta.direction} ${delta.magnitude}` : null,
    delta?.window,
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
        <Text variant="rowTitle" numberOfLines={2}>
          {card.title}
        </Text>
        <View style={styles.meta}>
          {/* `current` earns the same ink step it gets on a card and in the
              reader — a builder gated this row on its own data being new,
              and that is the one thing a ranked list cannot show by order. */}
          {card.lead ? (
            <Text variant="labelXs" tone="emphasis" numberOfLines={1}>
              {'current · '}
            </Text>
          ) : null}
          <Text variant="labelXs" numberOfLines={1} style={styles.metaText}>
            {kicker}
          </Text>
        </View>
      </View>
      <View style={styles.figures}>
        <Text variant="tabularEmphasis" scale={1.2} numberOfLines={1}>
          {card.reading}
        </Text>
        {delta ? <DeltaChip delta={delta} window={false} scale={1} /> : null}
        {move ? (
          <View style={styles.spark}>
            <Sparkline
              points={move.points}
              tone={move.delta.valence}
              width={SPARK_WIDTH}
              height={10}
            />
          </View>
        ) : null}
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
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xxs },
  // Shrinks so a long kicker truncates rather than pushing the row's figures.
  metaText: { flexShrink: 1 },
  // Right-aligned so a column of readings lines up and the eye can run down
  // the numbers without re-finding the edge on every row.
  figures: { alignItems: 'flex-end' },
  spark: { marginTop: SPACING.xxs },
});

/** As wide as a reading with its chip, so a column of lines reads as one scale. */
const SPARK_WIDTH = 56;
