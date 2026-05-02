import type { TrendAnnotation, TrendBand, TrendHighlight, TrendSeries } from '@shared/types';
import { Canvas, Circle, Line, Path, Skia, type SkPath, vec } from '@shopify/react-native-skia';
import { extent } from 'd3-array';
import { scaleLinear, scaleLog, scaleTime } from 'd3-scale';
import { curveMonotoneX, area as d3Area, line as d3Line } from 'd3-shape';
import { memo, useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, EASING, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { formatTickLabel } from '../../lib/date-format';
import { hapticTick } from '../../lib/haptics';
import { Pressable, Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import type { BlockVariant } from './shared';

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

type Pt = { x: number; y: number };

const CHART_HEIGHT = { article: 180, context: 148 } as const;
const STROKE_WIDTH = 1.5;
const DATA_DOT_R = 2;
const EVENT_DOT_R = 4;
const ENDPOINT_DOT_R = 4;
const ENDPOINT_RING_R = 8;
const LABEL_ROW_HEIGHT = 14;
const CHART_TOP_PAD = LABEL_ROW_HEIGHT + 10;
const CHART_BOTTOM_PAD = 14;
const CHART_RIGHT_PAD = 44;
const CHART_LEFT_PAD = 2;
const MAX_SERIES = 3;
const SCRUB_LABEL_W_SINGLE = 96;
const SCRUB_LABEL_W_MULTI = 132;
const SCRUB_VALUE_LINE_H = 16;
const SCRUB_PERIOD_LINE_H = 14;
const TIME_TICK_COUNT = 4;

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

function formatNumber(n: number, unit?: string): string {
  const s = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
  return unit ? `${s}${unit.length === 1 || unit === '%' ? '' : ' '}${unit}` : s;
}

/** Try to interpret each period string as a date. Returns aligned Date array
 *  if every period parses; otherwise null (caller falls back to index scale).
 *  Accepts ISO ("2026-04-13"), year ("1979"), and year-month ("2026-04"). */
function parsePeriodsAsDates(periods: string[] | undefined): Date[] | null {
  if (!periods || periods.length === 0) return null;
  const out: Date[] = [];
  for (const p of periods) {
    if (/^\d{4}$/.test(p)) {
      out.push(new Date(`${p}-01-01T00:00:00Z`));
      continue;
    }
    if (/^\d{4}-\d{2}$/.test(p)) {
      out.push(new Date(`${p}-01T00:00:00Z`));
      continue;
    }
    const d = new Date(p);
    if (Number.isNaN(d.getTime())) return null;
    out.push(d);
  }
  return out;
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
}

function Chart({
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
}: ChartProps) {
  const { seriesPaths, bandPath, points, minY, maxY } = useMemo(() => {
    const flat: number[] = [];
    for (const s of series) flat.push(...s.values);
    if (band) {
      flat.push(...band.low, ...band.high);
    }
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
      const path = Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
      const color =
        sIdx === 0 ? colors.textEmphasis : sIdx === 1 ? colors.accent : colors.textSecondary;
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
      bandPath = Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
    }

    // Use the FIRST series for scrub dots / data ticks; multi-series scrub
    // shows all readouts in the readout label, but the crosshair anchors on
    // the primary series so the highlight dot lands somewhere meaningful.
    const primary = series[0];
    const points = (primary?.values ?? []).map((v, i) => ({ x: xFor(i), y: yScale(v) }));

    return {
      seriesPaths,
      bandPath,
      points,
      minY: yScale(safeMin),
      maxY: yScale(safeMax),
    };
  }, [series, band, width, height, scale, colors]);

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

  return (
    <Canvas style={{ width, height }}>
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
      {points.map((p, i) => (
        <Circle key={`tick-${i}`} cx={p.x} cy={p.y} r={DATA_DOT_R} color={colors.textEmphasis} />
      ))}
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
      <Circle cx={activeCx} cy={activeCy} r={ENDPOINT_DOT_R} color={colors.accent} />
    </Canvas>
  );
}

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
}: TrendBlockProps) {
  const { colors, font } = useTheme();
  const reduceMotion = useReducedMotion();
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
  const flatExtent = useMemo(() => {
    const flat: number[] = [];
    for (const s of normalizedSeries) flat.push(...s.values);
    if (band) flat.push(...band.low, ...band.high);
    return extent(flat) as [number, number];
  }, [normalizedSeries, band]);
  const min = flatExtent[0] ?? 0;
  const max = flatExtent[1] ?? 0;

  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withTiming(1, { duration: ANIMATION.slow, easing: EASING.out });
  }, [reduceMotion, progress]);

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

  useAnimatedReaction(
    () => scrubIdx.value,
    (current, prev) => {
      if (current === prev) return;
      runOnJS(setScrubIdxJs)(current);
      if (current >= 0 && prev !== null && prev >= 0) runOnJS(hapticTick)();
    },
  );

  // Time-axis ticks: parse periods as dates, use d3-scale-time to pick nice
  // tick positions, format with d3-scale's auto-formatter.
  const timeTicks = useMemo(() => {
    const dates = parsePeriodsAsDates(periods);
    if (!dates || dates.length < 2 || width <= 0) return null;
    const innerLeft = CHART_LEFT_PAD;
    const innerRight = width - CHART_RIGHT_PAD;
    const xScale = scaleTime()
      .domain([dates[0] as Date, dates[dates.length - 1] as Date])
      .range([innerLeft, innerRight]);
    const ticks = xScale.ticks(TIME_TICK_COUNT);
    return ticks.map((d) => ({ x: xScale(d), label: formatTickLabel(d, ticks) }));
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
              return `${s.label}: ${formatNumber(sv, unit)}`;
            })
            .filter((l): l is string => l !== null)
            .join('\n')
        : formatNumber(v, unit);
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

  const pan = useMemo(() => {
    const pointsX = points.map((p) => p.x);
    return Gesture.Pan()
      .activeOffsetX([-5, 5])
      .failOffsetY([-10, 10])
      .onStart((e) => {
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
      })
      .onChange((e) => {
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
      })
      .onFinalize(() => {
        'worklet';
        scrubIdx.value = -1;
      });
  }, [points, scrubIdx]);

  const firstPeriod = periods?.[0];
  const lastPeriod = periods?.[periods.length - 1];

  const highlightValue = primaryValues[defaultHighlightIdx];
  const highlightPeriod = periods?.[defaultHighlightIdx];
  const a11yLabel =
    highlightValue !== undefined
      ? `${label}, ${formatNumber(highlightValue, unit)}${highlightPeriod ? ` in ${highlightPeriod}` : ''}, range ${formatNumber(min, unit)} to ${formatNumber(max, unit)}`
      : label;

  if (normalizedSeries.length === 0) return null;

  // Multi-series legend rendered above the chart, below the label. Keeps
  // the inline color → series mapping discoverable without an axis legend.
  const legend =
    normalizedSeries.length > 1
      ? normalizedSeries.map((s, i) => ({
          label: s.label,
          color: i === 0 ? colors.textEmphasis : i === 1 ? colors.accent : colors.textSecondary,
        }))
      : null;

  const inner = (
    <View style={styles.container}>
      <Text variant="labelSm" numberOfLines={2} style={styles.label}>
        {label}
      </Text>

      {legend ? (
        <View style={styles.legendRow}>
          {legend.map((l, i) => (
            <View key={`${l.label}-${i}`} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: l.color }]} />
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
          style={[styles.chartWrap, { height }]}
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

              <View pointerEvents="none" style={[styles.yAxis, styles.yAxisMax]}>
                <Text variant="tabular" tone="secondary">
                  {formatNumber(max, unit)}
                </Text>
              </View>
              <View pointerEvents="none" style={[styles.yAxis, styles.yAxisMin]}>
                <Text variant="tabular" tone="secondary">
                  {formatNumber(min, unit)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </GestureDetector>

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
  container: {
    marginVertical: SPACING.sm,
  },
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
  legendSwatch: {
    width: 10,
    height: 2,
    borderRadius: 1,
  },
  chartWrap: {
    position: 'relative',
    width: '100%',
  },
  yAxis: {
    position: 'absolute',
    right: 0,
    width: CHART_RIGHT_PAD,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
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
