import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface SheetHandleProps {
  title?: string;
}

export const SheetHandle = memo(function SheetHandle({ title }: SheetHandleProps) {
  const { colors, textStyles } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.indicator, { backgroundColor: colors.rule }]} />
      {title && <Text style={[styles.title, textStyles.smallCaps]}>{title}</Text>}
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
  },
  title: {
    marginTop: SPACING.sm,
  },
});
