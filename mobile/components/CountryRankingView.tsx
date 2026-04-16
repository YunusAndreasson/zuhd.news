import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type FlatList, StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { getRanking, METRICS, type MetricKey, type RankingEntry } from '../lib/country-ranking';
import { displayCountryName } from '../lib/place-names';

interface Props {
  metric: MetricKey;
  currentCountryName: string | null;
  bottomInset: number;
}

export const CountryRankingView = memo(function CountryRankingView({
  metric,
  currentCountryName,
  bottomInset,
}: Props) {
  const { colors, font, typography, textStyles } = useTheme();
  const ranking = useMemo(() => getRanking(metric), [metric]);
  const currentIndex = useMemo(
    () => (currentCountryName ? ranking.findIndex((r) => r.name === currentCountryName) : -1),
    [ranking, currentCountryName],
  );
  const listRef = useRef<FlatList<RankingEntry>>(null);

  // gorhom's BottomSheetFlatList locks internal scrolling while the sheet
  // animates toward its top snap. We retry scrolling a few times so at least
  // one attempt lands after the sheet is unlocked.
  useEffect(() => {
    if (currentIndex < 0) return;
    const offset = Math.max(0, ROW_HEIGHT * currentIndex - ROW_HEIGHT * 2);
    const scroll = () => {
      listRef.current?.scrollToOffset({ offset, animated: false });
    };
    const timers = [100, 350, 600, 900].map((delay) => setTimeout(scroll, delay));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
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
          <Text style={[styles.rank, textStyles.smallCapsXs]} maxFontSizeMultiplier={1.3}>
            {index + 1}
          </Text>
          <Text style={styles.flag}>{item.flag}</Text>
          <Text
            style={[
              styles.name,
              {
                ...font.regular,
                fontSize: typography.sizeSm,
                color: isCurrent ? colors.textEmphasis : colors.text,
              },
            ]}
            numberOfLines={1}
          >
            {displayCountryName(item.name)}
          </Text>
          <Text
            style={{
              ...font.regular,
              fontSize: typography.sizeSm,
              color: colors.text,
              fontVariant: ['oldstyle-nums'],
            }}
          >
            {item.value}
          </Text>
        </View>
      );
    },
    [colors, font, typography, textStyles, currentCountryName],
  );

  const totalLabel = `#${currentIndex + 1} of ${ranking.length}`;

  return (
    <BottomSheetFlatList
      ref={listRef as never}
      data={ranking}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      contentContainerStyle={{ paddingBottom: bottomInset + SPACING.lg }}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={textStyles.smallCapsXs}>{METRICS[metric].label}</Text>
          {currentIndex >= 0 && (
            <Text
              style={{
                ...font.semiBold,
                fontSize: typography.sizeXs,
                color: colors.textEmphasis,
                letterSpacing: typography.trackingCaps,
                fontVariant: ['oldstyle-nums'],
              }}
            >
              {totalLabel}
            </Text>
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
    paddingBottom: SPACING.md,
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
    fontSize: 18,
  },
  name: {
    flex: 1,
  },
});
