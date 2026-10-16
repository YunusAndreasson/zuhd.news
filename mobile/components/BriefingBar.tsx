import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { memo, useCallback, useEffect, useRef } from 'react';
import {
  type AccessibilityActionEvent,
  ActivityIndicator,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  type LayoutAnimation,
  LinearTransition,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  ANIMATION,
  type ColorPalette,
  dissolveIn,
  dissolveOut,
  EASING,
  RADIUS,
  SPACING,
} from '../constants/theme';
import { useLegibility } from '../hooks/useLegibility';
import { useScrub } from '../hooks/useScrub';
import { useTheme } from '../hooks/useTheme';
import { observationDate } from '../lib/data-freshness';
import { largeContent } from '../lib/large-content';
import { type PlayerMaterial, playerMaterial, playerMotion } from '../lib/player-material';
import { Icon, IconButton, Text } from './primitives';
import { ScrubBar, ScrubTooltip } from './ScrubBar';

const BAR_MARGIN = SPACING.md;
const PROGRESS_HEIGHT = 3;
const TOOLTIP_WIDTH = 48;
// No haptic notches on the audio: forty spatial detents across the track
// (until 2026-09-26) stood for nothing in the briefing, so under the finger
// they were a buzz, not a position. The fill and the time say where you are.
const SCRUB_DETENTS = 0;

const SEEK_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

/** Liquid Glass is in this build, on this iOS, and safe to make: some iOS 26
 *  betas lacked the API and crashed creating the effect. Read once. */
const GLASS_AVAILABLE =
  Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

// Down from above the screen, under the `▶` that opened it, and back up out
// of it: a slide and never a fade, since glass stops rendering under an
// opacity below 1 and a blur draws wrong under one. Built once, out here: the
// bar re-renders on every playback tick, and Reanimated configures an exit or
// a layout move again whenever the builder it is handed is a new one.
const SLIDE_IN_TIMING = { duration: ANIMATION.normal, easing: EASING.out } as const;
const SLIDE_OUT_TIMING = { duration: ANIMATION.fast, easing: EASING.out } as const;
const SLIDE_IN = (values: EntryAnimationsValues): LayoutAnimation => {
  'worklet';
  return {
    initialValues: {
      transform: [{ translateY: -(values.targetGlobalOriginY + values.targetHeight) }],
    },
    animations: { transform: [{ translateY: withTiming(0, SLIDE_IN_TIMING) }] },
  };
};
const SLIDE_OUT = (values: ExitAnimationsValues): LayoutAnimation => {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: {
      transform: [
        {
          translateY: withTiming(
            -(values.currentGlobalOriginY + values.currentHeight),
            SLIDE_OUT_TIMING,
          ),
        },
      ],
    },
  };
};
// Under Reduce Motion: a solid bar dissolves, as a toast does; glass and a
// blur, which cannot fade, appear in place (`playerMotion`).
const DISSOLVE_IN = dissolveIn();
const DISSOLVE_OUT = dissolveOut(ANIMATION.fast);
const BAR_MOVE = LinearTransition.duration(ANIMATION.normal).easing(EASING.out);

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface BriefingBarProps {
  state: 'idle' | 'preparing' | 'playing' | 'paused';
  elapsed: number;
  duration: number;
  date: string;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onDismiss: () => void;
  /** Hangs under whatever is pinned above it — the map's top bar, whose `▶`
   *  it replaces while it is up. */
  topOffset: number;
  onHeightChange?: (height: number) => void;
}

