import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface ActionButtonsProps {
  onSearchPress: () => void;
  onBookmarkPress: () => void;
}

export const ActionButtons = memo(function ActionButtons({
  onSearchPress,
  onBookmarkPress,
}: ActionButtonsProps) {
  const { colors, textStyles } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onSearchPress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: colors.sheetBg, shadowColor: colors.black },
          pressed && PRESSED_STYLE,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Search"
      >
        <Text style={[textStyles.smallCapsXs, { color: colors.textEmphasis }]}>
          search
        </Text>
      </Pressable>
      <Pressable
        onPress={onBookmarkPress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: colors.sheetBg, shadowColor: colors.black },
          pressed && PRESSED_STYLE,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Saved articles"
      >
        <Text style={[textStyles.smallCapsXs, { color: colors.textEmphasis }]}>
          saved
        </Text>
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
  pill: {
    ...LAYOUT.floatingPill,
  },
});
