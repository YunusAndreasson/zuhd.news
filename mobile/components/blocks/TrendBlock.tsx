import { Canvas, Circle, Line, Path, Skia, type SkPath, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
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
import { ANIMATION, EASING, MAX_FONT_SCALE, SPACING } from '../../constants/theme';

// Initial width estimate so the chart renders on first frame instead of flashing
// an empty container while `onLayout` resolves.
const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

import { useTheme } from '../../hooks/useTheme';
import { hapticTick } from '../../lib/haptics';
import type { ArticleBlock, TrendAnnotation } from '../../types';
import { HapticPressable } from '../HapticPressable';
import type { BlockVariant } from './index';
import { SourceCaption } from './SourceCaption';

type TrendHighlight = Extract<ArticleBlock, { type: 'trend' }>['highlight'];
type Pt = { x: number; y: number };

// ── Geometry ────────────────────────────────────────────────────────────────
const CHART_HEIGHT = { article: 180, context: 148 } as const;
const STROKE_WIDTH = 1.5;
const DATA_DOT_R = 2;
const EVENT_DOT_R = 4;
const ENDPOINT_DOT_R = 4;
const ENDPOINT_RING_R = 8;
// Top pad reserves room for the annotation label row plus the leader line
// that drops from the label down to its data point on the curve.
const LABEL_ROW_HEIGHT = 14;
const CHART_TOP_PAD = LABEL_ROW_HEIGHT + 10;
const CHART_BOTTOM_PAD = 14;
const CHART_RIGHT_PAD = 44;
const CHART_LEFT_PAD = 2;

// ── Helpers ─────────────────────────────────────────────────────────────────

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

/** Straight-line polyline. Honest over sparse, irregular-interval data where
 *  a smoothed curve would imply values that weren't sampled. */
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

// ── Chart ───────────────────────────────────────────────────────────────────

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

  // Active point — scrub position wins; otherwise fall back to default highlight.
  const activeCx = useDerivedValue(() => {
    const idx = scrubIdx.value >= 0 ? scrubIdx.value : defaultHighlightIdx;
    return points[idx]?.x ?? 0;
  });
  const activeCy = useDerivedValue(() => {
    const idx = scrubIdx.value >= 0 ? scrubIdx.value : defaultHighlightIdx;
    return points[idx]?.y ?? 0;
  });

  // Crosshair only visible while scrubbing.
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
      {/* Subtle filled area beneath the polyline. */}
      <Path
        path={areaPath}
        color={colors.textEmphasis}
        opacity={0.1}
        style="fill"
        start={0}
        end={progress}
      />

      {/* Min and max reference lines — the implicit axis. */}
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

      {/* The polyline */}
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

      {/* Crosshair — vertical rule at scrub position only */}
      <Line
        p1={crosshairP1}
        p2={crosshairP2}
        color={colors.textEmphasis}
        opacity={crosshairOpacity}
        strokeWidth={StyleSheet.hairlineWidth}
      />

      {/* Tick dots at every sampled value — make it obvious where the discrete
          points sit on the line instead of hiding them in one continuous curve. */}
      {points.map((p, i) => (
        <Circle key={`tick-${i}`} cx={p.x} cy={p.y} r={DATA_DOT_R} color={colors.textEmphasis} />
      ))}

      {/* Annotation leader lines — connect the top-row label to its event
          point on the curve so readers see which year each label belongs to. */}
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

      {/* Event dots — larger accent-colored markers for annotated points. */}
      {annotations?.map((a, i) => {
        const pt = points[a.atIndex];
        if (!pt) return null;
        return (
          <Circle key={`ann-dot-${i}`} cx={pt.x} cy={pt.y} r={EVENT_DOT_R} color={colors.accent} />
        );
      })}

      {/* Active dot — snaps to scrub position or falls back to highlight */}
      <Circle cx={activeCx} cy={activeCy} r={ENDPOINT_RING_R} color={colors.accent} opacity={0.2} />
      <Circle cx={activeCx} cy={activeCy} r={ENDPOINT_DOT_R} color={colors.accent} />
    </Canvas>
  );
}

