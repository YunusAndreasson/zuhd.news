import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { getMetricValue, getRanking, type MetricKey } from '@shared/countries/country-ranking';
import type { GdacsAlert } from '@shared/types';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useState } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, FLAG, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { displayCountryName, displayLocation } from '../lib/place-names';
import { CountryRankingView } from './CountryRankingView';
import { CountryCardsCarousel } from './country-cards/CountryCardsCarousel';
import { EVENT_TYPE_LABEL, GLYPH_HALF, getGlyphPath } from './globe/disaster-glyphs';
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

// Percentile strip: thin rule + dot whose horizontal position reflects the
// country's place in the full ranking. "Better" (lower rank number) = dot
// further right, with the left half of the rule filled from 0 → dot. Uses
// the dome accent for top-N ranks to match the rank-column typography.
const STRIP_WIDTH = 44;
const STRIP_DOT_SIZE = 4;
const STRIP_HEIGHT = 10;
const STRIP_RULE_HEIGHT = 2;

function PercentileStrip({
  rank,
  total,
  isTop,
}: {
  rank: number | null;
  total: number;
  isTop: boolean;
}) {
  const { colors } = useTheme();
  if (rank == null || total < 2) return <View style={styles.strip} />;
  const percentile = Math.max(0, Math.min(1, (total - rank) / (total - 1)));
  const dotLeft = percentile * STRIP_WIDTH - STRIP_DOT_SIZE / 2;
  const dotColor = isTop ? colors.dome : colors.textEmphasis;
  // Rule + fill share `textSecondary` as the hue and differ only by
  // opacity — the base reads as "unfilled %" and the fill as "achieved %",
  // mirroring a progress bar. `colors.rule` was too faint here (tuned for
  // row dividers, not load-bearing chrome).
  return (
    <View style={styles.strip}>
      <View style={[styles.stripRule, { backgroundColor: colors.textSecondary }]} />
      <View
        style={[
          styles.stripFill,
          { width: percentile * STRIP_WIDTH, backgroundColor: colors.textSecondary },
        ]}
      />
      <View style={[styles.stripDot, { left: dotLeft, backgroundColor: dotColor }]} />
    </View>
  );
}

