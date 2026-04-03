import { useCallback, useEffect } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticNotification } from '../lib/haptics';

const logo = require('../assets/icon.png');

interface BrandLogoProps {
  size?: number;
  autoPlay?: boolean;
}

function playRotation(rotation: { value: number }) {
  rotation.value = withSequence(
    withTiming(0, { duration: 0 }),
    withDelay(400, withTiming(-90, { duration: 500, easing: Easing.inOut(Easing.ease) })),
    withDelay(500, withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) })),
  );
}

export function BrandLogo({ size = 36, autoPlay = false }: BrandLogoProps) {
  const { colors } = useTheme();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (autoPlay) playRotation(rotation);
  }, [autoPlay, rotation]);

  const onPress = useCallback(() => {
    hapticNotification();
    playRotation(rotation);
  }, [rotation]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={SPACING.md}
      style={({ pressed }) => pressed && PRESSED_STYLE}
      accessibilityRole="button"
      accessibilityLabel="zuhd.news logo"
    >
      <Animated.View style={logoStyle}>
        <Image source={logo} style={[styles.logo, { width: size, height: size, backgroundColor: colors.bg }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  logo: {
    borderRadius: 8,
  },
});
