import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TEXT_STYLES } from '../constants/theme';

interface SheetHandleProps {
  title?: string;
}

export const SheetHandle = memo(function SheetHandle({ title }: SheetHandleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.indicator} />
      {title && <Text style={styles.title}>{title}</Text>}
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
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.rule,
  },
  title: {
    ...TEXT_STYLES.smallCaps,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
});
