import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, LAYOUT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';

interface BriefingButtonProps {
  playing: boolean;
  onPress: () => void;
}

export const BriefingButton = memo(function BriefingButton({ playing, onPress }: BriefingButtonProps) {
  const insets = useSafeAreaInsets();
  const { impact } = useHaptic();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { bottom: insets.bottom + LAYOUT.briefingButtonBottom },
        pressed && { opacity: 0.5 },
      ]}
      onPress={() => { impact(); onPress(); }}
      hitSlop={24}
    >
      <View style={styles.row}>
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={TYPOGRAPHY.sizeSm - 4}
          color={COLORS.accent}
          style={{ marginTop: 2 }}
        />
        <Text style={styles.label}>briefing</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: LAYOUT.briefingButtonRight,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  label: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.accent,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
});
