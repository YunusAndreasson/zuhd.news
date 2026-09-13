import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import { type SharedValue, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { mixHex, PRESSED_STYLE, SPACING } from '../../constants/theme';
import { useScrub } from '../../hooks/useScrub';
import { useTheme } from '../../hooks/useTheme';
import { formatAudioDurationMinutes } from '../../lib/audio-duration';
import { MASTHEAD_ROW } from '../../lib/deck-layout';
import type { FoundProgress } from '../../lib/story-places';
import { Pressable as CountButton, Icon, IconButton, Text } from '../primitives';
import { ScrubBar, ScrubTooltip } from '../ScrubBar';

/**
 * Story position and navigation above the card. The count stays visible at
 * rest and opens all stories; the track previews destinations while scrubbing.
 * The briefing and settings retain separate 40×48pt targets.
 */

/** Which story a fraction of the track points at: the segment under it. */
function storyAt(fraction: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.ceil(fraction * count) - 1));
}

const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

/**
 * How much of the briefing has been heard, drawn round the play button from
 * twelve o'clock. A fresh briefing, one paused halfway and one finished looked
 * identical; the difference lived only in the screen reader's label. Static:
 * the button only shows while the player is down, so the arc never moves.
 */
const HeardRing = memo(function HeardRing({ heard, color }: { heard: number; color: string }) {
  const path = useMemo(() => {
    const inset = HEARD_STROKE / 2;
    const d = LISTEN_SIZE - HEARD_STROKE;
    return Skia.PathBuilder.Make()
      .addArc(Skia.XYWHRect(inset, inset, d, d), -90, 360)
      .build();
  }, []);
  return (
    <Canvas
      style={styles.heard}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        path={path}
        style="stroke"
        strokeWidth={HEARD_STROKE}
        strokeCap="round"
        color={color}
        start={0}
        end={heard}
      />
    </Canvas>
  );
});

