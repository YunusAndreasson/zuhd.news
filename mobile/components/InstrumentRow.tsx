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
  // An exchange's row is named in words, as the strip and the menu's own
  // line name it — `Turkey stocks`, not `BIST 100` (the user's rule for the
  // strip, 2026-09-25: a reader should not need to know the code). The index
  // and its city follow, for the reader who does.
  const title = exchange ? row.short : (card?.title ?? chokepoint?.name ?? row.short);
  // Where no place can be named the title is the index, so the exchange
  // takes its place in the caption rather than the index twice.
  const kicker = exchange
    ? [title === card?.title ? exchange.name : card?.title, exchange.city]
        .filter(Boolean)
        .join(' · ')
    : card
      ? rowKicker(card)
      : 'shipping';
  // What the number counts: `52` beside `Egyptian pound` does not say which
  // way round the rate is, and `$115` not what the dollars buy. A date's note
  // is its day, which the row's date line already prints.
  const unit = card?.kind === 'scheduled' ? undefined : card?.readingNote;
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
        [reading, unit].filter(Boolean).join(' '),
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
        {unit ? (
          <Text variant="caption" tone="secondary" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
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
  unit: { textAlign: 'right' },
});
