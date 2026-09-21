import { Canvas, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { formatAudioDurationMinutes } from '../../lib/audio-duration';
import { CONTROL_ROW } from '../../lib/deck-layout';
import type { StripItem } from '../../lib/now';
import { Icon, IconButton } from '../primitives';
import type { IconButtonProps } from '../primitives/IconButton';
import { GAUGE_EXTRA, IndicatorStrip } from './IndicatorStrip';

/**
 * The gauges above the earth, scrolling from the reader column's left inset
 * to two fixed controls at the right: the briefing (▶) and the menu (≡).
 *
 * **A shade sits behind the bar.** The row floats over the globe, and a caps
 * label over a lit coastline or a city-light cluster was hard to read. The
 * shade is the screen's own ground, strongest under the status bar, still
 * holding under the row, and gone a little below it — so the globe runs up
 * into the bar rather than stopping at an edge. It is the web map's HUD scrim,
 * and one of the app's few gradients (DESIGN.md, carve-outs).
 *
 * **The menu is up here on purpose.** Moving through the stories is in the
 * dock under the thumb; the menu is opened a few times a week, and the top
 * corner is where both platforms put a destination that rare — out of the way
 * of a thumb that could hit it by accident. The top *left* was considered and
 * passed over: it is where the gauges start, largest move first, and the
 * farthest reach for a right thumb. `markets`, which sat between the gauges
 * and the menu, is a row in the menu since 2026-09-21; the strip's own
 * `all →` still ends the row.
 *
 * **The briefing sits beside it, at the user's request (2026-09-21).** It was
 * the first of the dock's three circles. Up here it is a bare glyph like the
 * menu's, because two neighbours drawn two ways read as unrelated marks. It
 * hides while the player bar is up — a second play button over audio already
 * playing says the opposite of what is happening — and its slot stays, so
 * the gauges do not widen and narrow with the player.
 *
 * **The two are aligned by construction, not by eye.** Each is a
 * `HeaderControl`: one box, one height, one optical nudge, and its glyph
 * centred in a square of one size. Neither may carry a style of its own that
 * moves it vertically; the user asked for the pair to line up exactly, and a
 * per-button offset is how two icons drift a point apart.
 *
 * **It is three lines, not a cog.** It opens markets, search, saved, settings,
 * the map key and the pages, and a cog promises only settings — a reader looking for
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
const CONTROL_WIDTH = CONTROL_ROW - SPACING.sm;
/** The square each control's glyph is centred in, and the heard ring's size. */
const GLYPH_BOX = 30;
const HEARD_STROKE = 1.5;
/** A play triangle's weight sits left of its box's centre; this puts it in
 *  the middle of its square to the eye. Horizontal only. */
const PLAY_NUDGE = 1.5;
/** How far below the row the shade runs out. */
const SHADE_FADE = SPACING.xxl;
/** The fade's steps, as fractions of the way down it, and how much of the
 *  row's strength is left at each: smoothstep, so the fade leaves the row and
 *  meets the globe with no slope at either end. It was a straight ramp over
 *  32pt, and its two ends — where the slope jumps — read as two lines across
 *  the light globe. Over 48pt its steepest point is the old ramp's slope. */
const SHADE_EASE = [0, 0.25, 0.5, 0.75, 1].map((t) => [t, 1 - t * t * (3 - 2 * t)] as const);
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
    return [at(SHADE_TOP), ...SHADE_EASE.map(([, left]) => at(SHADE_ROW * left))];
  }, [color]);
  const positions = useMemo(() => {
    const row = rowHeight / height;
    return [0, ...SHADE_EASE.map(([t]) => row + (1 - row) * t)];
  }, [rowHeight, height]);
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

/**
 * How much of the briefing has been heard, drawn round the play glyph from
 * twelve o'clock over a ring in rule ink. A fresh briefing, one paused
 * halfway and one finished looked identical; the difference lived only in the
 * screen reader's label. Static: the button only shows while the player is
 * down, so the arc never moves.
 */
