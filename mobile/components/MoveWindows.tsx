import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../constants/theme';
import type { MovePath } from '../lib/cards/path';
import type { CardDelta, WindowMove } from '../lib/cards/types';
import { DeltaChip } from './DeltaChip';
import { Text } from './primitives';
import { SPARK_WIDTH, Spark } from './Spark';

/**
 * One thing's move over several windows as cells of a table: a row of moves
 * (`MoveWindows`) under a line that names the windows once (`WindowHeads`).
 *
 * Several lists over the same three windows are a table, and a table's
 * columns are named at its head. The windows were stacked inside each row for
 * a day (a bar a window), which left nowhere to name them but on every row or
 * on the first alone: "we mention 1, 7, 30 d two times", and then "can we do
 * that in a smarter way? or is it better to repeat?" (2026-10-10). Side by
 * side they are named once, over everything they name, each list is one line,
 * and the lists can be read down a column.
 *
 * - **A cell is the chip every other surface prints**, at its own colour,
 *   with no window beside it: its column says that.
 * - **The longest window is drawn, not printed** (`Spark`): a day and a week
 *   are each one step, and a month has a way it went.
 * - **A window with nothing to say keeps its cell**, with a dash.
 * - **Every cell is as wide as the widest move** (`WIDEST`, at `room`), in
 *   the heads and in every row, so the columns fall on the same verticals
 *   whatever the text size and whatever a row prints.
 *
 * Hidden from a screen reader: the row says its moves in words, each with its
 * window, and the section's label is the header a reader hears.
 */
export const MoveWindows = memo(function MoveWindows({
  rungs,
  path,
  scale = 1,
  room = scale,
}: {
  /** The windows, shortest first. The last is drawn from `path`. */
  rungs: readonly WindowMove[];
  /** The longest window as a line. Null where there is too little to draw. */
  path: MovePath | null;
  /** The moves' size, as a `DeltaChip` takes it. */
  scale?: number;
  /** The size the cells are measured at: the table's largest. */
  room?: number;
}) {
  const drawn = rungs.length - 1;
  return (
    <View
      style={styles.windows}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {rungs.map((rung, i) => (
        <View key={rung.label} style={styles.cell}>
          <Room scale={room} graph={i === drawn} />
          {i === drawn && path ? (
            <Spark path={path} />
          ) : i !== drawn && rung.delta ? (
            <DeltaChip delta={rung.delta} window={false} scale={scale} />
          ) : (
            <Text variant="caption" tone="secondary">
              —
            </Text>
          )}
        </View>
      ))}
    </View>
  );
});

/** The windows' names over their columns: `1 day`, `7 days`, `30 days`. */
export const WindowHeads = memo(function WindowHeads({
  labels,
  room,
}: {
  labels: readonly string[];
  /** The size the table's cells are measured at (`MoveWindows`). */
  room: number;
}) {
  return (
    <View
      style={styles.windows}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {labels.map((label, i) => (
        <View key={label} style={styles.cell}>
          <Room scale={room} graph={i === labels.length - 1} />
          {/* Capped as a move is: a name that grew past its column's moves
              would push the column out from under them. */}
          <Text variant="caption" tone="secondary" maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
});

/**
 * The same windows under a card's reading: each name over its move, every one
 * a number, set from the leading edge as the reading is.
 *
 * The menu draws the longest window and prints the other two. A card prints
 * all three: its chart is the line, and the exact thirty-day figure is
 * printed nowhere else. Columns, not a row of names over a row of moves: a
 * yield's move is `0.09 points`, wider than any percentage, and a column
 * keeps its name over its move whatever the move prints.
 *
 * `subject` names what moved where the reading does not: `the lira`, under a
 * rate quoted per dollar, where a caret alone does not say which of the two
 * fell. It stands on the moves' line, before them.
 *
 * Hidden from a screen reader: the card says the moves in words.
 */
export const WindowColumns = memo(function WindowColumns({
  rungs,
  subject,
  scale = 1.15,
}: {
  rungs: readonly WindowMove[];
  subject?: string;
  /** The moves' size: a card's chip. */
  scale?: number;
}) {
  return (
    <View
      style={styles.columns}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {subject ? (
        <Text variant="caption" tone="secondary">
          {subject}
        </Text>
      ) : null}
      {rungs.map((rung) => (
        <View key={rung.label} style={styles.column}>
          <Room scale={scale} graph={false} />
          <Text variant="caption" tone="secondary" maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}>
            {rung.label}
          </Text>
          {rung.delta ? (
            <DeltaChip delta={rung.delta} window={false} scale={scale} />
          ) : (
            <Text variant="caption" tone="secondary">
              —
            </Text>
          )}
        </View>
      ))}
    </View>
  );
});

/** The widest move a cell prints: two digits and a decimal, with its caret. */
const WIDEST: CardDelta = { direction: 'down', magnitude: '88.8%' };

/** A cell's width and nothing else: the widest move, drawn with no height,
 *  and the line's box where the cell holds one. */
function Room({ scale, graph }: { scale: number; graph: boolean }) {
  return (
    <View style={[styles.room, graph && styles.graph]}>
      <DeltaChip delta={WIDEST} window={false} scale={scale} />
    </View>
  );
}

const styles = StyleSheet.create({
  windows: { flexDirection: 'row', gap: SPACING.sm },
  // What a cell prints stands at its trailing edge, so the figures of a
  // column end on one vertical.
  cell: { alignItems: 'flex-end' },
  // A card's windows. The subject and the moves end on one line, so the
  // columns' feet are what is aligned.
  columns: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  column: { alignItems: 'flex-start' },
  room: { height: 0, overflow: 'hidden' },
  graph: { minWidth: SPARK_WIDTH },
});
