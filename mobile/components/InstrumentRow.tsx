import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { spokenDelta } from '../lib/cards/format';
import type { CatalogRow } from '../lib/instrument-catalog';
import { cardObservation, contextualTitle, type listContext } from '../lib/instrument-presentation';
import { exchangeIsStale } from '../lib/markets';
import { rowKicker } from '../lib/now';
import { DeltaChip } from './DeltaChip';
import { FlagGlyph } from './FlagChip';
import { ListRow, RowReading } from './ListRow';
import { Text } from './primitives';

/**
 * One instrument in the menu's lists: what it is, where or what kind and the
 * day it was read, and the reading with its move.
 *
 * The move is the week where the reading has one, so a row, its strip slot
 * and its globe mark never disagree; a monthly series or a contract keeps its
 * own move, and prints the window it covers.
 */
export const InstrumentRow = memo(function InstrumentRow({
  row,
  first,
  onPress,
  context,
}: {
  row: CatalogRow;
  context?: ReturnType<typeof listContext>;
  first?: boolean;
  onPress: (row: CatalogRow) => void;
}) {
  const { card, exchange, chokepoint, move } = row;
  const handlePress = useCallback(() => onPress(row), [onPress, row]);
  // An exchange's row is named in words, as the strip names it — `Turkey
  // stocks`, not `BIST 100`. The index and its city follow, for the reader
  // who knows the code.
  const country = contextualTitle(row, context?.group);
  const title = country
    ? country
    : exchange
      ? row.short
      : (card?.title ?? chokepoint?.name ?? row.short);
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
  // way round the rate is. Empty where the list's own line has said it for
  // every row (`CatalogRow.note`); a screen reader still hears it. A date's
  // note is its day, which the row's caption prints.
  const said = card?.kind === 'scheduled' ? undefined : card?.readingNote || undefined;
  const fullUnit =
    card?.kind === 'scheduled' ? undefined : (row.note ?? card?.readingNote) || undefined;
  const sharedUnit =
    context?.group === 'currencies' ||
    (context?.group === 'stocks' && (fullUnit === 'index' || fullUnit === 'index points'));
  const unit = sharedUnit ? undefined : fullUnit;
  // `Sep 21`, as every card and chart prints a day. A date has no day it was
  // read — its line is the day it falls on.
  const asOf = exchange?.asOf ?? card?.asOf;
  const day =
    card?.kind === 'scheduled'
      ? (card.readingNote ?? '')
      : (card ? cardObservation(card) : '') || asOf || '';
  const date = exchange && exchangeIsStale(exchange) ? `${day} · older quote` : day;
  const reading = card?.reading ?? '—';
  const generic = [
    'markets',
    'money',
    'prices',
    'jobs',
    'energy',
    'food',
    'staples',
    'metal',
    'shipping',
    'currency',
    'crypto',
  ];
  const detail =
    context &&
    (context.group === 'borrowing' ||
      country ||
      kicker === context.kicker ||
      generic.includes(kicker))
      ? ''
      : kicker;
  return (
    <ListRow
      title={title}
      first={first}
      onPress={handlePress}
      accessibilityLabel={[
        title,
        kicker,
        [reading, fullUnit ?? said].filter(Boolean).join(' '),
        move ? spokenDelta(move) : '',
        date,
      ]
        .filter(Boolean)
        .join(', ')}
      // A country's market or money carries its flag, as a ranking's row
      // does. The slot is held where a row in such a list has none.
      leading={row.flag === undefined ? undefined : row.flag ? <FlagGlyph flag={row.flag} /> : null}
      trailing={
        <View style={styles.figures}>
          <RowReading>{reading}</RowReading>
          {unit ? (
            <Text variant="caption" tone="secondary" style={styles.unit}>
              {unit}
            </Text>
          ) : null}
          {move ? <DeltaChip delta={move} window={false} scale={1} /> : null}
          {move?.window && move.window !== (context ? context.window : row.saidWindow) ? (
            <Text variant="caption" tone="secondary" style={styles.unit}>
              {move.window}
            </Text>
          ) : null}
        </View>
      }
    >
      {detail || (date && date !== context?.date) ? (
        <Text variant="caption">
          {[detail, date !== context?.date ? date : ''].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </ListRow>
  );
});

const styles = StyleSheet.create({
  figures: { alignItems: 'flex-end', maxWidth: '38%', gap: SPACING.xs },
  unit: { textAlign: 'right' },
});