export const BriefingBar = memo(function BriefingBar({
  state,
  elapsed,
  duration,
  date,
  onToggle,
  onSeek,
  onDismiss,
  topOffset,
  onHeightChange,
}: BriefingBarProps) {
  const { colors, resolvedAppearance } = useTheme();
  const { reduceTransparency } = useLegibility();
  const reduceMotion = useReducedMotion();
  const material = playerMaterial({
    os: Platform.OS,
    glassAvailable: GLASS_AVAILABLE,
    reduceTransparency,
  });
  const motion = playerMotion(material, reduceMotion);
  const preparing = state === 'preparing';
  const playing = state === 'playing';

  const progress = duration > 0 ? Math.max(0, Math.min(elapsed / duration, 1)) : 0;
  const progressSV = useSharedValue(0);
  const scrubbingRef = useRef(false);
  useEffect(() => {
    // The gesture owns progressSV while the finger is down. Native playback
    // status can briefly report the pre-seek position; letting that value start
    // a timing animation here made the fill fight the finger and snap backward.
    if (scrubbingRef.current) return;
    // Slow fill for smooth playback tracking (matches the elapsed-update
    // cadence). Linear: an eased tween restarted on every status tick
    // accelerates and brakes once a second, so the fill pulsed. Under Reduce
    // Motion Reanimated lands it at once (`ReduceMotion.System`), which a
    // branch of its own here used to repeat.
    progressSV.value = withTiming(progress, { duration: ANIMATION.long, easing: Easing.linear });
  }, [progress, progressSV]);

  // The scrub owns `progressSV` while a finger is down (see the effect above);
  // one latest-value seek is committed when it lifts. `useScrub` holds the
  // gesture, detents and tooltip for this and for the story track.
  const handleScrubStart = useCallback(() => {
    scrubbingRef.current = true;
  }, []);
  const handleScrubEnd = useCallback(() => {
    scrubbingRef.current = false;
  }, []);
  const handleCommit = useCallback((f: number) => onSeek(f * duration), [onSeek, duration]);
  // Playback publishes whole elapsed seconds; the preview must use the same
  // rounding or releasing can appear to land a second before the chosen time.
  const labelFor = useCallback((f: number) => formatTime(Math.floor(f * duration)), [duration]);
  const scrub = useScrub({
    fraction: progressSV,
    detents: SCRUB_DETENTS,
    steps: Math.max(1, Math.round(duration)),
    labelFor,
    onCommit: handleCommit,
    onScrubStart: handleScrubStart,
    onScrubEnd: handleScrubEnd,
    tooltipWidth: TOOLTIP_WIDTH,
    enabled: !preparing,
  });
  const handleSeekAction = useCallback(
    (e: AccessibilityActionEvent) => {
      const step = Math.max(10, duration * 0.05);
      if (e.nativeEvent.actionName === 'increment') onSeek(Math.min(elapsed + step, duration));
      else if (e.nativeEvent.actionName === 'decrement') onSeek(Math.max(elapsed - step, 0));
    },
    [duration, elapsed, onSeek],
  );

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onHeightChange?.(Math.ceil(e.nativeEvent.layout.height)),
    [onHeightChange],
  );
  // Gone is zero: a card leaving room for a bar that has closed is a gap.
  useEffect(() => () => onHeightChange?.(0), [onHeightChange]);

  // The date grammar every card's kicker uses: `Sep 19`. The `try` this
  // replaced could catch nothing — an unreadable date printed `Invalid Date`.
  const dateLabel = observationDate(date);

  return (
    <Animated.View
      entering={motion === 'slide' ? SLIDE_IN : motion === 'dissolve' ? DISSOLVE_IN : undefined}
      exiting={motion === 'slide' ? SLIDE_OUT : motion === 'dissolve' ? DISSOLVE_OUT : undefined}
      layout={BAR_MOVE}
      style={[styles.wrapper, { top: topOffset }]}
      onLayout={handleLayout}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        {/* The material is a layer of its own, behind the bar's words: a
            BlurView clips what it holds, which cut off the scrub's tooltip
            hanging below, and Reduce Transparency swaps only this layer. */}
        <BarMaterial material={material} appearance={resolvedAppearance} colors={colors} />
        {/* Tooltip lives outside the clipping inner so it can float clear of
            the bar without being chopped by the inner's overflow:hidden —
            BELOW it, over the globe: the bar hangs under the top bar, and
            above it the readout covered the gauges. */}
        <ScrubTooltip scrub={scrub} backgroundColor={colors.toastBg} below />

        {/* Inner container clips the edge-to-edge progress strip to the
            pill's bottom-corner curve. The strip is only PROGRESS_HEIGHT
            tall, so it can't carry RADIUS.floating on its own — the curve
            has to come from a parent overflow:hidden + matching radius. */}
        <View style={styles.barInner}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text
                variant="labelSm"
                tone="emphasis"
                numberOfLines={1}
                accessibilityLiveRegion="polite"
              >
                {preparing ? 'preparing' : 'briefing'}
                <Text variant="labelSm">
                  {' · '}
                  {dateLabel}
                </Text>
              </Text>
            </View>

            {/* 13/11 = match `sizeSm` so the readout sits at the same optical
                size as the `briefing · {date}` label and reads as a peer of the
                lg icons rather than a tiny caption. */}
            <Text variant="tabular" tone="emphasis" scale={13 / 11}>
              {formatTime(elapsed)}
              <Text variant="tabular" tone="secondary" scale={13 / 11}>
                {' / '}
                {formatTime(duration)}
              </Text>
            </Text>

            {preparing ? (
              <ActivityIndicator
                size="small"
                color={colors.textEmphasis}
                accessibilityLabel="Preparing briefing"
              />
            ) : (
              <IconButton
                onPress={onToggle}
                accessibilityLabel={playing ? 'Pause briefing' : 'Play briefing'}
                {...largeContent(playing ? 'pause' : 'play')}
              >
                <Icon name={playing ? 'pause' : 'play'} tone="emphasis" size="lg" />
              </IconButton>
            )}

            {/* Same size as play/pause; visual hierarchy comes from `tone`,
                not a smaller box — `close-sharp` glyph is already thin so a
                size step down made the X read meaningfully smaller. */}
            <IconButton
              onPress={onDismiss}
              accessibilityLabel={preparing ? 'Cancel briefing loading' : 'Hide briefing player'}
              {...largeContent(preparing ? 'cancel' : 'hide')}
            >
              <Icon name="close-sharp" tone="secondary" size="lg" />
            </IconButton>
          </View>

          <ScrubBar
            scrub={scrub}
            fraction={progressSV}
            interactive={!preparing}
            height={PROGRESS_HEIGHT}
            // The dock's recipe: one scrubber, one track, wherever it is.
            trackColor={colors.rule}
            fillColor={colors.textSecondary}
            thumbColor={colors.textEmphasis}
            style={styles.progressTouch}
            accessibilityRole={preparing ? 'progressbar' : 'adjustable'}
            // The position is the value, not part of the name, so VoiceOver
            // reads the new one after each adjustment.
            accessibilityLabel={preparing ? 'Preparing briefing' : 'Briefing progress'}
            accessibilityValue={{
              min: 0,
              max: Math.max(0, Math.round(duration)),
              now: Math.min(Math.round(elapsed), Math.max(0, Math.round(duration))),
              text: preparing
                ? `${formatTime(duration)} total`
                : `${formatTime(elapsed)} of ${formatTime(duration)}`,
            }}
            accessibilityActions={preparing ? undefined : SEEK_ACTIONS}
            onAccessibilityAction={preparing ? undefined : handleSeekAction}
          />
        </View>
      </View>
    </Animated.View>
  );
});

