import { memo, type ReactNode, useCallback, useState } from 'react';
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { RADIUS, SPACING } from '../constants/theme';
import { type Scrub, STEM_WIDTH } from '../hooks/useScrub';
import { MAX_SEGMENTS, segmentLayout } from '../lib/scrub-segments';
import { Text } from './primitives';

/** The thumb: a handle that reads as one without crowding a 3pt track. */
const THUMB = 9;
/**
 * How far above the touch area a raised tooltip floats: past the pad of a
 * thumb on the track, which covered the 8pt default almost entirely.
 */
const THUMB_CLEARANCE = SPACING.xl;
const SEGMENT_GAP = 2;
/** A faded segment's thickness: a hairline, so a story already read differs
 *  from one still to read by shape, not only by how pale its colour is. */
const FADED_HEIGHT = 1;

/** An hour mark's height: through the track and a little past it, so it reads
 *  as a ruler's tick rather than a gap between two cells. */
const MARK_HEIGHT = 9;
/** A tall cell's height: a story among the most covered, rising from the track the
 *  way a histogram's bar rises from its axis. */
const TALL_HEIGHT = 8;
/**
 * How a keyed track's cells move when the river changes under them: stories
 * arriving at the head push the rest along, and the clock re-measuring the
 * day on a return slides every cell a little. Both were a jump — the whole
 * bar redrawn in its new place the frame the feed landed, which is most of
 * what made a return look glitchy. Layout-driven, so it runs only when a
 * cell's place or size changes; Reduce Motion snaps it (`ReduceMotion.System`).
 */
const CELL_MOVE = LinearTransition.duration(250);

/** Room for a mark's label, `18h` in 11pt tabular, centred on the mark. */
export const MARK_LABEL_WIDTH = 28;
/** Between the track and a mark's label under it. */
const MARK_LABEL_GAP = SPACING.xs;

/** A cell placed along the track in points — the story track's, where a story
 *  sits at its time instead of in an equal share. */
export interface PlacedCell {
  left: number;
  width: number;
}

/** A tick across the track, with a word under it when there is room for one. */
export interface TrackMark {
  at: number;
  label?: string;
}

/**
 * Where the current item's raised segment sits on a track `trackWidth` wide:
 * over its own segment, at least as wide as the track is tall, and never past
 * either end.
 */
function activeSegmentFrame(
  trackWidth: number,
  count: number,
  index: number,
  height: number,
): { left: number; width: number } {
  const gap = count <= MAX_SEGMENTS ? SEGMENT_GAP : 0;
  const segmentWidth = count > 0 ? (trackWidth - gap * (count - 1)) / count : 0;
  const width = Math.max(height, segmentWidth);
  const center = index * (segmentWidth + gap) + segmentWidth / 2;
  return { left: Math.max(0, Math.min(trackWidth - width, center - width / 2)), width };
}

/** Cells at their own places, over a hairline that is the rest of the track. */
/** A placed cell's height: a hairline once done with, taller when it stands
 *  out, the track's own otherwise. */
function placedHeight(height: number, faded?: boolean, tall?: boolean): number {
  if (faded) return Math.min(height, FADED_HEIGHT);
  return tall ? Math.max(height, TALL_HEIGHT) : height;
}

function PlacedSegments({
  cells,
  keys,
  color,
  colors,
  faded,
  tall,
  height,
}: {
  cells: readonly PlacedCell[];
  keys?: readonly string[];
  color: string;
  colors?: readonly string[];
  faded?: readonly boolean[];
  tall?: readonly boolean[];
  height: number;
}) {
  const animate = keys?.length === cells.length;
  const out: ReactNode[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell) continue;
    const h = placedHeight(height, faded?.[i], tall?.[i]);
    out.push(
      <PlacedSegment
        key={(animate && keys?.[i]) || `segment-${i}`}
        animate={animate}
        left={cell.left}
        width={cell.width}
        height={h}
        // A hairline sits on the midline; a tall cell stands on the track's
        // foot, so every unread cell shares one baseline.
        top={h < height ? (height - h) / 2 : height - h}
        color={colors?.[i] ?? color}
      />,
    );
  }
  return <>{out}</>;
}

/** One placed cell, memoized on primitives for the reason `Segment` is. */
const PlacedSegment = memo(function PlacedSegment({
  animate,
  left,
  width,
  height,
  top,
  color,
}: {
  animate: boolean;
  left: number;
  width: number;
  height: number;
  top: number;
  color: string;
}) {
  return (
    <Animated.View
      layout={animate ? CELL_MOVE : undefined}
      style={[styles.placed, { left, width, height, top, backgroundColor: color }]}
    />
  );
});

