import { useCallback } from 'react';
import type { PressableProps } from 'react-native';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, OPACITY, PRESS_SCALE } from '../constants/theme';

// Crisp drop on press-in, underdamped spring on release so taps "pop"
// instead of snapping back instantly.
const RELEASE_SPRING = { damping: 10, stiffness: 280, mass: 0.6 } as const;

type PressHandler = NonNullable<PressableProps['onPressIn']>;

/**
 * Shared press animation for `HapticPressable` and `HapticButton`.
 * Returns animated style + onPressIn/Out handlers that chain caller-supplied
 * handlers. Honours Reduce Motion by snapping to final state.
 */
export function useSpringPress(
  onPressIn?: PressableProps['onPressIn'],
  onPressOut?: PressableProps['onPressOut'],
) {
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const handlePressIn = useCallback<PressHandler>(
    (e) => {
      pressed.value = reduceMotion ? 1 : withTiming(1, { duration: ANIMATION.fast });
      onPressIn?.(e);
    },
    [pressed, reduceMotion, onPressIn],
  );

  const handlePressOut = useCallback<PressHandler>(
    (e) => {
      pressed.value = reduceMotion ? 0 : withSpring(0, RELEASE_SPRING);
      onPressOut?.(e);
    },
    [pressed, reduceMotion, onPressOut],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * (1 - OPACITY.pressed),
    transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }],
  }));

  return { animatedStyle, onPressIn: handlePressIn, onPressOut: handlePressOut };
}
