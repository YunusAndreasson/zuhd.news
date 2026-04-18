import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useMemo, useState } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { getMetricValue, getRanking, type MetricKey } from '../lib/country-ranking';
import { displayCountryName, displayLocation } from '../lib/place-names';
import { CountryRankingView } from './CountryRankingView';
import type { TapResult } from './globe/MiniGlobe';
import { Icon, Pressable, Text } from './primitives';
import { SheetHandle } from './SheetHandle';
import { SheetLayout } from './SheetLayout';

const MORE_METRICS: { key: MetricKey; label: string }[] = [
  { key: 'population', label: 'population' },
  { key: 'gdp', label: 'gdp' },
  { key: 'gdpPerCapita', label: 'gdp per capita' },
  { key: 'militaryPctGdp', label: 'military % of gdp' },
  { key: 'democracyIndex', label: 'democracy (v-dem)' },
  { key: 'corruptionCpi', label: 'cpi (clean gov)' },
  { key: 'pressFreedomScore', label: 'press freedom' },
  { key: 'hdi', label: 'human development' },
  { key: 'giniIndex', label: 'gini inequality' },
  { key: 'literacyPct', label: 'adult literacy' },
  { key: 'youthUnemploymentPct', label: 'youth unemployment' },
  { key: 'refugeesHosted', label: 'refugees hosted' },
  { key: 'refugeesProduced', label: 'refugees produced' },
  { key: 'remittancePctGdp', label: 'remittances % of gdp' },
  { key: 'rdPctGdp', label: 'r&d % of gdp' },
  { key: 'researchersPerMillion', label: 'researchers per million' },
  { key: 'scientificArticles', label: 'scientific articles / yr' },
  { key: 'highTechExportsPct', label: 'high-tech exports %' },
  { key: 'populationDensity', label: 'density' },
  { key: 'lifeExpectancy', label: 'life expectancy' },
  { key: 'fertilityRate', label: 'fertility rate' },
  { key: 'urbanPct', label: 'urbanization' },
  { key: 'internetPct', label: 'internet' },
  { key: 'migrantPct', label: 'foreign-born' },
  { key: 'co2PerCapita', label: 'co₂ per capita' },
  { key: 'area', label: 'area' },
];

const GOLD_RANK_THRESHOLD = 5;

