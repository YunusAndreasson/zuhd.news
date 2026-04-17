import { memo, useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { LAYOUT } from '../constants/theme';
import { useSpringPress } from '../hooks/useSpringPress';
import { fireHaptic, type HapticTier } from '../lib/haptics';

interface HapticButtonProps extends Omit<PressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  haptic?: HapticTier;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Icon-only / chrome button wrapper. Bakes in spring press animation,
 * haptics, `hitSlop`, and `accessibilityRole="button"` so callers only
 * need `onPress` and `accessibilityLabel`.
 *
 * Pairs with HapticPressable (full-bleed content rows). Use this for
 * compact chrome targets — toolbar icons, menu buttons, close buttons.
 */
export const HapticButton = memo(function HapticButton({
  onPress,
  haptic = 'impact',
  style,
  hitSlop = LAYOUT.hitSlop,
  accessibilityRole = 'button',
  onPressIn,
  onPressOut,
  ...rest
}: HapticButtonProps) {
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
    />
  );
});