/** What the bar is made of (`playerMaterial`): Liquid Glass on iOS 26, so the
 *  chrome floats over the globe as the system's own does; the frosted blur
 *  before it; and solid `playerBg` on Android, whose BlurView is uneven
 *  across vendors, and under Reduce Transparency. Solid, not `pillBg`: through
 *  `pillBg`'s 12% whatever was under the bar (a lit coastline) showed behind
 *  `briefing · Sep 19`. The glass is `regular`, never `clear`, and takes the
 *  app's appearance, not the phone's, so it is never the light glass behind
 *  light words. */
function BarMaterial({
  material,
  appearance,
  colors,
}: {
  material: PlayerMaterial;
  appearance: 'dark' | 'light';
  colors: ColorPalette;
}) {
  if (material === 'glass') {
    return (
      <GlassView
        pointerEvents="none"
        glassEffectStyle="regular"
        colorScheme={appearance}
        style={styles.material}
      />
    );
  }
  if (material === 'blur') {
    return (
      <BlurView
        pointerEvents="none"
        intensity={60}
        tint="systemThinMaterial"
        style={styles.material}
      />
    );
  }
  return (
    <View pointerEvents="none" style={[styles.material, { backgroundColor: colors.playerBg }]} />
  );
}

const styles = StyleSheet.create({
  // Just under the top bar's 48pt row, whose gauge labels sit mid-row, so
  // the space from the labels down to the bar is about the bar's side margin.
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: BAR_MARGIN,
    paddingTop: SPACING.xs,
    // Over the top chrome (`zIndex: 10` in `app/index.tsx`): the header's
    // shade runs `SHADE_FADE` below its row to fade into the globe, and the
    // bar hangs right there, so under it the player's words and controls sat
    // behind the fade, washed out to the gauges' ground.
    zIndex: 11,
  },
  // No overflow:hidden — the scrub tooltip hangs below the bar. The
  // progress strip is clipped by `barInner`'s overflow:hidden so it can
  // run edge-to-edge and follow the pill's bottom-corner curve.
  bar: {
    width: '100%',
    borderRadius: RADIUS.floating,
  },
  // Behind the words, the bar's own size and curve.
  material: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.floating,
    overflow: 'hidden',
  },
  // Clipping container for the bar's content. Holds the row + progress;
  // shares the bar's borderRadius so its overflow:hidden trims the strip
  // along the same outer curve. Padding lives here (was on `bar`) so the
  // strip can sit flush with the inner's bottom edge.
  barInner: {
    borderRadius: RADIUS.floating,
    overflow: 'hidden',
    // Balanced against the scrub's touch slack under the row: at `smPlus`
    // the words sat high in the pill over an empty band — a layout made for
    // a bar whose bottom edge was the screen's.
    paddingTop: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.smPlus,
    paddingHorizontal: SPACING.md,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  progressTouch: {
    // Vertical hit area above the visible 3px strip. The strip itself is
    // flush with the bar's bottom edge, so all the touch slack goes above.
    // `lg` (was `md`) widened the thin target so drag-to-scrub is easy to
    // catch; a step under it now, so the row sits in the middle of the pill
    // (16pt over the row, 20 + the strip under it) for 4pt of target.
    paddingTop: SPACING.md + SPACING.xs,
  },
});
