import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { COUNTRY_DATA } from '@shared/countries/country-data';
import type { GdacsAlert, GdacsDetail } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, FLAG, SPACING, staggerDelay } from '../constants/theme';
import { useGdacsDetail } from '../hooks/useGdacsDetail';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { displaySourceName, EVENT_TYPE_EYEBROW, parseSeverityHero } from '../lib/gdacs';
import { useOpenLink } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { Markdown, Pressable, Text } from './primitives';
import { SheetLayout } from './SheetLayout';

interface DisasterSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  alert: GdacsAlert | null;
  /** Pre-fetched detail map from /api/gdacs.json — keyed
   *  `${eventtype}:${eventid}`. The sheet does a synchronous lookup; missing
   *  keys (non-EQ/TC events, or EQ/TC where the cycle's detail fetch failed)
   *  resolve to null and the population row hides. */
  details: Record<string, GdacsDetail>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  /** Tap on a country chip — opens the CountrySheet for that country. */
  onCountryPress?: (countryName: string) => void;
}

function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffMs = Math.abs(now - t);
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function formatStarted(fromIso: string, now: number = Date.now()): string {
  const f = Date.parse(fromIso);
  if (!Number.isFinite(f)) return '';
  if (now - f < 0) return 'starting today';
  return `started ${relativeTime(fromIso, now)}`;
}

/** Status line built from the alert's three timestamps. The reader gets
 *  one of three signals:
 *    • ended Xh ago — `toDate` is in the past (storm passed, fire out)
 *    • updated Xh ago — `datemodified` is meaningfully fresher than
 *      `fromDate`, so GDACS is actively monitoring
 *    • (nothing) — for instant events where modified ≈ from and no end
 *  Returns the empty string when there's nothing useful to add. */
function formatStatus(alert: GdacsAlert, now: number = Date.now()): string {
  const to = alert.toDate ? Date.parse(alert.toDate) : NaN;
  if (Number.isFinite(to) && to < now) {
    return `ended ${relativeTime(alert.toDate ?? '', now)}`;
  }
  const modified = Date.parse(alert.modifiedDate);
  const from = Date.parse(alert.fromDate);
  if (Number.isFinite(modified) && Number.isFinite(from) && modified - from > 3_600_000) {
    return `updated ${relativeTime(alert.modifiedDate, now)}`;
  }
  return '';
}

/** Compact human form for population estimates. Earthquake exposure
 *  numbers span 5+ orders of magnitude (a few hundred for offshore
 *  events; tens of millions for shallow shocks under a megacity), so
 *  bucket by magnitude rather than render full digits — the precision
 *  is illusory anyway (GDACS itself tags these as "rapid impact"
 *  estimates). Returns null when n is null or 0 so the caller can
 *  hide the row entirely. */
function formatPopulation(n: number | null): string | null {
  if (n === null || n <= 0) return null;
  if (n < 1_000) return `~${Math.round(n / 100) * 100}`;
  if (n < 1_000_000) return `~${Math.round(n / 1_000)}K`;
  if (n < 1_000_000_000) return `~${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `~${(n / 1_000_000_000).toFixed(1)}B`;
}

function FlagChip({
  name,
  flag,
  borderColor,
  onPress,
}: {
  name: string;
  flag: string;
  borderColor: string;
  onPress?: (countryName: string) => void;
}) {
  const display = displayCountryName(name) ?? name;
  const handlePress = useCallback(() => onPress?.(name), [name, onPress]);
  if (!onPress) {
    return (
      <View style={[styles.flagChip, { borderColor }]}>
        <RNText allowFontScaling={false} style={styles.flagGlyph}>
          {flag}
        </RNText>
        <Text variant="labelSm" numberOfLines={1}>
          {display}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      haptic="tick"
      onPress={handlePress}
      style={[styles.flagChip, { borderColor }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${display}`}
    >
      <RNText allowFontScaling={false} style={styles.flagGlyph}>
        {flag}
      </RNText>
      <Text variant="labelSm" numberOfLines={1}>
        {display}
      </Text>
    </Pressable>
  );
}

