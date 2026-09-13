import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { MAX_FONT_SCALE, PRESSED_STYLE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { FoundProgress } from '../../lib/story-places';
import { Icon, Text } from '../primitives';

/**
 * One row above the story card: how far through the day you are, and the way
 * back to all of it.
 *
 * It says one thing at a time, in this order of precedence:
 *
 *  1. **`checking for new stories`** while a pull is running — the one thing a
 *     pull-to-refresh has no other way to say.
 *  2. **`now · …`** while a live Red alert exists. Alerts never enter the deck
 *     (the camera track is stories only), so this line is where a hazard with
 *     no article yet reaches the sheet. It opens the alert.
 *  3. **Where you are** otherwise: `3 of 48`, a track that fills as the deck
 *     moves, and `all news ›`. The whole row opens every story as a list.
 *
 * **The deck used to carry no position**, on the argument that the kicker's
 * time-ago, the next card's cut edge and the end card said enough. They said
 * it only to a reader already paying attention; swiping sideways through a
 * day felt like an unmarked corridor, with no sense of distance covered and
 * no obvious door back to the whole list. The track answers both in one line
 * the height of the caption it replaced.
 *
 * **The track follows the finger.** Its fill reads the deck's own `progress`
 * on the UI thread, so it moves with the swipe rather than jumping when the
 * card lands; the count beside it changes when the finger lifts, which is when
 * the story is committed.
 *
 * `found N` stays on the row once a reader has found anything — the globe's
 * game keeps its scoreboard — but it follows the position, because a swipe is
 * what this row now measures.
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
}: {
  /** A pull on the resting sheet is checking for a new cycle. */
  refreshing?: boolean;
  /** The committed story. `count` is the end card. */
  index: number;
  /** Stories in the river. */
  count: number;
  /** The deck's live position, in stories. */
  position: SharedValue<number>;
  progress?: FoundProgress;
  /** The newest live Red alert's title, if any. */
  alert?: string | null;
  /** Opens every story as a list. */
  onPress?: () => void;
  /** Opens the alert. */
  onAlertPress?: () => void;
}) {
  const { colors } = useTheme();
  const showingAlert = !refreshing && !!alert;
  const showingPosition = !refreshing && !showingAlert && count > 0;

  // One story of 48 shows a 48th of the track; the end card fills it.
  const fillStyle = useAnimatedStyle(() => {
    const filled = count > 0 ? (position.value + 1) / count : 0;
    return { width: `${Math.min(1, Math.max(0, filled)) * 100}%` };
  }, [count]);

  if (refreshing || showingAlert) {
    const handlePress = showingAlert ? onAlertPress : undefined;
    return (
      <Pressable
        onPress={handlePress}
        disabled={!handlePress}
        accessibilityLiveRegion="polite"
        accessibilityRole={handlePress ? 'button' : 'text'}
        accessibilityHint={handlePress ? 'Opens the alert' : undefined}
        hitSlop={SPACING.xs}
        style={({ pressed }) => [styles.row, pressed && handlePress ? PRESSED_STYLE : null]}
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
    );
  }
  if (!showingPosition) return null;

  const atEnd = index >= count;
  const place = atEnd ? `all ${count}` : `${index + 1} of ${count}`;
  const found = progress && progress.found > 0 ? progress.found : 0;
  const spokenFound = found > 0 ? `, ${found} found on the globe` : '';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${atEnd ? `End of all ${count} stories` : `Story ${index + 1} of ${count}`}${spokenFound}. All news`}
      accessibilityHint="Lists every story"
      hitSlop={SPACING.xs}
      style={({ pressed }) => [styles.row, pressed && onPress ? PRESSED_STYLE : null]}
    >
      <Text
        variant="caption"
        tone="emphasis"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
        style={styles.tabular}
      >
        {place}
        {found > 0 ? (
          <Text variant="caption" tone="secondary">
            {` · ${found} found`}
          </Text>
        ) : null}
      </Text>
      <View style={[styles.track, { backgroundColor: colors.rule }]}>
        <Animated.View
          style={[styles.fill, { backgroundColor: colors.textSecondary }, fillStyle]}
        />
      </View>
      <View style={styles.all}>
        <Text variant="caption" tone="secondary" maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
          all news
        </Text>
        <Icon name="chevron-forward" size="sm" tone="secondary" />
      </View>
    </Pressable>
  );
});

/** The track's thickness: a rule you can see, not a control you can grab. */
const TRACK = 2;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.smPlus,
    paddingHorizontal: SPACING.articlePadding,
    paddingBottom: SPACING.sm,
  },
  shrink: { flexShrink: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: TRACK, borderRadius: TRACK / 2, overflow: 'hidden' },
  fill: { height: TRACK, borderRadius: TRACK / 2 },
  all: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs },
});
