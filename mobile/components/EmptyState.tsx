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
    <Stack fill align="center" justify="center" gap="row" paddingX="xl" style={styles.container}>
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
  // bound its height (e.g. inside a content-sized scroll view); `fill` above
  // centers it whenever the parent is a flex container (full-screen list,
  // tall search sheet).
  container: {
    paddingVertical: SPACING.xxl,
  },
  text: {
    textAlign: 'center',
  },
});
