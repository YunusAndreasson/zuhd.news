import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIMATION, OPACITY, RADIUS, SPACING, withAlpha } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** UI-thread fraction calc shared between pan + tap callbacks. Returns null
 *  when the bar isn't ready. Called from inside other worklets, so avoiding
 *  a runOnJS hop just to compute the new progress fraction. */
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
  // `runOnJS` from the gesture worklet, but only after the worklet has
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
      const fraction = computeScrubFraction(e.x, barWidthSV.value, durationSV.value);
      if (fraction == null) return;
      progressSV.value = fraction;
      runOnJS(commitSeek)(fraction * durationSV.value);
    })
    .onChange((e) => {
      'worklet';
      scrubX.value = e.x;
      const fraction = computeScrubFraction(e.x, barWidthSV.value, durationSV.value);
      if (fraction == null) return;
      progressSV.value = fraction;
      runOnJS(commitSeek)(fraction * durationSV.value);
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
      const fraction = computeScrubFraction(e.x, barWidthSV.value, durationSV.value);
      if (fraction == null) return;
      progressSV.value = fraction;
      runOnJS(commitSeek)(fraction * durationSV.value);
    });

  const scrubGesture = Gesture.Race(panGesture, tapGesture);

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
      entering={FadeIn.duration(ANIMATION.normal).withInitialValues({
        transform: [{ translateY: 12 }],
      })}
      exiting={FadeOut.duration(ANIMATION.fast).withInitialValues({
        transform: [{ translateY: 0 }],
      })}
      layout={LinearTransition.duration(ANIMATION.normal)}
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      <View style={[styles.bar, { backgroundColor: colors.pillBg }]} onLayout={onBarLayout}>
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

            <Text variant="tabular" tone="emphasis">
              {formatTime(elapsed)}
              <Text variant="tabular" tone="secondary">
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

            <IconButton onPress={onClose} accessibilityLabel="Close briefing player">
              <Icon name="close-sharp" tone="secondary" />
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
      </View>
    </Animated.View>
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
    // flush with the bar's bottom edge, so all the touch slack goes above.
    paddingTop: SPACING.md,
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
