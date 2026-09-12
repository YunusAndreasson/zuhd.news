import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Pressable, Text } from '../primitives';

/**
 * One row of the sheet's list — and there is only one, on purpose.
 *
 * The NOW block and the river use this same component. Two row designs in one
 * scroller would tell the reader that a strait and a story are different kinds
 * of thing to *read*, when the only difference is what opens when you press
 * them. What separates them is the block's heading and the `current` ink step,
 * both of which the app already uses to mean exactly this.
 *
 * **Title first, metadata under it.** `foundation.md` calls headlines the
 * entry point, and a scanning eye should hit them rather than a row of
 * small-caps kickers. It also matches `ArticleRow`, which is what the search
 * and saved lists already use.
 *
 * **`current` is an ink step, never a colour** — the same rule and the same
 * slot `CardFrame` uses. The chromatic budget on this screen is spent on the
 * delta chips in the strip above.
 *
 * **Every row is exactly `height` tall.** That is not a layout convenience:
 * the globe's camera finds the row under the reader by dividing scroll offset
 * by row height, so the number the list lays out with and the number the
 * camera divides by have to be the same number. Titles clamp to two lines
 * rather than growing — the reader is where long text lives, and it has no
 * such constraint.
 */

export interface FeedRowProps {
  /** Uniform, and shared with the globe camera. See above. */
  height: number;
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
      style={[styles.row, { height, borderBottomColor: colors.rule }]}
    >
      <Text variant="title" numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
        {title}
      </Text>
      <View style={styles.meta}>
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
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  // Takes the slack so the odds chip stays pinned right and the kicker
  // truncates rather than pushing it off the row.
  metaText: { flex: 1 },
});
