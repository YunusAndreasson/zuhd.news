import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface ActionLabelProps {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export const ActionLabel = memo(function ActionLabel({ label, onPress, icon = 'chevron-down' }: ActionLabelProps) {
  const { colors, typography, textStyles } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={12} style={({ pressed }) => pressed && PRESSED_STYLE} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[styles.label, textStyles.smallCaps, textStyles.textShadow]}>
        {label} <Ionicons name={icon} size={typography.sizeXs} color={colors.accent} />
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  label: {
    paddingLeft: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
});
