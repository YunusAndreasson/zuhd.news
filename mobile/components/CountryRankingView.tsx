import { BottomSheetFlatList } from '@expo/ui/community/bottom-sheet';
import {
  getRanking,
  METRICS,
  type MetricKey,
  type RankingEntry,
} from '@shared/countries/country-ranking';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FlatList, Text as RNText, StyleSheet, View } from 'react-native';
import { FLAG, HIT_SLOP, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useOpenLink } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { Pressable, Text } from './primitives';

interface Props {
  metric: MetricKey;
  currentCountryName: string | null;
  bottomInset: number;
  onRequestClose?: () => void;
}

export const CountryRankingView = memo(function CountryRankingView({
  metric,
  currentCountryName,
  bottomInset,
  onRequestClose,
}: Props) {
  const { colors } = useTheme();
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
    const offset = currentIndex <= 2 ? 0 : headerHeight + ROW_HEIGHT * (currentIndex - 2);
    // Wait for native content layout too: a scroll sent while its extent is
    // still zero is silently clamped to the top on Android.
    if (contentHeight < headerHeight + ROW_HEIGHT * ranking.length) return;
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
  ]);

  const renderItem = useCallback(
    ({ item, index }: { item: RankingEntry; index: number }) => {
      const isCurrent = item.name === currentCountryName;
      return (
        <View
          style={[
            styles.row,
            { borderBottomColor: colors.rule },
            isCurrent && { backgroundColor: colors.pillBg },
          ]}
        >
          <Text variant="labelXs" style={styles.rank}>
            {index + 1}
          </Text>
          <RNText style={styles.flag}>{item.flag}</RNText>
          <Text
            variant="caption"
            tone={isCurrent ? 'emphasis' : 'default'}
            numberOfLines={1}
            style={styles.name}
          >
            {displayCountryName(item.name)}
          </Text>
          <Text variant="caption" tone="default" style={styles.value}>
            {item.value}
          </Text>
        </View>
      );
    },
    [colors, currentCountryName],
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
    <BottomSheetFlatList
      ref={listRef as never}
      style={styles.list}
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => setContentHeight(height)}
      data={ranking}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      getItemLayout={
        headerHeight === null
          ? undefined
          : (_, index) => ({ length: ROW_HEIGHT, offset: headerHeight + ROW_HEIGHT * index, index })
      }
      contentContainerStyle={{ paddingBottom: bottomInset + SPACING.lg }}
      ListHeaderComponent={
        <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
          <View style={styles.header}>
            <Text variant="labelXs">{meta.label}</Text>
            {currentIndex >= 0 && (
              <Text variant="labelXs" tone="emphasis" style={styles.totalNum}>
                {totalLabel}
              </Text>
            )}
          </View>
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
  list: { flexShrink: 1 },
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
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 28,
    fontVariant: ['oldstyle-nums'],
  },
  flag: {
    fontSize: FLAG.row,
  },
  name: {
    flex: 1,
  },
  value: {
    fontVariant: ['oldstyle-nums'],
  },
});
