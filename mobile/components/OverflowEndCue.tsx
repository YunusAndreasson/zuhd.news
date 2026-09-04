import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Text } from './primitives';

/**
 * The boundary between reading and paging.
 *
 * It lives in the scroll content, after the final line, rather than floating
 * over prose. The reader only sees it after reaching the real bottom, where
 * it explains where the next page gesture begins. The prose itself remains a
 * native, bidirectional scroller even at its edges.
 */
export const OverflowEndCue = memo(function OverflowEndCue() {
  const { colors } = useTheme();
  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel="End of text. Swipe above the text for next."
    >
      <View style={[styles.rule, { backgroundColor: colors.rule }]} />
      <Text variant="labelXs" tone="secondary">
        swipe above for next
      </Text>
      <View style={[styles.rule, { backgroundColor: colors.rule }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.lg,
    // At the true scroll boundary the cue must land above the floating action
    // pills, not merely behind them. This space is paid only by pages that
    // already overflow; fitting pages keep their original compact rhythm.
    marginBottom: SPACING.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
});
