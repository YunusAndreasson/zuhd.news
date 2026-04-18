import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LAYOUT, MAX_FONT_SCALE, PRESSED_STYLE, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

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
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors, font, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={LAYOUT.hitSlop}
      style={({ pressed }) => [
        styles.actionPill,
        { backgroundColor: colors.pillBg, borderColor: colors.rule },
        pressed && PRESSED_STYLE,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
        {label}
      </Text>
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
          accessibilityLabel={`Globe zoom ${zoomLabel}. Tap to cycle.`}
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
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
