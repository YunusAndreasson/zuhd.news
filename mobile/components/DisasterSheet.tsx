import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { COUNTRY_DATA } from '@shared/countries/country-data';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, FLAG, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import type { GdacsAlert } from '../lib/gdacs';
import { useOpenLink } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { EVENT_TYPE_LABEL, GLYPH_HALF, getGlyphPath } from './globe/disaster-glyphs';
import { Pressable, Text } from './primitives';
import { SheetLayout } from './SheetLayout';

interface DisasterSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  alert: GdacsAlert | null;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  /** Tap on a country chip — opens the CountrySheet for that country. */
  onCountryPress?: (countryName: string) => void;
}

// Hero glyph is 44 — bigger than the 22 globe marker so it reads as the
// sheet's identifying mark, smaller than the 36 used in CountrySheet's
// alert chips so it doesn't dominate alongside title-sized severity text.
const HERO_GLYPH = 44;

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

  const tint =
    alert?.alertlevel === 'Red'
      ? colors.toneUnfavorable
      : alert?.alertlevel === 'Orange'
        ? colors.alertOrange
        : colors.alertLow;
  // Tone-text vocabulary mirrors editorial signal: unfavorable for Red
  // (consequential), accent for Orange (notable), secondary for Green
  // (informational/ambient — same tone used for all chrome metadata).
  const tone =
    alert?.alertlevel === 'Red'
      ? 'unfavorable'
      : alert?.alertlevel === 'Orange'
        ? 'accent'
        : 'secondary';

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
            {/* Hero — the answer to "how bad and when?". Glyph + severity
                readout side-by-side; severity is the lead text (title
                variant), with a tone-coloured caption beneath restating
                the alert level and recency. The handle title above
                already covers the "what + where" identifier, so the body
                opens directly with the magnitude/wind-speed/burn-area
                number that's the actual answer the reader came for. */}
            <Animated.View entering={enter()} style={styles.hero}>
              <Canvas style={{ width: HERO_GLYPH, height: HERO_GLYPH }}>
                <Circle
                  cx={HERO_GLYPH / 2}
                  cy={HERO_GLYPH / 2}
                  r={HERO_GLYPH / 2}
                  color={tint}
                  opacity={0.18}
                />
                <Path
                  path={getGlyphPath(alert.eventtype)}
                  color={tint}
                  style="stroke"
                  strokeWidth={1.8}
                  strokeJoin="round"
                  strokeCap="round"
                  transform={[
                    { translateX: HERO_GLYPH / 2 - GLYPH_HALF },
                    { translateY: HERO_GLYPH / 2 - GLYPH_HALF },
                  ]}
                />
              </Canvas>
              <View style={styles.heroText}>
                {/* Severity readout uses `bodyEmphasis` (17pt semiBold), not
                    `title` (21pt). A GDACS sheet is a data snapshot, not an
                    article headline — pairing 21pt over the handle's 17pt
                    label stacked two big title tiers in the first ~80px and
                    fought the meta line beneath. bodyEmphasis lands hero:meta
                    at 17:13 (ratio 1.3), proportional for a stat. */}
                <Text variant="bodyEmphasis" tone="emphasis" selectable>
                  {alert.severityText.length > 0
                    ? alert.severityText
                    : EVENT_TYPE_LABEL[alert.eventtype]}
                </Text>
                <Text variant="labelSm" tone={tone} style={styles.heroMeta} numberOfLines={1}>
                  {[
                    alert.alertlevel.toLowerCase(),
                    formatStarted(alert.fromDate),
                    formatStatus(alert),
                  ]
                    .filter((s) => s.length > 0)
                    .join(' · ')}
                </Text>
              </View>
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

            {/* Footer attribution + tappable GDACS report. The originating
                authority (NEIC for earthquakes, JTWC for cyclones, JRC for
                floods) gives the alert a name reader can credit; the
                report link is the deep-dive escape hatch when the brief
                fields aren't enough. Tappable only when GDACS supplies a
                URL — otherwise just the source line. */}
            <Animated.View entering={enter()} style={styles.sourceLine}>
              {alert.reportUrl ? (
                <Pressable
                  haptic="tick"
                  onPress={handleReportPress}
                  accessibilityRole="link"
                  accessibilityLabel="Open the GDACS event report"
                  hitSlop={SPACING.sm}
                >
                  <Text variant="labelXs" tone="secondary">
                    {[alert.source, 'gdacs report ↗'].filter((s) => s.length > 0).join(' · ')}
                  </Text>
                </Pressable>
              ) : (
                <Text variant="labelXs" tone="secondary">
                  {alert.source.length > 0
                    ? `${alert.source} · gdacs`
                    : 'global disaster alert system'}
                </Text>
              )}
            </Animated.View>
          </>
        )}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  heroText: {
    flex: 1,
    gap: SPACING.xxs,
  },
  heroMeta: {
    marginTop: SPACING.xxs,
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
    alignItems: 'flex-end',
  },
});
