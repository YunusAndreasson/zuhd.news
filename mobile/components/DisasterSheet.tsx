import { COUNTRY_DATA } from '@shared/countries/country-data';
import type { GdacsAlert, GdacsDetail } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { relativeTime } from '../lib/date-format';
import {
  displaySourceName,
  EVENT_TYPE_EYEBROW,
  gdacsDetailFor,
  parseSeverityHero,
} from '../lib/gdacs';
import { useOpenLink } from '../lib/open-link';
import { severityTint } from '../lib/severity';
import { makeStaggerEnter } from '../lib/stagger';
import { Markdown, Text } from './primitives';
import { SheetFlagRow, SheetHero, SheetScrollView, SheetSourceFooter } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface DisasterSheetProps extends BaseSheetProps {
  alert: GdacsAlert | null;
  /** Pre-fetched detail map from /api/gdacs.json — keyed
   *  `${eventtype}:${eventid}`. The sheet does a synchronous lookup; missing
   *  keys (non-EQ/TC events, or EQ/TC where the cycle's detail fetch failed)
   *  resolve to null and the population row hides. */
  details: Record<string, GdacsDetail>;
  /** Tap on a country chip — opens the CountrySheet for that country. */
  onCountryPress?: (countryName: string) => void;
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

export const DisasterSheet = memo(function DisasterSheet({
  sheetRef,
  alert,
  details,
  bottomInset,
  onDismiss,
  onCountryPress,
}: DisasterSheetProps) {
  const { colors } = useTheme();
  const openLink = useOpenLink();
  const handleReportPress = useCallback(() => {
    if (alert?.reportUrl) openLink(alert.reportUrl);
  }, [alert?.reportUrl, openLink]);
  // Per-event detail — population estimates for EQ and TC. Pre-fetched
  // server-side (stage 3.4c of run-cycle) and shipped with the alert list,
  // so this is a synchronous map lookup and the population row renders the
  // moment the sheet opens.
  const detail = gdacsDetailFor(alert, details);
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

  // Severity tint reserved for Red — the most editorially urgent tier.
  // Lower alert levels (Orange, Green) read in the default display color
  // so the warm hue carries a single critical signal rather than a
  // 3-tier ladder competing with the focal number's typographic weight.
  // Severity is still legible from the metadata line and the focal
  // number itself (magnitude, wind speed, burn area).
  const tint = severityTint(colors, { alertLevel: alert?.alertlevel }, undefined);

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

  const enter = makeStaggerEnter();

  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle={alert?.name ?? ''}>
      <SheetScrollView bottomInset={bottomInset}>
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
            <SheetHero
              entering={enter()}
              eyebrow={EVENT_TYPE_EYEBROW[alert.eventtype]}
              focal={hero?.focal ?? ''}
              tint={tint}
              secondary={hero?.secondary}
            />

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
              <SheetFlagRow
                entering={enter()}
                flags={flags}
                borderColor={colors.rule}
                onPress={onCountryPress}
              />
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
            <SheetSourceFooter
              entering={enter()}
              source={displaySourceName(alert.source)}
              linkLabel="GDACS report →"
              linkAccessibilityLabel="Open the GDACS event report"
              onLinkPress={alert.reportUrl ? handleReportPress : undefined}
            />
          </>
        )}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  populationRow: {
    marginTop: SPACING.md,
  },
  narrativeRow: {
    marginTop: SPACING.md,
  },
  metaRow: {
    marginTop: SPACING.sm,
  },
  description: {
    marginTop: SPACING.lg,
  },
});
