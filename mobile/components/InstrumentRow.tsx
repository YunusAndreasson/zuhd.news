import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../constants/theme';
import { formatNumber, spokenDelta } from '../lib/cards/format';
import type { RangeScale } from '../lib/cards/range';
import type { CatalogRow } from '../lib/instrument-catalog';
import { cardObservation, contextualTitle, type listContext } from '../lib/instrument-presentation';
import { exchangeIsStale } from '../lib/markets';
import { rowKicker } from '../lib/now';
import { DeltaChip } from './DeltaChip';
import { FlagGlyph } from './FlagChip';
import { ListRow, RowReading } from './ListRow';
import { Text } from './primitives';
import { RANGE_WIDTH, RangeMark } from './RangeMark';
import { SPARK_WIDTH, Spark } from './Spark';

/**
 * What a list's rows hold between the name and the reading: each row's
 * thirty days as a small line, or its reading's likely range on the scale the
 * list shares. One for a whole list, so every row keeps the place whether it
 * has one or not, and the readings stay under each other.
 */
export type RowSlot = { kind: 'line' } | { kind: 'range'; scale: RangeScale };

/** The reading's column in a list with a slot: one width for every row, so
 *  what the slots hold stands on one vertical. Wide enough for an index at
 *  its two decimals; a longer reading shrinks to it (`RowReading`). */
const FIGURES_WIDTH = 88;

/**
 * One instrument in the menu's lists: what it is, where or what kind and the
 * day it was read, and the reading with its move.
 *
 * The move is the week where the reading has one, so a row, its strip slot
 * and its globe mark never disagree; a monthly series or a contract keeps its
 * own move, and prints the window it covers.
 *
 * Between the name and the reading, in a list that has them (`slot`): the
 * row's own thirty days as the line the first page draws for the whole list
 * (`Spark`), or an AI lab's likely range (`RangeMark`). A week is one number;
 * a month has a way it went, and a score has a margin.
 */
export const InstrumentRow = memo(function InstrumentRow({
  row,
  first,
  onPress,
  context,
  slot,
}: {
  row: CatalogRow;
  context?: ReturnType<typeof listContext>;
  first?: boolean;
  onPress: (row: CatalogRow) => void;
  slot?: RowSlot;
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
  // A row with a reading of its own (`CatalogRow.reading`) says what that is.
  const said =
    row.reading !== undefined
      ? row.readingSaid
      : card?.kind === 'scheduled'
        ? undefined
        : card?.readingNote || undefined;
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
  const reading = row.reading ?? card?.reading ?? '—';
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
  const figures = (
    <View style={slot ? styles.figuresFixed : styles.figures}>
      <RowReading fit={slot !== undefined}>{reading}</RowReading>
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
  );
  return (
    <ListRow
      title={title}
      first={first}
      onPress={handlePress}
      accessibilityLabel={[
        title,
        kicker,
        [reading, fullUnit ?? said].filter(Boolean).join(' '),
        // The mark is drawn for the eye; the range is said.
        row.range
          ? `likely range ${formatNumber(row.range.low, 0)} to ${formatNumber(row.range.high, 0)}`
          : '',
        move ? spokenDelta(move) : '',
        date,
      ]
        .filter(Boolean)
        .join(', ')}
      // A country's market or money carries its flag, as a ranking's row
      // does. The slot is held where a row in such a list has none.
      leading={row.flag === undefined ? undefined : row.flag ? <FlagGlyph flag={row.flag} /> : null}
      trailing={
        slot ? (
          <View style={styles.trailing}>
            {slot.kind === 'line' ? (
              <View style={styles.line}>{row.path ? <Spark path={row.path} /> : null}</View>
            ) : (
              <View style={styles.range}>
                {row.range ? <RangeMark range={row.range} scale={slot.scale} /> : null}
              </View>
            )}
            {figures}
          </View>
        ) : (
          // Alone at the row's edge, never inside a wrapper: its width is a
          // share of the row's, and a share of a box sized to itself is a
          // column a third as wide as its own text.
          figures
        )
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

/**
 * The names over a list's two trailing columns, said once over the first row
 * (`RowSlot`): `30 days` over the lines and `7 days` over the moves, or
 * `likely range` over the marks. The same widths as the rows' own, so each
 * name ends where its column does.
 *
 * Hidden from a screen reader: each row says its move with its window.
 */
export const InstrumentHeads = memo(function InstrumentHeads({
  slot,
  drawn,
  figures,
}: {
  slot: RowSlot;
  /** Over what the slot draws. */
  drawn: string;
  /** Over the readings' moves. Empty where the rows share no window. */
  figures: string;
}) {
  return (
    <View
      style={styles.heads}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Capped as a move is: a name that outgrew its column would run into
          the one beside it. */}
      <Text
        variant="caption"
        tone="secondary"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
        style={[slot.kind === 'line' ? styles.line : styles.range, styles.head]}
      >
        {drawn}
      </Text>
      <Text
        variant="caption"
        tone="secondary"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
        style={[styles.headFigures, styles.head]}
      >
        {figures}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  figures: { alignItems: 'flex-end', maxWidth: '38%', gap: SPACING.xs },
  unit: { textAlign: 'right' },
  // The slot, then the reading's column: `sm` between them, which a reading
  // shorter than its column widens.
  trailing: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  line: { width: SPARK_WIDTH },
  range: { width: RANGE_WIDTH },
  figuresFixed: { width: FIGURES_WIDTH, alignItems: 'flex-end', gap: SPACING.xs },
  heads: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
  head: { textAlign: 'right' },
  headFigures: { width: FIGURES_WIDTH },
});
