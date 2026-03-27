import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, PRESSED_STYLE, SPACING, TEXT_STYLES, TYPOGRAPHY } from '../constants/theme';

interface ActionLabelProps {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export const ActionLabel = memo(function ActionLabel({ label, onPress, icon = 'chevron-down' }: ActionLabelProps) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={({ pressed }) => pressed && PRESSED_STYLE}>
      <Text style={styles.label}>
        {label} <Ionicons name={icon} size={TYPOGRAPHY.sizeXs} color={COLORS.accent} />
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
