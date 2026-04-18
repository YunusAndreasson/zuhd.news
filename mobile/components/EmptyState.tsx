import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { SPACING } from '../constants/theme';
import { Stack, Text } from './primitives';

interface EmptyStateProps {
  message: string;
}

export const EmptyState = memo(function EmptyState({ message }: EmptyStateProps) {
  return (
    <Stack align="center" style={styles.container}>
      <Text variant="caption">{message}</Text>
    </Stack>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingTop: SPACING.xl,
  },
});
