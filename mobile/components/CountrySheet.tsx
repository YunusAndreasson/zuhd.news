import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
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
            fontSize: typography.sizeBase,
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

function CountryRow({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.countryRow}>
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
            <View style={[styles.countryKeyStats, { borderBottomColor: colors.rule }]}>
              <KeyStat label="population" value={country.data.population} />
              <KeyStat label="gdp" value={country.data.gdp} />
              <KeyStat label="military spend" value={country.data.military} />
            </View>

            {/* Developing stories — shown when coverage hotspots overlap this country */}
            {country.hotspotLabels && country.hotspotLabels.length > 0 && (
              <View style={styles.hotspotSection}>
                <Text style={[styles.sheetLabel, textStyles.smallCapsXs]}>
                  {country.hotspotLabels.length === 1 ? 'developing story' : 'developing stories'}
                </Text>
                {country.hotspotLabels.map((label, i) => (
                  <Text
                    key={i}
                    selectable
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
                ))}
              </View>
            )}

            {/* Detail rows — ordered by user interest */}
            <CountryRow
              label="official name"
              value={country.data.official !== country.countryName ? country.data.official : null}
            />
            <CountryRow label="capital" value={displayLocation(country.data.capital)} />
            <CountryRow label="languages" value={country.data.languages} />
            <CountryRow
              label="currency"
              value={
                country.data.currency
                  ? `${country.data.currency}${country.data.currencySymbol ? ` ${country.data.currencySymbol}` : ''}`
                  : null
              }
            />
            <CountryRow label="local time" value={country.localTime} />
            <CountryRow label="area" value={country.data.area} />
            <CountryRow label="GDP/capita" value={country.data.gdpPerCapita} />
            <CountryRow label="life expectancy" value={country.data.lifeExpectancy} />
            <CountryRow label="internet" value={country.data.internetPct} />
            <CountryRow
              label="region"
              value={[
                country.data.region,
                country.data.landlocked ? 'landlocked' : null,
                !country.data.independent ? 'territory' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
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
  },
  countryRowLabel: {
    flex: 1,
  },
  countryRowValue: {
    textAlign: 'right',
    flex: 1,
  },
});
