import { useCallback } from 'react';
import type { PressableProps } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ANIMATION, EASING, PRESS_SCALE } from '../constants/theme';

type PressHandler = NonNullable<PressableProps['onPressIn']>;

const DOWN = { duration: ANIMATION.press, easing: EASING.out };
const UP = { duration: ANIMATION.fast, easing: EASING.out };

/**
 * Shared press animation for the `Pressable` primitive (and `IconButton` through
 * it): a small scale down under the finger and back, each over before the eye
 * has to wait for it. Returns the animated style plus onPressIn/Out handlers
 * that chain the caller's. Under Reduce Motion Reanimated snaps both to their
 * end state on its own (`ReduceMotion.System`, the default).
 *
 * **A scale and nothing else.** It was a scale with a fade to 70% and an
 * underdamped spring back: about 0.6 s of frames for every press, and the fade
 * was an opacity between 0 and 1 on a view with children, which iOS draws off
 * screen as a group on each of them.
 *
 * The value is written from the press handlers, not from React state, so a
 * press costs no render.
 */
export function usePressScale(
  onPressIn?: PressableProps['onPressIn'],
  onPressOut?: PressableProps['onPressOut'],
) {
  const pressed = useSharedValue(0);

  const handlePressIn = useCallback<PressHandler>(
    (e) => {
      pressed.value = withTiming(1, DOWN);
      onPressIn?.(e);
    },
    [pressed, onPressIn],
  );

  const handlePressOut = useCallback<PressHandler>(
    (e) => {
      pressed.value = withTiming(0, UP);
      onPressOut?.(e);
    },
    [pressed, onPressOut],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }],
  }));

  return { animatedStyle, onPressIn: handlePressIn, onPressOut: handlePressOut };
}
