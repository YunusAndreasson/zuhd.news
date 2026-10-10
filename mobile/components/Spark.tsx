import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { toneColor } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { MovePath } from '../lib/cards/path';
import { sparkDirection, sparkPoints } from '../lib/cards/spark';
import { moveTone } from '../lib/valence';

/** The line's box. As wide as a move's cell beside it, and a row's one line
 *  tall. */
export const SPARK_WIDTH = 56;
const SPARK_HEIGHT = 20;
const STROKE = 1.5;
const END_DOT = 2;

/**
 * A list's thirty days as a small line: no axis, no label, no scrub.
 *
 * A day and a week are each one step, and a number is all either is. A month
 * has a way it went, and its number hides it: a slide and a plunge that half
 * recovered end in the same place. The user's question (2026-10-10): "are
 * numbers the best way to communicate this… or I mean small graph for 30d?"
 *
 * - **It takes its move's colour** (`moveTone`): green where it ends above
 *   where it began, red below, slate level. A dot marks the end it is read
 *   from, so the direction survives without the colour.
 * - **A quiet month lies flat** (`sparkPoints`): the box never stands for
 *   less than a few per cent, so the line's height says how far it went.
 *
 * Drawn once and still: a canvas with nothing animated in it costs no frame
 * at rest.
 */
export const Spark = memo(function Spark({ path }: { path: MovePath }) {
  const { colors } = useTheme();
  const { line, end } = useMemo(() => {
    const points = sparkPoints(path, SPARK_WIDTH, SPARK_HEIGHT, END_DOT);
    const builder = Skia.PathBuilder.Make();
    for (const [i, point] of points.entries()) {
      if (i === 0) builder.moveTo(point.x, point.y);
      else builder.lineTo(point.x, point.y);
    }
    return { line: builder.build(), end: points.at(-1) };
  }, [path]);
  const color = toneColor(moveTone({ direction: sparkDirection(path) }), colors) ?? colors.text;
  return (
    <Canvas
      style={styles.spark}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        path={line}
        style="stroke"
        strokeWidth={STROKE}
        strokeJoin="round"
        strokeCap="round"
        color={color}
      />
      {end ? <Circle cx={end.x} cy={end.y} r={END_DOT} color={color} /> : null}
    </Canvas>
  );
});

const styles = StyleSheet.create({
  spark: { width: SPARK_WIDTH, height: SPARK_HEIGHT },
});
