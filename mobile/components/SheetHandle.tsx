import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface SheetHandleProps {
  title?: string;
}

export const SheetHandle = memo(function SheetHandle({ title }: SheetHandleProps) {
  const { colors, textStyles } = useTheme();
  return (
    <View
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityLabel={title ? `${title} sheet` : 'Sheet handle'}
      accessibilityHint="Swipe down to dismiss"
    >
      <View style={[styles.indicator, { backgroundColor: colors.rule }]} />
      {title && <Text style={[styles.title, textStyles.sheetTitle]}>{title}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  indicator: {
    width: LAYOUT.handleWidth,
    height: LAYOUT.handleHeight,
    borderRadius: LAYOUT.handleRadius,
  },
  title: {
    marginTop: SPACING.sm,
  },
});
