import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface ActionButtonsProps {
  onSearchPress: () => void;
  onBookmarkPress: () => void;
}

export const ActionButtons = memo(function ActionButtons({
  onSearchPress,
  onBookmarkPress,
}: ActionButtonsProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onSearchPress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.circle,
          { backgroundColor: colors.sheetBg, shadowColor: colors.black },
          pressed && PRESSED_STYLE,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Search"
      >
        <Ionicons name="search" size={14} color={colors.textEmphasis} />
      </Pressable>
      <Pressable
        onPress={onBookmarkPress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.circle,
          { backgroundColor: colors.sheetBg, shadowColor: colors.black },
          pressed && PRESSED_STYLE,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Saved articles"
      >
        <Ionicons name="bookmark-outline" size={14} color={colors.textEmphasis} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
