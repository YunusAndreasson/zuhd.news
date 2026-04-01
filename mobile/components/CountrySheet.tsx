import { type BottomSheetBackdropProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { memo, useCallback } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { TapResult } from './globe/MiniGlobe';
import { SheetHandle } from './SheetHandle';

function SheetContainer({ children }: { children?: React.ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

const MAX_SHEET_HEIGHT = Dimensions.get('window').height * LAYOUT.sheetMaxFraction;

function KeyStat({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.keyStat}>
      <Text selectable style={[styles.keyStatValue, { fontFamily: font.bold, fontSize: typography.sizeBase, color: colors.textEmphasis }]}>{value}</Text>
      <Text selectable style={[styles.keyStatLabel, textStyles.smallCapsXs, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function CountryRow({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors, font, typography, textStyles } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.countryRow}>
      <Text selectable style={[styles.countryRowLabel, textStyles.smallCaps]}>{label}</Text>
      <Text selectable style={[styles.countryRowValue, { fontFamily: font.regular, fontSize: typography.sizeSm, color: colors.text }]}>{value}</Text>
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
  const CountryHandle = useCallback(() => <SheetHandle />, []);

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
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {country?.data && (
          <>
            {/* Identity — city + country hero */}
            <View style={styles.countryIdentity}>
              <View style={styles.countryIdentityText}>
                <Text selectable style={[styles.countryLocation, { fontFamily: font.bold, fontSize: typography.sizeH1 * 0.75, lineHeight: typography.sizeH1 * 0.75 * typography.leadingHeading, color: colors.textEmphasis }]}>{country.countryName}</Text>
                <Text selectable style={[styles.countryName, { fontFamily: font.regular, fontSize: typography.sizeSm, color: colors.textSecondary }]}>{country.data.official}</Text>
              </View>
              <Text style={[styles.countryFlag, { fontSize: typography.sizeH1 * 1.3 }]}>{country.data.flag}</Text>
            </View>

            {/* Key stats — at-a-glance numbers */}
            <View style={[styles.countryKeyStats, { borderBottomColor: colors.rule }]}>
              <KeyStat label="population" value={country.data.population} />
              <KeyStat label="gdp" value={country.data.gdp} />
              <KeyStat label="military spend" value={country.data.military} />
            </View>

            {/* Developing stories — shown when coverage hotspots overlap this country */}
            {country.hotspotLabels && country.hotspotLabels.length > 0 && (
              <View style={styles.hotspotSection}>
                <Text style={[styles.sheetLabel, textStyles.smallCapsXs, { color: colors.textSecondary }]}>
                  {country.hotspotLabels.length === 1
                    ? 'DEVELOPING STORY'
                    : 'DEVELOPING STORIES'}
                </Text>
                {country.hotspotLabels.map((label, i) => (
                  <Text key={i} selectable style={[styles.hotspotValue, { fontFamily: font.regular, fontSize: typography.sizeSm, color: colors.text, borderBottomColor: colors.rule }]}>
                    {label}
                  </Text>
                ))}
              </View>
            )}

            {/* Detail rows — ordered by user interest */}
            <CountryRow label="Capital" value={country.data.capital} />
            <CountryRow label="Languages" value={country.data.languages} />
            <CountryRow
              label="Currency"
              value={
                country.data.currency
                  ? `${country.data.currency}${country.data.currencySymbol ? ` ${country.data.currencySymbol}` : ''}`
                  : null
              }
            />
            <CountryRow label="Local time" value={country.localTime} />
            <CountryRow label="Area" value={country.data.area} />
            <CountryRow label="GDP/capita" value={country.data.gdpPerCapita} />
            <CountryRow label="Life expectancy" value={country.data.lifeExpectancy} />
            <CountryRow label="Internet" value={country.data.internetPct} />
            <CountryRow
              label="Region"
              value={[
                country.data.region,
                country.data.landlocked ? 'Landlocked' : null,
                !country.data.independent ? 'Disputed' : null,
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
  countryIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  countryIdentityText: {
    flex: 1,
  },
  countryFlag: {},
  countryLocation: {},
  countryName: {},
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
    marginBottom: 2,
  },
  keyStatLabel: {},
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  countryRowLabel: {
    flex: 1,
  },
  countryRowValue: {
    textAlign: 'right',
    flex: 1,
  },
});
