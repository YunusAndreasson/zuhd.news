import { memo, useCallback } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSpringPress } from '../../hooks/useSpringPress';
import { fireHaptic, type HapticTier } from '../../lib/haptics';

export interface PressableProps extends Omit<RNPressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  haptic?: HapticTier;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Full-bleed content row press. Spring scale + press opacity baked in,
 * haptics fire at press-release. Accepts any haptic tier including 'none'.
 *
 * Pair with `IconButton` for compact icon targets that need `hitSlop` + role.
 */
export const Pressable = memo(function Pressable({
  onPress,
  haptic = 'impact',
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps) {
  const {
    animatedStyle,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
  } = useSpringPress(onPressIn, onPressOut);

  const handlePress = useCallback(() => {
    fireHaptic(haptic);
    onPress();
  }, [onPress, haptic]);

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
});
