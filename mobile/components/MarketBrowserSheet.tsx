import { BottomSheetFlatList } from '@expo/ui/community/bottom-sheet';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { SwipeCard } from '../lib/cards/rank';
import { observationDate } from '../lib/data-freshness';
import { type Exchange, exchangeCard, exchangeDelta, exchangeIsStale } from '../lib/markets';
import { DeltaChip } from './DeltaChip';
import { EmptyState } from './EmptyState';
import { Pressable, Text } from './primitives';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

type Filter = 'all' | 'rising' | 'falling' | 'other data';
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
  // Other readings refresh independently. Reuse the exchange cards (including
  // their formatted histories) when only that other feed changes.
  const exchangeRows = useMemo(
    () =>
      [...exchanges]
        .filter(
          (e) => filter === 'all' || (filter === 'rising' ? e.changePct > 0 : e.changePct < 0),
        )
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || a.id.localeCompare(b.id))
        .map(exchangeCard),
    [exchanges, filter],
  );
  const rows = filter === 'other data' ? instruments : exchangeRows;
  const rise = exchanges.filter((e) => e.changePct > 0).length;
  const fall = exchanges.filter((e) => e.changePct < 0).length;
  const byId = useMemo(() => new Map(exchanges.map((e) => [`mkt:${e.id}`, e])), [exchanges]);
  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle="markets & data">
      <View style={styles.intro}>
        <Text variant="caption">
          {exchanges.length} exchanges · ↑ {rise} rising · ↓ {fall} falling
        </Text>
        <Text variant="caption">
          Latest quoted session vs prior close. The arrow is the direction; green or red is what it
          means for people — an index rising is green, oil rising is red. * on the map means an
          older quote.
        </Text>
        <Text variant="labelXs">Tap an exchange to locate it on the map</Text>
      </View>
      <View style={[styles.filters, { borderBottomColor: colors.rule }]}>
        {(['all', 'rising', 'falling', 'other data'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === value }}
            style={[styles.filter, filter === value && { backgroundColor: colors.pillBg }]}
          >
            <Text variant="labelXs" tone={filter === value ? 'emphasis' : 'secondary'}>
              {value}
            </Text>
          </Pressable>
        ))}
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
          const delta = exchange ? exchangeDelta(exchange) : item.delta;
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
                <Text variant="tabularEmphasis">{item.reading}</Text>
                {delta ? <DeltaChip delta={delta} window={false} scale={1} /> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </SheetLayout>
  );
}
const styles = StyleSheet.create({
  intro: { paddingHorizontal: SPACING.screenPadding, gap: SPACING.xs, paddingBottom: SPACING.sm },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filter: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SPACING.sm,
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
});