const HeardRing = memo(function HeardRing({
  heard,
  track,
  color,
}: {
  heard: number;
  track: string;
  color: string;
}) {
  const path = useMemo(() => {
    const inset = HEARD_STROKE / 2;
    const d = GLYPH_BOX - HEARD_STROKE;
    return Skia.PathBuilder.Make()
      .addArc(Skia.XYWHRect(inset, inset, d, d), -90, 360)
      .build();
  }, []);
  return (
    <Canvas
      style={styles.ring}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path path={path} style="stroke" strokeWidth={HEARD_STROKE} color={track} />
      <Path
        path={path}
        style="stroke"
        strokeWidth={HEARD_STROKE}
        strokeCap="round"
        color={color}
        start={0}
        end={heard}
      />
    </Canvas>
  );
});

/** One of the bar's two controls. Both go through here so they share every
 *  number that places a glyph vertically. */
function HeaderControl({
  children,
  ...button
}: Omit<IconButtonProps, 'style' | 'hitSlop' | 'haptic'>) {
  return (
    // The screen's handlers give their own feedback, as they do for every gauge.
    <IconButton {...button} haptic="none" hitSlop={0} style={styles.control}>
      <View style={styles.glyph}>{children}</View>
    </IconButton>
  );
}

export const MapHeader = memo(function MapHeader({
  items,
  onSelect,
  onAll,
  onMenuPress,
  selectedId = null,
  linkedIds,
  linkedColor,
  listenAvailable = false,
  listenResumable = false,
  listenDuration,
  listenHeard = 0,
  onListenPress,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  onAll: () => void;
  onMenuPress: () => void;
  /** Today's briefing exists and its player is not already up. */
  listenAvailable?: boolean;
  listenResumable?: boolean;
  listenDuration?: number;
  /** Share of a paused briefing already heard, 0–1. */
  listenHeard?: number;
  onListenPress?: () => void;
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
  // The two controls and the row's gap before each.
  const stripViewport = width - leftInset - insets.right - 2 * (CONTROL_WIDTH + SPACING.xs);

  const heard = listenResumable ? Math.min(1, Math.max(0, listenHeard)) : 0;
  const listenMinutes = formatAudioDurationMinutes(
    heard > 0 && listenDuration ? listenDuration * (1 - heard) : listenDuration,
  );

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
      {listenAvailable && onListenPress ? (
        <HeaderControl
          onPress={onListenPress}
          accessibilityLabel={`${listenResumable ? 'Resume daily briefing' : 'Daily briefing'}${listenMinutes ? `, ${listenMinutes}${heard > 0 ? ' left' : ''}` : ''}`}
          accessibilityHint={
            listenResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
          }
        >
          {heard > 0 ? (
            <HeardRing heard={heard} track={colors.rule} color={colors.textSecondary} />
          ) : null}
          <View style={styles.playNudge}>
            <Icon name="play" size="md" tone="default" />
          </View>
        </HeaderControl>
      ) : (
        <View style={styles.control} pointerEvents="none" accessible={false} />
      )}
      <HeaderControl
        onPress={onMenuPress}
        accessibilityLabel="Menu"
        accessibilityHint="Markets, search, saved stories, settings, the map key and about"
      >
        <Icon name="menu" size="md" tone="default" />
      </HeaderControl>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  control: {
    width: CONTROL_WIDTH,
    height: CONTROL_ROW,
    // Optical alignment with the gauges' text, which sits above their
    // selection bar; the icon font's own ascent is accounted for too.
    paddingBottom: GAUGE_EXTRA,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    width: GLYPH_BOX,
    height: GLYPH_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', top: 0, left: 0, width: GLYPH_BOX, height: GLYPH_BOX },
  playNudge: { transform: [{ translateX: PLAY_NUDGE }] },
  shade: { position: 'absolute', top: 0, left: 0 },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center' },
});
