import { BlurView } from 'expo-blur';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION, OPACITY, RADIUS, SPACING, withAlpha } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticImpact } from '../lib/haptics';
import { Icon, IconButton, Text } from './primitives';

const BAR_MARGIN = SPACING.md;
const PROGRESS_HEIGHT = 3;
const TOOLTIP_WIDTH = 48;
// Edge-to-edge progress sits at the pill's bottom — no horizontal inset, so
// scrub fraction is just `x / barWidth` (no padding to subtract).
const TRACK_INSET = 0;
// Scrub thumb that rides the leading edge of the fill while the user is
// dragging. Sized to read as a "handle" without crowding the 3px track.
const SCRUB_THUMB = 9;
// Haptic detents across the full track. The ratchet is *spatial*, not
// temporal: a fixed number of notches per swipe regardless of how long the
// briefing is, so a 4-minute and a 20-minute briefing feel identical under
// the finger. Firing per audio-second instead (what `seek` used to do)
// pegged the haptic to the frame rate — on a 12-minute briefing one point
// of finger travel spans ~2 audio seconds, so every frame crossed a
// boundary and the "tick per second" became a continuous buzz.
const SCRUB_DETENTS = 40;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** UI-thread fraction calc shared between pan + tap callbacks. Returns null
 *  when the bar isn't ready. Called from inside other worklets, so avoiding
 *  a scheduleOnRN hop just to compute the new progress fraction. */
function computeScrubFraction(x: number, barWidth: number, duration: number): number | null {
  'worklet';
  if (duration <= 0 || barWidth <= 0) return null;
  const trackWidth = barWidth - TRACK_INSET * 2;
  if (trackWidth <= 0) return null;
  return Math.max(0, Math.min(1, (x - TRACK_INSET) / trackWidth));
}

interface BriefingBarProps {
  playing: boolean;
  elapsed: number;
  duration: number;
  date: string;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onClose: () => void;
}