function Segments({
  count,
  color,
  colors,
  faded,
  height,
}: {
  count?: number;
  color: string;
  /** Per segment, overriding `color`. */
  colors?: readonly string[];
  /** Per segment: drawn `FADED_HEIGHT` thick. */
  faded?: readonly boolean[];
  height: number;
}) {
  const { cells: split, gapped } = segmentLayout(
    count,
    colors?.length === count || faded?.length === count,
  );
  if (!count || !split) {
    return <View style={[styles.segment, { height, backgroundColor: color }]} />;
  }
  const cells: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    cells.push(
      <Segment
        key={`segment-${i}`}
        height={faded?.[i] ? Math.min(height, FADED_HEIGHT) : height}
        color={colors?.[i] ?? color}
        gap={gapped && i < count - 1}
      />,
    );
  }
  return <>{cells}</>;
}

/**
 * One cell, memoized on three primitives. A story turning read changes one
 * cell's height and colour, and the arrays it arrives in are new, so without
 * this every cell's view re-rendered for it: ~42 of them, 127–141 ms a read
 * in a dev build on the emulator — more than a swipe landing (profiled
 * 2026-09-22).
 */
const Segment = memo(function Segment({
  height,
  color,
  gap,
}: {
  height: number;
  color: string;
  gap: boolean;
}) {
  return (
    <View
      style={[styles.segment, { height, backgroundColor: color }, gap ? styles.segmentGap : null]}
    />
  );
});

interface ScrubBarProps
  extends Pick<
    ViewProps,
    | 'accessibilityRole'
    | 'accessibilityLabel'
    | 'accessibilityHint'
    | 'accessibilityValue'
    | 'accessibilityActions'
    | 'onAccessibilityAction'
  > {
  scrub: Scrub;
  fraction: SharedValue<number>;
  /** False draws the track alone — a player still preparing. */
  interactive?: boolean;
  /** One segment per item, so a track of stories reads as stories. */
  segments?: number;
  /** The current item, raised above the track so position does not rely on colour. */
  activeSegment?: number;
  /** Full current-story hue, independent of the stable muted track palettes. */
  activeSegmentColor?: string;
  height: number;
  trackColor: string;
  /** The fill up to `fraction`. A track without one — the dock's, whose
   *  segments say what has been read rather than what is behind the finger —
   *  shows where it is by the raised segment and, while held, the thumb. */
  fillColor?: string;
  /** One colour per segment for what is still ahead, overriding `trackColor`. */
  trackColors?: readonly string[];
  /** One colour per segment for what the fill has passed, overriding `fillColor`. */
  fillColors?: readonly string[];
  /** Per segment: done with — drawn as a hairline (the dock's read stories). */
  faded?: readonly boolean[];
  /** Per placed segment: stands taller than the track (most covered). */
  tall?: readonly boolean[];
  /** Per segment, its place along the track in points, replacing the equal
   *  shares. The track between them is a hairline in `trackColor`. */
  cells?: readonly PlacedCell[];
  /** Per placed cell, what it stands for (a story's slug). Given, a cell is
   *  that story wherever it moves, and moves there rather than jumping. */
  cellKeys?: readonly string[];
  /** Ticks across the track, in points, with an optional word under each. */
  marks?: readonly TrackMark[];
  /** The ticks' and their words' ink. */
  markColor?: string;
  /** The track's measured width, for a caller that places its own cells. */
  onTrackWidth?: (width: number) => void;
  thumbColor: string | SharedValue<string>;
  /** The touch area. Vertical padding only: its width is the track's. */
  style?: StyleProp<ViewStyle>;
  /** Drawn over the touch area — `ScrubTooltip`, usually. */
  children?: ReactNode;
}

/**
 * The track, its fill and its thumb, under `useScrub`'s gesture.
 *
 * The fill, where there is one, is revealed rather than stretched: a clip
 * slides in from the left while its content slides back by the same distance,
 * so segments keep their shape at every fraction and nothing lays out per
 * frame.
 */
