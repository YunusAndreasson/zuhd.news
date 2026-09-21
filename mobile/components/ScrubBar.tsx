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
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { RADIUS, SPACING } from '../constants/theme';
import { type Scrub, STEM_WIDTH } from '../hooks/useScrub';
import { Text } from './primitives';

/** The thumb: a handle that reads as one without crowding a 3pt track. */
const THUMB = 9;
/**
 * How far above the touch area a raised tooltip floats: past the pad of a
 * thumb on the track, which covered the 8pt default almost entirely.
 */
const THUMB_CLEARANCE = SPACING.xl;
/** Past this many, a segment would be no wider than the gap beside it. */
const MAX_SEGMENTS = 60;
const SEGMENT_GAP = 2;
/** The rule over marked segments: thinner than the track, so it annotates the
 *  track rather than reading as a second one. */
const MARK_HEIGHT = 2;

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

function Segments({
  count,
  color,
  colors,
  height,
}: {
  count?: number;
  color: string;
  /** Per segment, overriding `color`; ignored once the track goes continuous. */
  colors?: readonly string[];
  height: number;
}) {
  if (!count || count <= 1 || count > MAX_SEGMENTS) {
    return <View style={[styles.segment, { height, backgroundColor: color }]} />;
  }
  const cells: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    cells.push(
      <View
        key={`segment-${i}`}
        style={[
          styles.segment,
          { height, backgroundColor: colors?.[i] ?? color },
          i < count - 1 ? styles.segmentGap : null,
        ]}
      />,
    );
  }
  return <>{cells}</>;
}

/**
 * A rule over the segments `marks` flags, laid out as the segments are so each
 * dash sits over its own, and clear of the raised current segment.
 */
function Marks({
  count,
  marks,
  color,
  trackHeight,
}: {
  count: number;
  marks: readonly boolean[];
  color: string;
  trackHeight: number;
}) {
  if (count <= 0 || marks.length !== count || !marks.includes(true)) return null;
  const gapped = count > 1 && count <= MAX_SEGMENTS;
  const cells: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    cells.push(
      <View
        key={`mark-${i}`}
        style={[
          styles.segment,
          { height: MARK_HEIGHT, backgroundColor: marks[i] ? color : 'transparent' },
          gapped && i < count - 1 ? styles.segmentGap : null,
        ]}
      />,
    );
  }
  return (
    <View
      pointerEvents="none"
      style={[styles.row, styles.marks, { bottom: trackHeight + SPACING.xs }]}
    >
      {cells}
    </View>
  );
}

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
  fillColor: string;
  /** One colour per segment for what is still ahead, overriding `trackColor`. */
  trackColors?: readonly string[];
  /** One colour per segment for what the fill has passed, overriding `fillColor`. */
  fillColors?: readonly string[];
  /** Per segment: draw a rule over it in `markColor` (the dock's new stories). */
  marks?: readonly boolean[];
  markColor?: string;
  thumbColor: string | SharedValue<string>;
  /** The touch area. Vertical padding only: its width is the track's. */
  style?: StyleProp<ViewStyle>;
  /** Drawn over the touch area — `ScrubTooltip`, usually. */
  children?: ReactNode;
}

/**
 * The track, its fill and its thumb, under `useScrub`'s gesture.
 *
 * The fill is revealed rather than stretched: a clip slides in from the left
 * while its content slides back by the same distance, so segments keep their
 * shape at every fraction and nothing lays out per frame.
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
  marks,
  markColor,
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
    },
    [onLayout],
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
  const active =
    activeSegment !== undefined &&
    activeSegment >= 0 &&
    activeSegment < (segments ?? 0) &&
    trackWidth > 0
      ? activeSegmentFrame(trackWidth, segments ?? 0, activeSegment, height)
      : null;

  const bar = (
    <View style={style} onLayout={handleLayout} {...accessibility}>
      <View style={[styles.track, { height }]}>
        {marks && markColor ? (
          <Marks count={segments ?? 0} marks={marks} color={markColor} trackHeight={height} />
        ) : null}
        <View style={styles.row}>
          <Segments count={segments} color={trackColor} colors={trackColors} height={height} />
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.clip, clipStyle]}>
          <Animated.View style={[styles.row, contentStyle]}>
            <Segments count={segments} color={fillColor} colors={fillColors} height={height} />
          </Animated.View>
        </Animated.View>
        {active && activeSegment !== undefined ? (
          <View
            pointerEvents="none"
            style={[
              styles.activeSegment,
              {
                width: active.width,
                height: height + SPACING.xs,
                top: -SPACING.xs / 2,
                transform: [{ translateX: active.left }],
                backgroundColor: activeSegmentColor ?? fillColors?.[activeSegment] ?? fillColor,
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
 */
export const ScrubTooltip = memo(function ScrubTooltip({
  scrub,
  backgroundColor,
  stemColor,
}: {
  scrub: Scrub;
  backgroundColor: string;
  stemColor?: string | SharedValue<string>;
}) {
  const lift = stemColor ? THUMB_CLEARANCE : SPACING.sm;
  const stemColorStyle = useAnimatedStyle(() => ({
    backgroundColor: typeof stemColor === 'string' ? stemColor : stemColor?.value,
  }));
  return (
    <>
      {stemColor ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.stem, { height: lift }, stemColorStyle, scrub.stemStyle]}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tooltip,
          { width: scrub.tooltipWidth, backgroundColor, marginBottom: lift },
          scrub.tooltipStyle,
        ]}
      >
        <Text variant="tabularEmphasis" style={styles.tooltipText}>
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
  row: { flexDirection: 'row', width: '100%' },
  clip: { overflow: 'hidden' },
  segment: { flex: 1 },
  segmentGap: { marginRight: SEGMENT_GAP },
  marks: { position: 'absolute', left: 0 },
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
    bottom: '100%',
    left: 0,
    paddingVertical: SPACING.xxs,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
  },
  tooltipText: { textAlign: 'center' },
  stem: { position: 'absolute', bottom: '100%', left: 0, width: STEM_WIDTH },
});
