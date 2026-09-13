import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Pressable, Text } from '../primitives';

/**
 * One row of the sheet's list — and there is only one, on purpose.
 *
 * The alert block and the river use this same component. Two row designs in
 * one scroller would tell the reader that an alert and a story are different
 * kinds of thing to *read*, when the only difference is what opens when you
 * press them. What separates them is the block's heading and the `current` ink
 * step, both of which the app already uses to mean exactly this.
 *
 * **Title first, metadata under it.** `foundation.md` calls headlines the
 * entry point, and a scanning eye should hit them rather than a row of
 * small-caps kickers. It also matches `ArticleRow`, which is what the search
 * and saved lists already use.
 *
 * **`current` is an ink step, never a colour** — the same rule and the same
 * slot `CardFrame` uses.
 *
 * **The one colour on a row is the story's globe hue**, as a dot before the
 * metadata: the same hue the globe drew the story's beacon in, filled while
 * the story is still a light to find and a ring once it has been opened —
 * the web rail's read state. It is a dot and never the text: the web hues are
 * mark colours, and at 11pt on cream several of them are not legible ink.
 * An alert row has no category and no dot.
 *
 * **A row takes its natural height unless it is given one.** Rows used to be
 * a fixed height because the globe's camera divided the list's scroll offset
 * by it; the camera reads a story index now, so a long headline wraps rather
 * than clamping. `height` remains for a list that has to be uniform.
 */

/** The category dot's diameter — a beacon at row scale. */
const DOT = 7;

export interface FeedRowProps {
  /** A fixed row height, which also clamps the title to two lines. */
  height?: number;
  title: string;
  /** `kicker · when` — already assembled, already lowercase. */
  meta: string;
  /** `current` or `updated`, in stronger ink before the meta line. */
  mark?: string | null;
  /**
   * What a prediction market says about this story, as a bare percentage.
   *
   * Never tinted favorable or unfavorable: a green "US invades Iran, 35%" is
   * the app calling a likelier war good news. It is also the signifier that
   * the story has a market on it at all — the full line, with its movement
   * and its "a market, not a forecast" caveat, is in the reader.
   */
  odds?: string | null;
  /**
   * The reader has already opened this story — from its globe mark, this row
   * or the reader. The title drops to secondary ink, the way the web's rail
   * greys a read story. An ink step and not a badge: the row cannot grow, and
   * the globe already says it louder by no longer drawing the mark.
   */
  found?: boolean;
  /** The story's category hue (`categoryMarkColor`). Absent → no dot. */
  hue?: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

export const FeedRow = memo(function FeedRow({
  height,
  title,
  meta,
  mark,
  odds,
  found = false,
  hue,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: FeedRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.row, height ? { height } : styles.natural, { borderBottomColor: colors.rule }]}
    >
      <Text
        variant="rowTitle"
        tone={found ? 'secondary' : 'default'}
        numberOfLines={height ? 2 : undefined}
        maxFontSizeMultiplier={MAX_FONT_SCALE.heading}
      >
        {title}
      </Text>
      <View style={styles.meta}>
        {hue ? (
          <View
            style={[
              styles.dot,
              found ? { borderColor: hue, borderWidth: 1.2 } : { backgroundColor: hue },
            ]}
          />
        ) : null}
        {mark ? (
          <Text variant="labelXs" tone="emphasis" numberOfLines={1}>
            {`${mark} · `}
          </Text>
        ) : null}
        <Text variant="labelXs" numberOfLines={1} style={styles.metaText}>
          {meta}
        </Text>
        {odds ? (
          <Text variant="tabular" tone="secondary" numberOfLines={1}>
            {odds}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    justifyContent: 'center',
    paddingHorizontal: SPACING.articlePadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  natural: { paddingVertical: SPACING.smPlus },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  // Takes the slack so the odds chip stays pinned right and the kicker
  // truncates rather than pushing it off the row.
  metaText: { flex: 1 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginRight: SPACING.xs },
});