export const SheetMasthead = memo(function SheetMasthead({
  refreshing = false,
  index,
  count,
  position,
  progress,
  alert,
  onPress,
  onMenuPress,
  onAlertPress,
  onSeek,
  detailAt,
  hues,
  listenAvailable = false,
  listenResumable = false,
  listenDuration,
  listenHeard = 0,
  onListenPress,
}: {
  /** A pull on the resting sheet is checking for a new cycle. */
  refreshing?: boolean;
  /** The committed story. `count` is the end card. */
  index: number;
  /** Stories in the river. */
  count: number;
  /** The deck's live position, in stories. */
  position: SharedValue<number>;
  /** Found on the globe — spoken, not printed. */
  progress?: FoundProgress;
  /** The newest live Red alert's title, if any. */
  alert?: string | null;
  /** Opens every story as a list. */
  onPress?: () => void;
  /** Opens settings and pages beside the story list. */
  onMenuPress?: () => void;
  /** Opens the alert. */
  onAlertPress?: () => void;
  /** Jump to a story from the track. */
  onSeek?: (index: number) => void;
  /** A story's category and when it ran (`tech · 5h ago`), shown under its
   *  position while scrubbing. */
  detailAt?: (index: number) => string;
  /** One category hue per story, for the track's segments. */
  hues?: readonly string[];
  /** Today's briefing exists and its player is not already up. */
  listenAvailable?: boolean;
  listenResumable?: boolean;
  listenDuration?: number;
  /** Share of a paused briefing already heard, 0–1. */
  listenHeard?: number;
  onListenPress?: () => void;
}) {
  const { colors, resolvedAppearance } = useTheme();
  const showingAlert = !refreshing && !!alert;

  // One story of 48 fills a 48th of the track; the end card fills it. The deck
  // writes this unless a finger is scrubbing the track itself.
  const fraction = useSharedValue(0);
  const labelFor = useCallback((f: number) => `${storyAt(f, count) + 1} of ${count}`, [count]);
  // Where in the day is only half of it; when is the other half, in the words
  // the card's kicker and the index already use.
  const detailFor = useCallback(
    (f: number) => (detailAt ? detailAt(storyAt(f, count)) : ''),
    [detailAt, count],
  );
  // Each segment in its story's category hue — the globe's beacons and the
  // card's dot, so a teal segment is a teal light. Stories already passed take
  // the hue a step quieter, as found places dim on the globe, so the colour sits
  // on what is left to read and the track still says how far through the day
  // you are. Upcoming stories sit a touch below full too: at full strength
  // the row was the loudest colour on the sheet after the globe, and it pulled
  // the eye off the headline. Only the story on the card keeps its full hue —
  // quiet up to and including it, the reader's own place looked read.
  const tints = useMemo(() => {
    if (!hues || hues.length !== count) return null;
    const quiet = QUIET_MIX[resolvedAppearance];
    const ahead = AHEAD_MIX[resolvedAppearance];
    const tint = (mix: number) =>
      hues.map((hue, i) => (i === index ? hue : mixHex(hue, colors.sheetBg, mix)));
    return { passed: tint(quiet), ahead: tint(ahead) };
  }, [hues, count, index, colors.sheetBg, resolvedAppearance]);
  const handleCommit = useCallback((f: number) => onSeek?.(storyAt(f, count)), [onSeek, count]);
  const scrub = useScrub({
    fraction,
    detents: count,
    steps: count,
    labelFor,
    detailFor,
    onCommit: handleCommit,
    tooltipWidth: detailAt ? DETAIL_TOOLTIP_WIDTH : 64,
    enabled: count > 0 && !!onSeek,
  });
  const holding = scrub.holding;
  useAnimatedReaction(
    () => position.value,
    (p) => {
      if (holding.value) return;
      const filled = count > 0 ? (p + 1) / count : 0;
      fraction.value = Math.min(1, Math.max(0, filled));
    },
    [count],
  );
  const handleAdjust = useCallback(
    (e: AccessibilityActionEvent) => {
      if (!onSeek || count <= 0) return;
      if (e.nativeEvent.actionName === 'increment') onSeek(Math.min(index + 1, count - 1));
      else if (e.nativeEvent.actionName === 'decrement') onSeek(Math.max(index - 1, 0));
    },
    [onSeek, index, count],
  );

  const found = progress?.found ?? 0;
  const heard = listenResumable ? Math.min(1, Math.max(0, listenHeard)) : 0;
  const listenMinutes = formatAudioDurationMinutes(
    heard > 0 && listenDuration ? listenDuration * (1 - heard) : listenDuration,
  );
  const spoken = `${index >= count ? `End of all ${count} stories` : `Story ${index + 1} of ${count}`}${found > 0 ? `, ${found} found on the globe` : ''}`;

  return (
    <View style={styles.row}>
      <CountButton
        onPress={onPress ?? (() => {})}
        haptic="none"
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : 'text'}
        accessibilityLabel={`${Math.min(count, Math.max(1, index + 1))} of ${count} stories`}
        accessibilityHint="Show all articles"
        style={styles.count}
      >
        <Text variant="tabular" tone="secondary">
          {`${Math.min(count, Math.max(1, index + 1))} of ${count}`}
        </Text>
      </CountButton>
      {refreshing || showingAlert ? (
        <Pressable
          onPress={showingAlert ? onAlertPress : undefined}
          disabled={!showingAlert || !onAlertPress}
          accessibilityLiveRegion="polite"
          accessibilityRole={showingAlert ? 'button' : 'text'}
          style={({ pressed }) => [styles.status, pressed && showingAlert ? PRESSED_STYLE : null]}
        >
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {refreshing ? 'checking for new stories' : `now · ${alert}`}
          </Text>
        </Pressable>
      ) : count > 0 ? (
        <ScrubBar
          scrub={scrub}
          fraction={fraction}
          interactive={!!onSeek}
          segments={count}
          height={TRACK}
          trackColor={colors.rule}
          fillColor={colors.textSecondary}
          trackColors={tints?.ahead}
          fillColors={tints?.passed}
          thumbColor={colors.textEmphasis}
          style={styles.scrub}
          accessibilityRole="adjustable"
          accessibilityLabel={spoken}
          accessibilityHint="Drag along it to move through the day's stories"
          accessibilityActions={ADJUST_ACTIONS}
          onAccessibilityAction={handleAdjust}
        >
          <ScrubTooltip
            scrub={scrub}
            backgroundColor={colors.toastBg}
            stemColor={colors.textSecondary}
          />
        </ScrubBar>
      ) : (
        <View style={styles.shrink} />
      )}
      <View style={styles.actions}>
        {listenAvailable && onListenPress ? (
          <IconButton
            onPress={onListenPress}
            haptic="none"
            style={styles.action}
            hitSlop={0}
            accessibilityLabel={`${listenResumable ? 'Resume daily briefing' : 'Daily briefing'}${listenMinutes ? `, ${listenMinutes}${heard > 0 ? ' left' : ''}` : ''}`}
            accessibilityHint={
              listenResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
            }
          >
            <View
              style={[styles.listen, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
            >
              {heard > 0 ? <HeardRing heard={heard} color={colors.textSecondary} /> : null}
              <Icon name="play" size="sm" tone="default" />
            </View>
          </IconButton>
        ) : null}
        {onMenuPress ? (
          <IconButton
            onPress={onMenuPress}
            hitSlop={0}
            style={styles.action}
            accessibilityLabel="Settings and pages"
            accessibilityHint="Opens settings, search, saved stories and information"
          >
            <Icon name="settings-outline" size="md" tone="secondary" />
          </IconButton>
        ) : null}
      </View>
    </View>
  );
});

/** The track's thickness: a rule you can see, not a control you can grab. */
const TRACK = 3;
/** The visible listen circle stays compact inside its larger touch target. */
const LISTEN_SIZE = 28;
const HEARD_STROKE = 1.5;
/** Wide enough for `politics · 12h ago` at the tabular size. */
const DETAIL_TOOLTIP_WIDTH = 116;
/**
 * How far a passed segment's hue is mixed toward the sheet. Less on the dark
 * sheet: at 0.6 the quiet politics and economy hues both went a muddy brown
 * there, while on the light sheet 0.6 still reads as four distinct pastels.
 */
const QUIET_MIX = { dark: 0.45, light: 0.6 } as const;
/** How far an upcoming segment's hue is mixed toward the sheet: still plainly
 *  its category, and a step brighter than what has been passed. */
const AHEAD_MIX = { dark: 0.15, light: 0.15 } as const;
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.articlePadding,
    paddingBottom: SPACING.sm,
    minHeight: MASTHEAD_ROW + SPACING.sm,
  },
  shrink: { flex: 1 },
  status: { flex: 1, minHeight: MASTHEAD_ROW, justifyContent: 'center' },
  count: {
    minWidth: MASTHEAD_ROW,
    minHeight: MASTHEAD_ROW,
    marginRight: SPACING.xs,
    flexShrink: 0,
    justifyContent: 'center',
  },
  // Hairline edge so the button holds its shape on the sheet without a shadow.
  listen: {
    width: LISTEN_SIZE,
    height: LISTEN_SIZE,
    borderRadius: LISTEN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heard: { position: 'absolute', top: 0, left: 0, width: LISTEN_SIZE, height: LISTEN_SIZE },
  actions: { flexDirection: 'row', alignItems: 'center' },
  // Compact horizontal bounds; retain the full-height, non-overlapping targets.
  action: {
    width: MASTHEAD_ROW - SPACING.sm,
    height: MASTHEAD_ROW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The touch area is taller than the 3pt track it holds.
  scrub: { flex: 1, minHeight: MASTHEAD_ROW, justifyContent: 'center' },
});
