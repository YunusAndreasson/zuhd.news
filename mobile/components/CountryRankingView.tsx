import {
  getRanking,
  METRICS,
  type MetricKey,
  type RankingEntry,
} from '@shared/countries/country-ranking';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { openExternal } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { FlagGlyph } from './FlagChip';
import { ListIntro, ListRow, listStyles, ROW_LEADING, RowReading } from './ListRow';
import { Text } from './primitives';
import { SheetFlatList, SheetLink } from './SheetContent';

interface Props {
  metric: MetricKey;
  currentCountryName: string | null;
  bottomInset: number;
  onRequestClose?: () => void;
  /**
   * Makes each row open its country. The menu's `country rankings` passes it:
   * reached from there, a ranking is a way into the countries rather than a
   * detail of one, and a list of names that could not be pressed would be a
   * dead end.
   */
  onSelectCountry?: (name: string) => void;
  /** Print the metric's name over the list. Off where the sheet's handle
   *  already names it — the menu's ranking pages: a title lives in the
   *  handle, never again as a heading in the body. */
  titled?: boolean;
}

export const CountryRankingView = memo(function CountryRankingView({
  metric,
  currentCountryName,
  bottomInset,
  onRequestClose,
  onSelectCountry,
  titled = true,
}: Props) {
  // Fixed, for `getItemLayout`, and tall enough for the reading's line at
  // the reader's text size.
  const { textVariants } = useTheme();
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(
    LAYOUT.rowMinHeight,
    Math.ceil((textVariants.bodyEmphasis.lineHeight ?? 0) * fontScale) + 2 * SPACING.smPlus,
  );
  const ranking = useMemo(() => getRanking(metric), [metric]);
  const currentIndex = useMemo(
    () => (currentCountryName ? ranking.findIndex((r) => r.name === currentCountryName) : -1),
    [ranking, currentCountryName],
  );
  const listRef = useRef<FlatList<RankingEntry>>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const positioned = useRef<string | null>(null);

  useEffect(() => {
    if (currentIndex < 0 || headerHeight === null || viewportHeight <= 0) return;
    const target = `${metric}:${currentCountryName}:${headerHeight}`;
    if (positioned.current === target) return;
    const offset = currentIndex <= 2 ? 0 : headerHeight + rowHeight * (currentIndex - 2);
    // Wait for native content layout too: a scroll sent while its extent is
    // still zero is silently clamped to the top on Android.
    if (contentHeight < headerHeight + rowHeight * ranking.length) return;
    // Let the content-size commit reach the native sheet before dispatching
    // its scroll command; a JS microtask can still precede that native mount.
    let task = requestAnimationFrame(() => {
      task = requestAnimationFrame(() => {
        positioned.current = target;
        listRef.current?.scrollToOffset({
          offset: Math.min(offset, Math.max(0, contentHeight - viewportHeight)),
          animated: false,
        });
      });
    });
    return () => cancelAnimationFrame(task);
  }, [
    currentIndex,
    headerHeight,
    viewportHeight,
    contentHeight,
    ranking.length,
    metric,
    currentCountryName,
    rowHeight,
  ]);

  const renderItem = useCallback(
    ({ item, index }: { item: RankingEntry; index: number }) => {
      const name = displayCountryName(item.name) ?? item.name;
      return (
        <ListRow
          title={name}
          titleLines={1}
          first={index === 0}
          current={item.name === currentCountryName}
          height={rowHeight}
          onPress={onSelectCountry ? () => onSelectCountry(item.name) : undefined}
          accessibilityLabel={`${index + 1}. ${name}, ${item.value}`}
          leadingWidth={RANK_LEADING}
          leading={
            <View style={styles.rank}>
              <Text variant="labelXs" style={styles.rankDigits}>
                {index + 1}
              </Text>
              <FlagGlyph flag={item.flag} />
            </View>
          }
          trailing={<RowReading>{item.value}</RowReading>}
        />
      );
    },
    [currentCountryName, onSelectCountry, rowHeight],
  );

  const totalLabel = `#${currentIndex + 1} of ${ranking.length}`;
  const meta = METRICS[metric];
  const openSource = useCallback(() => {
    if (!meta.sourceUrl) return;
    onRequestClose?.();
    openExternal(meta.sourceUrl);
  }, [meta.sourceUrl, onRequestClose]);

  return (
    <SheetFlatList
      ref={listRef}
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => setContentHeight(height)}
      data={ranking}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      getItemLayout={
        headerHeight === null
          ? undefined
          : (_, index) => ({ length: rowHeight, offset: headerHeight + rowHeight * index, index })
      }
      bottomInset={bottomInset}
      contentContainerStyle={listStyles.content}
      ListHeaderComponent={
        <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
          <ListIntro
            note={titled ? meta.label : meta.description}
            figure={
              currentIndex >= 0 ? (
                <Text variant="caption" tone="emphasis" style={styles.rankDigits}>
                  {totalLabel}
                </Text>
              ) : undefined
            }
          >
            {titled && meta.description ? <Text variant="caption">{meta.description}</Text> : null}
            {meta.source ? (
              meta.sourceUrl ? (
                <SheetLink
                  label={meta.source}
                  onPress={openSource}
                  accessibilityLabel={`Source: ${meta.source}`}
                />
              ) : (
                <Text variant="caption">{meta.source}</Text>
              )
            ) : null}
          </ListIntro>
        </View>
      }
    />
  );
});

const RANK_WIDTH = 28;
/** A rank and a flag, as one mark before the name. */
const RANK_LEADING = RANK_WIDTH + SPACING.sm + ROW_LEADING;

const styles = StyleSheet.create({
  rank: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rankDigits: { fontVariant: ['tabular-nums'] },
});
