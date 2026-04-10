import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface ActionButtonsProps {
  onSearchPress: () => void;
  onBookmarkPress: () => void;
}

const PILL_RADIUS = 14;

export const ActionButtons = memo(function ActionButtons({
  onSearchPress,
  onBookmarkPress,
}: ActionButtonsProps) {
  const { colors, font, typography } = useTheme();
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
        <Text
          style={{
            fontFamily: font.smallCaps,
            fontSize: typography.sizeXs,
            letterSpacing: typography.trackingCaps,
            color: colors.textEmphasis,
          }}
        >
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
        <Text
          style={{
            fontFamily: font.smallCaps,
            fontSize: typography.sizeXs,
            letterSpacing: typography.trackingCaps,
            color: colors.textEmphasis,
          }}
        >
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
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: PILL_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    ...LAYOUT.floatingShadow,
  },
});
