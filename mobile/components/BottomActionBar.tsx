import { StyleSheet, View } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { briefingActionLabel } from '../lib/audio-duration';
import { Pressable, Text } from './primitives';

// Compact pills — small visible footprint so the globe has more room.
// Tap target stays ≥48pt thanks to the inflated hitSlop below.
const PILL_HIT_SLOP = 16;

interface BottomActionBarProps {
  bottomInset: number;
  zoomLabel: string;
  briefingDuration?: number;
  briefingResumable: boolean;
  onBriefingPress: () => void;
  onZoomPress: () => void;
  onSharePress: () => void;
  /**
   * Whether the section behind the bar is the article river.
   *
   * Two of the three pills only mean anything there, and they were showing on
   * all six sections:
   *
   *   zoom   cycles the globe's clip, and the globe is on `news` only. On a
   *          card column the pill was inert — a control that answers a tap by
   *          doing nothing, which is worse than an absent one because the
   *          reader spends a tap finding out.
   *   share  shares `activeArticleRef`, the last article read. Standing on a
   *          Brent card and tapping it sent whoever received it a link to an
   *          unrelated story. Not dead chrome — wrong chrome.
   *
   * `listen` survives everywhere: the briefing is the day's news read aloud
   * and is not about whatever is on screen, so it is reachable from anywhere.
   *
   * Sharing a *card* is worth having and is not this change: it needs a URL
   * per card, and only the indicator-backed ones have one (`/e/{id}`).
   */
  articleActions: boolean;
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
  briefingDuration,
  briefingResumable,
  onBriefingPress,
  onZoomPress,
  onSharePress,
  articleActions,
}: BottomActionBarProps) {
  const briefingLabel = briefingActionLabel(briefingResumable, briefingDuration);

  return (
    <View
      style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      <ActionPill
        label={briefingLabel}
        onPress={onBriefingPress}
        accessibilityLabel={briefingResumable ? 'Resume daily briefing' : 'Daily briefing'}
        accessibilityHint={
          briefingResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
        }
      />

      <View style={styles.bottomSpacer} />

      {articleActions ? (
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
      ) : null}
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
    // Mirror `SectionBar` and the article body: pill outer edges land on
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
