import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { COLORS, FONT, TYPOGRAPHY, SPACING } from '../constants/theme';
import { BrandLogo } from './BrandLogo';

interface CaughtUpProps {
  visible: boolean;
}

export function CaughtUp({ visible }: CaughtUpProps) {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <BrandLogo autoPlay />
      <Animated.Text entering={FadeIn.delay(2000)} style={styles.label}>
        UP TO DATE
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.lg,
  },
  label: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.accent,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
});
