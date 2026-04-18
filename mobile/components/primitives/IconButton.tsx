import { memo, type ReactNode, useCallback } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { HIT_SLOP } from '../../constants/theme';
import { useSpringPress } from '../../hooks/useSpringPress';
import { fireHaptic, type HapticTier } from '../../lib/haptics';

export interface IconButtonProps extends Omit<RNPressableProps, 'style' | 'onPress' | 'children'> {
  onPress: () => void;
  haptic?: HapticTier;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  children: ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Compact icon-only button. Bakes spring press, haptics, `hitSlop`, and
 * `accessibilityRole="button"` so callers supply only `onPress`,
 * `accessibilityLabel`, and an `<Icon>` child.
 */
export const IconButton = memo(function IconButton({
  onPress,
  haptic = 'impact',
  style,
  hitSlop = HIT_SLOP,
  accessibilityRole = 'button',
  onPressIn,
  onPressOut,
  children,
  ...rest
}: IconButtonProps) {
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
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});