function MoreRow({
  label,
  value,
  rank,
  total,
  onPress,
}: {
  label: string;
  value: string | null;
  rank: number | null;
  total: number;
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
      accessibilityLabel={`${label}: ${value}${rank ? `, ranked ${rank} of ${total}` : ''}`}
    >
      <RNText style={[styles.rankCol, rankStyle]}>{hasRank ? `#${rank}` : ''}</RNText>
      <PercentileStrip rank={rank} total={total} isTop={isTopRank} />
      <Text variant="labelSm" style={styles.moreLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.moreRight}>
        <Text variant="caption" tone="default" style={styles.value} numberOfLines={1}>
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
  /** GDACS alerts whose primary or affected-country list includes this
   *  country. Empty when there are no active disaster alerts touching it. */
  activeAlerts?: GdacsAlert[];
  /** Called when the user taps an alert chip — opens DisasterSheet. */
  onAlertPress?: (alert: GdacsAlert) => void;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

const ALERT_CHIP_GLYPH = 28;

function AlertChip({
  alert,
  onPress,
}: {
  alert: GdacsAlert;
  onPress: (alert: GdacsAlert) => void;
}) {
  const { colors } = useTheme();
  const tint =
    alert.alertlevel === 'Red'
      ? colors.toneUnfavorable
      : alert.alertlevel === 'Orange'
        ? colors.alertOrange
        : colors.alertLow;
  const handlePress = useCallback(() => onPress(alert), [alert, onPress]);
  return (
    <Pressable
      haptic="tick"
      onPress={handlePress}
      style={[styles.alertChip, { borderColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.alertlevel} alert: ${EVENT_TYPE_LABEL[alert.eventtype]}`}
    >
      <Canvas style={{ width: ALERT_CHIP_GLYPH, height: ALERT_CHIP_GLYPH }}>
        <Circle
          cx={ALERT_CHIP_GLYPH / 2}
          cy={ALERT_CHIP_GLYPH / 2}
          r={ALERT_CHIP_GLYPH / 2}
          color={tint}
          opacity={0.18}
        />
        <Path
          path={getGlyphPath(alert.eventtype)}
          color={tint}
          style="stroke"
          strokeWidth={1.4}
          strokeJoin="round"
          strokeCap="round"
          transform={[
            { translateX: ALERT_CHIP_GLYPH / 2 - GLYPH_HALF },
            { translateY: ALERT_CHIP_GLYPH / 2 - GLYPH_HALF },
          ]}
        />
      </Canvas>
      <View style={styles.alertChipText}>
        <View style={styles.alertChipTitleRow}>
          <Text variant="labelSm" tone="emphasis" numberOfLines={1} style={styles.alertChipTitle}>
            {EVENT_TYPE_LABEL[alert.eventtype]}
          </Text>
          {/* Tiny level dot — restates the alert tier in chrome that's
              visible at a glance. Same color family as the glyph so the
              chip reads as a single unit, not stitched-together pieces. */}
          <View style={[styles.alertChipDot, { backgroundColor: tint }]} />
        </View>
        {alert.severityText.length > 0 && (
          <Text variant="labelXs" tone="secondary" numberOfLines={1}>
            {alert.severityText}
          </Text>
        )}
      </View>
      <Icon name="chevron-forward" size="sm" tone="secondary" />
    </Pressable>
  );
}

export const CountrySheet = memo(function CountrySheet({
  sheetRef,
  country,
  activeAlerts,
  onAlertPress,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: CountrySheetProps) {
  const { sheetStyles } = useTheme();
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
    if (country.localTime) parts.push(country.localTime);
    return parts.join(' · ');
  }, [country?.data, country?.localTime]);

  const hasBack = activeRanking !== null;
  const CountryHandle = useCallback(
    () => (
      <SheetHandle
        onBack={hasBack ? onBackToCountry : undefined}
        title={
          flag || name ? (
            <View style={[styles.handleRow, hasBack && styles.handleRowWithBack]}>
              <View style={styles.handleIdent}>
                {flag && (
                  <RNText allowFontScaling={false} style={styles.handleFlag}>
                    {flag}
                  </RNText>
                )}
                {/* 21pt semibold so the country name reads as the canonical
                 *  identifier above every card headline (also 21pt) and metric
                 *  row label (13pt small-caps). `flexShrink` lets a long name
                 *  (e.g. Bosnia and Herzegovina) ellipsize before pushing the
                 *  meta off the right edge. */}
                {name && (
                  <Text variant="title" numberOfLines={1} style={styles.handleName}>
                    {name}
                  </Text>
                )}
              </View>
              {dateline && (
                <Text
                  variant="labelXs"
                  tone="secondary"
                  numberOfLines={1}
                  style={styles.handleMeta}
                >
                  {dateline}
                </Text>
              )}
            </View>
          ) : undefined
        }
      />
    ),
    [hasBack, onBackToCountry, flag, name, dateline],
  );

  const rankFor = useMemo(() => {
    const targetName = country?.countryName;
    if (!targetName) return () => ({ rank: null as number | null, total: 0 });
    return (metric: MetricKey): { rank: number | null; total: number } => {
      const entries = getRanking(metric);
      const idx = entries.findIndex((e) => e.name === targetName);
      return { rank: idx >= 0 ? idx + 1 : null, total: entries.length };
    };
  }, [country?.countryName]);

  const rankedRows = useMemo(() => {
    if (!country?.data) return [];
    const rows: {
      key: MetricKey;
      label: string;
      value: string;
      rank: number | null;
      total: number;
    }[] = [];
    for (const m of MORE_METRICS) {
      const value = getMetricValue(country.countryName ?? '', country.data, m.key);
      if (value == null) continue;
      const { rank, total } = rankFor(m.key);
      rows.push({ key: m.key, label: m.label, value, rank, total });
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
          contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
        >
          {country?.countryName && (
            <Animated.View entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(0))}>
              <CountryCardsCarousel countryName={country.countryName} />
            </Animated.View>
          )}
          {country?.data && (
            <Animated.View
              entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(1))}
              // No border-top here — the carousel above already provides the
              // bottom hairline that separates story (carousel) from
              // appendix (metric rows). Doubling them would read as a
              // gutter.
              style={styles.moreList}
            >
              {rankedRows.map((r) => (
                <MoreRow
                  key={r.key}
                  label={r.label}
                  value={r.value}
                  rank={r.rank}
                  total={r.total}
                  onPress={() => setActiveRanking(r.key)}
                />
              ))}
            </Animated.View>
          )}
          {activeAlerts && activeAlerts.length > 0 && onAlertPress && (
            <Animated.View
              entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(2))}
              style={styles.alertsSection}
            >
              <Text variant="labelXs" tone="secondary" style={styles.alertsHeading}>
                {activeAlerts.length === 1
                  ? 'active alert'
                  : `${activeAlerts.length} active alerts`}
              </Text>
              {activeAlerts.map((a) => (
                <AlertChip key={a.eventid} alert={a} onPress={onAlertPress} />
              ))}
            </Animated.View>
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
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SPACING.screenPadding,
    gap: SPACING.md,
  },
  // When the back chevron is present (absolute-positioned at screenPadding),
  // shift the row content right so flag/name don't sit under the chevron.
  handleRowWithBack: {
    paddingLeft: SPACING.screenPadding + SPACING.lg,
  },
  handleIdent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  handleFlag: {
    fontSize: FLAG.inline,
    lineHeight: FLAG.inline * 1.125,
  },
  handleName: {
    flexShrink: 1,
  },
  handleMeta: {
    flexShrink: 0,
    textAlign: 'right',
  },
  moreList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.smPlus,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rankCol: {
    width: 34,
    textAlign: 'right',
    marginRight: SPACING.sm,
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
  strip: {
    width: STRIP_WIDTH,
    height: STRIP_HEIGHT,
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  stripRule: {
    height: STRIP_RULE_HEIGHT,
    opacity: 0.3,
  },
  stripFill: {
    position: 'absolute',
    left: 0,
    height: STRIP_RULE_HEIGHT,
    opacity: 1,
  },
  stripDot: {
    position: 'absolute',
    top: (STRIP_HEIGHT - STRIP_DOT_SIZE) / 2,
    width: STRIP_DOT_SIZE,
    height: STRIP_DOT_SIZE,
    borderRadius: STRIP_DOT_SIZE / 2,
  },
  value: {
    fontVariant: ['oldstyle-nums'],
  },
  alertsSection: {
    marginTop: SPACING.lg,
  },
  alertsHeading: {
    marginBottom: SPACING.xs,
  },
  alertChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  alertChipText: {
    flex: 1,
    gap: 1,
  },
  alertChipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  alertChipTitle: {
    flexShrink: 1,
  },
  alertChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