function MoreRow({
  label,
  value,
  rank,
  onPress,
}: {
  label: string;
  value: string | null;
  rank: number | null;
  onPress: () => void;
}) {
  const { colors, font, typography } = useTheme();
  if (!value) return null;
  const hasRank = typeof rank === 'number' && rank > 0;
  const isTopRank = hasRank && rank <= GOLD_RANK_THRESHOLD;
  // Rank column is a single-purpose typographic role (#N) — keep the per-cell
  // style here rather than inventing a variant just for this.
  const rankStyle = {
    ...(isTopRank ? font.semiBold : font.regular),
    fontSize: typography.sizeXs,
    color: isTopRank ? colors.dome : colors.textSecondary,
    letterSpacing: typography.trackingCaps,
  };
  return (
    <Pressable
      haptic="tick"
      onPress={onPress}
      style={[styles.moreRow, { borderBottomColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${rank ? `, ranked ${rank}` : ''}`}
    >
      <RNText style={[styles.rankCol, rankStyle]}>{hasRank ? `#${rank}` : ''}</RNText>
      <Text variant="labelSm" style={styles.moreLabel}>
        {label}
      </Text>
      <View style={styles.moreRight}>
        <Text variant="caption" tone="default" style={styles.value}>
          {value}
        </Text>
        <Icon name="chevron-forward" size="sm" tone="secondary" />
      </View>
    </Pressable>
  );
}

interface CountrySheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  country: TapResult | null;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

export const CountrySheet = memo(function CountrySheet({
  sheetRef,
  country,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: CountrySheetProps) {
  const { colors, sheetStyles } = useTheme();
  const [activeRanking, setActiveRanking] = useState<MetricKey | null>(null);
  const snapProps = useSheetSnaps(activeRanking !== null);
  const flag = country?.data?.flag;
  const name = displayCountryName(country?.countryName ?? null);
  const onBackToCountry = useCallback(() => setActiveRanking(null), []);

  const dateline = useMemo(() => {
    if (!country?.data) return '';
    const parts: string[] = [];
    const capital = displayLocation(country.data.capital);
    if (capital) parts.push(capital);
    const currency = country.data.currencySymbol || country.data.currency;
    if (currency) parts.push(currency);
    if (country.data.languages) {
      const first = country.data.languages.split(',')[0]?.trim();
      if (first) parts.push(first);
    }
    if (country.localTime) parts.push(country.localTime);
    return parts.join(' · ');
  }, [country?.data, country?.localTime]);

  const CountryHandle = useCallback(
    () => (
      <SheetHandle
        onBack={activeRanking ? onBackToCountry : undefined}
        title={
          flag || name ? (
            <View style={styles.handleStack}>
              {flag && (
                <RNText allowFontScaling={false} style={styles.handleFlag}>
                  {flag}
                </RNText>
              )}
              {name && <Text variant="label">{name}</Text>}
              {dateline && (
                <Text variant="labelXs" numberOfLines={1} style={styles.dateline}>
                  {dateline}
                </Text>
              )}
            </View>
          ) : undefined
        }
      />
    ),
    [activeRanking, onBackToCountry, flag, name, dateline],
  );

  const rankFor = useMemo(() => {
    const targetName = country?.countryName;
    if (!targetName) return () => null;
    return (metric: MetricKey): number | null => {
      const entries = getRanking(metric);
      const idx = entries.findIndex((e) => e.name === targetName);
      return idx >= 0 ? idx + 1 : null;
    };
  }, [country?.countryName]);

  const rankedRows = useMemo(() => {
    if (!country?.data) return [];
    const rows: { key: MetricKey; label: string; value: string; rank: number | null }[] = [];
    for (const m of MORE_METRICS) {
      const value = getMetricValue(country.countryName ?? '', country.data, m.key);
      if (value == null) continue;
      rows.push({ key: m.key, label: m.label, value, rank: rankFor(m.key) });
    }
    rows.sort((a, b) => {
      if (a.rank == null && b.rank == null) return 0;
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank;
    });
    return rows;
  }, [country?.data, country?.countryName, rankFor]);

  const handleDismiss = useCallback(() => {
    setActiveRanking(null);
    onDismiss();
  }, [onDismiss]);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      handleComponent={CountryHandle}
      onDismiss={handleDismiss}
    >
      {activeRanking ? (
        <CountryRankingView
          metric={activeRanking}
          currentCountryName={country?.countryName ?? null}
          bottomInset={bottomInset}
          onRequestClose={() => sheetRef.current?.dismiss()}
        />
      ) : (
        <BottomSheetScrollView
          contentContainerStyle={[
            sheetStyles.content,
            { paddingBottom: bottomInset + SPACING.xxl },
          ]}
        >
          {country?.data && (
            <Animated.View
              entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(0))}
              style={[styles.moreList, { borderTopColor: colors.rule }]}
            >
              {rankedRows.map((r) => (
                <MoreRow
                  key={r.key}
                  label={r.label}
                  value={r.value}
                  rank={r.rank}
                  onPress={() => setActiveRanking(r.key)}
                />
              ))}
            </Animated.View>
          )}
        </BottomSheetScrollView>
      )}
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  handleStack: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  handleFlag: {
    fontSize: 32,
    lineHeight: 36,
  },
  dateline: {
    marginTop: SPACING.xxs,
    textAlign: 'center',
  },
  moreList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rankCol: {
    width: 34,
    textAlign: 'right',
    marginRight: SPACING.md,
    fontVariant: ['tabular-nums'],
  },
  moreLabel: {
    flex: 1,
  },
  moreRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  value: {
    fontVariant: ['oldstyle-nums'],
  },
});