export const BriefingBar = memo(function BriefingBar({
  playing,
  elapsed,
  duration,
  date,
  onToggle,
  onSeek,
  onClose,
}: BriefingBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const barWidthSV = useSharedValue(0);
  const onBarLayout = useCallback(
    (e: LayoutChangeEvent) => {
      barWidthSV.value = e.nativeEvent.layout.width;
    },
    [barWidthSV],
  );

  const progress = duration > 0 ? elapsed / duration : 0;
  const progressSV = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) {
      progressSV.value = progress;
    } else {
      // Slow fill for smooth playback tracking (matches the elapsed-update cadence)
      progressSV.value = withTiming(progress, { duration: ANIMATION.long });
    }
  }, [progress, reduceMotion, progressSV]);
  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progressSV.value }],
  }));

  const isScrubbing = useSharedValue(0);
  // Tooltip scale has its own underdamped spring so grab overshoots past 1
  // before settling — gives the scrub handle a tactile "pop" on contact.
  const tooltipScale = useSharedValue(0.8);
  const scrubX = useSharedValue(0);
  // Mirror `duration` into a SharedValue so the gesture worklet can read it
  // without bridging to JS every frame to look up the prop.
  const durationSV = useSharedValue(duration);
  useEffect(() => {
    durationSV.value = duration;
  }, [duration, durationSV]);
  const [scrubLabel, setScrubLabel] = useState('');
  const prevLabelRef = useRef('');

  // JS-only side of a scrub: real audio seek + label update. Called via
  // `scheduleOnRN` from the gesture worklet, but only after the worklet has
  // already updated `progressSV` for visual feedback — so the bar fill
  // tracks the finger without waiting for the JS-thread round trip.
  const commitSeek = useCallback(
    (seconds: number) => {
      onSeek(seconds);
      const label = formatTime(Math.round(seconds));
      if (label !== prevLabelRef.current) {
        prevLabelRef.current = label;
        setScrubLabel(label);
      }
    },
    [onSeek],
  );

  // Ratchet + commit bookkeeping. Both live on the UI thread so the gesture
  // worklet can decide whether a frame is worth a haptic or a JS hop without
  // round-tripping to find out.
  const lastDetent = useSharedValue(-1);
  const lastCommitSec = useSharedValue(-1);

  const scrubGesture = useMemo(() => {
    // Advance the visual fill every frame (UI thread, never gated), then fire
    // the haptic and the JS-side commit only on a real detent / second change.
    // The three used to run on independent cadences; now the notch the finger
    // feels, the label it reads, and the audio position all land on the same
    // frame.
    const track = (x: number) => {
      'worklet';
      const fraction = computeScrubFraction(x, barWidthSV.value, durationSV.value);
      if (fraction == null) return;
      progressSV.value = fraction;

      const detent = Math.round(fraction * SCRUB_DETENTS);
      if (detent !== lastDetent.value) {
        lastDetent.value = detent;
        // `hapticImpact`, not `hapticTick`: iOS suppresses `selectionAsync()`
        // while an AVAudioSession is in playback mode, which is exactly when
        // this bar is on screen.
        scheduleOnRN(hapticImpact);
      }

      const seconds = fraction * durationSV.value;
      const sec = Math.floor(seconds);
      if (sec !== lastCommitSec.value) {
        lastCommitSec.value = sec;
        scheduleOnRN(commitSeek, seconds);
      }
    };

    const panGesture = Gesture.Pan()
      // Low threshold so the scrub engages as soon as the finger moves —
      // vertical fail-offset still lets the parent list steal vertical pans.
      .activeOffsetX([-2, 2])
      .failOffsetY([-10, 10])
      .onStart((e) => {
        'worklet';
        isScrubbing.value = withSpring(1, ANIMATION.springSoft);
        tooltipScale.value = withSpring(1, { damping: 8, stiffness: 260, mass: 0.7 });
        scrubX.value = e.x;
        // Reset both ratchets so grabbing the bar always announces itself with
        // one notch, then ticks per detent from there.
        lastDetent.value = -1;
        lastCommitSec.value = -1;
        track(e.x);
      })
      .onChange((e) => {
        'worklet';
        scrubX.value = e.x;
        track(e.x);
      })
      .onFinalize(() => {
        'worklet';
        isScrubbing.value = withTiming(0, { duration: ANIMATION.fast });
        tooltipScale.value = withTiming(0.8, { duration: ANIMATION.fast });
      });

    // Tap-to-seek: instant jump. No tooltip — the progress bar fill moving
    // to the new position is feedback enough; the tooltip is reserved for
    // drag scrubbing where the user needs a preview before committing.
    const tapGesture = Gesture.Tap()
      .maxDuration(400)
      .onEnd((e, success) => {
        'worklet';
        if (!success) return;
        lastDetent.value = -1;
        lastCommitSec.value = -1;
        track(e.x);
      });

    return Gesture.Race(panGesture, tapGesture);
  }, [
    barWidthSV,
    durationSV,
    progressSV,
    scrubX,
    isScrubbing,
    tooltipScale,
    lastDetent,
    lastCommitSec,
    commitSeek,
  ]);

  // Tooltip rides the finger horizontally (clamped to bar edges) and lifts
  // in/out with the scrub gesture.
  const tooltipStyle = useAnimatedStyle(() => {
    const w = barWidthSV.value || 1;
    const clampedX = Math.max(TOOLTIP_WIDTH / 2, Math.min(scrubX.value, w - TOOLTIP_WIDTH / 2));
    return {
      opacity: isScrubbing.value,
      transform: [{ translateX: clampedX - TOOLTIP_WIDTH / 2 }, { scale: tooltipScale.value }],
    };
  });

  // Scrub thumb — small dot at the leading edge of the fill, only visible
  // while the user is actively scrubbing. Translates by `progressSV * width`
  // so it matches whatever the worklet has set, and centers via -SCRUB/2.
  const thumbStyle = useAnimatedStyle(() => {
    const w = barWidthSV.value || 1;
    return {
      opacity: isScrubbing.value,
      transform: [{ translateX: progressSV.value * w - SCRUB_THUMB / 2 }],
    };
  });

  const dateLabel = (() => {
    try {
      return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return date;
    }
  })();

  return (
    <Animated.View
      entering={FadeInDown.duration(ANIMATION.normal).withInitialValues({
        transform: [{ translateY: 12 }],
      })}
      exiting={FadeOut.duration(ANIMATION.fast)}
      layout={LinearTransition.duration(ANIMATION.normal)}
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      <BarBackground onLayout={onBarLayout} tintColor={colors.pillBg}>
        {/* Tooltip lives outside the clipping inner so it can float ABOVE
            the bar without being chopped by the inner's overflow:hidden. */}
        <Animated.View
          style={[styles.tooltip, { backgroundColor: colors.toastBg }, tooltipStyle]}
          pointerEvents="none"
        >
          <Text variant="tabularEmphasis" style={styles.tooltipText}>
            {scrubLabel}
          </Text>
        </Animated.View>

        {/* Inner container clips the edge-to-edge progress strip to the
            pill's bottom-corner curve. The strip is only PROGRESS_HEIGHT
            tall, so it can't carry RADIUS.floating on its own — the curve
            has to come from a parent overflow:hidden + matching radius. */}
        <View style={styles.barInner}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text variant="labelSm" tone="emphasis" numberOfLines={1}>
                briefing
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

            <IconButton
              onPress={onToggle}
              accessibilityLabel={playing ? 'Pause briefing' : 'Play briefing'}
            >
              <Icon name={playing ? 'pause' : 'play'} tone="emphasis" size="lg" />
            </IconButton>

            {/* Same size as play/pause; visual hierarchy comes from `tone`,
                not a smaller box — `close-sharp` glyph is already thin so a
                size step down made the X read meaningfully smaller. */}
            <IconButton onPress={onClose} accessibilityLabel="Close briefing player">
              <Icon name="close-sharp" tone="secondary" size="lg" />
            </IconButton>
          </View>

          <GestureDetector gesture={scrubGesture}>
            <View
              style={styles.progressTouch}
              accessibilityRole="adjustable"
              accessibilityLabel={`Briefing progress, ${formatTime(elapsed)} of ${formatTime(duration)}`}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                const step = Math.max(10, duration * 0.05);
                if (e.nativeEvent.actionName === 'increment')
                  onSeek(Math.min(elapsed + step, duration));
                else if (e.nativeEvent.actionName === 'decrement')
                  onSeek(Math.max(elapsed - step, 0));
              }}
            >
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: withAlpha(colors.textEmphasis, OPACITY.soft) },
                ]}
              >
                <Animated.View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.textSecondary },
                    progressStyle,
                  ]}
                />
              </View>
              <Animated.View
                pointerEvents="none"
                style={[styles.scrubThumb, { backgroundColor: colors.textEmphasis }, thumbStyle]}
              />
            </View>
          </GestureDetector>
        </View>
      </BarBackground>
    </Animated.View>
  );
});

