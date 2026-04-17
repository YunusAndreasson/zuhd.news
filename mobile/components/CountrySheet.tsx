import { Ionicons } from '@expo/vector-icons';
import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, ICON, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import type { MetricKey } from '../lib/country-ranking';
import { displayCountryName, displayLocation } from '../lib/place-names';
import { CountryRankingView } from './CountryRankingView';
import type { TapResult } from './globe/MiniGlobe';
import { HapticPressable } from './HapticPressable';
import { SheetHandle } from './SheetHandle';
import { SheetLayout } from './SheetLayout';

function KeyStat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string | null | undefined;
  onPress?: () => void;
}) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  const body = (
    <View style={styles.keyStat}>
      <Text
        selectable={!onPress}
        style={[
          styles.keyStatValue,
          {
            ...font.bold,
            fontSize: typography.sizeLg,
            color: colors.textEmphasis,
            fontVariant: ['oldstyle-nums'] as const,
            textDecorationLine: onPress ? 'underline' : 'none',
            textDecorationStyle: 'dotted',
            textDecorationColor: colors.accent,
          },
        ]}
      >
        {value}
      </Text>
      <Text selectable={!onPress} style={textStyles.smallCapsXs}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <HapticPressable
      onPress={onPress}
      haptic="tick"
      accessibilityRole="button"
      accessibilityLabel={`Rank ${label}`}
      accessibilityHint={`See how this country ranks globally by ${label}`}
    >
      {body}
    </HapticPressable>
  );
}

function CountryRow({
  label,
  value,
  borderColor,
  onPress,
}: {
  label: string;
  value: string | null | undefined;
  borderColor: string;
  onPress?: () => void;
}) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  const body = (
    <View style={[styles.countryRow, { borderBottomColor: borderColor }]}>
      <Text selectable={!onPress} style={[styles.countryRowLabel, textStyles.smallCaps]}>
        {label}
      </Text>
      <View style={styles.countryRowRight}>
        <Text
          selectable={!onPress}
          style={[
            styles.countryRowValue,
            { ...font.regular, fontSize: typography.sizeSm, color: colors.text },
          ]}
        >
          {value}
        </Text>
        {onPress && <Ionicons name="chevron-forward" size={ICON.sm} color={colors.accent} />}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <HapticPressable
      onPress={onPress}
      haptic="tick"
      accessibilityRole="button"
      accessibilityLabel={`Rank ${label}`}
      accessibilityHint={`See how this country ranks globally by ${label}`}
    >
      {body}
    </HapticPressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { textStyles } = useTheme();
  return <Text style={[styles.sectionLabel, textStyles.smallCapsXs]}>{children}</Text>;
}

interface CountrySheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  country: TapResult | null;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  onStoryPress?: (label: string) => void;
}

