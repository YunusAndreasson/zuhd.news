import { useCallback, useEffect } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticImpact } from '../lib/haptics';

const logo = require('../assets/icon.png');

interface BrandLogoProps {
  size?: number;
  autoPlay?: boolean;
}

function playRotation(rotation: { value: number }, reduceMotion: boolean) {
  if (reduceMotion) return;
  rotation.value = withSequence(
    withTiming(0, { duration: 0 }),
    withSpring(-90, { damping: 12, stiffness: 180 }),
    withSpring(0, { damping: 14, stiffness: 150 }),
  );
}

export function BrandLogo({ size = 36, autoPlay = false }: BrandLogoProps) {
  const { colors } = useTheme();
  const rotation = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (autoPlay) playRotation(rotation, !!reduceMotion);
  }, [autoPlay, rotation, reduceMotion]);

  const onPress = useCallback(() => {
    hapticImpact();
    playRotation(rotation, !!reduceMotion);
  }, [rotation, reduceMotion]);

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
        <Image
          source={logo}
          style={[styles.logo, { width: size, height: size, backgroundColor: colors.bg }]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  logo: {
    borderRadius: LAYOUT.logoRadius,
  },
});