export const ScrubBar = memo(function ScrubBar({
  scrub,
  fraction,
  interactive = true,
  segments,
  activeSegment,
  activeSegmentColor,
  height,
  trackColor,
  fillColor,
  trackColors,
  fillColors,
  faded,
  cells,
  cellKeys,
  tall,
  marks,
  markColor,
  onTrackWidth,
  thumbColor,
  style,
  children,
  ...accessibility
}: ScrubBarProps) {
  const { width, shown, onLayout } = scrub;
  // The raised segment moves when the current item changes, which React
  // knows, so React places it, from a copy of the track's width. It was an
  // animated style reading `activeSegment`, and once, after a cold start, it
  // stayed on the first story while the card and the track's own label said
  // the sixth, until the next step moved it. Why the updater missed that
  // change was never pinned down; the segment never animates, so there was
  // nothing to gain from letting it.
  const [trackWidth, setTrackWidth] = useState(0);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onLayout(e);
      setTrackWidth(e.nativeEvent.layout.width);
      onTrackWidth?.(e.nativeEvent.layout.width);
    },
    [onLayout, onTrackWidth],
  );
  // Each updater runs once on the JS thread when the bar mounts, and the dock
  // remounts it whenever its status line gives way — possibly mid-landing,
  // while the deck's spring is writing `fraction` on the UI thread. A JS read
  // of a value the UI thread has changed blocks until the UI thread answers
  // (the stall `StoryDeck`'s `DeckSlot` documents). So the first style is the
  // one an unmeasured bar has anyway — no fill, no thumb — and the UI mapper,
  // which runs straight after, draws the real one.
  const clipStyle = useAnimatedStyle(() => {
    if (globalThis.__RUNTIME_KIND === 1) return { opacity: 0 };
    return {
      opacity: width.value > 0 ? 1 : 0,
      transform: [{ translateX: (fraction.value - 1) * width.value }],
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    if (globalThis.__RUNTIME_KIND === 1) return {};
    return { transform: [{ translateX: (1 - fraction.value) * width.value }] };
  });
  const thumbStyle = useAnimatedStyle(() => {
    if (globalThis.__RUNTIME_KIND === 1) return { opacity: 0 };
    return {
      backgroundColor: typeof thumbColor === 'string' ? thumbColor : thumbColor.value,
      opacity: shown.value,
      transform: [{ translateX: fraction.value * width.value - THUMB / 2 }],
    };
  });
  const placed = cells && cells.length === segments ? cells : null;
  const movingCells = placed !== null && cellKeys?.length === placed.length;
  // The raised current cell keeps its own story's height: tall if it is.
  const activeHeight =
    placed && activeSegment !== undefined
      ? placedHeight(height, false, tall?.[activeSegment])
      : height;
  const activeCell = placed && activeSegment !== undefined ? placed[activeSegment] : undefined;
  const active =
    activeSegment !== undefined &&
    activeSegment >= 0 &&
    activeSegment < (segments ?? 0) &&
    trackWidth > 0
      ? activeCell
        ? {
            width: Math.max(height, activeCell.width),
            left: activeCell.left + activeCell.width / 2 - Math.max(height, activeCell.width) / 2,
          }
        : placed
          ? null
          : activeSegmentFrame(trackWidth, segments ?? 0, activeSegment, height)
      : null;

  const bar = (
    <View style={style} onLayout={handleLayout} {...accessibility}>
      <View style={[styles.track, { height }]}>
        {marks && markColor
          ? marks.map((mark) => (
              <View
                key={`mark-${mark.at}`}
                pointerEvents="none"
                style={[
                  styles.mark,
                  {
                    left: mark.at - 0.5,
                    top: (height - MARK_HEIGHT) / 2,
                    backgroundColor: markColor,
                  },
                ]}
              />
            ))
          : null}
        {placed ? (
          <>
            <View
              style={[
                styles.baseline,
                { top: (height - StyleSheet.hairlineWidth) / 2, backgroundColor: trackColor },
              ]}
            />
            <PlacedSegments
              cells={placed}
              keys={cellKeys}
              color={trackColor}
              colors={trackColors}
              faded={faded}
              tall={tall}
              height={height}
            />
          </>
        ) : (
          <View style={[styles.row, { height }]}>
            <Segments
              count={segments}
              color={trackColor}
              colors={trackColors}
              faded={faded}
              height={height}
            />
          </View>
        )}
        {marks && markColor && trackWidth > 0
          ? marks.map((mark) =>
              mark.label ? (
                <Text
                  key={`label-${mark.at}`}
                  variant="tabular"
                  tone="secondary"
                  pointerEvents="none"
                  numberOfLines={1}
                  style={[
                    styles.markLabel,
                    {
                      top: height + MARK_LABEL_GAP,
                      left: Math.max(
                        0,
                        Math.min(trackWidth - MARK_LABEL_WIDTH, mark.at - MARK_LABEL_WIDTH / 2),
                      ),
                    },
                  ]}
                >
                  {mark.label}
                </Text>
              ) : null,
            )
          : null}
        {fillColor ? (
          <Animated.View style={[StyleSheet.absoluteFill, styles.clip, clipStyle]}>
            <Animated.View style={[styles.row, contentStyle]}>
              <Segments count={segments} color={fillColor} colors={fillColors} height={height} />
            </Animated.View>
          </Animated.View>
        ) : null}
        {active && activeSegment !== undefined ? (
          <Animated.View
            pointerEvents="none"
            // Placed by `left` where the cells move, so it moves with its own
            // cell: by a transform it jumped to the story's new place while
            // the cell under it was still easing there.
            layout={movingCells ? CELL_MOVE : undefined}
            style={[
              styles.activeSegment,
              {
                width: active.width,
                height: activeHeight + SPACING.xs,
                top: height - activeHeight - SPACING.xs / 2,
                ...(movingCells
                  ? { left: active.left }
                  : { transform: [{ translateX: active.left }] }),
                backgroundColor:
                  activeSegmentColor ?? fillColors?.[activeSegment] ?? fillColor ?? trackColor,
              },
            ]}
          />
        ) : null}
        {interactive ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.thumb, { top: (height - THUMB) / 2 }, thumbStyle]}
          />
        ) : null}
      </View>
      {children}
    </View>
  );
  return interactive ? <GestureDetector gesture={scrub.gesture}>{bar}</GestureDetector> : bar;
});