export const CountrySheet = memo(function CountrySheet({
  sheetRef,
  country,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onStoryPress,
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
            <View style={styles.handleRow}>
              {flag && <Text style={styles.handleFlag}>{flag}</Text>}
              {name && <Text style={textStyles.sheetTitle}>{name}</Text>}
            </View>
          ) : undefined
        }
      />
    ),
    [activeRanking, onBackToCountry, flag, name, textStyles.sheetTitle],
  );

  const hasHotspot = country?.hotspotLabels && country.hotspotLabels.length > 0;

  // Smart 3rd key stat: military spend when active stories, gdp per capita otherwise
  const thirdStat: { label: string; value: string | null | undefined; metric: MetricKey } =
    hasHotspot
      ? { label: 'military spend', value: country?.data?.military, metric: 'military' }
      : { label: 'gdp per capita', value: country?.data?.gdpPerCapita, metric: 'gdpPerCapita' };

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
              {/* Key stats — at-a-glance numbers */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(0))}
                style={[styles.countryKeyStats, { borderBottomColor: colors.rule }]}
              >
                <KeyStat
                  label="population"
                  value={country.data.population}
                  onPress={() => setActiveRanking('population')}
                />
                <KeyStat
                  label="gdp"
                  value={country.data.gdp}
                  onPress={() => setActiveRanking('gdp')}
                />
                <KeyStat
                  label={thirdStat.label}
                  value={thirdStat.value}
                  onPress={() => setActiveRanking(thirdStat.metric)}
                />
              </Animated.View>

              {/* Developing stories — tappable to navigate to the article */}
              {hasHotspot && (
                <Animated.View
                  style={styles.hotspotSection}
                  entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(1))}
                >
                  <Text style={[styles.sheetLabel, textStyles.smallCapsXs]}>
                    {country.hotspotLabels?.length === 1
                      ? 'developing story'
                      : 'developing stories'}
                  </Text>
                  {country.hotspotLabels?.map((label, i) => (
                    <HapticPressable
                      key={i}
                      haptic="tick"
                      onPress={() => onStoryPress?.(label)}
                      accessibilityRole="button"
                      accessibilityLabel={`View story: ${label}`}
                    >
                      <Text
                        style={[
                          styles.hotspotValue,
                          {
                            ...font.regular,
                            fontSize: typography.sizeSm,
                            color: colors.text,
                            borderBottomColor: colors.rule,
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </HapticPressable>
                  ))}
                </Animated.View>
              )}

              {/* ── Economy ── */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(2))}
              >
                <SectionLabel>economy</SectionLabel>
                <CountryRow
                  label="gdp per capita"
                  value={country.data.gdpPerCapita}
                  borderColor={colors.rule}
                  onPress={() => setActiveRanking('gdpPerCapita')}
                />
                <CountryRow
                  label="currency"
                  value={
                    country.data.currency
                      ? `${country.data.currency}${country.data.currencySymbol ? ` ${country.data.currencySymbol}` : ''}`
                      : null
                  }
                  borderColor={colors.rule}
                />
              </Animated.View>

              {/* ── People ── */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(3))}
              >
                <SectionLabel>people</SectionLabel>
                <CountryRow
                  label="capital"
                  value={displayLocation(country.data.capital)}
                  borderColor={colors.rule}
                />
                <CountryRow
                  label="languages"
                  value={country.data.languages}
                  borderColor={colors.rule}
                />
                <CountryRow
                  label="life expectancy"
                  value={country.data.lifeExpectancy}
                  borderColor={colors.rule}
                  onPress={() => setActiveRanking('lifeExpectancy')}
                />
                <CountryRow
                  label="internet"
                  value={country.data.internetPct}
                  borderColor={colors.rule}
                  onPress={() => setActiveRanking('internetPct')}
                />
              </Animated.View>

              {/* ── Geography ── */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(4))}
              >
                <SectionLabel>geography</SectionLabel>
                <CountryRow
                  label="official name"
                  value={
                    country.data.official !== country.countryName ? country.data.official : null
                  }
                  borderColor={colors.rule}
                />
                <CountryRow
                  key="time"
                  label="local time"
                  value={country.localTime}
                  borderColor={colors.rule}
                />
                <CountryRow
                  label="area"
                  value={country.data.area}
                  borderColor={colors.rule}
                  onPress={() => setActiveRanking('area')}
                />
                <CountryRow
                  label="region"
                  value={[
                    country.data.region,
                    country.data.landlocked ? 'landlocked' : null,
                    !country.data.independent ? 'territory' : null,
                  ]
                    .filter(Boolean)
                    .join(' \u00B7 ')}
                  borderColor={colors.rule}
                />
              </Animated.View>

              {/* Attribution */}
              <Animated.View
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(5))}
              >
                <Text style={[styles.attribution, textStyles.smallCapsXs]}>
                  {'world bank \u00B7 rest countries'}
                </Text>
              </Animated.View>
            </>
          )}
        </BottomSheetScrollView>
      )}
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  handleFlag: {
    fontSize: ICON.md,
  },
  sheetLabel: {
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  hotspotSection: {
    marginBottom: SPACING.md,
  },
  hotspotValue: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryKeyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  keyStat: {
    flex: 1,
    alignItems: 'center',
  },
  keyStatValue: {
    marginBottom: SPACING.xxs,
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryRowLabel: {
    flex: 1,
  },
  countryRowRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  countryRowValue: {
    textAlign: 'right',
    flexShrink: 1,
  },
  attribution: {
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
});
