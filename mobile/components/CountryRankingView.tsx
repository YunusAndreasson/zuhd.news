import { BottomSheetFlatList } from '@expo/ui/community/bottom-sheet';
import {
  getRanking,
  METRICS,
  type MetricKey,
  type RankingEntry,
} from '@shared/countries/country-ranking';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type FlatList, Text as RNText, StyleSheet, View } from 'react-native';
import { FLAG, SPACING } from '../constants/theme';
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

  useEffect(() => {
    if (currentIndex < 0) return;
    const offset = Math.max(0, ROW_HEIGHT * currentIndex - ROW_HEIGHT * 2);
    // Let the sheet transition finish, then position once. Four overlapping
    // animated retries kept retargeting the same list for nearly a second and
    // made an otherwise-ready ranking sheet look unsettled.
    const task = setImmediate(() => {
      listRef.current?.scrollToOffset({ offset, animated: false });
    });
    return () => clearImmediate(task);
  }, [currentIndex]);

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
      data={ranking}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      contentContainerStyle={{ paddingBottom: bottomInset + SPACING.lg }}
      ListHeaderComponent={
        <View>
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
                    haptic="tick"
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
