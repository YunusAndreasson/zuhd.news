import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, EASING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

// Geometry — compact settings control. The radii are height-derived (a full
// pill), not RADIUS tokens: the curve is a consequence of the shape, not a
// design-tier decision.
const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 24;
const THUMB_SIZE = 16;
const THUMB_INSET = 4;
const TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

/**
 * Monochrome switch. Replaces RN's platform `Switch`, whose Android
 * rendering is the legacy SwitchCompat widget — an oversized thumb that
 * overflows its track and reads as broken next to Material 3 system chrome.
 *
 * On-state fills the track with `text` and punches a `bg`-colored thumb —
 * the guaranteed-inverting pair reads as a high-contrast "on" in both
 * modes. Off-state stays a quiet `rule` track with a `textSecondary` thumb.
 * (Same semantic mapping the platform Switch carried before.)
 *
 * Purely presentational: the owning row supplies press handling and the
 * `switch` semantics (role, checked state, label, hint).
 */
export function Toggle({ value }: { value: boolean }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(
      withTiming(value ? 1 : 0, {
        duration: reduceMotion ? 0 : ANIMATION.fast,
        easing: EASING.inOut,
      }),
    );
  }, [value, reduceMotion, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.rule, colors.text]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.textSecondary, colors.bg]),
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  return (
    <Animated.View style={[styles.track, trackStyle]}>
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
    paddingHorizontal: THUMB_INSET,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});
