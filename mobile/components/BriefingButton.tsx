import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, LAYOUT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';

interface BriefingButtonProps {
  playing: boolean;
  elapsed: number;
  duration: number;
  onPress: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export const BriefingButton = memo(function BriefingButton({
  playing,
  elapsed,
  duration,
  onPress,
}: BriefingButtonProps) {
  const insets = useSafeAreaInsets();
  const { impact } = useHaptic();

  const remaining = duration > 0 ? Math.max(0, duration - elapsed) : 0;

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
        <Text style={styles.label}>
          {playing && remaining > 0 ? formatTime(remaining) : 'briefing'}
        </Text>
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
