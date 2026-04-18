import { Canvas, Circle, Line, Path, Skia, type SkPath, vec } from '@shopify/react-native-skia';
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

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

import { useTheme } from '../../hooks/useTheme';
import { hapticTick } from '../../lib/haptics';
import type { ArticleBlock, TrendAnnotation } from '../../types';
import { Pressable, Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import type { BlockVariant } from './shared';

type TrendHighlight = Extract<ArticleBlock, { type: 'trend' }>['highlight'];
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

const SCRUB_LABEL_W = 96;
const SCRUB_LABEL_H = 30;

function resolveHighlightIndex(values: number[], mode: TrendHighlight): number {
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

function buildPolyline(points: Pt[]): SkPath {
  const path = Skia.Path.Make();
  const first = points[0];
  if (!first) return path;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p) path.lineTo(p.x, p.y);
  }
  return path;
}

function buildLinearArea(points: Pt[], baseY: number): SkPath {
  const area = Skia.Path.Make();
  if (points.length < 2) return area;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return area;
  area.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p) area.lineTo(p.x, p.y);
  }
  area.lineTo(last.x, baseY);
  area.lineTo(first.x, baseY);
  area.close();
  return area;
}

interface ChartProps {
  values: number[];
  points: Pt[];
  width: number;
  height: number;
  defaultHighlightIdx: number;
  progress: SharedValue<number>;
  scrubIdx: SharedValue<number>;
  colors: ReturnType<typeof useTheme>['colors'];
  annotations?: TrendAnnotation[];
}

function Chart({
  values,
  points,
  width,
  height,
  defaultHighlightIdx,
  progress,
  scrubIdx,
  colors,
  annotations,
}: ChartProps) {
  const { polyPath, areaPath, minY, maxY } = useMemo(() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const innerTop = CHART_TOP_PAD;
    const innerBottom = height - CHART_BOTTOM_PAD;
    const innerH = innerBottom - innerTop;
    const yFor = (v: number) => innerTop + (1 - (v - min) / range) * innerH;
    return {
      polyPath: buildPolyline(points),
      areaPath: buildLinearArea(points, innerBottom),
      minY: yFor(min),
      maxY: yFor(max),
    };
  }, [values, points, height]);

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
      <Path
        path={areaPath}
        color={colors.textEmphasis}
        opacity={0.1}
        style="fill"
        start={0}
        end={progress}
      />
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
      <Path
        path={polyPath}
        style="stroke"
        strokeWidth={STROKE_WIDTH}
        strokeJoin="round"
        strokeCap="round"
        color={colors.textEmphasis}
        start={0}
        end={progress}
      />
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
  values: number[];
  label: string;
  unit?: string;
  periods?: string[];
  highlight?: TrendHighlight;
  annotations?: TrendAnnotation[];
  variant?: BlockVariant;
  onPress?: () => void;
  sourceLabel?: string;
}

export const TrendBlock = memo(function TrendBlock({
  values,
  label,
  unit,
  periods,
  highlight,
  annotations,
  variant = 'article',
  onPress,
  sourceLabel,
}: TrendBlockProps) {
  const { colors, font } = useTheme();
  const reduceMotion = useReducedMotion();
  const isContext = variant === 'context';
  const height = isContext ? CHART_HEIGHT.context : CHART_HEIGHT.article;

  const defaultHighlightIdx = useMemo(
    () => resolveHighlightIndex(values, highlight),
    [values, highlight],
  );
  const min = useMemo(() => Math.min(...values), [values]);
  const max = useMemo(() => Math.max(...values), [values]);

  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withTiming(1, { duration: ANIMATION.slow, easing: EASING.out });
  }, [reduceMotion, progress]);

  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);

  const points: Pt[] = useMemo(() => {
    if (width <= 0) return [];
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const innerW = width - CHART_LEFT_PAD - CHART_RIGHT_PAD;
    const innerTop = CHART_TOP_PAD;
    const innerBottom = height - CHART_BOTTOM_PAD;
    const innerH = innerBottom - innerTop;
    return values.map((v, i) => ({
      x: CHART_LEFT_PAD + (i / (values.length - 1)) * innerW,
      y: innerTop + (1 - (v - minV) / range) * innerH,
    }));
  }, [values, width, height]);

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

  const scrubInfo = (() => {
    if (scrubIdxJs < 0) return null;
    const v = values[scrubIdxJs];
    if (v === undefined) return null;
    return {
      idx: scrubIdxJs,
      value: formatNumber(v, unit),
      period: periods?.[scrubIdxJs] ?? '',
    };
  })();

  const scrubPt = scrubInfo ? points[scrubInfo.idx] : null;
  const scrubLeft = scrubPt
    ? Math.max(0, Math.min(width - SCRUB_LABEL_W, scrubPt.x - SCRUB_LABEL_W / 2))
    : 0;

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

  const highlightValue = values[defaultHighlightIdx];
  const highlightPeriod = periods?.[defaultHighlightIdx];
  const a11yLabel =
    highlightValue !== undefined
      ? `${label}, ${formatNumber(highlightValue, unit)}${highlightPeriod ? ` in ${highlightPeriod}` : ''}, range ${formatNumber(min, unit)} to ${formatNumber(max, unit)}`
      : label;

  const inner = (
    <View style={styles.container}>
      <Text variant="labelXs" numberOfLines={2} style={styles.label}>
        {label}
      </Text>

      <GestureDetector gesture={pan}>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[styles.chartWrap, { height }]}
        >
          {width > 0 ? (
            <>
              <Chart
                values={values}
                points={points}
                width={width}
                height={height}
                defaultHighlightIdx={defaultHighlightIdx}
                progress={progress}
                scrubIdx={scrubIdx}
                colors={colors}
                annotations={annotations}
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
                  style={[
                    styles.scrubLabel,
                    { left: scrubLeft, width: SCRUB_LABEL_W, height: SCRUB_LABEL_H },
                  ]}
                >
                  {/* Scrub readout value: regular + sizeSm + oldstyle+tabular nums
                      + emphasis color. No exact variant — caption (regular + sizeSm
                      + secondary) + tone="emphasis" + fontVariant override. */}
                  <Text
                    variant="caption"
                    tone="emphasis"
                    numberOfLines={1}
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

      {firstPeriod || lastPeriod ? (
        <View style={styles.xAxisRow}>
          {/* X-axis: regular + sizeXs + trackingCaps + secondary. Borrow labelXs
              size/color/tracking; override family to regular via font.regular. */}
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
});
