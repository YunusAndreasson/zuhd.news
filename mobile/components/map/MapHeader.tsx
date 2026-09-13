import { Canvas, Group, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { StripItem } from '../../lib/now';
import { IconButton } from '../primitives';
import { IndicatorStrip } from './IndicatorStrip';

/**
 * The one bar above the earth: the zuhd mark · every gauge that moved.
 *
 * **The mark is home.** Pressed, it puts the day back where the app opens: the
 * newest story on the card at rest, the globe's zoom released and the camera
 * flown to that story, and the gauges scrolled back to their start. A reader
 * twenty swipes in, pinched into a coastline, has one place to press to start
 * over — the same place a website's logo has always been.
 *
 * **The gauges scroll from beside it to the screen's edge**; the cut slot says
 * the row continues. Listen moved down to the sheet's masthead, beside the
 * story list, and gave the gauges its slot.
 *
 * **A shade sits behind the bar.** The row floats over the globe, and a caps
 * label over a lit coastline or a city-light cluster was hard to read. The
 * shade is the screen's own ground, strongest under the status bar, still
 * holding under the row, and gone a little below it — so the globe runs up
 * into the bar rather than stopping at an edge. It is the web map's HUD scrim,
 * and it is the one gradient in the app's chrome (DESIGN.md, carve-outs).
 *
 * **The menu is not here.** Settings and pages are opened from the header of
 * the story list (`IndexSheet`), the sheet a reader already opens for "the
 * rest of the app".
 */

/** The zuhd mark — `public/logo.svg`, the same three shapes on a 32-unit box. */
const MARK_PATH = Skia.Path.MakeFromSVGString(
  'M4.5 4.5H12L4.5 16.25Z M19.5 4.5H27.5L12 27.5H4.5Z M27.5 16.25V27.5H20Z',
);
const MARK_SIZE = 20;
/** How far below the row the shade runs out. */
const SHADE_FADE = SPACING.xl;
/** The shade's strength at the top edge and at the bottom of the row. */
const SHADE_TOP = 0.88;
const SHADE_ROW = 0.62;

const ZuhdMark = memo(function ZuhdMark({ color }: { color: string }) {
  if (!MARK_PATH) return null;
  return (
    <Canvas style={styles.mark}>
      <Group transform={[{ scale: MARK_SIZE / 32 }]}>
        <Path path={MARK_PATH} color={color} />
      </Group>
    </Canvas>
  );
});

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
  onHomePress,
  homeKey,
  items,
  onSelect,
  onAll,
  recede,
  gaugesEnabled,
}: {
  /** The mark: back to the newest story, zoom released. */
  onHomePress: () => void;
  /** Changes on every home press, so the gauges scroll back to their start. */
  homeKey: number;
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  onAll: () => void;
  /** 0 at rest, 1 with a story grown: the gauges step aside. */
  recede: SharedValue<number>;
  /** False while a story is grown, so a faded gauge cannot be tapped. */
  gaugesEnabled: boolean;
}) {
  const { colors, textVariants } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hasGauges = items.length > 0;
  const [rowHeight, setRowHeight] = useState(0);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.height);
    setRowHeight((prev) => (prev === next ? prev : next));
  }, []);

  // The row is as tall as a gauge whether or not the gauges have arrived, so
  // their arrival does not move the globe, whose centre is measured from here.
  const gaugeHeight = Math.ceil(
    (textVariants.labelXsTight.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.chrome) +
      (textVariants.tabularEmphasis.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.tabular) +
      1 +
      SPACING.xs +
      SPACING.sm,
  );

  const gaugesStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, recede.value));
    return { opacity: 1 - p, transform: [{ translateY: -SPACING.sm * p }] };
  });

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.row,
        { paddingTop: insets.top + SPACING.xs },
        // The scroller reaches the right edge and pads its own content.
        hasGauges ? styles.rightToEdge : null,
      ]}
      pointerEvents="box-none"
    >
      <Shade width={width} rowHeight={rowHeight} color={colors.bg} />
      <IconButton
        onPress={onHomePress}
        style={styles.home}
        accessibilityRole="header"
        accessibilityLabel="zuhd.news"
        accessibilityHint="Back to the newest story, with the globe's zoom reset"
      >
        <ZuhdMark color={colors.textEmphasis} />
      </IconButton>
      <Animated.View
        style={[styles.middle, { minHeight: gaugeHeight }, gaugesStyle]}
        pointerEvents={gaugesEnabled ? 'box-none' : 'none'}
      >
        <IndicatorStrip items={items} onSelect={onSelect} onAll={onAll} resetKey={homeKey} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Mirrors the reader column and the sheet, so every horizontal edge in
    // the app lands on one vertical.
    paddingHorizontal: SPACING.articlePadding,
    gap: SPACING.md,
  },
  rightToEdge: { paddingRight: 0 },
  shade: { position: 'absolute', top: 0, left: 0 },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center' },
  home: { paddingVertical: SPACING.xs },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
});