// ── TrendBlock ──────────────────────────────────────────────────────────────

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
  const { colors, font, typography, textStyles } = useTheme();
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

  // Precompute point geometry once per (values, width, height) so the chart
  // renderer and the pan worklet share the same coordinates.
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

  // Scrub state — the SharedValue drives the Skia chart's active dot; the
  // animated reaction fires a haptic tick on each point-to-point transition.
  const scrubIdx = useSharedValue(-1);

  useAnimatedReaction(
    () => scrubIdx.value,
    (current, prev) => {
      if (current !== prev && current >= 0 && prev !== null && prev >= 0) {
        runOnJS(hapticTick)();
      }
    },
  );

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

  // a11y describes the default highlight (accessibilityLabel isn't re-announced
  // during a pan, so scrub updates don't belong here).
  const highlightValue = values[defaultHighlightIdx];
  const highlightPeriod = periods?.[defaultHighlightIdx];
  const a11yLabel =
    highlightValue !== undefined
      ? `${label}, ${formatNumber(highlightValue, unit)}${highlightPeriod ? ` in ${highlightPeriod}` : ''}, range ${formatNumber(min, unit)} to ${formatNumber(max, unit)}`
      : label;

  const inner = (
    <View style={styles.container}>
      {/* Title — metric label. The chart itself communicates the values. */}
      <Text
        style={[styles.label, textStyles.smallCapsXs]}
        maxFontSizeMultiplier={MAX_FONT_SCALE.label}
        numberOfLines={2}
      >
        {label}
      </Text>

      {/* Chart — wrapped in gesture for horizontal scrub */}
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
              {/* Annotation labels — real small-caps glyphs pinned at the top of
                  the chart. The leader line is drawn inside the canvas and ends
                  just below this row, visually linking label to data point. */}
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
                      style={{
                        ...font.smallCaps,
                        fontSize: typography.sizeXs,
                        lineHeight: LABEL_ROW_HEIGHT,
                        letterSpacing: typography.trackingCaps,
                        color: colors.accent,
                        textAlign: 'center',
                      }}
                      maxFontSizeMultiplier={MAX_FONT_SCALE.label}
                      numberOfLines={1}
                    >
                      {a.label}
                    </Text>
                  </View>
                );
              })}
              {/* Right-edge y-axis min/max — the axis readout. */}
              <View pointerEvents="none" style={[styles.yAxis, styles.yAxisMax]}>
                <Text
                  style={{
                    ...font.regular,
                    fontSize: typography.sizeXs,
                    color: colors.textSecondary,
                    fontVariant: ['oldstyle-nums'],
                  }}
                  maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
                >
                  {formatNumber(max, unit)}
                </Text>
              </View>
              <View pointerEvents="none" style={[styles.yAxis, styles.yAxisMin]}>
                <Text
                  style={{
                    ...font.regular,
                    fontSize: typography.sizeXs,
                    color: colors.textSecondary,
                    fontVariant: ['oldstyle-nums'],
                  }}
                  maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
                >
                  {formatNumber(min, unit)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </GestureDetector>

      {/* X-axis: first and last period anchors */}
      {firstPeriod || lastPeriod ? (
        <View style={styles.xAxisRow}>
          <Text
            style={[
              styles.xAxisLabel,
              {
                ...font.regular,
                fontSize: typography.sizeXs,
                color: colors.textSecondary,
                letterSpacing: typography.trackingCaps,
              },
            ]}
            maxFontSizeMultiplier={MAX_FONT_SCALE.label}
          >
            {firstPeriod ? firstPeriod.toUpperCase() : ''}
          </Text>
          <Text
            style={[
              styles.xAxisLabel,
              styles.xAxisLabelEnd,
              {
                ...font.regular,
                fontSize: typography.sizeXs,
                color: colors.textSecondary,
                letterSpacing: typography.trackingCaps,
              },
            ]}
            maxFontSizeMultiplier={MAX_FONT_SCALE.label}
          >
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
    <HapticPressable
      haptic="impact"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      {inner}
    </HapticPressable>
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
