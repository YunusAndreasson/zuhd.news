import { useTransition } from 'react';
import { StyleSheet } from 'react-native';
import { HIT_SLOP, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Pressable, Screen, Stack, Text } from './primitives';

interface ErrorStateProps {
  offline: boolean;
  error: string | null;
  /** Settles when the attempt has: the pill says it is trying until then. */
  onRetry: () => Promise<unknown>;
}

export function ErrorState({ offline, error, onRetry }: ErrorStateProps) {
  const { colors } = useTheme();
  // An action, so the pill knows how long the attempt takes. Offline, the
  // query waits for the network before it fetches, and the pill says so
  // rather than spinning on a request that has not been sent.
  const [trying, startTrying] = useTransition();
  const retry = () =>
    startTrying(async () => {
      try {
        await onRetry();
      } catch {}
    });
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
          onPress={retry}
          disabled={trying}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={trying ? 'Trying again' : 'Try again'}
          accessibilityState={{ busy: trying, disabled: trying }}
          style={[styles.retryPill, { backgroundColor: colors.pillBg }]}
        >
          <Text variant="labelXs" tone="emphasis">
            {trying ? (offline ? 'waiting for a connection…' : 'trying…') : 'try again'}
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
