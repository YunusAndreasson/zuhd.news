import { BottomSheetFlatList } from '@expo/ui/community/bottom-sheet';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { SwipeCard } from '../lib/cards/rank';
import type { CardDelta } from '../lib/cards/types';
import { exchangeMove, gaugeMove, WEEK_WINDOW } from '../lib/cards/week-move';
import { observationDate } from '../lib/data-freshness';
import { type Exchange, exchangeCard, exchangeIsStale } from '../lib/markets';
import { DeltaChip } from './DeltaChip';
import { EmptyState } from './EmptyState';
import { Pressable, Text } from './primitives';
import { SegmentedControl, type SegmentOption } from './SegmentedControl';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

type Filter = 'all' | 'rising' | 'falling' | 'other data';
const FILTERS: SegmentOption<Filter>[] = [
  { value: 'all', label: 'all' },
  { value: 'rising', label: 'rising' },
  { value: 'falling', label: 'falling' },
  { value: 'other data', label: 'other data' },
];

interface Props extends BaseSheetProps {
  exchanges: Exchange[];
  instruments: SwipeCard[];
  onSelect: (card: SwipeCard) => void;
}
export function MarketBrowserSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  exchanges,
  instruments,
  onSelect,
}: Props) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  // Every row prints the strip's number, the past week — this list is where
  // the strip's `all →` leads. It printed each exchange's latest session
  // against the prior close, so `BIST 100 ▼2.9%` on the strip opened a list
  // that said ▲0.09%. Other readings refresh independently; the exchange
  // cards (with their formatted histories) are reused when only they change.
  const exchangeMoves = useMemo(
    () =>
      exchanges.map((e) => {
        const card = exchangeCard(e);
        return { card, delta: exchangeMove(e, card) };
      }),
    [exchanges],
  );
  const exchangeRows = useMemo(
    () =>
      exchangeMoves
        .filter(
          ({ delta }) =>
            filter === 'all' || delta.direction === (filter === 'rising' ? 'up' : 'down'),
        )
        .sort(
          (a, b) => (b.delta.size ?? 0) - (a.delta.size ?? 0) || a.card.id.localeCompare(b.card.id),
        )
        .map(({ card }) => card),
    [exchangeMoves, filter],
  );
  // A reading without a week (a monthly series, a contract) keeps its own
  // move, and its row prints the period it covers.
  const moves = useMemo(
    () =>
      new Map<string, CardDelta | undefined>([
        ...exchangeMoves.map(({ card, delta }) => [card.id, delta] as const),
        ...instruments.map((card) => [card.id, gaugeMove(card)?.delta ?? card.delta] as const),
      ]),
    [exchangeMoves, instruments],
  );
  const rows = filter === 'other data' ? instruments : exchangeRows;
  const rise = exchangeMoves.filter(({ delta }) => delta.direction === 'up').length;
  const fall = exchangeMoves.filter(({ delta }) => delta.direction === 'down').length;
  const byId = useMemo(() => new Map(exchanges.map((e) => [`mkt:${e.id}`, e])), [exchanges]);
  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle="markets & data">
      <View style={styles.intro}>
        {/* ▲▼, the rows' own marks; this line said ↑↓ over rows that print ▲▼. */}
        <Text variant="captionEmphasis">
          {exchanges.length} exchanges · ▲ {rise} rising · ▼ {fall} falling
        </Text>
        <Text variant="caption">
          Moves over the past week, as on the map: green up, red down. * means an older quote. Tap
          an exchange to find it on the globe.
        </Text>
      </View>
      <View style={[styles.filters, { borderBottomColor: colors.rule }]}>
        <SegmentedControl
          role="tab"
          size="compact"
          accessibilityLabel="Filter exchanges"
          options={FILTERS}
          selected={filter}
          onSelect={setFilter}
        />
      </View>
      <BottomSheetFlatList
        key={filter}
        style={styles.list}
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: bottomInset + SPACING.md }}
        ListEmptyComponent={
          <EmptyState
            message={
              exchanges.length === 0 && filter !== 'other data'
                ? 'Market data unavailable'
                : 'No matching readings'
            }
            hint="Other data includes commodities, currencies, straits and predictions."
          />
        }
        renderItem={({ item }) => {
          const exchange = byId.get(item.id);
          const delta = moves.get(item.id);
          // `Sep 21`, as every card and chart prints a day; the raw
          // `2026-09-21` was the only ISO date a reader saw anywhere.
          const asOf = exchange?.asOf ?? item.asOf;
          const day = observationDate(asOf) || asOf;
          const date = exchange && exchangeIsStale(exchange) ? `${day} · older quote` : day;
          return (
            <Pressable
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={[
                item.title,
                exchange?.city ?? item.kicker,
                item.reading,
                delta ? `${delta.direction} ${delta.magnitude} ${delta.window ?? ''}` : '',
                date,
              ]
                .filter(Boolean)
                .join(', ')}
              style={[styles.row, { borderBottomColor: colors.rule }]}
            >
              <View style={styles.subject}>
                <Text variant="rowTitle">{item.title}</Text>
                <Text variant="caption">
                  {exchange ? `${exchange.city} · ${exchange.name}` : item.kicker}
                </Text>
                {date ? <Text variant="labelXs">{date}</Text> : null}
              </View>
              <View style={styles.figures}>
                {/* The figure the row is for, at body size: it was 11pt, the
                    smallest type on the row, under a 16pt name. */}
                <Text variant="bodyEmphasis" style={styles.reading}>
                  {item.reading}
                </Text>
                {delta ? (
                  <DeltaChip delta={delta} window={delta.window !== WEEK_WINDOW} scale={1} />
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </SheetLayout>
  );
}
const styles = StyleSheet.create({
  intro: { paddingHorizontal: SPACING.screenPadding, gap: SPACING.xs, paddingBottom: SPACING.md },
  filters: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: { flexShrink: 1 },
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
