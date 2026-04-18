import { Ionicons } from '@expo/vector-icons';
import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, ICON, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { getMetricValue, getRanking, type MetricKey } from '../lib/country-ranking';
import { displayCountryName, displayLocation } from '../lib/place-names';
import { CountryRankingView } from './CountryRankingView';
import type { TapResult } from './globe/MiniGlobe';
import { HapticPressable } from './HapticPressable';
import { SheetHandle } from './SheetHandle';
import { SheetLayout } from './SheetLayout';

// Progressive disclosure: three headline rankings sit at rest; everything
// else is one tap away. What matters is the ranking — currency names and
// language lists are chrome, not information a reader comes here to find.

// Every metric that can appear in the country sheet. Rows are sorted per
// country by ascending rank at render time, so declared order here is only
// the fallback for countries that have no rank on a given metric. The three
// former hero tiles (population, gdp, gdpPerCapita) are now part of this
// list — ranked like everything else.
const MORE_METRICS: { key: MetricKey; label: string }[] = [
  { key: 'population', label: 'population' },
  { key: 'gdp', label: 'gdp' },
  { key: 'gdpPerCapita', label: 'gdp per capita' },
  { key: 'militaryPctGdp', label: 'military % of gdp' },
  // Governance
  { key: 'democracyIndex', label: 'democracy (v-dem)' },
  { key: 'corruptionCpi', label: 'cpi (clean gov)' },
  { key: 'pressFreedomScore', label: 'press freedom' },
  // Development & inequality
  { key: 'hdi', label: 'human development' },
  { key: 'giniIndex', label: 'gini inequality' },
  { key: 'literacyPct', label: 'adult literacy' },
  { key: 'youthUnemploymentPct', label: 'youth unemployment' },
  // Ummah lens
  { key: 'refugeesHosted', label: 'refugees hosted' },
  { key: 'refugeesProduced', label: 'refugees produced' },
  { key: 'remittancePctGdp', label: 'remittances % of gdp' },
  // Science / tech
  { key: 'rdPctGdp', label: 'r&d % of gdp' },
  { key: 'researchersPerMillion', label: 'researchers per million' },
  { key: 'scientificArticles', label: 'scientific articles / yr' },
  { key: 'highTechExportsPct', label: 'high-tech exports %' },
  // Demography & environment
  { key: 'populationDensity', label: 'density' },
  { key: 'lifeExpectancy', label: 'life expectancy' },
  { key: 'fertilityRate', label: 'fertility rate' },
  { key: 'urbanPct', label: 'urbanization' },
  { key: 'internetPct', label: 'internet' },
  { key: 'migrantPct', label: 'foreign-born' },
  { key: 'co2PerCapita', label: 'co₂ per capita' },
  // Geography
  { key: 'area', label: 'area' },
];

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
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  const hasRank = typeof rank === 'number' && rank > 0;
  return (
    <HapticPressable
      onPress={onPress}
      haptic="tick"
      style={[styles.moreRow, { borderBottomColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${rank ? `, ranked ${rank}` : ''}`}
    >
      {/* Fixed-width rank column on the left. Empty slot reserved for
          rank-less rows so the label margin stays aligned. tabular-nums
          keeps #1 and #144 the same visual width. */}
      <Text
        style={[
          styles.rankCol,
          {
            ...font.semiBold,
            fontSize: typography.sizeXs,
            color: colors.dome,
            letterSpacing: typography.trackingCaps,
          },
        ]}
      >
        {hasRank ? `#${rank}` : ''}
      </Text>
      <Text style={[textStyles.smallCaps, styles.moreLabel]}>{label}</Text>
      <View style={styles.moreRight}>
        <Text
          style={{
            ...font.regular,
            fontSize: typography.sizeSm,
            color: colors.text,
            fontVariant: ['oldstyle-nums'],
          }}
        >
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={ICON.sm} color={colors.textSecondary} />
      </View>
    </HapticPressable>
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
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
  const [activeRanking, setActiveRanking] = useState<MetricKey | null>(null);
  const snapProps = useSheetSnaps(activeRanking !== null);
  const flag = country?.data?.flag;
  const name = displayCountryName(country?.countryName ?? null);
  const onBackToCountry = useCallback(() => setActiveRanking(null), []);

  const CountryHandle = useCallback(
    () => (
      <SheetHandle
        onBack={activeRanking ? onBackToCountry : undefined}
        title={
          flag || name ? (
            <View style={styles.handleStack}>
              {flag && (
                <Text allowFontScaling={false} style={styles.handleFlag}>
                  {flag}
                </Text>
              )}
              {name && <Text style={textStyles.sheetTitle}>{name}</Text>}
            </View>
          ) : undefined
        }
      />
    ),
    [activeRanking, onBackToCountry, flag, name, textStyles.sheetTitle],
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

  // Per-country rank-sorted list. Rows with no value disappear entirely; rows
  // with a rank rise to the top in ascending order (#1 first), so the sheet
  // opens with what the country stands out for. Rank-less rows fall to the
  // bottom and keep MORE_METRICS' declared order among themselves.
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

  // Compact metadata list directly beneath the title. One row per fact so
  // the reader can pick out what they want at a glance — capital, currency,
  // languages, local time. Region is dropped (obvious from the tap).
  const basics = useMemo(() => {
    if (!country?.data) return [];
    const rows: { label: string; value: string }[] = [];
    const capital = displayLocation(country.data.capital);
    if (capital) rows.push({ label: 'capital', value: capital });
    if (country.data.currency) {
      const sym = country.data.currencySymbol ? ` ${country.data.currencySymbol}` : '';
      rows.push({ label: 'currency', value: `${country.data.currency}${sym}` });
    }
    if (country.data.languages) rows.push({ label: 'languages', value: country.data.languages });
    if (country.localTime) rows.push({ label: 'local time', value: country.localTime });
    return rows;
  }, [country?.data, country?.localTime]);

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
            <>
              {/* Basics — caption block: small, muted, tight rhythm so the
                  reader's eye slides past it toward the hero zone below. */}
              {basics.length > 0 && (
                <Animated.View
                  entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(0))}
                  style={styles.basics}
                >
                  {basics.map((b) => (
                    <View key={b.label} style={styles.basicsRow}>
                      <Text style={[textStyles.smallCapsXs, styles.basicsLabel]}>{b.label}</Text>
                      <Text
                        style={{
                          ...font.regular,
                          fontSize: typography.sizeXs,
                          lineHeight: typography.sizeXs * typography.leadingBody,
                          color: colors.textSecondary,
                          flexShrink: 1,
                          textAlign: 'right',
                        }}
                        numberOfLines={2}
                      >
                        {b.value}
                      </Text>
                    </View>
                  ))}
                </Animated.View>
              )}

              {/* Rankings list — always visible, sorted per-country by
                  ascending rank so the country's strongest showings lead. */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(1))}
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
            </>
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
  basics: {
    marginBottom: SPACING.md,
  },
  basicsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.xxs,
  },
  basicsLabel: {
    minWidth: 80,
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
});
