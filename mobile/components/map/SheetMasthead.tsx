import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/theme';
import type { FoundProgress } from '../../lib/story-places';
import { Text } from '../primitives';

/**
 * Above the sheet's list: how much of today's news the reader has found, or
 * that a pull is checking for more.
 *
 * It held the day's date, the story count and the briefing button. The
 * briefing moved to the top left of `MapHeader`, and the date went to give the
 * news the room — the list's own rows carry each story's age.
 *
 * The count came back as progress. Every story on the globe is a light until
 * it is opened, so the line is the game's only scoreboard, and before the
 * first find it is also the only thing saying the lights are stories at all.
 * A pull's "checking" line takes the slot while it runs, because that is the
 * one thing a pull-to-refresh has no other way to say. Both are a live region,
 * so a screen reader hears them without moving focus.
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
}: {
  /** A pull on the resting sheet is checking for a new cycle. */
  refreshing?: boolean;
  progress?: FoundProgress;
}) {
  const line = refreshing ? 'checking for new stories' : progress ? progressLine(progress) : null;
  return (
    <View accessibilityLiveRegion="polite">
      {line ? (
        <Text variant="caption" numberOfLines={1} style={styles.line}>
          {line}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  line: {
    paddingHorizontal: SPACING.articlePadding,
    paddingBottom: SPACING.sm,
  },
});
