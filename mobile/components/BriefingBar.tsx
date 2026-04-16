import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIMATION, LAYOUT, MAX_FONT_SCALE, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const BAR_MARGIN = SPACING.md;
const PROGRESS_HEIGHT = 3;
const TOOLTIP_WIDTH = 48;
// progressTouch extends horizontally by -SPACING.md on each side (for easier
// edge-reach) then pads content back. TRACK_INSET is that padding — seekToX
// must subtract it so touching the visible left edge of the track yields 0%.
const TRACK_INSET = SPACING.md;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
  const { colors, font, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const barWidthSV = useSharedValue(0);
  const barWidthRef = useRef(0);
  const onBarLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      barWidthRef.current = w;
      barWidthSV.value = w;
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
      // Slow fill for smooth playback tracking (1s matches the elapsed-update cadence)
      progressSV.value = withTiming(progress, { duration: 1000 });
    }
  }, [progress, reduceMotion, progressSV]);
  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progressSV.value }],
  }));

  const isScrubbing = useSharedValue(0);
  const scrubX = useSharedValue(0);
  const [scrubLabel, setScrubLabel] = useState('');
  const prevLabelRef = useRef('');

  const seekToX = useCallback(
    (x: number) => {
      if (duration <= 0 || barWidthRef.current <= 0) return;
      const trackWidth = barWidthRef.current - TRACK_INSET * 2;
      if (trackWidth <= 0) return;
      const fraction = Math.max(0, Math.min(1, (x - TRACK_INSET) / trackWidth));
      progressSV.value = fraction;
      onSeek(fraction * duration);
      const label = formatTime(Math.round(fraction * duration));
      if (label !== prevLabelRef.current) {
        prevLabelRef.current = label;
        setScrubLabel(label);
      }
    },
    [duration, onSeek, progressSV],
  );

  const scrubGesture = Gesture.Pan()
    .activeOffsetX([-5, 5])
    .failOffsetY([-10, 10])
    .onStart((e) => {
      'worklet';
      isScrubbing.value = withSpring(1, { damping: 20, stiffness: 300 });
      scrubX.value = e.x;
      runOnJS(seekToX)(e.x);
    })
    .onChange((e) => {
      'worklet';
      scrubX.value = e.x;
      runOnJS(seekToX)(e.x);
    })
    .onFinalize(() => {
      'worklet';
      isScrubbing.value = withTiming(0, { duration: ANIMATION.fast });
    });

  // Tooltip rides the finger horizontally (clamped to bar edges) and lifts
  // in/out with the scrub gesture. Positioned above the entire bar — bar's
  // overflow is visible so the tooltip can float out.
  const tooltipStyle = useAnimatedStyle(() => {
    const w = barWidthSV.value || 1;
    const clampedX = Math.max(TOOLTIP_WIDTH / 2, Math.min(scrubX.value, w - TOOLTIP_WIDTH / 2));
    return {
      opacity: isScrubbing.value,
      transform: [
        { translateX: clampedX - TOOLTIP_WIDTH / 2 },
        { scale: interpolate(isScrubbing.value, [0, 1], [0.8, 1], Extrapolation.CLAMP) },
      ],
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
        <Animated.View
          style={[styles.tooltip, { backgroundColor: colors.toastBg }, tooltipStyle]}
          pointerEvents="none"
        >
          <Text
            style={{
              ...font.semiBold,
              fontSize: typography.sizeXs,
              color: colors.textEmphasis,
              fontVariant: ['tabular-nums'],
              textAlign: 'center',
            }}
            maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
          >
            {scrubLabel}
          </Text>
        </Animated.View>

        <View style={styles.row}>
          <View style={styles.info}>
            <Text
              style={{
                ...font.smallCaps,
                fontSize: typography.sizeSm,
                letterSpacing: typography.trackingCaps,
                color: colors.textEmphasis,
              }}
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
            >
              briefing
              <Text style={{ ...font.regular, color: colors.textSecondary }}>
                {' \u00b7 '}
                {dateLabel}
              </Text>
            </Text>
          </View>

          <Text
            style={[
              styles.time,
              {
                ...font.regular,
                fontSize: typography.sizeXs,
                color: colors.textEmphasis,
              },
            ]}
            maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
          >
            {formatTime(elapsed)}
            <Text style={{ color: colors.textSecondary }}> / {formatTime(duration)}</Text>
          </Text>

          <Pressable
            onPress={onToggle}
            hitSlop={LAYOUT.hitSlop}
            style={({ pressed }) => pressed && PRESSED_STYLE}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause briefing' : 'Play briefing'}
          >
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={LAYOUT.iconMd}
              color={colors.textEmphasis}
            />
          </Pressable>

          <Pressable
            onPress={onClose}
            hitSlop={LAYOUT.hitSlop}
            style={({ pressed }) => pressed && PRESSED_STYLE}
            accessibilityRole="button"
            accessibilityLabel="Close briefing player"
          >
            <Ionicons name="close" size={LAYOUT.iconMd} color={colors.textSecondary} />
          </Pressable>
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
            <View style={[styles.progressTrack, { backgroundColor: colors.rule }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.textSecondary },
                  progressStyle,
                ]}
              />
            </View>
          </View>
        </GestureDetector>
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
    alignItems: 'flex-end',
  },
  // No overflow:hidden — the scrub tooltip floats above the bar. The
  // progressFill is clipped by progressTrack's own overflow:hidden.
  bar: {
    width: '100%',
    borderRadius: LAYOUT.floatingRadius,
    paddingTop: SPACING.smPlus,
    paddingHorizontal: SPACING.md,
    ...LAYOUT.floatingShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.smPlus,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  time: {
    fontVariant: ['tabular-nums'],
  },
  progressTouch: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.smPlus,
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_HEIGHT,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_HEIGHT,
    transformOrigin: 'left',
  },
  // Floats above the bar card so the finger never covers it. Horizontal
  // position is tooltip-centered via translateX in tooltipStyle; the left:0
  // here is the baseline origin for that translate.
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: SPACING.sm,
    width: TOOLTIP_WIDTH,
    paddingVertical: SPACING.xxs,
    borderRadius: LAYOUT.pillRadius,
    alignItems: 'center',
  },
});
