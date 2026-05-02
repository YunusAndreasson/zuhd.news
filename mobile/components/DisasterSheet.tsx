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

function formatStarted(fromIso: string, now: number = Date.now()): string {
  const f = Date.parse(fromIso);
  if (!Number.isFinite(f)) return '';
  const diffMs = now - f;
  if (diffMs < 0) return 'starting today';
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return 'started just now';
  if (diffHours < 24) return `started ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `started ${diffDays}d ago`;
  if (diffDays < 30) return `started ${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `started ${Math.floor(diffDays / 30)}mo ago`;
  return `started ${Math.floor(diffDays / 365)}y ago`;
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

  const tint =
    alert?.alertlevel === 'Red'
      ? colors.toneUnfavorable
      : alert?.alertlevel === 'Orange'
        ? colors.alertOrange
        : colors.alertGreen;
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
                <Text variant="title" tone="emphasis" selectable>
                  {alert.severityText.length > 0
                    ? alert.severityText
                    : EVENT_TYPE_LABEL[alert.eventtype]}
                </Text>
                <Text variant="labelSm" tone={tone} style={styles.heroMeta} numberOfLines={1}>
                  {alert.alertlevel.toLowerCase()} · {formatStarted(alert.fromDate)}
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

            <Animated.View entering={enter()} style={styles.sourceLine}>
              <Text variant="labelXs" tone="secondary">
                source: global disaster alert system
              </Text>
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
