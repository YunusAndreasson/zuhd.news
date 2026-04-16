import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIMATION, LAYOUT, MAX_FONT_SCALE, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const BAR_MARGIN = SPACING.md;
const PROGRESS_HEIGHT = 3;

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
  const { colors, font, typography, textStyles } = useTheme();
  const insets = useSafeAreaInsets();
  const barWidth = useRef(0);
  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    barWidth.current = e.nativeEvent.layout.width;
  }, []);

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

  const seekToX = useCallback(
    (x: number) => {
      if (duration <= 0 || barWidth.current <= 0) return;
      const fraction = Math.max(0, Math.min(1, x / barWidth.current));
      progressSV.value = fraction;
      onSeek(fraction * duration);
    },
    [duration, onSeek, progressSV],
  );

  const scrubGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-5, 5])
        .failOffsetY([-10, 10])
        .minDistance(0)
        .onStart((e) => {
          runOnJS(seekToX)(e.x);
        })
        .onChange((e) => {
          runOnJS(seekToX)(e.x);
        }),
    [seekToX],
  );

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
      entering={FadeIn.duration(ANIMATION.normal)}
      exiting={FadeOut.duration(ANIMATION.fast)}
      layout={LinearTransition.duration(ANIMATION.normal)}
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.bar, { backgroundColor: colors.sheetBg, shadowColor: colors.black }]}
        onLayout={onBarLayout}
      >
        <View style={styles.row}>
          <View style={styles.info}>
            <Text
              style={[styles.title, textStyles.smallCaps, { color: colors.textEmphasis }]}
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
            hitSlop={12}
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
            hitSlop={12}
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
  /* ── Expanded bar ── */
  bar: {
    width: '100%',
    borderRadius: LAYOUT.floatingRadius,
    paddingTop: SPACING.smPlus,
    paddingHorizontal: SPACING.md,
    overflow: 'hidden',
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
  title: {},
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
});
