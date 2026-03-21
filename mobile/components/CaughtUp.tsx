import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { BrandLogo } from './BrandLogo';

interface CaughtUpProps {
  visible: boolean;
}

export function CaughtUp({ visible }: CaughtUpProps) {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <BrandLogo autoPlay />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
});
