import { memo } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSpringPress } from '../../hooks/useSpringPress';

export interface PressableProps extends Omit<RNPressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Full-bleed content row press. Spring scale + press opacity baked in. No
 * haptic: an ordinary press never knocks (`lib/haptics.ts`) — a handler whose
 * press commits something gives its own.
 *
 * Pair with `IconButton` for compact icon targets that need `hitSlop` + role.
 */
export const Pressable = memo(function Pressable({
  onPress,
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

  return (
    <AnimatedPressable
      {...rest}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
});
