import {
  getRanking,
  METRICS,
  type MetricKey,
  type RankingEntry,
} from '@shared/countries/country-ranking';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FlatList, StyleSheet, View } from 'react-native';
import { HIT_SLOP, LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useOpenLink } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { FlagGlyph } from './FlagChip';
import { Pressable, Text } from './primitives';
import { SheetFlatList } from './SheetContent';

interface Props {
  metric: MetricKey;
  currentCountryName: string | null;
  bottomInset: number;
  onRequestClose?: () => void;
  /**
   * Makes each row open its country. The menu's `country rankings` passes it:
   * reached from there, a ranking is a way into the countries rather than a
   * detail of one, and a list of names that could not be pressed would be a
   * dead end. Rows grow to the menu's row height to be a target.
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
  const { colors } = useTheme();
  const rowHeight = onSelectCountry ? LAYOUT.rowMinHeight : ROW_HEIGHT;
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
      const isCurrent = item.name === currentCountryName;
      const name = displayCountryName(item.name);
      const content = (
        <>
          <Text variant="labelXs" style={styles.rank}>
            {index + 1}
          </Text>
          <FlagGlyph flag={item.flag} />
          <Text
            variant="caption"
            tone={isCurrent ? 'emphasis' : 'default'}
            numberOfLines={1}
            style={styles.name}
          >
            {name}
          </Text>
          <Text variant="caption" tone="default" style={styles.value}>
            {item.value}
          </Text>
        </>
      );
      const style = [
        styles.row,
        { height: rowHeight, borderBottomColor: colors.rule },
        isCurrent && { backgroundColor: colors.pillBg },
      ];
      if (!onSelectCountry) return <View style={style}>{content}</View>;
      return (
        <Pressable
          onPress={() => onSelectCountry(item.name)}
          style={style}
          accessibilityRole="button"
          accessibilityLabel={`${index + 1}. ${name}, ${item.value}`}
        >
          {content}
        </Pressable>
      );
    },
    [colors, currentCountryName, onSelectCountry, rowHeight],
  );

  const totalLabel = `#${currentIndex + 1} of ${ranking.length}`;
  const meta = METRICS[metric];
  const openLink = useOpenLink();
  const openSource = useCallback(() => {
    if (!meta.sourceUrl) return;
    onRequestClose?.();
    openLink(meta.sourceUrl);
  }, [meta.sourceUrl, openLink, onRequestClose]);

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
      ListHeaderComponent={
        <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
          {titled || currentIndex >= 0 ? (
            <View style={styles.header}>
              {titled ? <Text variant="labelXs">{meta.label}</Text> : <View />}
              {currentIndex >= 0 && (
                <Text variant="labelXs" tone="emphasis" style={styles.totalNum}>
                  {totalLabel}
                </Text>
              )}
            </View>
          ) : null}
          {(meta.description || meta.source) && (
            <View style={[styles.meta, { borderBottomColor: colors.rule }]}>
              {meta.description && (
                <Text variant="caption" style={styles.descr}>
                  {meta.description}
                </Text>
              )}
              {meta.source &&
                (meta.sourceUrl ? (
                  <Pressable
                    onPress={openSource}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="link"
                    accessibilityLabel={`Source: ${meta.source}`}
                  >
                    <Text variant="labelXs" tone="dome" style={styles.sourceLine}>
                      {meta.source} ↗
                    </Text>
                  </Pressable>
                ) : (
                  <Text variant="labelXs" style={styles.sourceLine}>
                    {meta.source}
                  </Text>
                ))}
            </View>
          )}
        </View>
      }
    />
  );
});

const ROW_HEIGHT = 40;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  totalNum: {
    fontVariant: ['oldstyle-nums'],
  },
  meta: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  descr: {
    // description reads tight vs the labelSm above — uses caption variant's
    // own leading; no extra margin needed.
  },
  sourceLine: {
    marginTop: SPACING.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.screenPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 28,
    fontVariant: ['oldstyle-nums'],
  },
  name: {
    flex: 1,
  },
  value: {
    fontVariant: ['oldstyle-nums'],
  },
});
