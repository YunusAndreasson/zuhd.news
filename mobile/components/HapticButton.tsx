import { memo, useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { LAYOUT, PRESSED_STYLE } from '../constants/theme';
import { hapticImpact, hapticTick } from '../lib/haptics';

type Haptic = 'impact' | 'tick' | 'none';

interface HapticButtonProps extends Omit<PressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  haptic?: Haptic;
  style?: StyleProp<ViewStyle>;
}

/**
 * Icon-only / chrome button wrapper. Bakes in the shared PRESSED_STYLE,
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
  ...rest
}: HapticButtonProps) {
  const handlePress = useCallback(() => {
    if (haptic === 'impact') hapticImpact();
    else if (haptic === 'tick') hapticTick();
    onPress();
  }, [onPress, haptic]);

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      style={({ pressed }) => [style, pressed && PRESSED_STYLE]}
    />
  );
});
