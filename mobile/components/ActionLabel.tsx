import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface ActionLabelProps {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
}

export const ActionLabel = memo(function ActionLabel({
  label,
  onPress,
  accessibilityHint,
}: ActionLabelProps) {
  const { textStyles } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => pressed && PRESSED_STYLE}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
    >
      <Text style={[styles.label, textStyles.smallCaps, textStyles.textShadow]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  label: {
    paddingLeft: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
});
