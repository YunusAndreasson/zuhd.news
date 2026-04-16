import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { displayCountryName, displayLocation } from '../lib/place-names';
import type { TapResult } from './globe/MiniGlobe';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';

function KeyStat({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.keyStat}>
      <Text
        selectable
        style={[
          styles.keyStatValue,
          {
            ...font.bold,
            fontSize: typography.sizeLg,
            color: colors.textEmphasis,
            fontVariant: ['oldstyle-nums'] as const,
          },
        ]}
      >
        {value}
      </Text>
      <Text selectable style={[styles.keyStatLabel, textStyles.smallCapsXs]}>
        {label}
      </Text>
    </View>
  );
}

function CountryRow({
  label,
  value,
  borderColor,
}: {
  label: string;
  value: string | null | undefined;
  borderColor: string;
}) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  return (
    <View style={[styles.countryRow, { borderBottomColor: borderColor }]}>
      <Text selectable style={[styles.countryRowLabel, textStyles.smallCaps]}>
        {label}
      </Text>
      <Text
        selectable
        style={[
          styles.countryRowValue,
          { ...font.regular, fontSize: typography.sizeSm, color: colors.text },
        ]}
      >
        {value}
      </Text>
    </View>
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
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();
  const flag = country?.data?.flag;
  const name = displayCountryName(country?.countryName ?? null);
  const handleDataRef = useRef({ flag, name });
  handleDataRef.current = { flag, name };
  const CountryHandle = useCallback(() => {
    const { flag: f, name: n } = handleDataRef.current;
    return (
      <View
        style={styles.handle}
        accessibilityRole="adjustable"
        accessibilityLabel={n ? `${n} sheet` : 'Country sheet'}
        accessibilityHint="Swipe down to dismiss"
      >
        <View style={[styles.handleIndicator, { backgroundColor: colors.rule }]} />
        {(f || n) && (
          <View style={styles.handleRow}>
            {f && <Text style={styles.handleFlag}>{f}</Text>}
            {n && <Text style={[styles.handleTitle, textStyles.sheetTitle]}>{n}</Text>}
          </View>
        )}
      </View>
    );
  }, [colors.rule, textStyles.sheetTitle]);

  const hasHotspot = country?.hotspotLabels && country.hotspotLabels.length > 0;

  // Smart 3rd key stat: military spend when active stories, GDP/capita otherwise
  const thirdStat = hasHotspot
    ? { label: 'military spend', value: country?.data?.military }
    : { label: 'GDP/capita', value: country?.data?.gdpPerCapita };

  let delay = 0;
  const nextDelay = () => (delay += 40);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={CountryHandle}
      containerComponent={SheetContainer}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        {country?.data && (
          <>
            {/* Key stats — at-a-glance numbers */}
            <Animated.View
              entering={FadeInDown.duration(ANIMATION.normal).delay(nextDelay())}
              style={[styles.countryKeyStats, { borderBottomColor: colors.rule }]}
            >
              <KeyStat label="population" value={country.data.population} />
              <KeyStat label="gdp" value={country.data.gdp} />
              <KeyStat label={thirdStat.label} value={thirdStat.value} />
            </Animated.View>

            {/* Developing stories — tappable to navigate to the article */}
            {hasHotspot && (
              <Animated.View
                style={styles.hotspotSection}
                entering={FadeInDown.duration(ANIMATION.normal).delay(nextDelay())}
              >
                <Text style={[styles.sheetLabel, textStyles.smallCapsXs]}>
                  {country.hotspotLabels!.length === 1
                    ? 'developing story'
                    : 'developing stories'}
                </Text>
                {country.hotspotLabels!.map((label, i) => (
                  <Pressable
                    key={i}
                    onPress={() => onStoryPress?.(label)}
                    style={({ pressed }) => pressed && PRESSED_STYLE}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${label}`}
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
                  </Pressable>
                ))}
              </Animated.View>
            )}

            {/* ── Economy ── */}
            <Animated.View entering={FadeInDown.duration(ANIMATION.normal).delay(nextDelay())}>
              <SectionLabel>economy</SectionLabel>
              <CountryRow
                label="GDP/capita"
                value={country.data.gdpPerCapita}
                borderColor={colors.rule}
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
            <Animated.View entering={FadeInDown.duration(ANIMATION.normal).delay(nextDelay())}>
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
              />
              <CountryRow
                label="internet"
                value={country.data.internetPct}
                borderColor={colors.rule}
              />
            </Animated.View>

            {/* ── Geography ── */}
            <Animated.View entering={FadeInDown.duration(ANIMATION.normal).delay(nextDelay())}>
              <SectionLabel>geography</SectionLabel>
              <CountryRow
                label="official name"
                value={
                  country.data.official !== country.countryName ? country.data.official : null
                }
                borderColor={colors.rule}
              />
              <CountryRow key="time" label="local time" value={country.localTime} borderColor={colors.rule} />
              <CountryRow label="area" value={country.data.area} borderColor={colors.rule} />
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
            <Animated.View entering={FadeInDown.duration(ANIMATION.normal).delay(nextDelay())}>
              <Text style={[styles.attribution, textStyles.smallCapsXs]}>
                world bank \u00B7 rest countries
              </Text>
            </Animated.View>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  handle: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  handleIndicator: {
    width: LAYOUT.handleWidth,
    height: LAYOUT.handleHeight,
    borderRadius: LAYOUT.handleRadius,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  handleFlag: {
    fontSize: LAYOUT.iconMd,
  },
  handleTitle: {},
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
  keyStatLabel: {},
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryRowLabel: {
    flex: 1,
  },
  countryRowValue: {
    textAlign: 'right',
    flex: 1,
  },
  attribution: {
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
});
