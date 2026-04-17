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
// an empty container while `onLayout` resolves. Recomputed from onLayout on
// mount; the estimate is conservative (full screen minus typical padding) so
// actual layout is nearly always narrower, not wider.
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
const CHART_HEIGHT = { article: 176, context: 136 } as const;
const STROKE_WIDTH = 1.5;
const ENDPOINT_DOT_R = 4;
const ENDPOINT_RING_R = 7;
// Top/bottom pads double as the vertical centering window for the y-axis
// labels — each label's View is anchored top/bottom with height = 2×pad, so
// its center lines up with the rule line drawn at y = pad (or height - pad).
const CHART_TOP_PAD = 14;
const CHART_BOTTOM_PAD = 14;
const CHART_RIGHT_PAD = 48;
const CHART_LEFT_PAD = 2;
const GRID_QUARTILES = [0.25, 0.5, 0.75];

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

/** Catmull-Rom → cubic bezier for a smooth C1 curve through every point. */
function buildCurve(points: Pt[]): SkPath {
  const path = Skia.Path.Make();
  if (points.length < 2) return path;
  const at = (i: number): Pt => {
    const clamped = Math.max(0, Math.min(i, points.length - 1));
    return points[clamped] ?? { x: 0, y: 0 };
  };
  path.moveTo(at(0).x, at(0).y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  return path;
}

function buildArea(curve: SkPath, points: Pt[], baseY: number): SkPath {
  const area = curve.copy();
  if (points.length < 2) return area;
  const last = points[points.length - 1];
  const first = points[0];
  if (!last || !first) return area;
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
  const { curvePath, areaPath, minY, maxY, quartileYs } = useMemo(() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const innerTop = CHART_TOP_PAD;
    const innerBottom = height - CHART_BOTTOM_PAD;
    const innerH = innerBottom - innerTop;
    const yFor = (v: number) => innerTop + (1 - (v - min) / range) * innerH;
    const quarts = GRID_QUARTILES.map((q) => yFor(min + range * q));
    return {
      curvePath: buildCurve(points),
      areaPath: buildArea(buildCurve(points), points, innerBottom),
      minY: yFor(min),
      maxY: yFor(max),
      quartileYs: quarts,
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
      {/* Subtle filled area under the curve */}
      <Path
        path={areaPath}
        color={colors.textEmphasis}
        opacity={0.08}
        style="fill"
        start={0}
        end={progress}
      />

      {/* Vertical grid — one line per data point, anchors the x-axis so
          scrubbing lands on a recognizable column. */}
      {points.map((p, i) => (
        <Line
          key={`vgrid-${i}`}
          p1={vec(p.x, CHART_TOP_PAD)}
          p2={vec(p.x, height - CHART_BOTTOM_PAD)}
          color={colors.textSecondary}
          opacity={0.2}
          strokeWidth={1}
        />
      ))}

      {/* Horizontal quartile grid — reference scale. 1pt stroke so thin
          hairlines don't vanish under antialiasing on high-DPR screens. */}
      {quartileYs.map((y, i) => (
        <Line
          key={`hgrid-${i}`}
          p1={vec(CHART_LEFT_PAD, y)}
          p2={vec(chartRightX, y)}
          color={colors.textSecondary}
          opacity={0.28}
          strokeWidth={1}
        />
      ))}

      {/* Min and max reference lines — emphasized against the grid */}
      <Line
        p1={vec(CHART_LEFT_PAD, maxY)}
        p2={vec(chartRightX, maxY)}
        color={colors.textSecondary}
        opacity={0.6}
        strokeWidth={1}
      />
      <Line
        p1={vec(CHART_LEFT_PAD, minY)}
        p2={vec(chartRightX, minY)}
        color={colors.textSecondary}
        opacity={0.6}
        strokeWidth={1}
      />

      {/* The curve */}
      <Path
        path={curvePath}
        style="stroke"
        strokeWidth={STROKE_WIDTH}
        strokeJoin="round"
        strokeCap="round"
        color={colors.textEmphasis}
        start={0}
        end={progress}
      />

      {/* Crosshair — vertical rule at scrub position */}
      <Line
        p1={crosshairP1}
        p2={crosshairP2}
        color={colors.textEmphasis}
        opacity={crosshairOpacity}
        strokeWidth={StyleSheet.hairlineWidth}
      />

      {/* Annotation markers — vertical hairlines at pinned data-point indices.
          Labels are rendered as RN Text overlays in the parent (Skia text
          rendering needs a font object; sticking with RN keeps typography
          coherent with the rest of the block). */}
      {annotations?.map((a, i) => {
        const pt = points[a.atIndex];
        if (!pt) return null;
        return (
          <Line
            key={`ann-${i}`}
            p1={vec(pt.x, CHART_TOP_PAD)}
            p2={vec(pt.x, height - CHART_BOTTOM_PAD)}
            color={colors.accent}
            opacity={0.5}
            strokeWidth={1}
          />
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

function formatDelta(first: number, current: number): { arrow: string; text: string } | null {
  if (first === 0) return null;
  const pct = ((current - first) / Math.abs(first)) * 100;
  if (!Number.isFinite(pct)) return null;
  const rounded = Math.round(pct);
  if (rounded === 0) return { arrow: '\u2192', text: '0%' };
  const arrow = rounded > 0 ? '\u2197' : '\u2198';
  const sign = rounded > 0 ? '+' : '';
  return { arrow, text: `${sign}${rounded}%` };
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

  // Precompute point geometry once per (values, width, height) so both the
  // Chart renderer and the pan worklet can read the same coordinates.
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

  // Scrub state — SharedValues drive the Skia chart; a JS-side index drives
  // the Text legend (synced via useAnimatedReaction + runOnJS, which only
  // fires on transitions, not every frame).
  const scrubIdx = useSharedValue(-1);
  const [scrubbedIdx, setScrubbedIdx] = useState(-1);

  useAnimatedReaction(
    () => scrubIdx.value,
    (current, prev) => {
      if (current !== prev) {
        runOnJS(setScrubbedIdx)(current);
        // Haptic tick on point-to-point transitions (not on start/end).
        if (current >= 0 && prev !== null && prev >= 0) runOnJS(hapticTick)();
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

  // What the legend shows: scrubbed point wins; otherwise default highlight.
  const displayIdx = scrubbedIdx >= 0 ? scrubbedIdx : defaultHighlightIdx;
  const displayValue = values[displayIdx];
  const displayPeriod = periods?.[displayIdx];
  const firstValue = values[0];
  const delta =
    displayValue !== undefined && firstValue !== undefined
      ? formatDelta(firstValue, displayValue)
      : null;

  const firstPeriod = periods?.[0];
  const lastPeriod = periods?.[periods.length - 1];

  const a11yLabel =
    displayValue !== undefined
      ? `${label}, ${formatNumber(displayValue, unit)}${displayPeriod ? ` in ${displayPeriod}` : ''}, range ${formatNumber(min, unit)} to ${formatNumber(max, unit)}`
      : label;

  const rightColumnWidth = CHART_RIGHT_PAD;

  const inner = (
    <View style={styles.container}>
      {/* Legend — label + value + period + trend indicator */}
      <View style={styles.headerRow}>
        <Text
          style={[styles.label, textStyles.smallCapsXs]}
          maxFontSizeMultiplier={MAX_FONT_SCALE.label}
          numberOfLines={2}
        >
          {label}
        </Text>
        {displayValue !== undefined ? (
          <View style={styles.headerValue}>
            <Text
              style={{
                ...font.bold,
                fontSize: typography.sizeLg,
                lineHeight: typography.sizeLg * 1.05,
                color: colors.textEmphasis,
                fontVariant: ['oldstyle-nums'],
              }}
              maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
            >
              {formatNumber(displayValue, unit)}
            </Text>
            <View style={styles.legendMetaRow}>
              {displayPeriod ? (
                <Text
                  style={{
                    ...font.regular,
                    fontSize: typography.sizeXs,
                    color: colors.textSecondary,
                    letterSpacing: typography.trackingCaps,
                  }}
                  maxFontSizeMultiplier={MAX_FONT_SCALE.label}
                >
                  {displayPeriod.toUpperCase()}
                </Text>
              ) : null}
              {delta ? (
                <>
                  {displayPeriod ? (
                    <Text
                      style={{
                        ...font.regular,
                        fontSize: typography.sizeXs,
                        color: colors.textSecondary,
                      }}
                    >
                      {'  \u00b7  '}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      ...font.semiBold,
                      fontSize: typography.sizeXs,
                      color: colors.accent,
                      fontVariant: ['oldstyle-nums'],
                    }}
                    maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
                  >
                    {delta.arrow} {delta.text}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

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
              {/* Annotation labels — real small-caps glyphs pinned at the top
                  of each marker line, clamped within chart bounds so edge
                  markers don't clip off-canvas. */}
              {annotations?.map((a, i) => {
                const pt = points[a.atIndex];
                if (!pt) return null;
                const LABEL_W = 64;
                const leftClamped = Math.max(0, Math.min(width - LABEL_W, pt.x - LABEL_W / 2));
                return (
                  <View
                    key={`ann-label-${i}`}
                    pointerEvents="none"
                    style={[
                      styles.annotationLabelWrap,
                      { left: leftClamped, top: 0, width: LABEL_W },
                    ]}
                  >
                    <Text
                      style={{
                        ...font.smallCaps,
                        fontSize: typography.sizeXs,
                        lineHeight: typography.sizeXs,
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
              {/* Right-edge y-axis labels, centered on their rule lines */}
              <View
                pointerEvents="none"
                style={[styles.yAxis, styles.yAxisMax, { width: rightColumnWidth }]}
              >
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
              <View
                pointerEvents="none"
                style={[styles.yAxis, styles.yAxisMin, { width: rightColumnWidth }]}
              >
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  label: {
    flex: 1,
  },
  headerValue: {
    alignItems: 'flex-end',
  },
  legendMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xxs,
  },
  chartWrap: {
    position: 'relative',
    width: '100%',
  },
  yAxis: {
    position: 'absolute',
    right: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
  },
  yAxisMax: {
    top: 0,
    height: CHART_TOP_PAD * 2,
  },
  yAxisMin: {
    bottom: 0,
    height: CHART_BOTTOM_PAD * 2,
  },
  annotationLabelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
