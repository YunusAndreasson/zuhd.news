import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

interface EmptyStateProps {
  message: string;
}

export const EmptyState = memo(function EmptyState({ message }: EmptyStateProps) {
  const { font, typography, colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={{ ...font.regular, fontSize: typography.sizeSm, color: colors.textSecondary }}>
        {message}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
  },
});
