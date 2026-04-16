import { memo, useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { PRESSED_STYLE } from '../constants/theme';
import { hapticImpact, hapticTick } from '../lib/haptics';

type Haptic = 'impact' | 'tick' | 'none';

interface HapticPressableProps extends Omit<PressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  haptic?: Haptic;
  style?: StyleProp<ViewStyle>;
}

export const HapticPressable = memo(function HapticPressable({
  onPress,
  haptic = 'impact',
  style,
  ...rest
}: HapticPressableProps) {
  const handlePress = useCallback(() => {
    if (haptic === 'impact') hapticImpact();
    else if (haptic === 'tick') hapticTick();
    onPress();
  }, [onPress, haptic]);

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
      style={({ pressed }) => [style, pressed && PRESSED_STYLE]}
    />
  );
});
