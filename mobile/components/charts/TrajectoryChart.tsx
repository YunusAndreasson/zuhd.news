import { Canvas, Circle, DashPathEffect, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { extent } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { curveMonotoneX, line as d3Line } from 'd3-shape';
import { memo, useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { ANIMATION, EASING, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../primitives';

// Seed width with a Dimensions estimate so the first paint already has a
// usable trajectory instead of a frame of empty layout while we wait for
// onLayout. The estimate matches the carousel's page width (sheet content
// area = window − 2× sheet padding); the real measured width replaces it
// on the next render. Mirrors the pattern in TrendBlock.
const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

// d3 line generator is stateless once configured — build it once at module
// scope so we don't re-allocate per useMemo run (twice today: once for the
// country path, once for the comparison path).
const lineGenerator = d3Line<{ x: number; y: number }>()
  .x((d) => d.x)
  .y((d) => d.y)
  .curve(curveMonotoneX);

// Horizontal graticule fractions of the inner chart height — read as
// "quarters" rather than "axis ticks". Module-level so the array reference
// stays stable across renders.
const GRID_FRACTIONS = [0.25, 0.5, 0.75] as const;

export interface TrajectoryThreshold {
  /** Y-value where the reference line sits (e.g. 1.5 for the Paris ceiling). */
  value: number;
  /** Caption rendered at the right edge of the line. */
  label: string;
  /** 'warn' (gold) for soft thresholds, 'crit' (red-ish) for hard limits,
   *  'neutral' (rule-color) for baselines like 0 or replacement fertility. */
  tone?: 'warn' | 'crit' | 'neutral';
}

interface TrajectoryChartProps {
  /** Y values, in chronological order. NaN/null entries are gaps. */
  values: (number | null | undefined)[];
  /** First year (left tick label). */
  startYear: number;
  /** Last year (right tick label). */
  endYear: number;
  /** Reference lines drawn under the trajectory. */
  thresholds?: TrajectoryThreshold[];
  /** Optional comparison series — drawn as a faint secondary line behind
   *  the country's trajectory. Use to show "all countries (median)" so the
   *  reader instantly sees how this country differs from the typical one.
   *  Aligned to the same `startYear`/`endYear` x-axis. */
  comparison?: {
    values: (number | null | undefined)[];
    /** Caption rendered top-left of the chart. */
    label?: string;
  };
  /** Force Y-axis lower bound (else computed from data + thresholds). */
  minY?: number;
  /** Force Y-axis upper bound. */
  maxY?: number;
  /** Y-value formatter used for the range strip ("0–100%", "$5K–$120K").
   *  The strip is the chart's only scale anchor — it lives in the
   *  top-left, NOT in the right gutter, so it can't be clipped by the
   *  page boundary. Include the unit in the formatter (the headline carries
   *  the unit too, but the strip stands alone as a chart annotation). */
  formatY?: (n: number) => string;
  /** Trajectory line color. Defaults to `colors.textEmphasis`. */
  accent?: string;
  /** Total chart height. Default 140. */
  height?: number;
  /** One-line description for screen readers. Should summarise the
   *  trajectory's story (current value, direction, comparison) in plain
   *  language — the visual is opaque to assistive tech otherwise. */
  accessibilityLabel?: string;
}

// Thin stroke + light threshold dashes match the documentary aesthetic of
// the metric-row percentile strips below. Thicker strokes start to feel
// dashboard-y; 1.4 is the sweet spot at 140pt chart height.
const STROKE = 1.4;
const ENDPOINT_R = 2.4;
const PAD_TOP = 14;
// Bottom pad must fit the decade tick labels — labelXs is 11pt × 1.2 lh,
// scaled up to ×1.4 at max label dynamic-type. Budget = 11×1.4×1.2 ≈ 19pt
// + 4pt clearance above the next row = 23pt. Plus 5pt extra so descenders
// (and the "world" comparison label if it lands near bottom) don't graze
// the card boundary on Android, which clips overflow by default.
const PAD_BOTTOM = 28;
const PAD_LEFT = 4;
// Right gutter only needs to fit the endpoint dot (radius 2.4) plus a
// breathing buffer so the dot doesn't graze the page boundary. We dropped
// the y-axis min/max labels in favour of: (a) the card headline carrying
// the current value with units, (b) the world-median comparison line as a
// scale anchor, (c) inline threshold labels for critical reference points.
// The user no longer has to read a number off the right gutter — the chart
// IS the trajectory, the headline IS the number.
const PAD_RIGHT = 12;
const THRESHOLD_LABEL_INDENT = 6;
// Year tick width = 4 digits at tabular ≈ 28px + 8px breathing room each
// side. Was 36 — fine at default text scale, but `labelXs` scales up to
// ×1.4 at max accessibility so "2020" overflowed the box and clipped on
// the right edge of the chart. Year ticks are chrome, not content; below
// they render with `tabular` variant which is capped at ×1.0 anyway.
const YEAR_TICK_W = 44;

/** Decade boundaries (multiples of 10) inside [start, end], inclusive of any
 *  boundary that falls within the range. Used for vertical gridlines. */
function decadeTicks(start: number, end: number): number[] {
  if (end <= start) return [];
  const first = Math.ceil(start / 10) * 10;
  const ticks: number[] = [];
  for (let y = first; y <= end; y += 10) ticks.push(y);
  return ticks;
}

/** Year-tick box positioning. Centered on the gridline by default; if a
 *  centered box would extend past the page boundary (which leaks into the
 *  adjacent ScrollView page), the text edge is anchored AT the gridline
 *  instead — so the label sits entirely on the chart-interior side. */
function yearTickPositioning(x: number, width: number) {
  const halfW = YEAR_TICK_W / 2;
  if (x - halfW < 0) {
    return { left: x, width: YEAR_TICK_W, alignItems: 'flex-start' as const };
  }
  if (x + halfW > width) {
    return { left: x - YEAR_TICK_W, width: YEAR_TICK_W, alignItems: 'flex-end' as const };
  }
  return { left: x - halfW, width: YEAR_TICK_W, alignItems: 'center' as const };
}

export const TrajectoryChart = memo(function TrajectoryChart({
  values,
  startYear,
  endYear,
  thresholds,
  comparison,
  minY,
  maxY,
  formatY,
  accent,
  height = 140,
  accessibilityLabel,
}: TrajectoryChartProps) {
  const { colors, font } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);

  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withTiming(1, { duration: ANIMATION.long, easing: EASING.out });
  }, [reduceMotion, progress]);

  const lineColor = accent ?? colors.textEmphasis;

  const { path, comparisonPath, yScale, computedMinY, computedMaxY, endPoint } = useMemo(() => {
    const cleaned = values.map((v) => (v == null || Number.isNaN(v) ? null : v));
    const cleanedCmp = (comparison?.values ?? []).map((v) =>
      v == null || Number.isNaN(v) ? null : v,
    );
    const numeric = cleaned.filter((v): v is number => v != null);
    const numericCmp = cleanedCmp.filter((v): v is number => v != null);
    const thresholdYs = (thresholds ?? []).map((t) => t.value);
    // Include the comparison series in the y-extent so both lines stay in
    // frame — otherwise the comparison can clip when the country's range
    // is narrow.
    const all = [...numeric, ...numericCmp, ...thresholdYs];
    const [eMin, eMax] = extent(all) as [number, number];
    let lo = minY ?? eMin ?? 0;
    let hi = maxY ?? eMax ?? 1;
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    } else {
      const pad = (hi - lo) * 0.08;
      if (minY == null) lo -= pad;
      if (maxY == null) hi += pad;
    }

    const innerBottom = height - PAD_BOTTOM;
    const innerRight = (width || 1) - PAD_RIGHT;

    const yScaleFn = scaleLinear().domain([lo, hi]).range([innerBottom, PAD_TOP]);
    const xFor = (i: number, len: number) =>
      len <= 1 ? PAD_LEFT : PAD_LEFT + (i / (len - 1)) * (innerRight - PAD_LEFT);

    const buildPath = (vs: (number | null)[]) => {
      // Fast path: no gaps. Build a single SVG path string and parse it
      // once — saves the empty Skia.Path.Make() + addPath() round-trip
      // that the segmented path requires. Most country series are dense
      // (climate is annual ERA5, World Bank fills back-years), so the
      // fast path hits ~95% of the time in practice.
      if (!vs.includes(null)) {
        const points = vs.map((v, i) => ({
          x: xFor(i, vs.length),
          y: yScaleFn(v as number),
        }));
        return Skia.Path.MakeFromSVGString(lineGenerator(points) ?? '') ?? Skia.Path.Make();
      }
      // Gappy data — split into contiguous segments at each null so the
      // line lifts cleanly across missing years instead of bridging them.
      const skPath = Skia.Path.Make();
      let segment: { x: number; y: number }[] = [];
      const flush = () => {
        if (segment.length === 0) return;
        const sub = Skia.Path.MakeFromSVGString(lineGenerator(segment) ?? '');
        if (sub) skPath.addPath(sub);
        segment = [];
      };
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (v == null) {
          flush();
          continue;
        }
        segment.push({ x: xFor(i, vs.length), y: yScaleFn(v) });
      }
      flush();
      return skPath;
    };

    const lastEndpoint = (vs: (number | null)[]) => {
      for (let i = vs.length - 1; i >= 0; i--) {
        const v = vs[i];
        if (v != null) return { x: xFor(i, vs.length), y: yScaleFn(v) };
      }
      return null;
    };

    return {
      path: buildPath(cleaned),
      comparisonPath: cleanedCmp.length > 0 ? buildPath(cleanedCmp) : null,
      yScale: yScaleFn,
      computedMinY: lo,
      computedMaxY: hi,
      endPoint: lastEndpoint(cleaned),
    };
  }, [values, comparison, thresholds, minY, maxY, width, height]);

  const toneColor = (tone: TrajectoryThreshold['tone']): string => {
    switch (tone) {
      case 'warn':
        return colors.dome;
      case 'crit':
        return colors.toneUnfavorable;
      default:
        return colors.textSecondary;
    }
  };

  // Inner chart bounds. PAD_LEFT and PAD_TOP are static constants used
  // directly; only innerRight/innerBottom move with the measured width
  // and the configured chart height respectively.
  const innerRight = (width || 1) - PAD_RIGHT;
  const innerBottom = height - PAD_BOTTOM;

  // Horizontal graticule: hairlines at GRID_FRACTIONS of inner height,
  // very low opacity so the eye reads it as a hint, not chrome.
  const gridYs = useMemo(
    () => GRID_FRACTIONS.map((f) => PAD_TOP + (innerBottom - PAD_TOP) * f),
    [innerBottom],
  );

  // Vertical graticule + year ticks: one hairline + label per decade
  // boundary inside [startYear, endYear].
  const decadeXs = useMemo(() => {
    const ticks = decadeTicks(startYear, endYear);
    if (endYear <= startYear) return [] as { year: number; x: number }[];
    return ticks.map((year) => ({
      year,
      x: PAD_LEFT + ((year - startYear) / (endYear - startYear)) * (innerRight - PAD_LEFT),
    }));
  }, [startYear, endYear, innerRight]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrap, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <>
          <Canvas style={{ width, height }}>
            {gridYs.map((gy, i) => (
              <Line
                key={`grid-h-${i}`}
                p1={vec(PAD_LEFT, gy)}
                p2={vec(innerRight, gy)}
                color={colors.textSecondary}
                opacity={0.12}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {decadeXs.map(({ year, x }) => (
              <Line
                key={`grid-v-${year}`}
                p1={vec(x, PAD_TOP)}
                p2={vec(x, innerBottom)}
                color={colors.textSecondary}
                opacity={0.12}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {thresholds?.map((t, i) => {
              const y = yScale(t.value);
              if (!Number.isFinite(y)) return null;
              return (
                <Line
                  key={`thresh-${i}`}
                  p1={vec(PAD_LEFT, y)}
                  p2={vec(innerRight, y)}
                  color={toneColor(t.tone)}
                  opacity={0.4}
                  strokeWidth={StyleSheet.hairlineWidth}
                >
                  <DashPathEffect intervals={[2, 4]} />
                </Line>
              );
            })}
            {/* Comparison line — draws BEFORE the country line so the
             *  country reads as foreground. Muted secondary tone, slightly
             *  thinner stroke. No endpoint dot — only the country gets that. */}
            {comparisonPath ? (
              <Path
                path={comparisonPath}
                style="stroke"
                strokeWidth={1}
                strokeJoin="round"
                strokeCap="round"
                color={colors.textSecondary}
                opacity={0.55}
                start={0}
                end={progress}
              />
            ) : null}
            <Path
              path={path}
              style="stroke"
              strokeWidth={STROKE}
              strokeJoin="round"
              strokeCap="round"
              color={lineColor}
              start={0}
              end={progress}
            />
            {endPoint ? (
              <Circle cx={endPoint.x} cy={endPoint.y} r={ENDPOINT_R} color={lineColor} />
            ) : null}
          </Canvas>

          {/* Inline threshold labels: by default float just above each
           *  dashed line, left-indented over the chart canvas. If a
           *  threshold lands within ~16px of the chart top (where the "above"
           *  position would clip), flip the label to sit BELOW the line
           *  instead. Same horizontal placement either way. */}
          {thresholds?.map((t, i) => {
            const y = yScale(t.value);
            if (!Number.isFinite(y)) return null;
            const flipBelow = y < PAD_TOP + 16;
            const labelTop = flipBelow ? y + 2 : y - 14;
            return (
              <View
                key={`thresh-label-${i}`}
                pointerEvents="none"
                style={[
                  styles.thresholdLabel,
                  { left: PAD_LEFT + THRESHOLD_LABEL_INDENT, top: labelTop },
                ]}
              >
                <Text
                  variant="labelXs"
                  numberOfLines={1}
                  style={[{ color: toneColor(t.tone) }, font.regular]}
                >
                  {t.label}
                </Text>
              </View>
            );
          })}

          {/* Scale strip — fixed top-left of the chart canvas. Carries
           *  the y-range ("0–100%", "$5K–$120K") so the reader can place
           *  the trajectory on a scale, plus the comparison-line legend
           *  (`┄┄ world median`) when present. Top-left is the only edge
           *  immune to right-side clipping in a paginated horizontal
           *  ScrollView. The character `┄` echoes the comparison line's
           *  dashed-secondary look. */}
          {formatY || comparison?.label ? (
            <View pointerEvents="none" style={styles.scaleStrip}>
              <Text variant="labelXs" tone="secondary" numberOfLines={1} style={font.regular}>
                {[
                  formatY ? `${formatY(computedMinY)}–${formatY(computedMaxY)}` : null,
                  comparison?.label ? `┄┄ ${comparison.label}` : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            </View>
          ) : null}

          {/* Year ticks at each decade boundary. `tabular` variant is
           *  capped at ×1.0 so digit widths stay predictable under
           *  accessibility text enlargement. See `yearTickPositioning`
           *  for the edge-anchoring rationale. */}
          {decadeXs.map(({ year, x }) => (
            <View
              key={`year-${year}`}
              pointerEvents="none"
              style={[styles.yearTick, yearTickPositioning(x, width)]}
            >
              <Text variant="tabular" tone="secondary" numberOfLines={1} style={styles.yearText}>
                {String(year)}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    position: 'relative',
    // overflow:visible on the chart wrap is intentional — descenders and
    // accessibility-scaled label glyphs can extend a couple of pixels past
    // the inner-area edge on Android. Cross-page leak prevention is handled
    // upstream at the carousel's wrap (overflow:hidden) and at year-tick
    // edge-alignment, so leaving overflow visible here is safe.
    overflow: 'visible',
  },
  thresholdLabel: {
    position: 'absolute',
    height: 14,
    justifyContent: 'center',
  },
  scaleStrip: {
    position: 'absolute',
    top: 0,
    left: PAD_LEFT + 6,
    // Bound the right edge so the strip can't grow into the chart's right
    // half — even if the formatted range gets long, numberOfLines={1}
    // ellipsises rather than overflowing into the trajectory area.
    right: PAD_RIGHT + 6,
    height: 14,
    justifyContent: 'center',
  },
  yearTick: {
    position: 'absolute',
    bottom: 2,
    // alignItems is set per-tick (centered/flex-start/flex-end based on
    // whether a centered box would clip the page edge).
  },
  yearText: {
    fontVariant: ['tabular-nums'],
  },
});
