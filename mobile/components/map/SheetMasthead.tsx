import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../../constants/theme';
import type { FoundProgress } from '../../lib/story-places';
import { Text } from '../primitives';

/**
 * One line above the story card, and the door to the whole day.
 *
 * It says exactly one thing, in this order of precedence:
 *
 *  1. **`checking for new stories`** while a pull is running — the one thing a
 *     pull-to-refresh has no other way to say.
 *  2. **`now · …`** while a live Red alert exists. Alerts never enter the deck
 *     (the camera track is stories only), so this line is where a hazard with
 *     no article yet reaches the sheet. It opens the alert.
 *  3. **`found N of M`** otherwise — the game's only scoreboard, and before the
 *     first find the only thing saying the lights on the globe are stories. It
 *     opens every story as a list.
 *
 * A live region, so a screen reader hears the line change without moving
 * focus.
 */
export function progressLine({ found, total }: FoundProgress): string | null {
  if (total <= 0) return null;
  if (found <= 0) return `${total} ${total === 1 ? 'story' : 'stories'} on the globe`;
  if (found >= total) return `all ${total} found`;
  return `found ${found} of ${total}`;
}

export const SheetMasthead = memo(function SheetMasthead({
  refreshing = false,
  progress,
  alert,
  onPress,
  onAlertPress,
}: {
  /** A pull on the resting sheet is checking for a new cycle. */
  refreshing?: boolean;
  progress?: FoundProgress;
  /** The newest live Red alert's title, if any. */
  alert?: string | null;
  /** Opens every story as a list. */
  onPress?: () => void;
  /** Opens the alert. */
  onAlertPress?: () => void;
}) {
  const showingAlert = !refreshing && !!alert;
  const line = refreshing
    ? 'checking for new stories'
    : showingAlert
      ? `now · ${alert}`
      : progress
        ? progressLine(progress)
        : null;
  const handlePress = refreshing ? undefined : showingAlert ? onAlertPress : onPress;

  if (!line) return null;
  return (
    <Pressable
      onPress={handlePress}
      disabled={!handlePress}
      accessibilityLiveRegion="polite"
      accessibilityRole={handlePress ? 'button' : 'text'}
      accessibilityHint={
        handlePress ? (showingAlert ? 'Opens the alert' : 'Lists every story') : undefined
      }
      hitSlop={SPACING.xs}
      style={({ pressed }) => [styles.row, pressed && handlePress ? PRESSED_STYLE : null]}
    >
      <Text
        variant="caption"
        tone={showingAlert ? 'emphasis' : 'secondary'}
        numberOfLines={1}
        style={styles.line}
      >
        {line}
      </Text>
      {handlePress && !showingAlert ? (
        <Text variant="caption" tone="secondary">
          all →
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.articlePadding,
    paddingBottom: SPACING.sm,
  },
  line: { flexShrink: 1 },
});
