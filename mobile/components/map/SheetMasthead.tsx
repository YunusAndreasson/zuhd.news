import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { briefingActionLabel } from '../../lib/audio-duration';
import { Icon, Pressable, Text } from '../primitives';

/**
 * The first thing in the sheet: what day it is, how much there is, and the
 * briefing.
 *
 * The briefing used to be a `listen · 12 min` pill in the bottom-left corner,
 * floating over the globe among two other pills — which is why the brief
 * included "we also need a way to start the daily briefing" for a feature
 * that had shipped. A control sized to stay out of the globe's way, placed
 * where nothing else on the screen was, reads as chrome. Here it is the one
 * button on the masthead of the day's list, which is where a reader goes
 * looking for "start here".
 *
 * The date is not decoration either. It is the app saying which cycle this
 * is — the pipeline commits five times a day and the reader has no other way
 * to tell a fresh column from a cached one.
 */
export const SheetMasthead = memo(function SheetMasthead({
  dateLabel,
  storyCount,
  briefingAvailable,
  briefingResumable,
  briefingDuration,
  onBriefingPress,
}: {
  /** "Friday 12 September" — the day the column was built. */
  dateLabel: string;
  storyCount: number;
  briefingAvailable: boolean;
  briefingResumable: boolean;
  briefingDuration?: number;
  onBriefingPress: () => void;
}) {
  const { colors } = useTheme();
  const label = briefingActionLabel(briefingResumable, briefingDuration);

  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text variant="labelSm" tone="emphasis" numberOfLines={1}>
          {dateLabel}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {storyCount === 1 ? '1 story' : `${storyCount} stories`}
        </Text>
      </View>

      {/* Absent rather than disabled when there is no briefing. A dead
          control the reader has to press to discover is dead is the failure
          the old pill's "No briefing available" toast already made once. */}
      {briefingAvailable ? (
        <Pressable
          onPress={onBriefingPress}
          haptic="none"
          hitSlop={SPACING.md}
          style={[styles.listen, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
          accessibilityRole="button"
          accessibilityLabel={briefingResumable ? 'Resume daily briefing' : 'Daily briefing'}
          accessibilityHint={
            briefingResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
          }
        >
          <Icon name="play" size="sm" tone="default" />
          <Text variant="labelXs" tone="default">
            {label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.smPlus,
    gap: SPACING.md,
  },
  titles: { flex: 1, minWidth: 0 },
  // The one place in the app a glyph sits inside a word pill. A play triangle
  // is not decoration here: it is the difference between a label that reads
  // as a heading and a control that reads as pressable, on a row whose other
  // half is a heading.
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.smPlus,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
