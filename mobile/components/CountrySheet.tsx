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

const MORE_METRICS: { key: MetricKey; label: string }[] = [
  { key: 'gdpPerCapita', label: 'gdp per capita' },
  { key: 'militaryPctGdp', label: 'military % of gdp' },
  { key: 'populationDensity', label: 'density' },
  { key: 'lifeExpectancy', label: 'life expectancy' },
  { key: 'fertilityRate', label: 'fertility rate' },
  { key: 'urbanPct', label: 'urbanization' },
  { key: 'internetPct', label: 'internet' },
  { key: 'migrantPct', label: 'foreign-born' },
  { key: 'co2PerCapita', label: 'co₂ per capita' },
  { key: 'area', label: 'area' },
];

function HeroStat({
  label,
  value,
  rank,
  onPress,
}: {
  label: string;
  value: string | null | undefined;
  rank: number | null;
  onPress?: () => void;
}) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  const body = (
    <View style={styles.hero}>
      <Text
        style={{
          ...font.bold,
          fontSize: typography.sizeLg,
          color: colors.textEmphasis,
          fontVariant: ['oldstyle-nums'],
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={textStyles.smallCapsXs}>{label}</Text>
      {typeof rank === 'number' && rank > 0 && (
        <Text
          style={[
            textStyles.smallCapsXs,
            {
              color: colors.dome,
              marginTop: 2,
              fontVariant: ['oldstyle-nums'],
            },
          ]}
        >
          {`#${rank}`}
        </Text>
      )}
    </View>
  );
  if (!onPress) return body;
  return (
    <HapticPressable
      onPress={onPress}
      haptic="tick"
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${rank ? `, ranked ${rank}` : ''}`}
      accessibilityHint={`See the full ${label} ranking`}
    >
      {body}
    </HapticPressable>
  );
}

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
  return (
    <HapticPressable
      onPress={onPress}
      haptic="tick"
      style={[styles.moreRow, { borderBottomColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${rank ? `, ranked ${rank}` : ''}`}
    >
      <Text style={[textStyles.smallCaps, styles.moreLabel]}>{label}</Text>
      <View style={styles.moreRight}>
        {typeof rank === 'number' && rank > 0 && (
          <Text
            style={{
              ...font.semiBold,
              fontSize: typography.sizeXs,
              color: colors.dome,
              letterSpacing: typography.trackingCaps,
              fontVariant: ['oldstyle-nums'],
            }}
          >
            {`#${rank}`}
          </Text>
        )}
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
  const [moreOpen, setMoreOpen] = useState(false);
  const snapProps = useSheetSnaps(activeRanking !== null || moreOpen);
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
    setMoreOpen(false);
    onDismiss();
  }, [onDismiss]);

  const toggleMore = useCallback(() => setMoreOpen((v) => !v), []);

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

              {/* Hero rankings — enclosed by hairlines top & bottom so the
                  three tiles read as one "headline" region (Gestalt common
                  region) and carry the most weight on the sheet. */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(1))}
                style={[
                  styles.heroRow,
                  { borderTopColor: colors.rule, borderBottomColor: colors.rule },
                ]}
              >
                <HeroStat
                  label="population"
                  value={country.data.population}
                  rank={rankFor('population')}
                  onPress={() => setActiveRanking('population')}
                />
                <HeroStat
                  label="gdp"
                  value={country.data.gdp}
                  rank={rankFor('gdp')}
                  onPress={() => setActiveRanking('gdp')}
                />
                <HeroStat
                  label="gdp per capita"
                  value={country.data.gdpPerCapita}
                  rank={rankFor('gdpPerCapita')}
                  onPress={() => setActiveRanking('gdpPerCapita')}
                />
              </Animated.View>

              {/* Progressive disclosure — everything else is one tap away */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(2))}
              >
                <HapticPressable
                  onPress={toggleMore}
                  haptic="tick"
                  style={styles.moreToggle}
                  accessibilityRole="button"
                  accessibilityLabel={moreOpen ? 'Hide rankings' : 'Show all rankings'}
                >
                  <Text style={[textStyles.smallCaps, { color: colors.text }]}>rankings</Text>
                  <Ionicons
                    name={moreOpen ? 'chevron-up' : 'chevron-down'}
                    size={ICON.sm}
                    color={colors.textSecondary}
                  />
                </HapticPressable>

                {moreOpen && country.data && (
                  <View style={[styles.moreList, { borderTopColor: colors.rule }]}>
                    {MORE_METRICS.map((m) => {
                      if (!country.data) return null;
                      const rawValue = getMetricValue(
                        country.countryName ?? '',
                        country.data,
                        m.key,
                      );
                      return (
                        <MoreRow
                          key={m.key}
                          label={m.label}
                          value={rawValue}
                          rank={rankFor(m.key)}
                          onPress={() => setActiveRanking(m.key)}
                        />
                      );
                    })}
                  </View>
                )}
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
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
  },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
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
  moreLabel: {
    flex: 1,
  },
  moreRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
});
