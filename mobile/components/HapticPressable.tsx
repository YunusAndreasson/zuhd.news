import { memo, useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSpringPress } from '../hooks/useSpringPress';
import { fireHaptic, type HapticTier } from '../lib/haptics';

interface HapticPressableProps extends Omit<PressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  haptic?: HapticTier;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const HapticPressable = memo(function HapticPressable({
  onPress,
  haptic = 'impact',
  style,
  onPressIn,
  onPressOut,
  ...rest
}: HapticPressableProps) {
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
