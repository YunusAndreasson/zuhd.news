import { dataDecimals } from '@shared/chart/series';
import type { TrendAnnotation, TrendHighlight, TrendSeries } from '@shared/types';
import {
  Canvas,
  Circle,
  DashPathEffect,
  Line,
  Path,
  Skia,
  type SkPath,
  vec,
} from '@shopify/react-native-skia';
import { scaleLinear } from 'd3-scale';
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  GestureDetector,
  type PanGestureConfig,
  usePanGesture,
} from 'react-native-gesture-handler';
import {
  type SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { type ColorPalette, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { nearestIndex } from '../../lib/arrays';
import { citedLabels } from '../../lib/cards/card-chart';
import { chartScale, partLabels } from '../../lib/cards/chart-scale';
import type { CardDelta } from '../../lib/cards/types';
import { clearLabelSpot } from '../../lib/chart-label';
import { hapticTick } from '../../lib/haptics';
import { DeltaChip } from '../DeltaChip';
import { Pressable, Text } from '../primitives';
import {
  type BlockVariant,
  blockContainerStyle,
  blockSharedStyles,
  formatBlockNumber,
  useChartDrawProgress,
} from './shared';
import {
  buildTrendLinePath,
  buildTrendXLayout,
  type TrendShape,
  type TrendTimeTick,
  trendLineVertices,
} from './trend-geometry';

type Pt = { x: number; y: number };

const CHART_HEIGHT = { context: 148, inline: 64 } as const;
const STROKE_WIDTH = 1.5;
const DATA_DOT_R = 2;
const EVENT_DOT_R = 4;
const ENDPOINT_DOT_R = 4;
const ENDPOINT_RING_R = 8;
const LABEL_ROW_HEIGHT = 14;
/** A time tick's mark under the plot, so its label below reads as a place on
 *  the line and not as a caption. */
const TICK_MARK = 4;
/** Width of one `labelXs` caps character with its tracking, for sizing the
 *  reference label before it has been laid out. */
const REFERENCE_LABEL_CHAR_WIDTH = 7.5;
/** The clear space kept between two cited-story labels. */
const ANNOTATION_LABEL_GAP = SPACING.sm;
/** How far along the line each candidate position for the label moves. */
const REFERENCE_LABEL_STEP = 8;
const CHART_TOP_PAD = LABEL_ROW_HEIGHT + 10;
const CHART_BOTTOM_PAD = 14;
// Share the plot inset with the labels' width. Seven-figure market readings
// need room at the large in-app text setting too; put units on their own row
// so neither the number nor its unit runs into the chart edge.
const CHART_RIGHT_PAD = 72;
const CHART_LEFT_PAD = 2;

/**
 * The plot's insets. An axis chart keeps a gutter on the right for its
 * extremes and a row above for cited-story labels. The inline chart prints
 * neither, and a blank 72pt gutter under a story is exactly the failure the
 * web's sparkline record describes — so it keeps room for the end ring, the
 * tick marks under the plot and nothing else. Both print the time axis.
 */
interface PlotInsets {
  top: number;
  bottom: number;
  right: number;
}
const AXIS_INSETS: PlotInsets = {
  top: CHART_TOP_PAD,
  bottom: CHART_BOTTOM_PAD,
  right: CHART_RIGHT_PAD,
};
const INLINE_INSETS: PlotInsets = { top: 8, bottom: 8, right: 10 };
const MAX_SERIES = 3;
const SCRUB_LABEL_W_SINGLE = 96;
const SCRUB_LABEL_W_MULTI = 132;
const SCRUB_VALUE_LINE_H = 16;
const SCRUB_PERIOD_LINE_H = 14;
/** The line under the day: how far the reading has moved since. */
const SCRUB_MOVE_LINE_H = 18;

function resolveHighlightIndex(values: number[], mode: TrendHighlight | undefined): number {
  if (values.length === 0) return -1;
  switch (mode) {
    case 'first':
      return 0;
    case 'max':
      return values.reduce(
        (best, v, i) => (v > (values[best] ?? Number.NEGATIVE_INFINITY) ? i : best),
        0,
      );
    case 'min':
      return values.reduce(
        (best, v, i) => (v < (values[best] ?? Number.POSITIVE_INFINITY) ? i : best),
        0,
      );
    default:
      return values.length - 1;
  }
}

/** A series' ink, for its line and for its swatch in the legend: the first in
 *  emphasis, the second in the accent, any other secondary. */
function seriesColor(index: number, colors: ColorPalette): string {
  return index === 0 ? colors.textEmphasis : index === 1 ? colors.accent : colors.textSecondary;
}

/**
 * The one y-axis a trend is drawn on, over the range its height stands for
 * (`chartScale`) between the plot's top and bottom. `inverted` turns it over:
 * a rate quoted per dollar, drawn so its line rises as the currency does.
 *
 * The chart drew its lines on one copy of this and the block placed the scrub
 * stops, the cited marks and the reference label on another: two copies that
 * had to agree for a dot to sit on its line.
 */
function trendYScale(lo: number, hi: number, top: number, bottom: number, inverted: boolean) {
  return scaleLinear()
    .domain([lo, hi])
    .range(inverted ? [top, bottom] : [bottom, top]);
}

/** A level the series is measured against — a strait's 90-day average —
 *  drawn as a dashed hairline with its label at the left end. It joins the
 *  y-extent, so the line is always on the canvas. */
interface TrendReference {
  value: number;
  label: string;
}

interface ChartProps {
  series: TrendSeries[];
  shape?: TrendShape;
  yScale: (value: number) => number;
  /** Where the scale's rules fall: the highest and lowest value drawn, or the
   *  ends and the middle of a scale of the quantity's own. */
  ruleYs: readonly number[];
  /** The primary series on the canvas — the scrub stops — and where the
   *  reference rule lands; the block places its labels from the same. */
  points: Pt[];
  referenceY: number | null;
  width: number;
  height: number;
  defaultHighlightIdx: number;
  progress: SharedValue<number>;
  scrubIdx: SharedValue<number>;
  colors: ColorPalette;
  annotations?: TrendAnnotation[];
  showDataDots: boolean;
  xPositions: number[];
  /** Where the time axis's ticks fall, for their marks under the plot. */
  tickXs: readonly number[];
  insets: PlotInsets;
}

// Memoized: `TrendBlock` itself is not compiled (its gesture config writes a
// shared value), so nothing else keeps a render of the block that changed
// nothing here from reconciling the whole Skia canvas. Every prop is a value
// the block memoizes, a shared value, a number, or the theme's palette. (A
// scrub no longer renders the block at all: `ScrubReadout` holds the index.)
const Chart = memo(function Chart({
  series,
  shape,
  yScale,
  ruleYs,
  points,
  referenceY,
  width,
  height,
  defaultHighlightIdx,
  progress,
  scrubIdx,
  colors,
  annotations,
  showDataDots,
  xPositions,
  tickXs,
  insets,
}: ChartProps) {
  const seriesPaths = useMemo(
    (): { path: SkPath; color: string }[] =>
      series.map((s, sIdx) => {
        const pts = s.values.map((v, i) => ({ x: xPositions[i] ?? CHART_LEFT_PAD, y: yScale(v) }));
        const d = buildTrendLinePath(pts, shape);
        const path = Skia.Path.MakeFromSVGString(d) ?? Skia.PathBuilder.Make().detach();
        return { path, color: seriesColor(sIdx, colors) };
      }),
    [series, shape, yScale, colors, xPositions],
  );

  const chartRightX = width - insets.right;
  // The time ticks hang from the plot's foot. They hung from the lowest
  // value's rule, which a quiet series leaves in the middle of the plot.
  const plotBottom = height - insets.bottom;

  const activeCx = useDerivedValue(() => {
    const idx = scrubIdx.value >= 0 ? scrubIdx.value : defaultHighlightIdx;
    return points[idx]?.x ?? 0;
  });
  const activeCy = useDerivedValue(() => {
    const idx = scrubIdx.value >= 0 ? scrubIdx.value : defaultHighlightIdx;
    return points[idx]?.y ?? 0;
  });

  const crosshairOpacity = useDerivedValue(() =>
    scrubIdx.value >= 0 ? withTiming(1, { duration: 80 }) : withTiming(0, { duration: 120 }),
  );
  const crosshairP1 = useDerivedValue(() => {
    const idx = scrubIdx.value;
    const x = idx >= 0 ? (points[idx]?.x ?? 0) : 0;
    return vec(x, insets.top);
  });
  const crosshairP2 = useDerivedValue(() => {
    const idx = scrubIdx.value;
    const x = idx >= 0 ? (points[idx]?.x ?? 0) : 0;
    return vec(x, height - insets.bottom);
  });

  const canvasStyle = useMemo(() => ({ width, height }), [width, height]);

  // Every scrub stop as one path, not one <Circle> per point: a 90-day series
  // mounted ninety Skia nodes, and every card chart scrubs now.
  const dotsPath = useMemo(() => {
    if (!showDataDots || points.length === 0) return null;
    const b = Skia.PathBuilder.Make();
    for (const p of points) b.addCircle(p.x, p.y, DATA_DOT_R);
    return b.detach();
  }, [showDataDots, points]);

  return (
    <Canvas style={canvasStyle}>
      {ruleYs.map((y) => (
        <Line
          key={`rule-${y}`}
          p1={vec(CHART_LEFT_PAD, y)}
          p2={vec(chartRightX, y)}
          color={colors.textSecondary}
          opacity={0.35}
          strokeWidth={StyleSheet.hairlineWidth}
        />
      ))}
      {tickXs.map((x) => (
        <Line
          key={`tick-${x}`}
          p1={vec(x, plotBottom)}
          p2={vec(x, plotBottom + TICK_MARK)}
          color={colors.textSecondary}
          opacity={0.6}
          strokeWidth={StyleSheet.hairlineWidth}
        />
      ))}
      {referenceY != null ? (
        <Line
          p1={vec(CHART_LEFT_PAD, referenceY)}
          p2={vec(chartRightX, referenceY)}
          color={colors.textSecondary}
          opacity={0.6}
          strokeWidth={StyleSheet.hairlineWidth}
        >
          <DashPathEffect intervals={[3, 3]} />
        </Line>
      ) : null}
      {seriesPaths.map((sp, i) => (
        <Path
          key={`series-${i}`}
          path={sp.path}
          style="stroke"
          strokeWidth={STROKE_WIDTH}
          strokeJoin="round"
          strokeCap="round"
          color={sp.color}
          start={0}
          end={progress}
        />
      ))}
      <Line
        p1={crosshairP1}
        p2={crosshairP2}
        color={colors.textEmphasis}
        opacity={crosshairOpacity}
        strokeWidth={StyleSheet.hairlineWidth}
      />
      {dotsPath ? <Path path={dotsPath} color={colors.textEmphasis} /> : null}
      {annotations?.map((a, i) => {
        const pt = points[a.atIndex];
        if (!pt) return null;
        return (
          <Line
            key={`ann-leader-${i}`}
            p1={vec(pt.x, LABEL_ROW_HEIGHT + 2)}
            p2={vec(pt.x, pt.y - EVENT_DOT_R - 1)}
            color={colors.accent}
            opacity={0.55}
            strokeWidth={StyleSheet.hairlineWidth}
          />
        );
      })}
      {annotations?.map((a, i) => {
        const pt = points[a.atIndex];
        if (!pt) return null;
        return (
          <Circle key={`ann-dot-${i}`} cx={pt.x} cy={pt.y} r={EVENT_DOT_R} color={colors.accent} />
        );
      })}
      <Circle cx={activeCx} cy={activeCy} r={ENDPOINT_RING_R} color={colors.accent} opacity={0.2} />
      <Circle cx={activeCx} cy={activeCy} r={ENDPOINT_DOT_R} color={colors.textEmphasis} />
    </Canvas>
  );
});

/**
 * The number over the finger while a chart is scrubbed.
 *
 * Its own component so a scrub re-renders only this: the index lives in state
 * here, and the chart, its axis labels, legend and annotation labels around it
 * stay as they were. When the index lived on `TrendBlock`, every step along the
 * line re-rendered the whole block.
 */
const ScrubReadout = memo(function ScrubReadout({
  scrubIdx,
  points,
  width,
  series: normalizedSeries,
  primaryValues,
  periods,
  unit,
  cited,
  moveSince,
  ground,
}: {
  scrubIdx: SharedValue<number>;
  points: Pt[];
  width: number;
  series: TrendSeries[];
  primaryValues: number[];
  periods?: string[];
  unit?: string;
  /** The points a cited story sits on — the only steps that tick. */
  cited: ReadonlySet<number>;
  moveSince?: (index: number) => CardDelta | undefined;
  /** The sheet's ground, behind the readout: it stands over the plot's top,
   *  where the line is at its highest. */
  ground: string;
}) {
  const [scrubIdxJs, setScrubIdxJs] = useState<number>(-1);

  // One hop per change, carrying both effects. Two `scheduleOnRN` calls meant
  // the label and the tick were queued as separate JS tasks and could land on
  // different frames; bundling them keeps the notch and the readout together.
  const applyScrub = useCallback(
    (idx: number, grabbed: boolean) => {
      setScrubIdxJs(idx);
      if (grabbed || cited.has(idx)) hapticTick();
    },
    [cited],
  );

  useAnimatedReaction(
    () => scrubIdx.value,
    (current, prev) => {
      if (current === prev) return;
      // Tick on grab (prev < 0) — landing on the chart is the moment the
      // scrub becomes real, and going silent there made the first contact
      // feel unregistered — and on a cited story's point, where the finger
      // has found something. Not on every point between: a dense series
      // crossed one a frame, a 60–120 Hz buzz that told the hand nothing.
      // Release (current < 0) stays silent: letting go is its own signal.
      if (current < 0) scheduleOnRN(applyScrub, current, false);
      else scheduleOnRN(applyScrub, current, prev == null || prev < 0);
    },
  );

  const scrubInfo = (() => {
    if (scrubIdxJs < 0) return null;
    const v = primaryValues[scrubIdxJs];
    if (v === undefined) return null;
    // The source's precision, the web chart's rule (`shared/chart/series.ts`).
    const decimals = Math.min(dataDecimals(primaryValues), 4);
    // Multi-series readout: stack labels in the value field if more than one.
    const lines =
      normalizedSeries.length > 1
        ? normalizedSeries
            .map((s) => {
              const sv = s.values[scrubIdxJs];
              if (sv === undefined) return null;
              return `${s.label}: ${formatBlockNumber(sv, unit, decimals)}`;
            })
            .filter((l): l is string => l !== null)
            .join('\n')
        : formatBlockNumber(v, unit, decimals);
    return {
      idx: scrubIdxJs,
      value: lines,
      period: periods?.[scrubIdxJs] ?? '',
      // What a reader holding a day wants next: how far it has come since.
      move: moveSince?.(scrubIdxJs),
    };
  })();

  // Scrub box dimensions scale with series count — single series fits a tight
  // 96×30 popover, but multi-series stacks one value line per series and
  // would clip without a taller box. Width also widens slightly so each
  // "Series: value" line stays on one line.
  // The move's line is the widest a single series prints (`0.50 points
  // since`), so a chart that reads one takes the wider box at every stop.
  const scrubW =
    normalizedSeries.length > 1 || moveSince ? SCRUB_LABEL_W_MULTI : SCRUB_LABEL_W_SINGLE;
  const scrubH =
    SCRUB_PERIOD_LINE_H +
    SCRUB_VALUE_LINE_H * Math.max(1, normalizedSeries.length) +
    (scrubInfo?.move ? SCRUB_MOVE_LINE_H : 0);
  const scrubPt = scrubInfo ? points[scrubInfo.idx] : null;
  const scrubLeft = scrubPt ? Math.max(0, Math.min(width - scrubW, scrubPt.x - scrubW / 2)) : 0;

  if (!scrubInfo) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.scrubLabel,
        { left: scrubLeft, width: scrubW, height: scrubH, backgroundColor: ground },
      ]}
    >
      {/* Scrub readout: regular + sizeSm + oldstyle+tabular nums
                      + emphasis color. No exact variant — caption (regular +
                      sizeSm + secondary) + tone="emphasis" + fontVariant. */}
      <Text
        variant="caption"
        tone="emphasis"
        numberOfLines={normalizedSeries.length}
        style={styles.scrubValue}
      >
        {scrubInfo.value}
      </Text>
      <Text variant="labelXs" numberOfLines={1} style={styles.scrubPeriod}>
        {scrubInfo.period.toUpperCase()}
      </Text>
      {scrubInfo.move ? <DeltaChip delta={scrubInfo.move} scale={1} /> : null}
    </View>
  );
});

