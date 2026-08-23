import type { TrendAnnotation, TrendBand, TrendHighlight, TrendSeries } from '@shared/types';
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
import { extent } from 'd3-array';
import { scaleLinear, scaleLog } from 'd3-scale';
import { curveMonotoneX, area as d3Area, line as d3Line } from 'd3-shape';
import { memo, useCallback, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
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
import { SPACING, toneColor } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { hapticTick } from '../../lib/haptics';
import type { Valence } from '../../lib/valence';
import { Pressable, Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import {
  axisDecimals,
  type BlockVariant,
  blockContainerStyle,
  blockSharedStyles,
  formatBlockNumber,
  useChartDrawProgress,
} from './shared';

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

type Pt = { x: number; y: number };

const CHART_HEIGHT = { article: 180, context: 148 } as const;
const STROKE_WIDTH = 1.5;
// 2.5, against a 1.5pt stroke. At 2 the dot extended a quarter of a point past
// the line and was invisible — which was survivable while every observation
// carried one and the marks were noise anyway, and is not now that they only
// appear on a series short enough for each reading to be worth pointing at.
// The six-point ceasefire contract is the case: `curveMonotoneX` draws it as
// one continuous swoop, and the beads are the only thing on screen saying
// which parts of it were measured.
const DATA_DOT_R = 2.5;
const EVENT_DOT_R = 4;
const ENDPOINT_DOT_R = 4;
const ENDPOINT_RING_R = 8;
const LABEL_ROW_HEIGHT = 14;
const CHART_TOP_PAD = LABEL_ROW_HEIGHT + 10;
const CHART_BOTTOM_PAD = 14;
// 56, not 44. This is both the plot's right inset and the width of the box the
// range labels live in, and 44 could not hold one: "$78,317.8" is a single
// token with nowhere to break, so it simply ran off the edge, and "4,599.4
// $/oz" wrapped to a second line the box then clipped through the middle of
// the glyphs. 56 fits the widest label the live payloads produce on one line
// (a seven-figure currency reading) and costs ~4% of the plot width.
const CHART_RIGHT_PAD = 56;
const CHART_LEFT_PAD = 2;
const MAX_SERIES = 3;
const SCRUB_LABEL_W_SINGLE = 96;
const SCRUB_LABEL_W_MULTI = 132;
const SCRUB_VALUE_LINE_H = 16;
const SCRUB_PERIOD_LINE_H = 14;

/**
 * Above this many observations, the per-point dots come off.
 *
 * A dot per observation is a mark that says *this is a reading someone took* —
 * true and worth drawing on the six-point ceasefire contract, where the curve
 * between them is interpolation and the reader should be able to see which
 * parts are data. On Brent's sixty-one it drew sixty-one 4pt discs along a
 * 1.5pt stroke and the line came out looking like a caterpillar: the marks
 * stopped distinguishing anything, because everything was marked. No chart a
 * reader has ever used dots a daily price series, which is the other half of
 * the reason.
 *
 * Fourteen is a fortnight of daily readings, or a year of monthly ones.
 */
const DOT_LIMIT = 14;

/** How dark the fill between the line and its reference gets. Low enough to
 *  read as weight rather than as a second mark, which matters because it is
 *  the app's own tone colour and the chromatic budget is small. */
const AREA_OPACITY = 0.14;

/** The reference line: 3 on, 3 off, at half the line's own strength. Dashed
 *  because it is not data — it is where the data started. */
const BASELINE_DASH = 3;
const BASELINE_OPACITY = 0.55;

/** The box one x-axis tick label is laid out in. Wide enough for the longest
 *  period the pipeline emits ("AUG 2024"); the boxes are positioned, not
 *  flexed, so this only has to be wide enough not to clip. */
const TICK_W = 64;

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

interface ChartProps {
  series: TrendSeries[];
  band?: TrendBand;
  width: number;
  height: number;
  defaultHighlightIdx: number;
  progress: SharedValue<number>;
  scrubIdx: SharedValue<number>;
  colors: ReturnType<typeof useTheme>['colors'];
  annotations?: TrendAnnotation[];
  scale: 'linear' | 'log';
  /** The primary series' own colour — the card's valence, or the default ink
   *  where the surface has no claim to make. Resolved by the parent so the
   *  legend cannot disagree with the line. */
  lineColor: string;
  /** The level the reading is measured from, already narrowed to single-series
   *  charts by the parent. Drives the dashed rule and the fill. */
  baseline?: number;
}

// Memoized: an active scrub gesture re-renders the parent TrendBlock on every
// pointer move (to update the JS-side scrub readout), but Chart's own props are
// stable across those renders (normalizedSeries/defaultHighlightIdx are
// memoized, progress/scrubIdx are shared values, colors is theme-stable). Memo
// lets the whole Skia canvas subtree skip reconciliation during a scrub.
const Chart = memo(function Chart({
  series,
  band,
  width,
  height,
  defaultHighlightIdx,
  progress,
  scrubIdx,
  colors,
  annotations,
  scale,
  lineColor,
  baseline,
}: ChartProps) {
  const { seriesPaths, bandPath, areaPath, baselineY, points, minY, maxY } = useMemo(() => {
    const flat: number[] = [];
    for (const s of series) flat.push(...s.values);
    if (band) {
      flat.push(...band.low, ...band.high);
    }
    // The reference joins the domain rather than being clamped into it. A
    // level the chart cannot show is worse than a slightly roomier axis: it
    // would sit on the floor or the ceiling and read as an extreme of the
    // series, which is a claim nobody made. By construction it is a level this
    // series has occupied, so in practice it costs nothing.
    if (baseline !== undefined && Number.isFinite(baseline)) flat.push(baseline);
    const [eMin, eMax] = extent(flat) as [number, number];
    const safeMin = eMin ?? 0;
    const safeMax = eMax ?? 1;
    const innerTop = CHART_TOP_PAD;
    const innerBottom = height - CHART_BOTTOM_PAD;
    const yDomain: [number, number] =
      scale === 'log' && safeMin > 0
        ? [safeMin, safeMax === safeMin ? safeMin * 10 : safeMax]
        : [safeMin, safeMax === safeMin ? safeMin + 1 : safeMax];
    const yScale =
      scale === 'log' && yDomain[0] > 0
        ? scaleLog().domain(yDomain).range([innerBottom, innerTop])
        : scaleLinear().domain(yDomain).range([innerBottom, innerTop]);

    const innerLeft = CHART_LEFT_PAD;
    const innerRight = width - CHART_RIGHT_PAD;
    const longest = series.reduce((m, s) => Math.max(m, s.values.length), 0);
    const xFor = (i: number) =>
      longest <= 1 ? innerLeft : innerLeft + (i / (longest - 1)) * (innerRight - innerLeft);

    const lineGen = d3Line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveMonotoneX);

    const seriesPaths: { path: SkPath; color: string }[] = series.map((s, sIdx) => {
      const pts = s.values.map((v, i) => ({ x: xFor(i), y: yScale(v) }));
      const d = lineGen(pts) ?? '';
      const path = Skia.Path.MakeFromSVGString(d) ?? Skia.PathBuilder.Make().detach();
      const color = sIdx === 0 ? lineColor : sIdx === 1 ? colors.accent : colors.textSecondary;
      return { path, color };
    });

    let bandPath: SkPath | null = null;
    if (band) {
      const areaGen = d3Area<{ idx: number; lo: number; hi: number }>()
        .x((d) => xFor(d.idx))
        .y0((d) => yScale(d.lo))
        .y1((d) => yScale(d.hi))
        .curve(curveMonotoneX);
      const bandPts = band.low.map((lo, i) => ({ idx: i, lo, hi: band.high[i] ?? lo }));
      const d = areaGen(bandPts) ?? '';
      bandPath = Skia.Path.MakeFromSVGString(d) ?? Skia.PathBuilder.Make().detach();
    }

    // Use the FIRST series for scrub dots / data ticks; multi-series scrub
    // shows all readouts in the readout label, but the crosshair anchors on
    // the primary series so the highlight dot lands somewhere meaningful.
    const primary = series[0];
    const points = (primary?.values ?? []).map((v, i) => ({ x: xFor(i), y: yScale(v) }));

    // The distance from the reference, as an area rather than a subtraction.
    //
    // This is the half of the chart that answers the question the card asks —
    // *what did it do since then* — without the reader measuring anything. The
    // fill flips sides on its own wherever the line crosses back, which is why
    // it is one path with the reference as `y0` rather than two clipped
    // halves: a series that spent the window below its opening and came back
    // draws both, in the right places, from the same generator.
    let areaPath: SkPath | null = null;
    let baselineY: number | null = null;
    if (baseline !== undefined && Number.isFinite(baseline) && points.length > 1) {
      baselineY = yScale(baseline);
      const refY = baselineY;
      const areaGen = d3Area<{ x: number; y: number }>()
        .x((d) => d.x)
        .y0(refY)
        .y1((d) => d.y)
        .curve(curveMonotoneX);
      const d = areaGen(points) ?? '';
      areaPath = Skia.Path.MakeFromSVGString(d);
    }

    return {
      seriesPaths,
      bandPath,
      areaPath,
      baselineY,
      points,
      minY: yScale(safeMin),
      maxY: yScale(safeMax),
    };
  }, [series, band, width, height, scale, colors, lineColor, baseline]);

  // The fill arrives with the line rather than before it. `start`/`end` trims a
  // path's contour, which is what draws a stroke on — on a closed area it
  // would peel the shape open instead, so this rides the same progress as an
  // opacity.
  const areaOpacity = useDerivedValue(() => progress.value * AREA_OPACITY);

  const chartRightX = width - CHART_RIGHT_PAD;

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
    return vec(x, CHART_TOP_PAD);
  });
  const crosshairP2 = useDerivedValue(() => {
    const idx = scrubIdx.value;
    const x = idx >= 0 ? (points[idx]?.x ?? 0) : 0;
    return vec(x, height - CHART_BOTTOM_PAD);
  });

  const canvasStyle = useMemo(() => ({ width, height }), [width, height]);

  return (
    <Canvas style={canvasStyle}>
      {bandPath ? (
        <Path
          path={bandPath}
          color={colors.textEmphasis}
          opacity={0.07}
          style="fill"
          start={0}
          end={progress}
        />
      ) : null}
      <Line
        p1={vec(CHART_LEFT_PAD, maxY)}
        p2={vec(chartRightX, maxY)}
        color={colors.textSecondary}
        opacity={0.35}
        strokeWidth={StyleSheet.hairlineWidth}
      />
      <Line
        p1={vec(CHART_LEFT_PAD, minY)}
        p2={vec(chartRightX, minY)}
        color={colors.textSecondary}
        opacity={0.35}
        strokeWidth={StyleSheet.hairlineWidth}
      />
      {areaPath ? (
        <Path path={areaPath} color={lineColor} opacity={areaOpacity} style="fill" />
      ) : null}
      {baselineY !== null ? (
        <Line
          p1={vec(CHART_LEFT_PAD, baselineY)}
          p2={vec(chartRightX, baselineY)}
          color={lineColor}
          opacity={BASELINE_OPACITY}
          strokeWidth={1}
        >
          <DashPathEffect intervals={[BASELINE_DASH, BASELINE_DASH]} />
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
      {points.length <= DOT_LIMIT
        ? points.map((p, i) => (
            <Circle key={`tick-${i}`} cx={p.x} cy={p.y} r={DATA_DOT_R} color={lineColor} />
          ))
        : null}
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
      {/* The end of the line, in the line's own colour.
          It was `colors.accent` — dome gold, the globe's hue — which made the
          last point read as a callout rather than as the end of the series,
          and put a gold marker directly beside the top range label. On the
          bitcoin card that pair ("$78,425" against a reading of $76,867) was
          sitting exactly where every stock app prints the current price. It is
          the same misuse of the accent `lib/valence.ts` records finding in
          `EntitySheet`, one component along. */}
      <Circle cx={activeCx} cy={activeCy} r={ENDPOINT_RING_R} color={lineColor} opacity={0.2} />
      <Circle cx={activeCx} cy={activeCy} r={ENDPOINT_DOT_R} color={lineColor} />
    </Canvas>
  );
});

interface TrendBlockProps {
  values?: number[];
  series?: TrendSeries[];
  label: string;
  unit?: string;
  periods?: string[];
  highlight?: TrendHighlight;
  annotations?: TrendAnnotation[];
  scale?: 'linear' | 'log';
  band?: TrendBand;
  variant?: BlockVariant;
  onPress?: () => void;
  sourceLabel?: string;
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
  /**
   * What the move this chart draws does to the person reading it.
   *
   * The app's stated rule is that every move is coloured (`lib/valence.ts`),
   * and this was the one surface that had dropped it: the 56×24 sparkline on
   * the column index took the chip's valence, and the 148pt chart the row
   * opened drew the same series in near-white. The glance-sized picture made
   * the claim and the read-it-properly one did not.
   *
   * The colour is the consequence, never the direction — a rose line can be
   * falling and a sage one rising, and on the FX cards it always is. Absent on
   * a sheet or an article, where the block has no card's chip to agree with;
   * absent on a multi-series chart, where one colour cannot belong to two
   * lines.
   */
  tone?: Valence;
  /**
   * The level the card's stated change is measured from — a dashed rule across
   * the plot with the distance from it filled in.
   *
   * See `CardSeries.baseline`. This is the "previous close" line of every
   * stock app, and it is what turns a percentage in the chip into something
   * the reader sees rather than takes on trust.
   */
  baseline?: number;
}

export const TrendBlock = memo(function TrendBlock({
  values,
  series,
  label,
  unit,
  periods,
  highlight,
  annotations,
  scale = 'linear',
  band,
  variant = 'article',
  onPress,
  sourceLabel,
  scrubbable = true,
  tone,
  baseline,
}: TrendBlockProps) {
  const { colors, font } = useTheme();
  const isContext = variant === 'context';
  const height = isContext ? CHART_HEIGHT.context : CHART_HEIGHT.article;

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
  // One reference, one line. Narrowed here rather than in `Chart` so the axis
  // labels, the hit-test scale and the canvas all read the same domain — three
  // places that compute the same y-scale and have to keep agreeing.
  const refLevel =
    normalizedSeries.length === 1 && baseline !== undefined && Number.isFinite(baseline)
      ? baseline
      : undefined;

  /**
   * The colour of the primary line.
   *
   * Single-series only: on two lines the first is already carrying "primary"
   * in `colors.textEmphasis` against the accent, and a valence would be
   * claiming that the *pair* moved one way. The legend below reads from the
   * same expression for the same reason.
   */
  const lineColor =
    normalizedSeries.length === 1 && tone
      ? (toneColor(tone, colors) ?? colors.textEmphasis)
      : colors.textEmphasis;

  const flatExtent = useMemo(() => {
    const flat: number[] = [];
    for (const s of normalizedSeries) flat.push(...s.values);
    if (band) flat.push(...band.low, ...band.high);
    if (refLevel !== undefined) flat.push(refLevel);
    return extent(flat) as [number, number];
  }, [normalizedSeries, band, refLevel]);
  const min = flatExtent[0] ?? 0;
  const max = flatExtent[1] ?? 0;
  // One precision for the whole chart — the two axis labels, the scrub readout
  // and the accessibility range. Derived from the endpoints rather than left
  // to each value, which is how `$2,515` came to sit directly above `$1,844.6`
  // on one axis while the card's own reading said `$2,418`.
  const decimals = useMemo(() => axisDecimals(min, max), [min, max]);

  const progress = useChartDrawProgress();

  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);

  // Compute primary-series points for hit testing (scrub).
  const points: Pt[] = useMemo(() => {
    if (width <= 0 || primaryValues.length === 0) return [];
    const innerTop = CHART_TOP_PAD;
    const innerBottom = height - CHART_BOTTOM_PAD;
    const innerLeft = CHART_LEFT_PAD;
    const innerRight = width - CHART_RIGHT_PAD;
    const yDomain: [number, number] =
      scale === 'log' && min > 0
        ? [min, max === min ? min * 10 : max]
        : [min, max === min ? min + 1 : max];
    const yScale =
      scale === 'log' && yDomain[0] > 0
        ? scaleLog().domain(yDomain).range([innerBottom, innerTop])
        : scaleLinear().domain(yDomain).range([innerBottom, innerTop]);
    const longest = normalizedSeries.reduce((m, s) => Math.max(m, s.values.length), 0);
    return primaryValues.map((v, i) => ({
      x: longest <= 1 ? innerLeft : innerLeft + (i / (longest - 1)) * (innerRight - innerLeft),
      y: yScale(v),
    }));
  }, [primaryValues, normalizedSeries, width, height, scale, min, max]);

  const scrubIdx = useSharedValue(-1);
  const [scrubIdxJs, setScrubIdxJs] = useState<number>(-1);

  // One hop per change, carrying both effects. Two `scheduleOnRN` calls meant
  // the label and the tick were queued as separate JS tasks and could land on
  // different frames; bundling them keeps the notch and the readout together.
  const applyScrub = useCallback((idx: number, haptic: boolean) => {
    setScrubIdxJs(idx);
    if (haptic) hapticTick();
  }, []);

  useAnimatedReaction(
    () => scrubIdx.value,
    (current, prev) => {
      if (current === prev) return;
      // Tick on grab (prev < 0) as well as on every step between points —
      // landing on the chart is the moment the scrub becomes real, and going
      // silent there made the first contact feel unregistered. Release
      // (current < 0) stays silent: letting go is its own signal.
      scheduleOnRN(applyScrub, current, current >= 0);
    },
  );

  /**
   * The x axis, taken from the period array by index rather than by parsing it
   * as a calendar.
   *
   * The old path parsed every period into a `Date`, built a `scaleTime`, and
   * asked d3 for four nice ticks. It has never once run in this app. Hermes
   * implements only ISO-ish date parsing, and every period string the pipeline
   * emits for an indicator is `"May 26"` or `"Aug 2024"` — both `Invalid Date`
   * on device, so the parse bailed and every chart in the app, in a card and
   * in a sheet alike, fell through to two endpoint labels. Nothing warned,
   * because the fallback is a reasonable-looking axis.
   *
   * Reading indices is better than fixing the parse, and not only because a
   * bare "May 26" has no year to fix it with. The plot's x scale is the
   * *index* — observation 30 of 61 sits at exactly half the width — while a
   * time scale spaces by calendar day, and a FRED series skips weekends. A
   * "JUL 1" tick placed by a time scale therefore lands a few points away from
   * the July 1 observation it names. A label taken from `periods[i]` and
   * placed at `x(i)` is under the reading it is naming, always, whatever
   * cadence or gaps the series has — and it needs no date library, no year
   * inference and no format rules, because the pipeline already wrote the
   * string a reader should see.
   */
  const axisTicks = useMemo(() => {
    const n = periods?.length ?? 0;
    const span = width - CHART_RIGHT_PAD - CHART_LEFT_PAD;
    if (!periods || n < 2 || span <= 0) return [];
    // One label per ~90pt of plot — four across a phone, which is the density
    // every chart a reader has used settles on. It also keeps a 64pt box clear
    // of its neighbours at the widest label the pipeline emits ("AUG 2024"),
    // which one per 75pt did not: five labels on a 307pt plot sit 61pt apart.
    // Never more labels than there are readings.
    const count = Math.max(2, Math.min(n, Math.floor(span / 90) + 1));
    const out: { label: string; x: number; align: 'start' | 'mid' | 'end' }[] = [];
    for (let j = 0; j < count; j++) {
      const i = Math.round((j * (n - 1)) / (count - 1));
      const label = periods[i];
      if (!label) continue;
      out.push({
        label: label.toUpperCase(),
        x: CHART_LEFT_PAD + (i / (n - 1)) * span,
        align: j === 0 ? 'start' : j === count - 1 ? 'end' : 'mid',
      });
    }
    return out;
  }, [periods, width]);

  const scrubInfo = (() => {
    if (scrubIdxJs < 0) return null;
    const v = primaryValues[scrubIdxJs];
    if (v === undefined) return null;
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
    };
  })();

  // Scrub box dimensions scale with series count — single series fits a tight
  // 96×30 popover, but multi-series stacks one value line per series and
  // would clip without a taller box. Width also widens slightly so each
  // "Series: value" line stays on one line.
  const scrubW = normalizedSeries.length > 1 ? SCRUB_LABEL_W_MULTI : SCRUB_LABEL_W_SINGLE;
  const scrubH = SCRUB_PERIOD_LINE_H + SCRUB_VALUE_LINE_H * Math.max(1, normalizedSeries.length);
  const scrubPt = scrubInfo ? points[scrubInfo.idx] : null;
  const scrubLeft = scrubPt ? Math.max(0, Math.min(width - scrubW, scrubPt.x - scrubW / 2)) : 0;

  const panConfig = useMemo<PanGestureConfig>(() => {
    const pointsX = points.map((p) => p.x);
    return {
      // Disabled rather than unmounted: the detector stays in the tree so the
      // chart's layout is identical either way, and the horizontal drag falls
      // straight through to whatever owns the page.
      enabled: scrubbable,
      activeOffsetX: [-5, 5],
      failOffsetY: [-10, 10],
      onActivate: (e) => {
        'worklet';
        if (pointsX.length === 0) return;
        let best = 0;
        let bestD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < pointsX.length; i++) {
          const d = Math.abs((pointsX[i] ?? 0) - e.x);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        scrubIdx.value = best;
      },
      onUpdate: (e) => {
        'worklet';
        if (pointsX.length === 0) return;
        let best = 0;
        let bestD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < pointsX.length; i++) {
          const d = Math.abs((pointsX[i] ?? 0) - e.x);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        scrubIdx.value = best;
      },
      onFinalize: () => {
        'worklet';
        scrubIdx.value = -1;
      },
    };
  }, [points, scrubIdx, scrubbable]);
  const pan = usePanGesture(panConfig);

  const highlightValue = primaryValues[defaultHighlightIdx];
  const highlightPeriod = periods?.[defaultHighlightIdx];
  const a11yLabel =
    highlightValue !== undefined
      ? `${label}, ${formatBlockNumber(highlightValue, unit, decimals)}${highlightPeriod ? ` in ${highlightPeriod}` : ''}, range ${formatBlockNumber(min, unit, decimals)} to ${formatBlockNumber(max, unit, decimals)}`
      : label;

  if (normalizedSeries.length === 0) return null;

  // Multi-series legend rendered above the chart, below the label. Keeps
  // the inline color → series mapping discoverable without an axis legend.
  const legend =
    normalizedSeries.length > 1
      ? normalizedSeries.map((s, i) => ({
          label: s.label,
          color: i === 0 ? lineColor : i === 1 ? colors.accent : colors.textSecondary,
        }))
      : null;

  const inner = (
    <View style={blockContainerStyle[variant]}>
      <Text variant="labelSm" numberOfLines={2} style={styles.label}>
        {label}
      </Text>

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
                band={band}
                width={width}
                height={height}
                defaultHighlightIdx={defaultHighlightIdx}
                progress={progress}
                scrubIdx={scrubIdx}
                colors={colors}
                annotations={annotations}
                scale={scale}
                lineColor={lineColor}
                baseline={refLevel}
              />
              {annotations?.map((a, i) => {
                const pt = points[a.atIndex];
                if (!pt) return null;
                const LABEL_W = 72;
                const leftClamped = Math.max(0, Math.min(width - LABEL_W, pt.x - LABEL_W / 2));
                return (
                  <View
                    key={`ann-label-${i}`}
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
              {scrubInfo ? (
                <View
                  pointerEvents="none"
                  style={[styles.scrubLabel, { left: scrubLeft, width: scrubW, height: scrubH }]}
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
                </View>
              ) : null}

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
              <View pointerEvents="none" style={[styles.yAxis, styles.yAxisMax]}>
                <Text variant="tabular" tone="secondary" numberOfLines={2} style={styles.yAxisText}>
                  {formatBlockNumber(max, unit, decimals)}
                </Text>
              </View>
              <View pointerEvents="none" style={[styles.yAxis, styles.yAxisMin]}>
                <Text variant="tabular" tone="secondary" numberOfLines={2} style={styles.yAxisText}>
                  {formatBlockNumber(min, unit, decimals)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </GestureDetector>

      {axisTicks.length > 0 ? (
        <View style={styles.timeAxisRow}>
          {/* The two end labels are anchored to the ends of the plot rather
              than centred on their ticks and clamped, which is what the old
              row did: a first tick at x = 2 was clamped to left = 0 and then
              centred inside a 60pt box, so the label sat 28pt to the right of
              the reading it named. An axis whose outermost labels are the only
              ones that lie is the wrong way round. */}
          {axisTicks.map((t, i) => (
            <Text
              key={`tick-${i}-${t.label}`}
              variant="labelXs"
              tone="secondary"
              numberOfLines={1}
              style={[
                styles.timeAxisTick,
                t.align === 'start'
                  ? { left: t.x, textAlign: 'left' }
                  : t.align === 'end'
                    ? { left: t.x - TICK_W, textAlign: 'right' }
                    : { left: t.x - TICK_W / 2, textAlign: 'center' },
                font.regular,
              ]}
            >
              {t.label}
            </Text>
          ))}
        </View>
      ) : null}

      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
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
    <Pressable
      haptic="impact"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      {inner}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // Slightly roomier than the shared `blockSharedStyles.label` (xs): the
  // multi-series legend can sit directly beneath this label, so the extra
  // breathing room keeps the label from crowding the legend row.
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
  yAxis: {
    position: 'absolute',
    right: 0,
    width: CHART_RIGHT_PAD,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
  },
  yAxisText: {
    lineHeight: LABEL_ROW_HEIGHT,
    textAlign: 'right',
  },
  yAxisMax: {
    top: CHART_TOP_PAD - LABEL_ROW_HEIGHT,
    height: LABEL_ROW_HEIGHT * 2,
  },
  yAxisMin: {
    bottom: 0,
    height: CHART_BOTTOM_PAD * 2,
  },
  annotationLabelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
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
  timeAxisRow: {
    position: 'relative',
    height: LABEL_ROW_HEIGHT,
    marginTop: SPACING.xs,
  },
  timeAxisTick: {
    position: 'absolute',
    width: TICK_W,
  },
});
