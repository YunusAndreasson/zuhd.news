import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { HapticPressable } from './HapticPressable';

interface ActionButtonsProps {
  onSearchPress: () => void;
  onBookmarkPress: () => void;
}

export const ActionButtons = memo(function ActionButtons({
  onSearchPress,
  onBookmarkPress,
}: ActionButtonsProps) {
  const { colors, textStyles } = useTheme();
  const buttons: { label: string; a11y: string; onPress: () => void }[] = [
    { label: 'search', a11y: 'Search', onPress: onSearchPress },
    { label: 'saved', a11y: 'Saved articles', onPress: onBookmarkPress },
  ];
  return (
    <View style={styles.row}>
      {buttons.map(({ label, a11y, onPress }) => (
        <HapticPressable
          key={label}
          onPress={onPress}
          hitSlop={LAYOUT.hitSlop}
          style={[styles.pill, { backgroundColor: colors.pillBg }]}
          accessibilityRole="button"
          accessibilityLabel={a11y}
        >
          <Text style={[textStyles.smallCapsXs, { color: colors.textEmphasis }]}>{label}</Text>
        </HapticPressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pill: {
    ...LAYOUT.floatingPill,
  },
});
