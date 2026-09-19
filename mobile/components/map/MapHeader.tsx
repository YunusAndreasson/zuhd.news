import { Canvas, LinearGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { CONTROL_ROW } from '../../lib/deck-layout';
import type { StripItem } from '../../lib/now';
import { Icon, IconButton } from '../primitives';
import { GAUGE_EXTRA, IndicatorStrip } from './IndicatorStrip';

/**
 * The gauges above the earth, scrolling from the reader column's left inset
 * to a fixed menu button at the right.
 *
 * **A shade sits behind the bar.** The row floats over the globe, and a caps
 * label over a lit coastline or a city-light cluster was hard to read. The
 * shade is the screen's own ground, strongest under the status bar, still
 * holding under the row, and gone a little below it — so the globe runs up
 * into the bar rather than stopping at an edge. It is the web map's HUD scrim,
 * and one of the app's few gradients (DESIGN.md, carve-outs).
 *
 * **The menu is the one control up here, on purpose.** Everything used every
 * session is in the dock under the thumb; the menu is opened a few times a
 * week, and the top corner is where both platforms put a destination that
 * rare — out of the way of a thumb that could hit it by accident. The top
 * *left* was considered and passed over: it is where the gauges start,
 * largest move first, and the farthest reach for a right thumb.
 *
 * **It is three lines, not a cog.** It opens search, saved, settings, the map
 * key and the pages, and a cog promises only settings — a reader looking for
 * a saved story or search would not look under a gear (2026-09-19).
 *
 * **The gauges stay when a story opens.** They used to fade out and stop
 * taking touches while a story was open, to quiet the screen for reading. But
 * the open story's globe band starts under this row, so they never covered
 * the story; hiding them only took the markets away at the moment a story
 * about them was on screen. Instead, the ones the story is tied to are marked
 * in its hue (`linkedIds`).
 */

/** Keep the full touch target while letting it meet the safe right edge. */
const MENU_WIDTH = CONTROL_ROW - SPACING.sm;
/** How far below the row the shade runs out. */
const SHADE_FADE = SPACING.xl;
/** The shade's strength at the top edge and at the bottom of the row.
 *  `textSecondary` (#999) is 6.7:1 on flat `bg`, but the row sits over live
 *  globe content, not `bg` — a city-light cluster or a saturated story mark
 *  under the old 0.62 composited down to as low as 2.7:1, under WCAG AA's
 *  4.5:1 body floor `DESIGN.md` claims for the palette. 0.82 keeps the worst
 *  measured case (a bright city-light cluster) at ~4.7:1 while staying
 *  visibly weaker than `SHADE_TOP`, so the fade direction still reads. */
const SHADE_TOP = 0.88;
const SHADE_ROW = 0.82;

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
  selectedId = null,
  linkedIds,
  linkedColor,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  onAll: () => void;
  onMenuPress: () => void;
  /** The gauge whose card is open. */
  selectedId?: string | null;
  /** Gauges tied to the open story, marked in its hue. */
  linkedIds?: ReadonlySet<string>;
  linkedColor?: string;
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
    CONTROL_ROW,
    Math.ceil(
      Math.max(
        (textVariants.labelXsTight.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.chrome),
        (textVariants.tabularEmphasis.lineHeight ?? 0) *
          Math.min(fontScale, MAX_FONT_SCALE.tabular),
      ) + GAUGE_EXTRA,
    ),
  );
  const leftInset = Math.max(SPACING.articlePadding, insets.left);
  // Reserve a fixed, non-overlapping target beside the scrolling gauges.
  const stripViewport = width - leftInset - insets.right - MENU_WIDTH - SPACING.xs;

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.row,
        // Straight under the status bar: the row is a 48pt target with its
        // label centred, so the air above the text is already in it. An extra
        // 4pt on top read as the header pushed down on Android, where the
        // status bar is as tall as the camera cutout.
        { paddingTop: insets.top, paddingLeft: leftInset, paddingRight: insets.right },
      ]}
      pointerEvents="box-none"
    >
      <Shade width={width} rowHeight={rowHeight} color={colors.bg} />
      <View style={[styles.middle, { minHeight: gaugeHeight }]} pointerEvents="box-none">
        {/* Never unmounted. A conditional unmount here once rebuilt all ~28
            components (23 gauges' Pressable/DeltaChip/Sparkline) from scratch
            on every collapse back to the map — measured at ~493ms dev /
            ~165ms production. */}
        <IndicatorStrip
          items={items}
          onSelect={onSelect}
          onAll={onAll}
          selectedId={selectedId}
          linkedIds={linkedIds}
          linkedColor={linkedColor}
          initialViewport={stripViewport}
        />
      </View>
      <IconButton
        onPress={onMenuPress}
        hitSlop={0}
        style={styles.menu}
        accessibilityLabel="Menu"
        accessibilityHint="Search, saved stories, settings, the map key and about"
      >
        <Icon name="menu" size="md" tone="default" />
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
  menu: {
    width: MENU_WIDTH,
    height: CONTROL_ROW,
    // Optical alignment with the text accounts for the icon font's own ascent.
    paddingBottom: GAUGE_EXTRA,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shade: { position: 'absolute', top: 0, left: 0 },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center' },
});
