import { StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
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
          {offline ? 'No connection.' : 'Could not load articles.'}
        </Text>
        <Text variant="caption" style={styles.center}>
          {offline ? 'Connect and try again.' : error}
        </Text>
        <Pressable
          onPress={handleRetry}
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
