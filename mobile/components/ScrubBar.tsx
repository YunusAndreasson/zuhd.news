import { memo, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { RADIUS, SPACING } from '../constants/theme';
import type { Scrub } from '../hooks/useScrub';
import { Text } from './primitives';

/** The thumb: a handle that reads as one without crowding a 3pt track. */
const THUMB = 9;
/** Past this many, a segment would be no wider than the gap beside it. */
const MAX_SEGMENTS = 60;
const SEGMENT_GAP = 2;

function Segments({ count, color, height }: { count?: number; color: string; height: number }) {
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
          { height, backgroundColor: color },
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
  height: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
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
  height,
  trackColor,
  fillColor,
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
    opacity: shown.value,
    transform: [{ translateX: fraction.value * width.value - THUMB / 2 }],
  }));

  const bar = (
    <View style={style} onLayout={scrub.onLayout} {...accessibility}>
      <View style={[styles.track, { height }]}>
        <View style={styles.row}>
          <Segments count={segments} color={trackColor} height={height} />
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.clip, clipStyle]}>
          <Animated.View style={[styles.row, contentStyle]}>
            <Segments count={segments} color={fillColor} height={height} />
          </Animated.View>
        </Animated.View>
        {interactive ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              { backgroundColor: thumbColor, top: (height - THUMB) / 2 },
              thumbStyle,
            ]}
          />
        ) : null}
      </View>
      {children}
    </View>
  );
  return interactive ? <GestureDetector gesture={scrub.gesture}>{bar}</GestureDetector> : bar;
});

/** The label that floats above the finger while it drags. */
export const ScrubTooltip = memo(function ScrubTooltip({
  scrub,
  backgroundColor,
}: {
  scrub: Scrub;
  backgroundColor: string;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.tooltip, { width: scrub.tooltipWidth, backgroundColor }, scrub.tooltipStyle]}
    >
      <Text variant="tabularEmphasis" style={styles.tooltipText}>
        {scrub.label}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  track: { width: '100%' },
  row: { flexDirection: 'row', width: '100%' },
  clip: { overflow: 'hidden' },
  segment: { flex: 1 },
  segmentGap: { marginRight: SEGMENT_GAP },
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
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
  },
  tooltipText: { textAlign: 'center' },
});
