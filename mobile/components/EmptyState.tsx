import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { SPACING } from '../constants/theme';
import { Stack, Text } from './primitives';

interface EmptyStateProps {
  message: string;
  /** Optional secondary line — the actionable instruction under the headline.
   *  Splits the empty state into a small-caps title + a caption so it reads as
   *  a designed state rather than faint placeholder microcopy. */
  hint?: string;
}

export const EmptyState = memo(function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <Stack align="center" justify="center" gap="row" paddingX="xl" style={styles.container}>
      <Text variant="label" style={styles.text}>
        {message}
      </Text>
      {hint ? (
        <Text variant="caption" style={styles.text}>
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
});

const styles = StyleSheet.create({
  // Vertical padding gives the state presence even when the parent doesn't
  // bound its height. Grow into available space without flex:1's zero basis,
  // which collapses the text inside content-sized native sheets.
  container: {
    flexGrow: 1,
    flexShrink: 1,
    paddingVertical: SPACING.xxl,
  },
  text: {
    textAlign: 'center',
  },
});