interface TrendBlockProps {
  /** Keep the accessible chart name when nearby text already names its unit. */
  showLabel?: boolean;
  values?: number[];
  series?: TrendSeries[];
  label: string;
  unit?: string;
  periods?: string[];
  highlight?: TrendHighlight;
  annotations?: TrendAnnotation[];
  reference?: TrendReference;
  /** `steps` for a value that holds until it is changed (`trendLineVertices`). */
  shape?: TrendShape;
  /** The quantity's own scale, where it has one: a chance's 0 to 100. Its
   *  ends and its middle are then the rules, in place of the series' own
   *  highest and lowest. */
  domain?: readonly [number, number];
  /** Turn the scale over: a rate per dollar, drawn so up is a stronger
   *  currency. The numbers stay the rate's. */
  inverted?: boolean;
  /** The move from an observation to the newest, for the scrub's readout. */
  moveSince?: (index: number) => CardDelta | undefined;
  /** A card's or a sheet's chart (`context`), or the line alone under a
   *  story's prose (`inline`). */
  variant: BlockVariant;
  onPress?: () => void;
  /**
   * Whether dragging across the chart scrubs it.
   *
   * On by default, and off on a card. A card lives inside a horizontal pager
   * and the app's one navigational rule is that you move by swiping left and
   * right — a scrubber spanning most of the screen swallows that swipe, and
   * the reader is stuck on Bitcoin dragging a dot along a line they did not
   * ask to interrogate. Inside a sheet there is no pager to compete with, so
   * scrubbing stays where it has always been.
   */
  scrubbable?: boolean;
}

