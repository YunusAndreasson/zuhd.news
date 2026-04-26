import { StyleSheet, View } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Pressable, Text } from './primitives';

// Compact pills — small visible footprint so the globe has more room.
// Tap target stays ≥48pt thanks to the inflated hitSlop below.
const PILL_HIT_SLOP = 16;

interface BottomActionBarProps {
  bottomInset: number;
  showBriefing: boolean;
  zoomLabel: string;
  onBriefingPress: () => void;
  onZoomPress: () => void;
  onSharePress: () => void;
  onContextPress: () => void;
}

function ActionPill({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  // Spring press via the primitive; haptic handled by each callsite's
  // handler (zoom ticks, share/context/briefing impact), so we pass 'none'
  // here to avoid double-firing.
  return (
    <Pressable
      onPress={onPress}
      haptic="none"
      hitSlop={PILL_HIT_SLOP}
      style={[styles.actionPill, { backgroundColor: colors.pillBg }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Text variant="labelSm">{label}</Text>
    </Pressable>
  );
}

export function BottomActionBar({
  bottomInset,
  showBriefing,
  zoomLabel,
  onBriefingPress,
  onZoomPress,
  onSharePress,
  onContextPress,
}: BottomActionBarProps) {
  return (
    <View
      style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      {showBriefing && (
        <ActionPill
          label="listen"
          onPress={onBriefingPress}
          accessibilityLabel="Listen to daily briefing"
        />
      )}

      <View style={styles.bottomSpacer} />

      <View style={styles.articleActions}>
        <ActionPill
          label={zoomLabel}
          onPress={onZoomPress}
          accessibilityLabel={`Globe zoom, ${zoomLabel}`}
          accessibilityHint="Cycles through zoom levels"
        />
        <ActionPill label="share" onPress={onSharePress} accessibilityLabel="Share article" />
        <ActionPill
          label="context"
          onPress={onContextPress}
          accessibilityLabel="Context about this story"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    zIndex: 10,
  },
  bottomSpacer: {
    flex: 1,
  },
  articleActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.smPlus,
    borderRadius: RADIUS.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
