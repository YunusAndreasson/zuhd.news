import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { WEEK_WINDOW } from '../lib/cards/week-move';
import { observationDate } from '../lib/data-freshness';
import type { CatalogRow } from '../lib/instrument-catalog';
import { exchangeIsStale } from '../lib/markets';
import { rowKicker } from '../lib/now';
import { DeltaChip } from './DeltaChip';
import { Pressable, Text } from './primitives';

/**
 * One instrument in the menu's lists: what it is, where or what kind, the day
 * it was read, and the reading with its move.
 *
 * It was the markets browser's row, which printed the same week the strip
 * prints; the browser folded into the menu on 2026-09-26 and every group's
 * list speaks this row now. The move is the week where the reading has one,
 * so a row, its strip slot and its globe mark never disagree; a monthly
 * series or a contract keeps its own move, and prints the window it covers.
 */
export const InstrumentRow = memo(function InstrumentRow({
  row,
  onPress,
}: {
  row: CatalogRow;
  onPress: (row: CatalogRow) => void;
}) {
  const { colors } = useTheme();
  const { card, exchange, chokepoint, move } = row;
  const handlePress = useCallback(() => onPress(row), [onPress, row]);
  const title = card?.title ?? chokepoint?.name ?? row.short;
  const kicker = exchange
    ? `${exchange.city} · ${exchange.name}`
    : card
      ? rowKicker(card)
      : 'shipping';
  // `Sep 21`, as every card and chart prints a day. A date has no day it was
  // read — its line is the day it falls on.
  const asOf = exchange?.asOf ?? card?.asOf;
  const day =
    card?.kind === 'scheduled' ? (card.readingNote ?? '') : observationDate(asOf) || asOf || '';
  const date = exchange && exchangeIsStale(exchange) ? `${day} · older quote` : day;
  const reading = card?.reading ?? '—';
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={[
        title,
        kicker,
        reading,
        move ? `${move.direction} ${move.magnitude} ${move.window ?? ''}` : '',
        date,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[styles.row, { borderBottomColor: colors.rule }]}
    >
      <View style={styles.subject}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="caption">{kicker}</Text>
        {date ? <Text variant="labelXs">{date}</Text> : null}
      </View>
      <View style={styles.figures}>
        {/* The figure the row is for, at body size: it was 11pt, the
            smallest type on the row, under a 16pt name. */}
        <Text variant="bodyEmphasis" style={styles.reading}>
          {reading}
        </Text>
        {move ? <DeltaChip delta={move} window={move.window !== WEEK_WINDOW} scale={1} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subject: { flex: 1, gap: SPACING.xxs },
  figures: { alignItems: 'flex-end', maxWidth: '38%', gap: SPACING.xs },
  reading: { fontVariant: ['tabular-nums'] },
});
