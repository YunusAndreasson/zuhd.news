import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { HapticPressable } from './HapticPressable';

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
    <HapticPressable
      onPress={onPress}
      hitSlop={LAYOUT.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
    >
      <Text style={[styles.label, textStyles.smallCaps, textStyles.textShadow]}>{label}</Text>
    </HapticPressable>
  );
});

const styles = StyleSheet.create({
  label: {
    paddingLeft: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
});
