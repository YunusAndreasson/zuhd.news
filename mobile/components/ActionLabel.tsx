import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, PRESSED_STYLE, SPACING, TEXT_STYLES } from '../constants/theme';

interface ActionLabelProps {
  label: string;
  onPress: () => void;
}

export const ActionLabel = memo(function ActionLabel({ label, onPress }: ActionLabelProps) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={({ pressed }) => pressed && PRESSED_STYLE}>
      <Text style={styles.label}>
        {label} <Ionicons name="chevron-down" size={8} color={COLORS.accent} />
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  label: {
    ...TEXT_STYLES.smallCaps,
    ...TEXT_STYLES.textShadow,
    paddingLeft: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
});
