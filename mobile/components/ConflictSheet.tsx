import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { COUNTRY_DATA } from '@shared/countries/country-data';
import type { ConflictEvent } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, FLAG, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import {
  displayConflictSource,
  FAMILY_EYEBROW,
  parseConflictHero,
  SUB_EVENT_LABEL,
} from '../lib/conflict';
import { useOpenLink } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { Pressable, Text } from './primitives';
import { SheetLayout } from './SheetLayout';

interface ConflictSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  event: ConflictEvent | null;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  /** Tap on the country chip — opens the CountrySheet for that country. */
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

export const ConflictSheet = memo(function ConflictSheet({
  sheetRef,
  event,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onCountryPress,
}: ConflictSheetProps) {
  const { colors, sheetStyles } = useTheme();
  const snapProps = useSheetSnaps(false);
  const openLink = useOpenLink();
  const handleSourcePress = useCallback(() => {
    if (event?.sourceUrl) openLink(event.sourceUrl);
  }, [event?.sourceUrl, openLink]);

  // Focal tint: fatalities > 0 reads in the unfavorable tone (the "people
  // killed" framing earns the same visual weight as a Red GDACS alert);
  // a 0-fatality unrest event keeps the default text color so a peaceful
  // protest doesn't read as a casualty event. This is the only place
  // colour shifts based on event semantics — the globe glyph itself stays
  // monochrome per the "color carries meaning only" rule.
  const tint = event && event.fatalities > 0 ? colors.toneUnfavorable : colors.textEmphasis;
  const hero = useMemo(() => (event ? parseConflictHero(event) : null), [event]);
  const flag = useMemo(() => {
    if (!event) return null;
    const data = COUNTRY_DATA[event.country];
    return data?.flag ? { name: event.country, flag: data.flag } : null;
  }, [event]);

  const handleTitle = event ? SUB_EVENT_LABEL[event.subEvent] : '';
  // Actor line shape:
  //   • Two-sided (battles, non-state) → "Group A vs Group B"
  //   • One-sided (UCDP type 3, ACLED VAC) → "Group A" alone — the "vs Civilians"
  //     framing reads as a mutual fight, which is exactly wrong for an attack
  //     on civilians. The sub-event label (e.g. "Attack on civilians") in the
  //     hero secondary already conveys the relationship without the false
  //     symmetry. UCDP encodes one-sided victims as the literal string
  //     "Civilians" in side_b, so we suppress that token verbatim.
  const actorLine = event
    ? event.actor2 && event.actor2.toLowerCase() !== 'civilians'
      ? `${event.actor1} vs ${event.actor2}`
      : event.actor1
    : '';
  const locationLine = event
    ? [event.location, event.admin1, displayCountryName(event.country) ?? event.country]
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .join(' · ')
    : '';

  let blockIndex = 0;
  const enter = () => FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(blockIndex++));

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle={handleTitle}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {event && (
          <>
            {/* Hero — eyebrow (family) + focal (fatalities or sub-event) +
                supporting clause. Same cognitive shape as DisasterSheet's
                hero so the two sheets feel like one family. */}
            <Animated.View entering={enter()}>
              <Text variant="labelXs" tone="secondary" style={styles.eyebrow}>
                {FAMILY_EYEBROW[event.family]}
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

            {/* Actors — who's involved. The "vs" form is ACLED's
                convention; one-actor events (peaceful_protest by
                civilians, abductions where actor2 is unspecified)
                render with the single name only. */}
            {actorLine.length > 0 && (
              <Animated.View entering={enter()} style={styles.actorRow}>
                <Text variant="bodyEmphasis" tone="emphasis" selectable>
                  {actorLine}
                </Text>
              </Animated.View>
            )}

            {/* Notes — the one-sentence summary from the data layer. */}
            {event.notes.length > 0 && (
              <Animated.View entering={enter()} style={styles.notesRow}>
                <Text variant="body" selectable>
                  {event.notes}
                </Text>
              </Animated.View>
            )}

            {/* Meta — when + where, joined as one quiet caption. */}
            <Animated.View entering={enter()} style={styles.metaRow}>
              <Text variant="labelXs" tone="secondary">
                {[relativeTime(event.eventDate), locationLine]
                  .filter((s) => s.length > 0)
                  .join(' · ')}
              </Text>
            </Animated.View>

            {flag && (
              <Animated.View entering={enter()} style={styles.flagsRow}>
                <FlagChip
                  name={flag.name}
                  flag={flag.flag}
                  borderColor={colors.rule}
                  onPress={onCountryPress}
                />
              </Animated.View>
            )}

            {/* Footer — source name + tappable URL when published.
                For prototype data this reads "Prototype data — not live
                ACLED" so nobody mistakes the fixture for journalism. */}
            <Animated.View entering={enter()} style={styles.sourceLine}>
              <Text variant="caption" tone="secondary">
                {displayConflictSource(event.source)}
              </Text>
              {event.sourceUrl && (
                <Pressable
                  haptic="tick"
                  onPress={handleSourcePress}
                  accessibilityRole="link"
                  accessibilityLabel="Open the source"
                  hitSlop={SPACING.sm}
                >
                  <Text variant="caption" tone="accent">
                    Source →
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
  focal: {},
  heroSecondary: {
    marginTop: SPACING.xxs,
  },
  actorRow: {
    marginTop: SPACING.md,
  },
  notesRow: {
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
  sourceLine: {
    marginTop: SPACING.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
