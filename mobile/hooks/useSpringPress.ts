import { useCallback } from 'react';
import type { PressableProps } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { ANIMATION, OPACITY, PRESS_SCALE } from '../constants/theme';

type PressHandler = NonNullable<PressableProps['onPressIn']>;

/**
 * Shared press animation for the `Pressable` primitive (and `IconButton` through
 * it): a crisp drop on press-in, an underdamped spring on release so a tap pops
 * back instead of snapping. Returns the animated style plus onPressIn/Out
 * handlers that chain the caller's. Under Reduce Motion Reanimated snaps both
 * to their end state on its own (`ReduceMotion.System`, the default).
 */
export function useSpringPress(
  onPressIn?: PressableProps['onPressIn'],
  onPressOut?: PressableProps['onPressOut'],
) {
  const pressed = useSharedValue(0);

  const handlePressIn = useCallback<PressHandler>(
    (e) => {
      pressed.value = withTiming(1, { duration: ANIMATION.fast });
      onPressIn?.(e);
    },
    [pressed, onPressIn],
  );

  const handlePressOut = useCallback<PressHandler>(
    (e) => {
      pressed.value = withSpring(0, ANIMATION.springPress);
      onPressOut?.(e);
    },
    [pressed, onPressOut],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * (1 - OPACITY.pressed),
    transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }],
  }));

  return { animatedStyle, onPressIn: handlePressIn, onPressOut: handlePressOut };
}
