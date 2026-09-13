import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import { type SharedValue, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { HIT_SLOP, mixHex, PRESSED_STYLE, SPACING } from '../../constants/theme';
import { useScrub } from '../../hooks/useScrub';
import { useTheme } from '../../hooks/useTheme';
import { formatAudioDurationMinutes } from '../../lib/audio-duration';
import { MASTHEAD_ROW } from '../../lib/deck-layout';
import type { FoundProgress } from '../../lib/story-places';
import { Icon, IconButton, Text } from '../primitives';
import { ScrubBar, ScrubTooltip } from '../ScrubBar';

/**
 * One row above the story card: how far through the day you are, and the way
 * back to all of it.
 *
 * It says one thing at a time, in this order of precedence:
 *
 *  1. **`checking for new stories`** while a pull is running — the one thing a
 *     pull-to-refresh has no other way to say.
 *  2. **`now · …`** while a live Red alert exists. Alerts never enter the deck
 *     (the camera track is stories only), so this line is where a hazard with
 *     no article yet reaches the sheet. It opens the alert.
 *  3. **A segmented track, listen and the list** otherwise: one segment per
 *     story, lit up to the one on the card. Drag along it to preview a story's
 *     place (`12 of 48` floats over the finger) and lift to jump there; tap to
 *     jump. Listen plays the day's briefing; the list opens every story.
 *
 * **The track is the status; nothing restates it.** It was `3 of 48 · 12 found
 * ━━━ all news ›` — the position twice (digits and bar), the found count a
 * third time once the globe's ring carried it, and a label naming the door.
 * A bar whose fill moves under the finger already shows where you are and how
 * much is left, without being read; the precise count is a screen reader's
 * (the row's label) and the index sheet's. The list icon is the signifier that
 * the row opens the list — the one thing the track cannot say.
 *
 * **Listen sits with the list, at the far end from the track.** For one build
 * it led this row, right against the start of the track, and a play button
 * touching a progress bar is that bar's play head. Beside the list button it is
 * one of the row's two doors — the day's stories as a list, the day's stories
 * as audio. It left the top bar so the gauges could run to the edge. Absent
 * rather than disabled when there is no briefing, and while the player is up.
 *
 * **The track follows the finger** twice over: its fill reads the deck's own
 * `progress` on the UI thread, so it moves with a swipe on the card, and it is
 * a scrubber in its own right (`useScrub`, the briefing player's gesture), so a
 * reader forty stories from the start does not have to swipe forty times.
 *
 * **Segments, because the unit is a story.** A plain bar maps to nothing the
 * reader can count; one segment per story makes a swipe light exactly one more,
 * which is the mapping Norman asks a control to make visible. Past 60 stories a
 * segment would be no wider than its gap, and the track goes continuous.
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

  if (refreshing || showingAlert) {
    const handlePress = showingAlert ? onAlertPress : undefined;
    return (
      <Pressable
        onPress={handlePress}
        disabled={!handlePress}
        accessibilityLiveRegion="polite"
        accessibilityRole={handlePress ? 'button' : 'text'}
        accessibilityHint={handlePress ? 'Opens the alert' : undefined}
        hitSlop={SPACING.xs}
        style={({ pressed }) => [styles.row, pressed && handlePress ? PRESSED_STYLE : null]}
      >
        <Text
          variant="caption"
          tone={showingAlert ? 'emphasis' : 'secondary'}
          numberOfLines={1}
          style={styles.shrink}
        >
          {refreshing ? 'checking for new stories' : `now · ${alert}`}
        </Text>
      </Pressable>
    );
  }
  if (count <= 0) return null;

  const found = progress?.found ?? 0;
  const heard = listenResumable ? Math.min(1, Math.max(0, listenHeard)) : 0;
  const listenMinutes = formatAudioDurationMinutes(
    heard > 0 && listenDuration ? listenDuration * (1 - heard) : listenDuration,
  );
  const spoken = `${index >= count ? `End of all ${count} stories` : `Story ${index + 1} of ${count}`}${found > 0 ? `, ${found} found on the globe` : ''}`;

  return (
    <View style={styles.row}>
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
      {listenAvailable && onListenPress ? (
        <IconButton
          onPress={onListenPress}
          haptic="none"
          style={[styles.listen, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
          hitSlop={LISTEN_SLOP}
          accessibilityLabel={`${listenResumable ? 'Resume daily briefing' : 'Daily briefing'}${listenMinutes ? `, ${listenMinutes}${heard > 0 ? ' left' : ''}` : ''}`}
          accessibilityHint={
            listenResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
          }
        >
          {heard > 0 ? <HeardRing heard={heard} color={colors.textSecondary} /> : null}
          <Icon name="play" size="sm" tone="default" />
        </IconButton>
      ) : null}
      {onPress ? (
        <IconButton
          onPress={onPress}
          hitSlop={LIST_SLOP}
          style={styles.list}
          accessibilityLabel="Today's stories"
          accessibilityHint="Lists every story from today"
        >
          <Icon name="list" size="md" tone="secondary" />
        </IconButton>
      ) : null}
    </View>
  );
});

/** The track's thickness: a rule you can see, not a control you can grab. */
const TRACK = 3;
/** The listen button's diameter: a 14pt glyph with room around it, as tall as
 *  the row. */
const LISTEN_SIZE = MASTHEAD_ROW;
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
/**
 * The two buttons' touch areas meet between them instead of overlapping. The
 * row's gap is `SPACING.md` and each kept the standard 12pt slop, so a tap in
 * the middle 8pt could land on either; the facing sides give up 4pt each.
 */
const LISTEN_SLOP = { ...HIT_SLOP, right: SPACING.sm };
const LIST_SLOP = { ...HIT_SLOP, left: SPACING.sm };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.articlePadding,
    paddingBottom: SPACING.sm,
    minHeight: MASTHEAD_ROW + SPACING.sm,
  },
  shrink: { flexShrink: 1 },
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
  // As big as the listen button, so with its slop the list's target clears
  // Android's 48dp; the icon alone gave it 44.
  list: {
    width: LISTEN_SIZE,
    height: LISTEN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The touch area is taller than the 3pt track it holds.
  scrub: { flex: 1, paddingVertical: SPACING.smPlus, justifyContent: 'center' },
});
