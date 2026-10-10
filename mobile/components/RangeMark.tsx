import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { OPACITY } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { type Range, type RangeScale, rangeMarks } from '../lib/cards/range';

/** The mark's box: wider than a row's small line, since where a range stands
 *  along it is all it says, and a row's one line tall. */
export const RANGE_WIDTH = 80;
const RANGE_HEIGHT = 20;
const BAR_HEIGHT = 4;
const TICK_WIDTH = 2;
const TICK_HEIGHT = 12;

/**
 * A reading and its likely range on the scale its list shares (`rangeScale`):
 * a quiet bar from the low to the high, and a tick at the reading.
 *
 * For the AI labs, whose scores overlap within their margin. The rows' note
 * says so in words, and a column of numbers then contradicts it by having an
 * order. Down a column of these the overlap is seen: two bars over the same
 * stretch are one place.
 *
 * - **No colour.** It is where a reading stands, not a move (`moveTone`).
 * - **One scale for every row**, so a bar further right is a higher score and
 *   two bars are compared by eye.
 *
 * Plain views, no canvas. Hidden from a screen reader: the row says the range.
 */
export const RangeMark = memo(function RangeMark({
  range,
  scale,
}: {
  range: Range;
  scale: RangeScale;
}) {
  const { colors } = useTheme();
  const marks = rangeMarks(range, scale);
  if (!marks) return <View style={styles.box} />;
  return (
    <View
      style={styles.box}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.bar,
          {
            left: marks.from * RANGE_WIDTH,
            // Never thinner than the tick over it.
            width: Math.max(TICK_WIDTH, marks.length * RANGE_WIDTH),
            backgroundColor: colors.textSecondary,
          },
        ]}
      />
      <View
        style={[
          styles.tick,
          { left: marks.at * (RANGE_WIDTH - TICK_WIDTH), backgroundColor: colors.textEmphasis },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: RANGE_WIDTH, height: RANGE_HEIGHT },
  // Both centred on the box's middle line by their own tops: an absolute
  // child is not placed by its parent's alignment on every platform.
  bar: {
    position: 'absolute',
    top: (RANGE_HEIGHT - BAR_HEIGHT) / 2,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    opacity: OPACITY.muted,
  },
  tick: {
    position: 'absolute',
    top: (RANGE_HEIGHT - TICK_HEIGHT) / 2,
    width: TICK_WIDTH,
    height: TICK_HEIGHT,
  },
});
