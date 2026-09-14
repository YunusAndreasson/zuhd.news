import { Canvas, LinearGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { MASTHEAD_ROW } from '../../lib/deck-layout';
import type { StripItem } from '../../lib/now';
import { Icon, IconButton } from '../primitives';
import { GAUGE_EXTRA, IndicatorStrip } from './IndicatorStrip';

/**
 * The gauges above the earth, scrolling from the reader column's left inset
 * to a fixed Settings button at the right.
 *
 * **A shade sits behind the bar.** The row floats over the globe, and a caps
 * label over a lit coastline or a city-light cluster was hard to read. The
 * shade is the screen's own ground, strongest under the status bar, still
 * holding under the row, and gone a little below it — so the globe runs up
 * into the bar rather than stopping at an edge. It is the web map's HUD scrim,
 * and it is the one gradient in the app's chrome (DESIGN.md, carve-outs).
 *
 * Settings stays available when the gauges recede for an expanded story.
 */

/** Keep the full touch target while letting it meet the safe right edge. */
const SETTINGS_WIDTH = MASTHEAD_ROW - SPACING.sm;
/** How far below the row the shade runs out. */
const SHADE_FADE = SPACING.xl;
/** The shade's strength at the top edge and at the bottom of the row. */
const SHADE_TOP = 0.88;
const SHADE_ROW = 0.62;

/** The screen's ground, fading out below the bar. */
const Shade = memo(function Shade({
  width,
  rowHeight,
  color,
}: {
  width: number;
  rowHeight: number;
  color: string;
}) {
  const height = rowHeight + SHADE_FADE;
  const colors = useMemo(() => {
    const c = Skia.Color(color);
    const at = (alpha: number) => Float32Array.of(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, alpha);
    return [at(SHADE_TOP), at(SHADE_ROW), at(0)];
  }, [color]);
  const positions = useMemo(() => [0, rowHeight / height, 1], [rowHeight, height]);
  if (width <= 0 || rowHeight <= 0) return null;
  return (
    <Canvas style={[styles.shade, { width, height }]} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={colors}
          positions={positions}
        />
      </Rect>
    </Canvas>
  );
});

export const MapHeader = memo(function MapHeader({
  items,
  onSelect,
  onAll,
  onMenuPress,
  recede,
  gaugesEnabled,
  selectedId = null,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  onAll: () => void;
  onMenuPress: () => void;
  /** 0 at rest, 1 with a story grown: the gauges step aside. */
  recede: SharedValue<number>;
  /** False while a story is grown, so a faded gauge cannot be tapped. */
  gaugesEnabled: boolean;
  /** The gauge whose card is open. */
  selectedId?: string | null;
}) {
  const { colors, textVariants } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [rowHeight, setRowHeight] = useState(0);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.height);
    setRowHeight((prev) => (prev === next ? prev : next));
  }, []);

  // The row is as tall as a gauge whether or not the gauges have arrived, so
  // their arrival does not move the globe, whose centre is measured from here.
  const gaugeHeight = Math.max(
    MASTHEAD_ROW,
    Math.ceil(
      Math.max(
        (textVariants.labelXsTight.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.chrome),
        (textVariants.tabularEmphasis.lineHeight ?? 0) *
          Math.min(fontScale, MAX_FONT_SCALE.tabular),
      ) + GAUGE_EXTRA,
    ),
  );
  // Reserve a fixed, non-overlapping target beside the scrolling gauges.
  const leftInset = Math.max(SPACING.articlePadding, insets.left);
  const stripViewport = width - leftInset - insets.right - SETTINGS_WIDTH - SPACING.xs;

  const gaugesStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, recede.value));
    return { opacity: 1 - p, transform: [{ translateY: -SPACING.sm * p }] };
  });

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.row,
        { paddingTop: insets.top + SPACING.xs, paddingLeft: leftInset, paddingRight: insets.right },
      ]}
      pointerEvents="box-none"
    >
      <Shade width={width} rowHeight={rowHeight} color={colors.bg} />
      <Animated.View
        style={[styles.middle, { minHeight: gaugeHeight }, gaugesStyle]}
        pointerEvents={gaugesEnabled ? 'box-none' : 'none'}
        accessibilityElementsHidden={!gaugesEnabled}
        importantForAccessibility={gaugesEnabled ? 'auto' : 'no-hide-descendants'}
      >
        {gaugesEnabled && (
          <IndicatorStrip
            items={items}
            onSelect={onSelect}
            onAll={onAll}
            selectedId={selectedId}
            initialViewport={stripViewport}
          />
        )}
      </Animated.View>
      <IconButton
        onPress={onMenuPress}
        hitSlop={0}
        style={styles.settings}
        accessibilityLabel="Settings and pages"
        accessibilityHint="Opens settings, search, saved stories and information"
      >
        <Icon name="settings-outline" size="md" tone="default" />
      </IconButton>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  settings: {
    width: SETTINGS_WIDTH,
    height: MASTHEAD_ROW,
    // Optical alignment with the text accounts for the icon font's own ascent.
    paddingBottom: GAUGE_EXTRA,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shade: { position: 'absolute', top: 0, left: 0 },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center' },
});