/**
 * The label that floats above the finger while it drags, with `scrub.detail`
 * as a quieter second line when the scrub has one.
 *
 * `stemColor` raises it clear of the thumb and hangs a hairline from it to the
 * finger, so where the finger is stays readable while the thumb covers the
 * track. Only a tooltip drawn inside `ScrubBar` can take it: the stem measures
 * from the touch area's top edge.
 *
 * `below` hangs it under its container instead, for a bar at the top of the
 * screen, where above is the top bar's gauges. It takes no stem.
 */
export const ScrubTooltip = memo(function ScrubTooltip({
  scrub,
  backgroundColor,
  stemColor,
  labelScale,
  below = false,
}: {
  scrub: Scrub;
  backgroundColor: string;
  stemColor?: string | SharedValue<string>;
  below?: boolean;
  /** Grows the label from the tabular size, for a readout that is the one
   *  thing the scrub is for — the story track's time. */
  labelScale?: number;
}) {
  const stem = below ? undefined : stemColor;
  const lift = stem ? THUMB_CLEARANCE : SPACING.sm;
  const stemColorStyle = useAnimatedStyle(() => ({
    backgroundColor: typeof stem === 'string' ? stem : stem?.value,
  }));
  return (
    <>
      {stem ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.stem, { height: lift }, stemColorStyle, scrub.stemStyle]}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tooltip,
          below
            ? { top: '100%', width: scrub.tooltipWidth, backgroundColor, marginTop: lift }
            : { bottom: '100%', width: scrub.tooltipWidth, backgroundColor, marginBottom: lift },
          scrub.tooltipStyle,
        ]}
      >
        <Text variant="tabularEmphasis" scale={labelScale} style={styles.tooltipText}>
          {scrub.label}
        </Text>
        {scrub.detail ? (
          <Text variant="tabular" tone="secondary" style={styles.tooltipText}>
            {scrub.detail}
          </Text>
        ) : null}
      </Animated.View>
    </>
  );
});

const styles = StyleSheet.create({
  track: { width: '100%' },
  // Centred, so a faded hairline sits on the track's midline.
  row: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  clip: { overflow: 'hidden' },
  segment: { flex: 1 },
  placed: { position: 'absolute' },
  baseline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  mark: { position: 'absolute', width: 1, height: MARK_HEIGHT },
  markLabel: { position: 'absolute', width: MARK_LABEL_WIDTH, textAlign: 'center' },
  segmentGap: { marginRight: SEGMENT_GAP },
  activeSegment: { position: 'absolute', left: 0, borderRadius: RADIUS.handle },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
  tooltip: {
    position: 'absolute',
    left: 0,
    paddingVertical: SPACING.xxs,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
  },
  tooltipText: { textAlign: 'center' },
  stem: { position: 'absolute', bottom: '100%', left: 0, width: STEM_WIDTH },
});
