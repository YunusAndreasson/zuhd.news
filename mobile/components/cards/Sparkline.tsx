import { Canvas, DashPathEffect, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type TextTone, toneColor } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

/**
 * The shape of a move, at the size of a line of type.
 *
 * This is not a small `TrendBlock`. That component's floor is 148pt of canvas
 * plus a caption row, two axis boxes and a time axis — ~210pt all in — and
 * every one of those parts is there because a card has room to be read. A row
 * on the column index has room to be *glanced at*, which is a different
 * component and not a variant of the same one.
 *
 * ── What this picture is allowed to mean ──────────────────────────────────
 *
 * Only the shape. Not the magnitude, and not a comparison with the row above.
 *
 * Each line autoscales to its own domain, and — unlike the web rail's old
 * sparklines, which at least shared one calendar window — the series in a
 * column do not cover the same period: a strait is 90 days, an FX mover is a
 * month, a belief contract can be six observations. A column of lines over
 * different spans at one rhythm is a set of incomparable pictures with nothing
 * on screen saying so, which is the trap `.claude/rules/web/charts.md` names.
 *
 * The defence is that magnitude is carried entirely by `DeltaChip` beside it,
 * the line is drawn thin and takes the chip's own valence colour rather than a
 * second one, and no row is ever ranked, sorted or thresholded on this. If a
 * reader can answer "how much" from the picture rather than the figure, this
 * component has grown past its job.
 *
 * ── The dotted rule ───────────────────────────────────────────────────────
 *
 * A card with no series gets a drawn absence rather than an empty box: "a
 * drawn absence is a measurement; a gap is a bug" (`_map/markets.ts`). 2pt on,
 * 3pt off, in `colors.rule` — the same dash the web rail uses, and it keeps
 * every reading in the column ending on one edge.
 */

/** Kept off the very top and bottom so a peak is not clipped by the row's own
 *  hairline, and so a flat series does not read as a border. */
const INSET = 3;

const SPARKLINE_W = 56;
const SPARKLINE_H = 24;

export const Sparkline = memo(function Sparkline({
  values,
  tone,
  width = SPARKLINE_W,
  height = SPARKLINE_H,
}: {
  /** The card's own series. Absent — or shorter than two usable points — draws
   *  the rule instead. A multi-line series is deliberately not passed here:
   *  two lines in 24pt is noise, and drawing only the first would put the
   *  wrong series under a reading built from both. */
  values?: number[];
  /** The delta's valence, so the line and the chip beside it cannot disagree.
   *  `neutral` where the card makes no claim — slate, never the absence of a
   *  colour. */
  tone: TextTone;
  width?: number;
  height?: number;
}) {
  const { colors } = useTheme();

  const path = useMemo(() => {
    if (!values) return null;
    // Index-preserving: a non-finite observation drops its point but not its
    // slot, so a gap in the middle of a series does not silently compress the
    // shape on either side of it.
    const points: { x: number; y: number }[] = [];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

    const span = values.length - 1;
    const innerTop = INSET;
    const innerBottom = height - INSET;
    // A flat series sits on the centre line rather than on the floor. Scaling
    // a zero-span domain the ordinary way pins it to one edge, where it reads
    // as a rule rather than as a series that did not move.
    const y = (v: number) =>
      max === min ? height / 2 : innerBottom - ((v - min) / (max - min)) * (innerBottom - innerTop);
    const x = (i: number) => (span <= 0 ? 0 : (i / span) * width);

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      points.push({ x: x(i), y: y(v) });
    }
    if (points.length < 2) return null;

    const d =
      d3Line<{ x: number; y: number }>()
        .x((p) => p.x)
        .y((p) => p.y)
        .curve(curveMonotoneX)(points) ?? '';
    return Skia.Path.MakeFromSVGString(d);
  }, [values, width, height]);

  const canvasStyle = useMemo(() => ({ width, height }), [width, height]);
  const color = toneColor(tone, colors) ?? colors.textSecondary;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Canvas style={canvasStyle}>
        {path ? (
          <Path path={path} color={color} style="stroke" strokeWidth={1.5} strokeJoin="round" />
        ) : (
          <Line
            p1={vec(0, height / 2)}
            p2={vec(width, height / 2)}
            color={colors.rule}
            strokeWidth={1}
          >
            <DashPathEffect intervals={[2, 3]} />
          </Line>
        )}
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
});
