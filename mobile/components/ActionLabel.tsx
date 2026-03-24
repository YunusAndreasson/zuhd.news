import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, PRESSED_STYLE, TEXT_STYLES } from '../constants/theme';

interface ActionLabelProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  onPress: () => void;
}

export const ActionLabel = memo(function ActionLabel({
  label,
  icon,
  iconPosition = 'right',
  onPress,
}: ActionLabelProps) {
  const iconEl = (
    <Ionicons
      name={icon}
      size={iconPosition === 'left' ? 9 : 10}
      color={COLORS.accent}
      style={iconPosition === 'left' ? styles.iconLeft : undefined}
    />
  );

  return (
    <Pressable onPress={onPress} hitSlop={12} style={({ pressed }) => pressed && PRESSED_STYLE}>
      <Text style={styles.label}>
        {iconPosition === 'left' && iconEl}
        {iconPosition === 'left' ? ' ' : ''}
        {label}
        {iconPosition === 'right' ? ' ' : ''}
        {iconPosition === 'right' && iconEl}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  label: {
    ...TEXT_STYLES.smallCaps,
    ...TEXT_STYLES.textShadow,
  },
  iconLeft: {
    marginTop: 2,
  },
});
