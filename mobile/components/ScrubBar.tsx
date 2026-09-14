import { memo, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
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

interface ScrubBarProps
  extends Pick<
    ViewProps,
    | 'accessibilityRole'
    | 'accessibilityLabel'
    | 'accessibilityHint'
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
  thumbColor,
  style,
  children,
  ...accessibility
}: ScrubBarProps) {
  const { width, shown } = scrub;
  const clipStyle = useAnimatedStyle(() => ({
    opacity: width.value > 0 ? 1 : 0,
    transform: [{ translateX: (fraction.value - 1) * width.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - fraction.value) * width.value }],
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: typeof thumbColor === 'string' ? thumbColor : thumbColor.value,
    opacity: shown.value,
    transform: [{ translateX: fraction.value * width.value - THUMB / 2 }],
  }));
  const activeStyle = useAnimatedStyle(() => {
    const count = segments ?? 0;
    const gap = count <= MAX_SEGMENTS ? SEGMENT_GAP : 0;
    const segmentWidth = count > 0 ? (width.value - gap * (count - 1)) / count : 0;
    const markerWidth = Math.max(height, segmentWidth);
    const center = (activeSegment ?? 0) * (segmentWidth + gap) + segmentWidth / 2;
    return {
      opacity: width.value > 0 ? 1 : 0,
      width: markerWidth,
      transform: [
        { translateX: Math.max(0, Math.min(width.value - markerWidth, center - markerWidth / 2)) },
      ],
    };
  });

  const bar = (
    <View style={style} onLayout={scrub.onLayout} {...accessibility}>
      <View style={[styles.track, { height }]}>
        <View style={styles.row}>
          <Segments count={segments} color={trackColor} colors={trackColors} height={height} />
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.clip, clipStyle]}>
          <Animated.View style={[styles.row, contentStyle]}>
            <Segments count={segments} color={fillColor} colors={fillColors} height={height} />
          </Animated.View>
        </Animated.View>
        {activeSegment !== undefined && activeSegment >= 0 && activeSegment < (segments ?? 0) ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activeSegment,
              {
                height: height + SPACING.xs,
                top: -SPACING.xs / 2,
                backgroundColor: activeSegmentColor ?? fillColors?.[activeSegment] ?? fillColor,
              },
              activeStyle,
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