/** iOS uses a frosted-glass background so the chrome floats over the article
 *  reader; Android falls back to a solid `pillBg` fill because Android's
 *  BlurView implementation is uneven across vendors. Both wrap the bar's
 *  rounded-rect with the same border radius and clip overflow so the inner
 *  edge-to-edge progress strip follows the corner curve. */
const BarBackground = memo(function BarBackground({
  children,
  onLayout,
  tintColor,
}: {
  children: React.ReactNode;
  onLayout: (e: LayoutChangeEvent) => void;
  tintColor: string;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={60} tint="systemThinMaterial" style={styles.bar} onLayout={onLayout}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.bar, { backgroundColor: tintColor }]} onLayout={onLayout}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: BAR_MARGIN,
  },
  // No overflow:hidden — the scrub tooltip floats above the bar. The
  // progress strip is clipped by `barInner`'s overflow:hidden so it can
  // run edge-to-edge and follow the pill's bottom-corner curve.
  bar: {
    width: '100%',
    borderRadius: RADIUS.floating,
  },
  // Clipping container for the bar's content. Holds the row + progress;
  // shares the bar's borderRadius so its overflow:hidden trims the strip
  // along the same outer curve. Padding lives here (was on `bar`) so the
  // strip can sit flush with the inner's bottom edge.
  barInner: {
    borderRadius: RADIUS.floating,
    overflow: 'hidden',
    paddingTop: SPACING.smPlus,
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
    // flush with the bar's bottom edge, so all the touch slack goes above —
    // which also lifts the grabbable zone clear of the system gesture inset
    // at the screen's bottom edge. `lg` (was `md`) widens the thin target so
    // drag-to-scrub is easy to catch without clipping the home-indicator zone.
    paddingTop: SPACING.lg,
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    overflow: 'hidden',
    // No border-radius needed — `barInner` clips the strip's corners to
    // the pill's outer curve. A 3px strip can't carry a large radius on
    // its own anyway (radius caps at half its height).
  },
  progressFill: {
    width: '100%',
    height: PROGRESS_HEIGHT,
    transformOrigin: 'left',
  },
  scrubThumb: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: SCRUB_THUMB,
    height: SCRUB_THUMB,
    borderRadius: SCRUB_THUMB / 2,
    // Lift the thumb so its center sits on the track baseline rather than
    // hanging off the pill's bottom edge.
    marginBottom: -SCRUB_THUMB / 2 + PROGRESS_HEIGHT / 2,
  },
  // Floats above the bar card so the finger never covers it.
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: SPACING.sm,
    width: TOOLTIP_WIDTH,
    paddingVertical: SPACING.xxs,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
  },
  tooltipText: {
    textAlign: 'center',
  },
});
