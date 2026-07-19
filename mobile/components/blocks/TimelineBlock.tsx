import type { BlockTone } from '@shared/types';
import { Canvas, Circle, Line, Rect, vec } from '@shopify/react-native-skia';
import { extent } from 'd3-array';
import { scaleTime } from 'd3-scale';
import { memo, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { parseFlexibleDate } from '../../lib/date-format';
import { staggerFadeIn } from '../../lib/stagger';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle, blockSharedStyles, blockToneBg } from './shared';

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;
const AXIS_PAD_X = 8;
const SPAN_HEIGHT = 14;
const EVENT_DOT_R = 3;
const EVENT_TICK_H = 12;
// Per-event 4-digit year labels sit at the top of the chart and connect to
// each tick via the leader line below. 4-digit (not 2-digit) so the label
// matches the detail list below verbatim — reader's eye jumps directly from
// chart year to list row.
const YEAR_LABEL_W = 32;
const YEAR_LABEL_H = 14;
const YEAR_LABEL_GAP = 2;
const AXIS_Y = YEAR_LABEL_H + YEAR_LABEL_GAP + EVENT_TICK_H;
const CHART_HEIGHT = AXIS_Y + SPAN_HEIGHT / 2 + 6;

interface TimelineEvent {
  year: string;
  label: string;
  emphasis?: 'start' | 'end' | 'pivot';
}

interface TimelineSpan {
  from: string;
  to: string;
  label: string;
  tone?: BlockTone;
}