export const DisasterSheet = memo(function DisasterSheet({
  sheetRef,
  alert,
  details,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onCountryPress,
}: DisasterSheetProps) {
  const { colors, sheetStyles } = useTheme();
  const snapProps = useSheetSnaps(false);
  const openLink = useOpenLink();
  const handleReportPress = useCallback(() => {
    if (alert?.reportUrl) openLink(alert.reportUrl);
  }, [alert?.reportUrl, openLink]);
  // Per-event detail — population estimates for EQ and TC. Pre-fetched
  // server-side (stage 3.4c of run-cycle) and shipped with the alert list,
  // so this is a synchronous map lookup and the population row renders the
  // moment the sheet opens.
  const detail = useGdacsDetail(alert, details);
  const populationCount =
    detail?.criticalPopulation && detail.criticalPopulation > 0
      ? detail.criticalPopulation
      : detail?.widerPopulation && detail.widerPopulation > 0
        ? detail.widerPopulation
        : null;
  const populationClause =
    detail?.criticalPopulation && detail.criticalPopulation > 0
      ? detail.criticalClause
      : (detail?.widerClause ?? '');
  const populationText = formatPopulation(populationCount);

  // Severity tint moves from the (now-removed) glyph backdrop disc to the
  // focal number itself — the magnitude / wind speed / burn area is
  // *literally* coloured by severity tier, so the reader's eye picks up
  // "how bad?" pre-attentively from a single tinted number rather than
  // hunting for a coloured disc and a separate text caption.
  const tint =
    alert?.alertlevel === 'Red'
      ? colors.toneUnfavorable
      : alert?.alertlevel === 'Orange'
        ? colors.alertOrange
        : colors.alertLow;

  const hero = useMemo(() => (alert ? parseSeverityHero(alert) : null), [alert]);

  const flags = useMemo(() => {
    if (!alert) return [] as { name: string; flag: string }[];
    const names = alert.affectedCountries.length > 0 ? alert.affectedCountries : [alert.country];
    const seen = new Set<string>();
    const out: { name: string; flag: string }[] = [];
    for (const n of names) {
      const data = COUNTRY_DATA[n];
      if (data?.flag && !seen.has(n)) {
        seen.add(n);
        out.push({ name: n, flag: data.flag });
      }
    }
    return out;
  }, [alert]);

  let blockIndex = 0;
  const enter = () => FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(blockIndex++));

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle={alert?.name ?? ''}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {alert && (
          <>
            {/* Hero — eyebrow + focal severity number + supporting clause.
                Cognitive-load shape: the reader's eye lands on a single
                large tinted number (the magnitude / wind speed / burn
                area) and gets the "how bad?" answer pre-attentively.
                Severity tier is encoded in the colour of that number,
                so the meta line below doesn't need to repeat the
                alert-level word. The 44px glyph that used to sit here
                was redundant — the reader just tapped the same shape
                on the globe. */}
            <Animated.View entering={enter()}>
              <Text variant="labelXs" tone="secondary" style={styles.eyebrow}>
                {EVENT_TYPE_EYEBROW[alert.eventtype]}
              </Text>
              <Text
                variant="display"
                style={[styles.focal, { color: tint }]}
                numberOfLines={2}
                selectable
              >
                {hero?.focal ?? ''}
              </Text>
              {hero?.secondary && hero.secondary.length > 0 && (
                <Text variant="caption" tone="secondary" style={styles.heroSecondary}>
                  {hero.secondary}
                </Text>
              )}
            </Animated.View>

            {/* Population sentence — plain-English form of the human
                stake. Renders only when GDACS publishes a meaningful
                number (EQ shaking footprint or TC hurricane wind zone);
                low-tier events get null detail and the row stays hidden. */}
            {populationText && populationClause.length > 0 && (
              <Animated.View entering={enter()} style={styles.populationRow}>
                <Text variant="bodyEmphasis" tone="emphasis" selectable>
                  {populationText}{' '}
                  <Text variant="body" tone="default">
                    people {populationClause}
                  </Text>
                </Text>
              </Animated.View>
            )}

            {/* Narrative — server-composed 2-3 sentence context tying
                the alert to country profile, recent weather (FL/WF/DR),
                and nearby chokepoints. Only present on Orange/Red alerts
                where the cycle's narration call validated successfully;
                Green alerts and validation-rejected calls fall through. */}
            {alert.narrative && alert.narrative.length > 0 && (
              <Animated.View entering={enter()} style={styles.narrativeRow}>
                <Markdown variant="body" selectable>
                  {alert.narrative}
                </Markdown>
              </Animated.View>
            )}

            {/* Meta — when did it start, when was the data last refreshed,
                or whether it's already over. Alert-level word dropped
                because the focal number above already carries it via tint. */}
            <Animated.View entering={enter()} style={styles.metaRow}>
              <Text variant="labelXs" tone="secondary">
                {[formatStarted(alert.fromDate), formatStatus(alert)]
                  .filter((s) => s.length > 0)
                  .join(' · ')}
              </Text>
            </Animated.View>

            {flags.length > 0 && (
              <Animated.View entering={enter()} style={styles.flagsRow}>
                {flags.map((f) => (
                  <FlagChip
                    key={f.name}
                    name={f.name}
                    flag={f.flag}
                    borderColor={colors.rule}
                    onPress={onCountryPress}
                  />
                ))}
              </Animated.View>
            )}

            {alert.description.length > 0 && (
              <Animated.View entering={enter()} style={styles.description}>
                <Text selectable variant="body">
                  {alert.description}
                </Text>
              </Animated.View>
            )}

            {/* Footer — full source name (no acronyms) + tappable report.
                The acronym alone ("NEIC", "JTWC") forces the reader to
                either know the org or read the line as opaque chrome;
                the spelled-out name carries the trust signal directly. */}
            <Animated.View entering={enter()} style={styles.sourceLine}>
              <Text variant="caption" tone="secondary">
                {displaySourceName(alert.source)}
              </Text>
              {alert.reportUrl && (
                <Pressable
                  haptic="tick"
                  onPress={handleReportPress}
                  accessibilityRole="link"
                  accessibilityLabel="Open the GDACS event report"
                  hitSlop={SPACING.sm}
                  style={styles.reportLink}
                >
                  <Text variant="caption" tone="accent">
                    GDACS report →
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          </>
        )}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  eyebrow: {
    marginBottom: SPACING.xs,
  },
  focal: {
    // The hero pre-attentive cue — large, severity-tinted, single-line
    // first scan target. `display` variant is 28pt bold; we keep that
    // and override only the colour via the inline tint so the variant's
    // tracking + line-height stay intact.
  },
  heroSecondary: {
    marginTop: SPACING.xxs,
  },
  populationRow: {
    marginTop: SPACING.md,
  },
  narrativeRow: {
    marginTop: SPACING.md,
  },
  metaRow: {
    marginTop: SPACING.sm,
  },
  flagsRow: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flagGlyph: {
    fontSize: FLAG.row,
    lineHeight: FLAG.row * 1.125,
  },
  description: {
    marginTop: SPACING.lg,
  },
  sourceLine: {
    marginTop: SPACING.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  reportLink: {
    // Report link sits on the right of the source line baseline-aligned
    // with the source name on the left, so the sheet's last row reads
    // as one balanced footer rather than a stacked block.
  },
});
