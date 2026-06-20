import { StyleSheet, View } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Pressable, Text } from './primitives';

// Compact pills — small visible footprint so the globe has more room.
// Tap target stays ≥48pt thanks to the inflated hitSlop below.
const PILL_HIT_SLOP = 16;

interface BottomActionBarProps {
  bottomInset: number;
  zoomLabel: string;
  onBriefingPress: () => void;
  onZoomPress: () => void;
  onSharePress: () => void;
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
      style={[styles.actionPill, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
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
  zoomLabel,
  onBriefingPress,
  onZoomPress,
  onSharePress,
}: BottomActionBarProps) {
  return (
    <View
      style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      <ActionPill
        label="listen"
        onPress={onBriefingPress}
        accessibilityLabel="Daily briefing"
        accessibilityHint="Plays today's audio briefing"
      />

      <View style={styles.bottomSpacer} />

      <View style={styles.articleActions}>
        <ActionPill
          label={zoomLabel}
          onPress={onZoomPress}
          accessibilityLabel="Globe zoom"
          accessibilityHint="Cycles through zoom levels"
        />
        <ActionPill
          label="share"
          onPress={onSharePress}
          accessibilityLabel="Share article"
          accessibilityHint="Opens the system share sheet"
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
    // Mirror `CategoryBar` and the article body: pill outer edges land on
    // the same vertical as the article column, so chrome top and bottom
    // share one rhythm. Previously `SPACING.md` (16) left a 2px outdent
    // against the body's `articlePadding` (14).
    paddingHorizontal: SPACING.articlePadding,
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
    // Hairline edge so the pill always reads as a defined control over the
    // variable globe backdrop (land, coastline, city-glow), where the low-lift
    // `pillBg` fill alone can blend into what's behind it — especially in dark
    // mode. `colors.rule` inverts the right way per mode: lighter-than-map in
    // dark, darker-than-cream in light. Definition over elevation — no shadow.
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