interface TimelineBlockProps {
  events?: TimelineEvent[];
  spans?: TimelineSpan[];
  label?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

export const TimelineBlock = memo(function TimelineBlock({
  events,
  spans,
  label,
  variant = 'article',
  sourceLabel,
}: TimelineBlockProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);

  const parsed = useMemo(() => {
    const eventDates = (events ?? [])
      .map((e) => ({ ev: e, date: parseFlexibleDate(e.year) }))
      .filter((x): x is { ev: TimelineEvent; date: Date } => x.date !== null);
    const spanDates = (spans ?? [])
      .map((s) => {
        const from = parseFlexibleDate(s.from);
        const to = parseFlexibleDate(s.to);
        return from && to && to >= from ? { sp: s, from, to } : null;
      })
      .filter((x): x is { sp: TimelineSpan; from: Date; to: Date } => x !== null);
    return { eventDates, spanDates };
  }, [events, spans]);

  const scale = useMemo(() => {
    const dates: Date[] = [];
    for (const e of parsed.eventDates) dates.push(e.date);
    for (const s of parsed.spanDates) dates.push(s.from, s.to);
    const [lo, hi] = extent(dates) as [Date | undefined, Date | undefined];
    if (!lo || !hi || width <= 0) return null;
    const innerL = AXIS_PAD_X + YEAR_LABEL_W / 2;
    const innerR = width - AXIS_PAD_X - YEAR_LABEL_W / 2;
    // Pad domain by 5% on each side so endpoints don't sit flush against the
    // canvas edge — keeps event ticks fully visible at min/max years.
    const span = +hi - +lo;
    const pad = span > 0 ? span * 0.05 : 1000 * 60 * 60 * 24 * 365; // 1y if zero span
    const domain: [Date, Date] = [new Date(+lo - pad), new Date(+hi + pad)];
    return scaleTime().domain(domain).range([innerL, innerR]);
  }, [parsed, width]);

  // Greedy collision avoidance for per-event year labels. Walk events in
  // chronological order; place each label only if its left edge clears the
  // previously-placed label's right edge. Suppressed labels still get their
  // tick + dot rendered — the reader can find them in the detail list below.
  const yearLabels = useMemo(() => {
    if (!scale || width <= 0) return [];
    const sorted = [...parsed.eventDates].sort((a, b) => +a.date - +b.date);
    const placed: { left: number; year: string; isPivot: boolean }[] = [];
    let lastRight = -Infinity;
    for (const e of sorted) {
      const x = scale(e.date);
      const left = x - YEAR_LABEL_W / 2;
      if (left < lastRight + 2) continue;
      placed.push({
        left: Math.max(0, Math.min(width - YEAR_LABEL_W, left)),
        year: e.date.getUTCFullYear().toString(),
        isPivot: e.ev.emphasis === 'pivot',
      });
      lastRight = left + YEAR_LABEL_W;
    }
    return placed;
  }, [parsed.eventDates, scale, width]);

  const axisY = AXIS_Y;

  if (parsed.eventDates.length === 0 && parsed.spanDates.length === 0) return null;

  return (
    <View style={blockContainerStyle[variant]}>
      {label ? (
        <Text variant="labelSm" style={blockSharedStyles.label}>
          {label}
        </Text>
      ) : null}

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[blockSharedStyles.chartWrap, { height: CHART_HEIGHT }]}
      >
        {scale && width > 0 ? (
          <>
            <Canvas style={{ width, height: CHART_HEIGHT }}>
              {/* Axis line */}
              <Line
                p1={vec(AXIS_PAD_X, axisY)}
                p2={vec(width - AXIS_PAD_X, axisY)}
                color={colors.textSecondary}
                opacity={0.4}
                strokeWidth={StyleSheet.hairlineWidth}
              />
              {/* Spans */}
              {parsed.spanDates.map((s, i) => {
                const x0 = scale(s.from);
                const x1 = scale(s.to);
                return (
                  <Rect
                    key={`span-${i}`}
                    x={x0}
                    y={axisY - SPAN_HEIGHT / 2}
                    width={Math.max(2, x1 - x0)}
                    height={SPAN_HEIGHT}
                    color={blockToneBg(s.sp.tone, colors)}
                    opacity={0.35}
                  />
                );
              })}
              {/* Event ticks (leader lines from axis up). */}
              {parsed.eventDates.map((e, i) => {
                const x = scale(e.date);
                const isPivot = e.ev.emphasis === 'pivot';
                return (
                  <Line
                    key={`event-tick-${i}`}
                    p1={vec(x, axisY - EVENT_TICK_H)}
                    p2={vec(x, axisY)}
                    color={isPivot ? colors.accent : colors.textEmphasis}
                    opacity={0.7}
                    strokeWidth={StyleSheet.hairlineWidth}
                  />
                );
              })}
              {/* Event dots — drawn after ticks so they stack on top. */}
              {parsed.eventDates.map((e, i) => {
                const x = scale(e.date);
                const isPivot = e.ev.emphasis === 'pivot';
                return (
                  <Circle
                    key={`event-dot-${i}`}
                    cx={x}
                    cy={axisY}
                    r={isPivot ? EVENT_DOT_R + 1 : EVENT_DOT_R}
                    color={isPivot ? colors.accent : colors.textEmphasis}
                  />
                );
              })}
            </Canvas>
            {/* Per-event 4-digit year labels positioned above each tick.
                Year format matches the detail list verbatim so the eye can
                jump chart → list without translating. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {yearLabels.map((y, i) => (
                <Text
                  key={`year-${y.year}-${i}`}
                  variant="labelXs"
                  tone={y.isPivot ? 'accent' : 'secondary'}
                  style={[styles.yearLabel, { left: y.left, top: 0, width: YEAR_LABEL_W }]}
                >
                  {y.year}
                </Text>
              ))}
            </View>
          </>
        ) : null}
      </View>

      {/* Detail list — events and spans interleaved by date so a reader can
          scan the chronology without parsing the chart. Each row is the
          legend entry for the chart marker above. */}
      <View style={styles.list}>
        {parsed.eventDates.map((e, i) => (
          <Animated.View
            key={`detail-event-${i}`}
            entering={reduceMotion ? undefined : staggerFadeIn(i)}
            style={styles.listRow}
          >
            <View
              style={[
                styles.listMarker,
                {
                  backgroundColor: e.ev.emphasis === 'pivot' ? colors.accent : colors.textEmphasis,
                },
              ]}
            />
            <Text variant="labelXs" tone="secondary" style={styles.listYear}>
              {e.ev.year.toUpperCase()}
            </Text>
            <Text variant="body" numberOfLines={2} style={styles.listText}>
              {e.ev.label}
            </Text>
          </Animated.View>
        ))}
        {parsed.spanDates.map((s, i) => (
          <Animated.View
            key={`detail-span-${i}`}
            entering={reduceMotion ? undefined : staggerFadeIn(parsed.eventDates.length + i)}
            style={styles.listRow}
          >
            <View
              style={[
                styles.listSpanMarker,
                {
                  backgroundColor: blockToneBg(s.sp.tone, colors),
                },
              ]}
            />
            <Text variant="labelXs" tone="secondary" style={styles.listYear}>
              {`${s.sp.from.toUpperCase()}–${s.sp.to.toUpperCase()}`}
            </Text>
            <Text variant="body" numberOfLines={2} style={styles.listText}>
              {s.sp.label}
            </Text>
          </Animated.View>
        ))}
      </View>

      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  yearLabel: {
    position: 'absolute',
    height: YEAR_LABEL_H,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  list: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  listMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listSpanMarker: {
    width: 14,
    height: 8,
    borderRadius: RADIUS.handle,
  },
  listYear: {
    minWidth: 56,
    // Span entries (e.g. "1979–1989") are wider than single years; let the
    // column expand for them while staying tight for plain "1979" rows.
  },
  listText: {
    flex: 1,
  },
});