/** A day is "on Sep 20"; a month, year or quarter is "in Sep", "in 2024".
 *  The spoken summary said "3.1 a day in Sep 20" on every daily series. */
function periodPreposition(period: string): 'on' | 'in' {
  return /^[A-Za-z]{3,9}\.? \d{1,2}$/.test(period.trim()) ? 'on' : 'in';
}

export const TrendBlock = memo(function TrendBlock({
  showLabel = true,
  values,
  series,
  label,
  unit,
  periods,
  highlight,
  annotations,
  reference,
  shape,
  domain,
  inverted = false,
  moveSince,
  variant,
  onPress,
  scrubbable = true,
}: TrendBlockProps) {
  const { colors, font } = useTheme();
  const isInline = variant === 'inline';
  const height = CHART_HEIGHT[variant];
  const insets = isInline ? INLINE_INSETS : AXIS_INSETS;

  // Normalize to an array of series. If `series` is provided, use it (capped
  // at MAX_SERIES). Otherwise wrap `values` in a single-series array. Empty
  // result is handled below by short-circuiting the render.
  const normalizedSeries: TrendSeries[] = useMemo(() => {
    if (series && series.length > 0) {
      return series.slice(0, MAX_SERIES);
    }
    if (values && values.length > 0) {
      return [{ values, label, highlight }];
    }
    return [];
  }, [series, values, label, highlight]);

  const primary = normalizedSeries[0];
  const primaryValues = primary?.values ?? [];
  const primaryHighlight = primary?.highlight ?? highlight;

  const defaultHighlightIdx = useMemo(
    () => resolveHighlightIndex(primaryValues, primaryHighlight),
    [primaryValues, primaryHighlight],
  );
  // The range the height stands for, over everything drawn: each line, and
  // the level a rule marks.
  const scale = useMemo(() => {
    const flat: number[] = [];
    for (const s of normalizedSeries) flat.push(...s.values);
    if (reference) flat.push(reference.value);
    return chartScale({ values: flat, unit, domain });
  }, [normalizedSeries, reference, unit, domain]);
  const { min, max } = scale;

  const progress = useChartDrawProgress();

  const { width: windowWidth } = useWindowDimensions();
  // Match the article column on the first paint; onLayout supplies the exact
  // measured width after layout settles.
  const [width, setWidth] = useState(() => windowWidth - SPACING.articlePadding * 2);

  const xLayout = useMemo(
    () =>
      buildTrendXLayout({
        periods,
        seriesLengths: normalizedSeries.map((item) => item.values.length),
        left: CHART_LEFT_PAD,
        right: width - insets.right,
      }),
    [periods, normalizedSeries, width, insets],
  );

  const yScale = useMemo(
    () => trendYScale(scale.lo, scale.hi, insets.top, height - insets.bottom, inverted),
    [scale, insets, height, inverted],
  );

  // The scale's rules and the numbers beside them. A quantity with a scale of
  // its own is named by its ends and its middle; any other by the highest and
  // lowest value drawn, each at its own height. Two that fall within a label
  // of each other part around their middle (`partLabels`).
  const rules = useMemo(() => {
    // A level series has one extreme, and one rule.
    const levels = domain
      ? [scale.hi, (scale.lo + scale.hi) / 2, scale.lo]
      : max === min
        ? [max]
        : [max, min];
    const marks = levels.map((level) => ({
      y: yScale(level),
      text: formatBlockNumber(level, unit).replace(' ', '\n'),
    }));
    const [first, second] = marks;
    if (marks.length !== 2 || !first || !second) {
      return marks.map((mark) => ({ ...mark, centre: mark.y }));
    }
    const rows = first.text.includes('\n') || second.text.includes('\n') ? 2 : 1;
    const flipped = first.y > second.y;
    const [upper, lower] = partLabels(
      Math.min(first.y, second.y),
      Math.max(first.y, second.y),
      rows * LABEL_ROW_HEIGHT,
      0,
      height,
    );
    return [
      { ...first, centre: flipped ? lower : upper },
      { ...second, centre: flipped ? upper : lower },
    ];
  }, [domain, scale, max, min, yScale, unit, height]);
  const ruleYs = useMemo(() => rules.map((rule) => rule.y), [rules]);

  // The primary series on the canvas: the scrub stops, the cited marks and
  // the crosshair's anchor — a multi-series scrub reads every series out, but
  // the dot lands on the first. And where the reference rule lands, for its
  // label.
  const { points, referenceY } = useMemo<{ points: Pt[]; referenceY: number | null }>(() => {
    if (width <= 0 || primaryValues.length === 0) return { points: [], referenceY: null };
    return {
      points: primaryValues.map((v, i) => ({
        x: xLayout.positions[i] ?? CHART_LEFT_PAD,
        y: yScale(v),
      })),
      referenceY: reference ? yScale(reference.value) : null,
    };
  }, [primaryValues, xLayout.positions, width, yScale, reference]);

  const citedPoints = useMemo(
    () => new Set((annotations ?? []).map((a) => a.atIndex)),
    [annotations],
  );

  // One label per crowd of cited marks (`citedLabels`): neighbouring days'
  // numbers printed edge to edge read as one number.
  const annotationLabels = useMemo(() => {
    if (!annotations?.length) return [];
    const marks: { x: number; label: string }[] = [];
    for (const a of annotations) {
      const pt = points[a.atIndex];
      if (pt) marks.push({ x: pt.x, label: a.label });
    }
    return citedLabels(marks, REFERENCE_LABEL_CHAR_WIDTH, ANNOTATION_LABEL_GAP);
  }, [annotations, points]);

  // Where the reference label sits on its line: the first stretch, from the
  // left, that the series leaves clear for a label-wide band — above the line
  // by preference, below it otherwise. Pinned to the left end, "NORMAL 10.2"
  // printed straight across the curve of a disrupted strait whose normal sits
  // under its early peak.
  const referenceLabelPos = useMemo(() => {
    if (referenceY == null || !reference) return { left: CHART_LEFT_PAD, top: 0 };
    const text = `${reference.label} ${formatBlockNumber(reference.value)}`;
    const aboveTop = Math.max(0, referenceY - LABEL_ROW_HEIGHT);
    const spot = clearLabelSpot({
      lines: [trendLineVertices(points, shape)],
      ruleY: referenceY,
      labelWidth: text.length * REFERENCE_LABEL_CHAR_WIDTH,
      labelHeight: LABEL_ROW_HEIGHT,
      minLeft: CHART_LEFT_PAD,
      maxRight: width - insets.right,
      step: REFERENCE_LABEL_STEP,
    });
    if (!spot) return { left: CHART_LEFT_PAD, top: aboveTop };
    return {
      left: spot.left,
      top: spot.above ? aboveTop : Math.min(referenceY + 2, height - LABEL_ROW_HEIGHT),
    };
  }, [points, shape, reference, referenceY, width, height, insets]);

  const scrubIdx = useSharedValue(-1);
  const timeTicks: TrendTimeTick[] | null = xLayout.ticks;
  const tickXs = useMemo(() => (timeTicks ?? []).map((tick) => tick.x), [timeTicks]);

  const panConfig = useMemo((): PanGestureConfig => {
    const pointsX = points.map((p) => p.x);
    // The nearest point to the finger, on touch-down and as it moves.
    const scrubTo = (e: { x: number }) => {
      'worklet';
      if (pointsX.length === 0) return;
      scrubIdx.value = nearestIndex(pointsX, e.x);
    };
    return {
      // Disabled rather than unmounted: the detector stays in the tree so the
      // chart's layout is identical either way, and the horizontal drag falls
      // straight through to whatever owns the page.
      enabled: scrubbable,
      activeOffsetX: [-5, 5],
      failOffsetY: [-10, 10],
      onActivate: scrubTo,
      onUpdate: scrubTo,
      onFinalize: () => {
        'worklet';
        scrubIdx.value = -1;
      },
    };
  }, [points, scrubIdx, scrubbable]);
  const pan = usePanGesture(panConfig);

  const firstPeriod = periods?.[0];
  const lastPeriod = periods?.[periods.length - 1];

  const highlightValue = primaryValues[defaultHighlightIdx];
  const highlightPeriod = periods?.[defaultHighlightIdx];
  const referenceText = reference
    ? `${reference.label} ${formatBlockNumber(reference.value, unit)}`
    : null;
  const a11yLabel =
    highlightValue !== undefined
      ? `${label}, ${formatBlockNumber(highlightValue, unit)}${highlightPeriod ? ` ${periodPreposition(highlightPeriod)} ${highlightPeriod}` : ''}, range ${formatBlockNumber(min, unit)} to ${formatBlockNumber(max, unit)}${referenceText ? `, ${referenceText}` : ''}`
      : label;

  if (normalizedSeries.length === 0) return null;

  // Multi-series legend rendered above the chart, below the label. Keeps
  // the inline color → series mapping discoverable without an axis legend.
  const legend =
    normalizedSeries.length > 1
      ? normalizedSeries.map((s, i) => ({
          label: s.label,
          color: seriesColor(i, colors),
        }))
      : null;

  const inner = (
    <View style={blockContainerStyle[variant]}>
      {/* The caption is in the axis furniture's own register. At `labelSm`
          it was the second-largest small-caps thing on a card — bigger than
          the kicker, the ticks and the source — and it sat directly under the
          title, where it read as a subtitle rather than as "what this axis
          measures". */}
      {isInline || !showLabel ? null : (
        <Text variant="labelXs" numberOfLines={2} style={styles.label}>
          {label}
        </Text>
      )}

      {legend ? (
        <View style={styles.legendRow}>
          {legend.map((l, i) => (
            <View key={`${l.label}-${i}`} style={styles.legendItem}>
              <View style={[blockSharedStyles.swatch, { backgroundColor: l.color }]} />
              <Text variant="labelXs" tone="secondary" numberOfLines={1}>
                {l.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <GestureDetector gesture={pan}>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[blockSharedStyles.chartWrap, { height }]}
        >
          {width > 0 ? (
            <>
              <Chart
                series={normalizedSeries}
                shape={shape}
                yScale={yScale}
                ruleYs={ruleYs}
                points={points}
                referenceY={referenceY}
                width={width}
                height={height}
                defaultHighlightIdx={defaultHighlightIdx}
                progress={progress}
                scrubIdx={scrubIdx}
                colors={colors}
                annotations={annotations}
                xPositions={xLayout.positions}
                // Point markers communicate the scrub stops in interactive
                // charts. Card previews do not scrub, so mounting dozens of
                // Skia circles there adds cost and visual noise without
                // exposing any interaction or information the line lacks.
                showDataDots={scrubbable}
                tickXs={tickXs}
                insets={insets}
              />
              {annotationLabels.map((a) => {
                const LABEL_W = 72;
                const leftClamped = Math.max(0, Math.min(width - LABEL_W, a.x - LABEL_W / 2));
                return (
                  <View
                    key={`ann-label-${a.label}`}
                    pointerEvents="none"
                    style={[
                      styles.annotationLabelWrap,
                      { left: leftClamped, top: 0, width: LABEL_W, height: LABEL_ROW_HEIGHT },
                    ]}
                  >
                    <Text
                      variant="labelXs"
                      tone="accent"
                      numberOfLines={1}
                      style={styles.annotationLabelText}
                    >
                      {a.label}
                    </Text>
                  </View>
                );
              })}
              <ScrubReadout
                scrubIdx={scrubIdx}
                points={points}
                width={width}
                series={normalizedSeries}
                primaryValues={primaryValues}
                periods={periods}
                unit={unit}
                cited={citedPoints}
                moveSince={moveSince}
                ground={colors.sheetBg}
              />
              {/* Both boxes are two `LABEL_ROW_HEIGHT` rows tall, which is
                  what the label needs when its unit wraps ("4,599.4" over
                  "$/oz"). `tabular` leads at 1.55 though — 17pt a line, 34pt
                  for two — so the second line overflowed a 28pt box and the
                  chart clipped it through the middle of the glyphs. Setting
                  the leading to the row height the box was built from is the
                  whole fix; 11pt over 14pt is tighter than body text and
                  looser than `leadingTight`, which is the right register for
                  two stacked axis labels. `numberOfLines` caps it so no unit
                  can ever reach a third line and clip again. */}
              {isInline || !showLabel
                ? null
                : rules.map((rule) => (
                    <View
                      key={`rule-label-${rule.y}`}
                      pointerEvents="none"
                      style={[styles.yAxis, { top: rule.centre - LABEL_ROW_HEIGHT }]}
                    >
                      <Text
                        variant="tabular"
                        tone="secondary"
                        numberOfLines={2}
                        style={styles.yAxisText}
                      >
                        {rule.text}
                      </Text>
                    </View>
                  ))}
              {/* On the line, at its left end, rather than in the right gutter:
                  a disrupted strait's normal sits near the top of its own
                  range, exactly where the max label already is, and a label
                  that hides when it matters is not a label. Clamped so a
                  reference at the very top still prints. */}
              {reference && referenceY != null ? (
                // Backed with the sheet's ground: where no stretch of the rule
                // is clear (Brent's line crosses its Aug 3 level all the way
                // along), the least-crossed spot still sits on the line, and
                // "88.9" printed through it. Over clear space it is invisible.
                <View
                  pointerEvents="none"
                  style={[
                    styles.referenceLabelWrap,
                    referenceLabelPos,
                    { backgroundColor: colors.sheetBg },
                  ]}
                >
                  <Text
                    variant="labelXs"
                    tone="secondary"
                    numberOfLines={1}
                    style={styles.referenceLabelText}
                  >
                    {`${reference.label} ${formatBlockNumber(reference.value)}`}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </GestureDetector>

      {/* The time axis, under a story's line as under a card's. The inline
          chart had none, and its header reads `▲9.6% over 7 days`: a reader
          took the line for that week when it ran eleven. */}
      {timeTicks ? (
        <View style={styles.timeAxisRow}>
          {timeTicks.map((t, i) => (
            <Text
              key={`tick-${i}`}
              variant="labelXs"
              tone="secondary"
              style={[
                styles.timeAxisTick,
                {
                  left: Math.max(0, Math.min(width - 60, t.x - 30)),
                },
                font.regular,
              ]}
            >
              {t.label}
            </Text>
          ))}
        </View>
      ) : firstPeriod || lastPeriod ? (
        <View style={styles.xAxisRow}>
          <Text variant="labelXs" style={[styles.xAxisLabel, font.regular]}>
            {firstPeriod ? firstPeriod.toUpperCase() : ''}
          </Text>
          <Text variant="labelXs" style={[styles.xAxisLabel, styles.xAxisLabelEnd, font.regular]}>
            {lastPeriod ? lastPeriod.toUpperCase() : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={a11yLabel}>
        {inner}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11yLabel}>
      {inner}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // `sm`, not `xs`: the multi-series legend can sit directly beneath this
  // label, so the extra breathing room keeps the label from crowding the
  // legend row.
  label: {
    marginBottom: SPACING.sm,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
  },
  // Two label rows tall and centred on its rule, which is what a number over
  // its unit needs.
  yAxis: {
    position: 'absolute',
    right: 0,
    width: CHART_RIGHT_PAD,
    height: LABEL_ROW_HEIGHT * 2,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
  },
  yAxisText: {
    // Constrain the text itself: Android otherwise lets an unbroken number
    // overflow this flex-end container instead of wrapping its unit.
    width: '100%',
    lineHeight: LABEL_ROW_HEIGHT,
    textAlign: 'right',
  },
  annotationLabelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceLabelWrap: {
    position: 'absolute',
    left: CHART_LEFT_PAD,
    height: LABEL_ROW_HEIGHT,
    justifyContent: 'center',
    // A little ground either side of the backing, without moving the text.
    paddingHorizontal: 2,
    marginLeft: -2,
  },
  referenceLabelText: {
    lineHeight: LABEL_ROW_HEIGHT,
  },
  annotationLabelText: {
    textAlign: 'center',
    lineHeight: LABEL_ROW_HEIGHT,
  },
  scrubLabel: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  scrubValue: {
    textAlign: 'center',
    fontVariant: ['oldstyle-nums'],
  },
  scrubPeriod: {
    textAlign: 'center',
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  xAxisLabel: {
    flex: 1,
  },
  xAxisLabelEnd: {
    textAlign: 'right',
  },
  timeAxisRow: {
    position: 'relative',
    height: LABEL_ROW_HEIGHT,
    marginTop: SPACING.xs,
  },
  timeAxisTick: {
    position: 'absolute',
    width: 60,
    textAlign: 'center',
  },
});
