import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING, titleFontScale } from '../../constants/theme';
import type { IndexRow } from '../../lib/cards/row';
import { Box, Pressable, Text } from '../primitives';
import { DeltaChip } from './DeltaChip';
import { Sparkline } from './Sparkline';

/**
 * One line of a column index: what a thing is, what it reads, and which way it
 * went.
 *
 * Four zones across two lines, and the split between the two columns is the
 * whole design. The left is language — the dense title and its unit. The right
 * is arithmetic — the level and the move, both set tabular so a reader running
 * down the column compares digits in one place rather than hunting for them.
 * The picture sits between as a shape and nothing more; see `Sparkline` for why
 * its amplitude is not allowed to mean anything.
 *
 * Every string here comes from `indexRow`, which copies them off the card. A
 * formatter in this file would be a second opinion about a number the card has
 * already spelled — the failure `lib/cards/row.ts` opens by naming.
 */

/**
 * The reading is set in `tabularEmphasis` and scaled up rather than in a body
 * variant with a `fontVariant` override, because that is the pairing the app
 * already made once: `DeltaChip` sits directly beneath it at the same variant,
 * `scale` 1.15, and the two have to share a figure width or the right-hand
 * column stops being a column. The Dynamic Type cap on `tabular` is 1.0, so
 * neither grows — also already true of the chip, and the reason the row can be
 * a fixed two lines.
 */
const READING_SCALE = 1.5;

/**
 * The width of the right-hand cluster, and it is measured rather than chosen.
 *
 * It has to be fixed, because content-sizing it is what makes the column stop
 * being a column: the widest thing in the cluster is the delta on some rows
 * ("▲ 27 points") and the reading on others ("$76,867"), so each row absorbed
 * a different amount of the slack and the sparklines beside them started and
 * ended at six different x positions down one screen. The web rail pins its
 * level and move columns for the same reason.
 *
 * 88 clears both of those at the sizes they are set in, and neither can grow:
 * `tabular` is capped at 1.0 Dynamic Type, so this is not a width that a
 * larger accessibility setting can overrun.
 */
const CLUSTER_W = 88;

export const IndicatorRow = memo(function IndicatorRow({
  row,
  index,
  onPress,
}: {
  row: IndexRow;
  index: number;
  onPress: (index: number) => void;
}) {
  const handlePress = useCallback(() => onPress(index), [index, onPress]);
  // The same ramp `ArticleRow` applies to a headline. A prediction market's
  // title is its question — "Will the Fed hold rates at the September
  // meeting?" — and a question cut mid-word is not a shorter question, it is
  // a different one, so these wrap to a second line rather than truncate.
  const titleScale = useMemo(() => titleFontScale(row.title.length), [row.title]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={row.a11yLabel}
      // The label is the whole row read aloud; the hint is the one thing it
      // cannot contain, which is what pressing does. Sighted readers get that
      // from the chevron below — this is the same signifier, in the channel
      // that has no chevron.
      accessibilityHint="Opens the full card"
    >
      <Box paddingY="md" rule="bottom" style={styles.row}>
        <View style={styles.left}>
          <Text variant="title" scale={titleScale} numberOfLines={2}>
            {row.title}
          </Text>
          {/* The `today ·` mark rides the note line rather than the title,
              because it is set in the note's own variant — small caps at
              `sizeXs` — and inline at 11pt in front of a 21pt title it reads
              as a rendering fault rather than as an eyebrow. Directly under
              the title it qualifies, at matching weight, it is the same ink
              step `CardFrame` prints before the kicker. Never a colour. */}
          {/* Two lines, because this is the unit and the unit is not
              decoration: truncating it cost the Kerch strait the week its
              count belongs to ("ships a day, week to 16 Aug"), which is the
              one thing standing between a fourteen-day-old reading and a
              reader taking it for this morning's. A row grows rather than
              drops a fact — the same rule the cards follow. */}
          {/* Unmounted rather than rendered empty when `indexRows` has dropped
              a note that said the same thing on every row of the column: an
              empty `Text` still costs its line box and its `marginTop`, so the
              row would keep the hole the line used to fill and the column's
              rhythm would be set by a string nobody can see. The separator
              goes with it — "today ·" pointing at a blank margin is the same
              dangling dot `CardFrame.readingMeta` documents. */}
          {row.note || row.lead ? (
            <Text variant="labelXs" tone="secondary" numberOfLines={2} style={styles.note}>
              {row.lead ? (
                <Text variant="labelXs" tone="emphasis">
                  {row.note ? 'today · ' : 'today'}
                </Text>
              ) : null}
              {row.note}
            </Text>
          ) : null}
        </View>

        <Sparkline values={row.spark} tone={row.tone} />

        <View style={styles.right}>
          <Text
            variant="tabularEmphasis"
            scale={READING_SCALE}
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
          >
            {row.reading}
          </Text>
          {/* No chip rather than a flat one where the card carries no delta:
              `attention`'s reading *is* its move, and the calendar and the
              condition cards report a state. A caret there would be a claim
              the builder declined to make. */}
          {row.delta ? <DeltaChip delta={row.delta} compact /> : null}
        </View>
      </Box>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // `sm`, not `md`. At 360pt the row has 332 to spend and the furniture on
  // the right — the picture and the number cluster — already takes 144 of it;
  // two 16pt gaps put the title under 150 and wrapped every one of them.
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // `minWidth: 0` is what lets the title truncate instead of shoving the
  // reading off the right edge — a flex child's default `minWidth: auto` is
  // its content, so without this the longest title in the column sets the
  // width of every row's number.
  left: { flex: 1, minWidth: 0 },
  note: { marginTop: SPACING.xxs },
  right: { width: CLUSTER_W, alignItems: 'flex-end', gap: SPACING.xxs },
});
