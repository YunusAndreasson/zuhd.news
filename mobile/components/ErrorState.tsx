import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LAYOUT, MAX_FONT_SCALE, PRESSED_STYLE, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticImpact } from '../lib/haptics';

interface ErrorStateProps {
  offline: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ErrorState({ offline, error, onRetry }: ErrorStateProps) {
  const { colors, font, typography } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.bg }]}>
      <Text
        style={[
          styles.errorText,
          { ...font.regular, fontSize: typography.sizeBase, color: colors.text },
        ]}
      >
        {offline ? 'No connection.' : 'Could not load articles.'}
      </Text>
      <Text
        style={[
          styles.errorHint,
          { ...font.regular, fontSize: typography.sizeSm, color: colors.textSecondary },
        ]}
      >
        {offline ? 'Connect and try again.' : error}
      </Text>
      <Pressable
        onPress={() => {
          hapticImpact();
          onRetry();
        }}
        style={({ pressed }) => [
          styles.retryPill,
          { backgroundColor: colors.pillBg },
          pressed && PRESSED_STYLE,
        ]}
        hitSlop={LAYOUT.hitSlop}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text
          style={{
            ...font.smallCaps,
            fontSize: typography.sizeXs,
            letterSpacing: typography.trackingCaps,
            color: colors.textEmphasis,
          }}
          maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
        >
          try again
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  errorHint: {
    textAlign: 'center',
  },
  retryPill: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.floating,
  },
});
