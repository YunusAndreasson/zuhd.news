import { StyleSheet } from 'react-native';
import { HIT_SLOP, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticImpact } from '../lib/haptics';
import { Pressable, Screen, Stack, Text } from './primitives';

interface ErrorStateProps {
  offline: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ErrorState({ offline, error, onRetry }: ErrorStateProps) {
  const { colors } = useTheme();
  const handleRetry = () => {
    hapticImpact();
    onRetry();
  };
  return (
    <Screen>
      <Stack fill align="center" justify="center" padding="xl" gap="tight">
        <Text variant="body" style={styles.center}>
          {offline ? 'No connection.' : 'Could not load the news.'}
        </Text>
        <Text variant="caption" style={styles.center}>
          {/* The raw error is a developer's message ("Network request
              failed", an HTTP status); a reader gets what to do about it. */}
          {offline
            ? 'Connect and try again.'
            : __DEV__ && error
              ? error
              : 'The newsroom did not answer. Try again in a moment.'}
        </Text>
        <Pressable
          onPress={handleRetry}
          haptic="none"
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={[styles.retryPill, { backgroundColor: colors.pillBg }]}
        >
          <Text variant="labelXs" tone="emphasis">
            try again
          </Text>
        </Pressable>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  retryPill: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.floating,
  },
});
