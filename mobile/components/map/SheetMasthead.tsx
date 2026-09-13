import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { PRESSED_STYLE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { formatAudioDurationMinutes } from '../../lib/audio-duration';
import { MASTHEAD_ROW } from '../../lib/deck-layout';
import type { FoundProgress } from '../../lib/story-places';
import { Icon, IconButton, Text } from '../primitives';

/**
 * One row above the story card: listen, how far through the day you are, and
 * the way back to all of it.
 *
 * **Listen leads the row** whenever there is a briefing to play and the player
 * is not already up: a round filled button, so it reads as its own control and
 * not as the play head of the track beside it. It moved here from the top bar,
 * where it sat over the globe out of the thumb's reach.
 *
 * After it the row says one thing at a time, in this order of precedence:
 *
 *  1. **`checking for new stories`** while a pull is running — the one thing a
 *     pull-to-refresh has no other way to say.
 *  2. **`now · …`** while a live Red alert exists. Alerts never enter the deck
 *     (the camera track is stories only), so this line is where a hazard with
 *     no article yet reaches the sheet. It opens the alert.
 *  3. **A track and a list icon** otherwise. The whole row opens every story as
 *     a list.
 *
 * **The track is the status; nothing restates it.** It was `3 of 48 · 12 found
 * ━━━ all news ›` — the position twice (digits and bar), the found count a
 * third time once the globe's ring carried it, and a label naming the door.
 * A bar whose fill moves under the finger already shows where you are and how
 * much is left, without being read; the precise count is a screen reader's
 * (the row's label) and the index sheet's. The list icon is the signifier that
 * the row opens the list — the one thing the track cannot say.
 *
 * **The track follows the finger.** Its fill reads the deck's own `progress`
 * on the UI thread, so it moves with the swipe rather than jumping when the
 * card lands.
 */
export const SheetMasthead = memo(function SheetMasthead({
  refreshing = false,
  index,
  count,
  position,
  progress,
  alert,
  onPress,
  onAlertPress,
  briefingAvailable = false,
  briefingResumable = false,
  briefingDuration,
  onBriefingPress,
}: {
  /** A pull on the resting sheet is checking for a new cycle. */
  refreshing?: boolean;
  /** The committed story. `count` is the end card. */
  index: number;
  /** Stories in the river. */
  count: number;
  /** The deck's live position, in stories. */
  position: SharedValue<number>;
  /** Found on the globe — spoken, not printed. */
  progress?: FoundProgress;
  /** The newest live Red alert's title, if any. */
  alert?: string | null;
  /** Opens every story as a list. */
  onPress?: () => void;
  /** Opens the alert. */
  onAlertPress?: () => void;
  briefingAvailable?: boolean;
  briefingResumable?: boolean;
  briefingDuration?: number;
  onBriefingPress?: () => void;
}) {
  const { colors } = useTheme();
  const showingAlert = !refreshing && !!alert;
  const minutes = formatAudioDurationMinutes(briefingDuration);
  const listen =
    briefingAvailable && onBriefingPress ? (
      <IconButton
        onPress={onBriefingPress}
        haptic="none"
        style={[styles.listen, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
        accessibilityLabel={`${briefingResumable ? 'Resume daily briefing' : 'Daily briefing'}${minutes ? `, ${minutes}` : ''}`}
        accessibilityHint={
          briefingResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
        }
      >
        <Icon name="play" size="sm" tone="default" />
      </IconButton>
    ) : null;

  // One story of 48 shows a 48th of the track; the end card fills it.
  const fillStyle = useAnimatedStyle(() => {
    const filled = count > 0 ? (position.value + 1) / count : 0;
    return { width: `${Math.min(1, Math.max(0, filled)) * 100}%` };
  }, [count]);

  if (refreshing || showingAlert) {
    const handlePress = showingAlert ? onAlertPress : undefined;
    return (
      <View style={styles.row}>
        {listen}
        <Pressable
          onPress={handlePress}
          disabled={!handlePress}
          accessibilityLiveRegion="polite"
          accessibilityRole={handlePress ? 'button' : 'text'}
          accessibilityHint={handlePress ? 'Opens the alert' : undefined}
          hitSlop={SPACING.xs}
          style={({ pressed }) => [styles.body, pressed && handlePress ? PRESSED_STYLE : null]}
        >
          <Text
            variant="caption"
            tone={showingAlert ? 'emphasis' : 'secondary'}
            numberOfLines={1}
            style={styles.shrink}
          >
            {refreshing ? 'checking for new stories' : `now · ${alert}`}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (count <= 0) return listen ? <View style={styles.row}>{listen}</View> : null;

  const found = progress?.found ?? 0;
  const spoken = `${index >= count ? `End of all ${count} stories` : `Story ${index + 1} of ${count}`}${found > 0 ? `, ${found} found on the globe` : ''}. All news`;

  return (
    <View style={styles.row}>
      {listen}
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Lists every story"
        hitSlop={SPACING.sm}
        style={({ pressed }) => [styles.body, pressed && onPress ? PRESSED_STYLE : null]}
      >
        <View style={[styles.track, { backgroundColor: colors.rule }]}>
          <Animated.View
            style={[styles.fill, { backgroundColor: colors.textSecondary }, fillStyle]}
          />
        </View>
        <Icon name="list" size="md" tone="secondary" />
      </Pressable>
    </View>
  );
});

/** The track's thickness: a rule you can see, not a control you can grab. */
const TRACK = 3;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.articlePadding,
    paddingBottom: SPACING.sm,
  },
  body: {
    flex: 1,
    minHeight: MASTHEAD_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  // Hairline edge so the button stays defined on the sheet and over the globe
  // alike. Definition over elevation: no shadow.
  listen: {
    width: MASTHEAD_ROW,
    height: MASTHEAD_ROW,
    borderRadius: MASTHEAD_ROW / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  shrink: { flexShrink: 1 },
  track: { flex: 1, height: TRACK, borderRadius: TRACK / 2, overflow: 'hidden' },
  fill: { height: TRACK, borderRadius: TRACK / 2 },
});
