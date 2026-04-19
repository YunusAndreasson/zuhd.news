import { Canvas, Circle, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { geoCentroid, geoEquirectangular, geoPath } from 'd3-geo';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  Pressable,
  Text as RNText,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COUNTRY_DATA, type CountryData } from '../../constants/country-data';
import { EASING, FLAG, OPACITY, PRESSED_STYLE, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { hapticImpact } from '../../lib/haptics';
import { displayNameFromCode, topojsonNameFromCode } from '../../lib/iso-country';
import { createSkiaPathContext } from '../globe/shared';
import { Text } from '../primitives';
import {
  bordersMeshHiRes,
  CAPITALS_BY_ISO2,
  countriesHiRes,
  lakesHiRes,
  landHiRes,
  riversHiRes,
  SEAS,
} from './locations-geo';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle } from './shared';

/** Inset the highlighted bounding box from the canvas edges so country
 *  borders aren't flush against the frame. 8% of width feels like a
 *  considered margin — a hair less than 10% so small countries don't look
 *  lonely in the middle. Floor at 12px prevents degenerate insets on
 *  narrow viewports. */
const FOCUS_PAD_FRACTION = 0.08;
const FOCUS_PAD_MIN = 12;
const focusPadFor = (w: number) =>
  Math.max(FOCUS_PAD_MIN, Math.round(Math.max(0, w) * FOCUS_PAD_FRACTION));
const MAX_LNG_SPAN_FOR_MAP = 120;
const WORLD_CLIP_ASPECT = 2.0;
// Label box width. Wide enough for ~20 characters of labelXs ("Bosnia and
// Herzegovina", "Central African Republic"); longer names clip with
// numberOfLines={1}. Centered on the centroid via `left: x - LABEL_WIDTH/2`.
const LABEL_WIDTH = 160;

const SPHERE = { type: 'Sphere' } as const;

function fitWorldProjection(
  proj: ReturnType<typeof geoEquirectangular>,
  width: number,
  height: number,
): void {
  proj
    .rotate([0, 0])
    .center([0, 0])
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2]);
  proj.fitSize([width, height], SPHERE);
}

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

/** Pick a screen-space label point for a river. Finds the longest
 *  constituent LineString and returns the midpoint of the longest *run* of
 *  consecutive vertices that project inside the selected country bbox — so
 *  a river that passes through the country gets its label placed on the
 *  visible segment, not at the planar centroid (often miles offshore). */
function riverLabelPointIn(
  f: GeoJSON.Feature,
  projection: (lngLat: [number, number]) => [number, number] | null,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): [number, number] | null {
  const geom = f.geometry;
  if (!geom) return null;
  const lines: GeoJSON.Position[][] =
    geom.type === 'LineString'
      ? [geom.coordinates]
      : geom.type === 'MultiLineString'
        ? geom.coordinates
        : [];
  let bestMid: [number, number] | null = null;
  let bestRunLen = 0;
  for (const line of lines) {
    const projected: [number, number][] = [];
    for (const pos of line) {
      const lng = pos[0];
      const lat = pos[1];
      if (lng == null || lat == null) continue;
      const p = projection([lng, lat]);
      if (!p) continue;
      projected.push([p[0], p[1]]);
    }
    // Find the longest run of consecutive in-bbox vertices, then take its
    // midpoint. Falls through to the overall midpoint when nothing crosses.
    let runStart = -1;
    let runBestStart = -1;
    let runBestLen = 0;
    for (let i = 0; i < projected.length; i++) {
      const pt = projected[i];
      if (!pt) continue;
      const [x, y] = pt;
      const inside = x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
      if (inside) {
        if (runStart < 0) runStart = i;
        const curLen = i - runStart + 1;
        if (curLen > runBestLen) {
          runBestLen = curLen;
          runBestStart = runStart;
        }
      } else {
        runStart = -1;
      }
    }
    if (runBestLen > bestRunLen && runBestStart >= 0) {
      bestRunLen = runBestLen;
      const mid = projected[runBestStart + Math.floor(runBestLen / 2)];
      if (mid) bestMid = [mid[0], mid[1]];
    }
  }
  return bestMid;
}

type Feature = (typeof countriesHiRes.features)[number];

/** Label that stays glued to a projected point during the zoom animation.
 *  Math mirrors the Skia `Group transform={[tx, ty, scale]}` — for a projected
 *  centroid (x, y), the screen position after the group transform is
 *  `(tx + x*scale, ty + y*scale)`. We reuse that here via a UI-thread worklet
 *  and apply only the translate (never the scale), so text stays the same
 *  visual size while the paths underneath grow. */
const MapLabel = memo(function MapLabel({
  text,
  x,
  y,
  kind,
  animScale,
  animTx,
  animTy,
}: {
  text: string;
  x: number;
  y: number;
  /** Visual role — country (small caps, emphasis), capital (caption,
   *  emphasis, below marker dot), or water (italic sectionHeading, shown
   *  only when zoomed). All use textEmphasis for contrast. */
  kind: 'country' | 'capital' | 'water';
  animScale: SharedValue<number>;
  animTx: SharedValue<number>;
  animTy: SharedValue<number>;
}) {
  const { colors, typography } = useTheme();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: animTx.value + x * (animScale.value - 1) },
      { translateY: animTy.value + y * (animScale.value - 1) },
    ],
  }));
  const variant =
    kind === 'country' ? 'labelXs' : kind === 'capital' ? 'caption' : 'sectionHeading';
  // Capital labels sit just below the marker dot; country + water labels
  // are centered on the point.
  const yOffset = kind === 'capital' ? typography.sizeXs * 0.6 : -typography.sizeXs * 0.6;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.countryLabelWrap,
        { left: x - LABEL_WIDTH / 2, top: y + yOffset },
        animatedStyle,
      ]}
    >
      <Text
        variant={variant}
        style={[styles.countryLabel, { color: colors.textEmphasis, textShadowColor: colors.bg }]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </Animated.View>
  );
});

interface LocationsBlockProps {
  codes: string[];
  label?: string;
  caption?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
  onCountryPress?: (payload: { countryName: string; data: CountryData | null }) => void;
}

export const LocationsBlock = memo(function LocationsBlock({
  codes,
  label,
  caption,
  variant = 'article',
  sourceLabel,
  onCountryPress,
}: LocationsBlockProps) {
  const { colors, typography } = useTheme();
  const isContext = variant === 'context';

  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const resolved = useMemo(() => {
    return codes.map((code) => {
      const name = topojsonNameFromCode(code);
      const feature = name
        ? (countriesHiRes.features.find(
            (f) => (f.properties as { name?: string } | undefined)?.name === name,
          ) ?? null)
        : null;
      return { code, feature, name };
    });
  }, [codes]);

  const highlightedFeatures = useMemo(
    () => resolved.map((r) => r.feature).filter((f): f is Feature => f != null),
    [resolved],
  );

  const { height, showMap } = useMemo((): { height: number; showMap: boolean } => {
    const fallback = { height: Math.max(1, width / WORLD_CLIP_ASPECT), showMap: false };
    if (highlightedFeatures.length === 0 || width <= 0) return fallback;
    try {
      let lngMin = Infinity;
      let lngMax = -Infinity;
      let latMin = Infinity;
      let latMax = -Infinity;
      const walk = (coords: unknown): void => {
        if (Array.isArray(coords) && typeof coords[0] === 'number') {
          const lng = coords[0];
          const lat = coords[1] as number;
          if (lng < lngMin) lngMin = lng;
          if (lng > lngMax) lngMax = lng;
          if (lat < latMin) latMin = lat;
          if (lat > latMax) latMax = lat;
          return;
        }
        if (Array.isArray(coords)) for (const c of coords) walk(c);
      };
      for (const f of highlightedFeatures) {
        if (f.geometry) walk((f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
      }
      if (
        !Number.isFinite(lngMin) ||
        !Number.isFinite(lngMax) ||
        !Number.isFinite(latMin) ||
        !Number.isFinite(latMax)
      ) {
        return fallback;
      }
      const lngSpan = lngMax - lngMin;
      const latSpan = Math.max(1, latMax - latMin);
      if (lngSpan > MAX_LNG_SPAN_FOR_MAP) {
        return { height: 0, showMap: false };
      }
      const pad = focusPadFor(width);
      const availableW = Math.max(1, width - 2 * pad);
      const degreesPerPixel = lngSpan > 0 ? lngSpan / availableW : 1;
      const computed = latSpan / degreesPerPixel + 2 * pad;
      if (!Number.isFinite(computed) || computed <= 0) return fallback;
      return {
        height: Math.round(Math.max(1, Math.min(600, computed))),
        showMap: true,
      };
    } catch {
      return fallback;
    }
  }, [highlightedFeatures, width]);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selected = selectedIdx != null ? (resolved[selectedIdx] ?? null) : null;
  const selectedFeature = selected?.feature ?? null;

  const projection = useMemo(() => {
    const proj = geoEquirectangular();
    const w = Math.max(width, 1);
    const h = Math.max(height, 1);
    if (highlightedFeatures.length === 0) {
      fitWorldProjection(proj, w, h);
      return proj;
    }
    const pad = focusPadFor(w);
    const extent: [[number, number], [number, number]] = [
      [pad, pad],
      [Math.max(pad + 1, w - pad), Math.max(pad + 1, h - pad)],
    ];
    try {
      const fc = { type: 'FeatureCollection', features: highlightedFeatures } as const;
      proj.fitExtent(extent, fc as never);
    } catch {
      fitWorldProjection(proj, w, h);
    }
    return proj;
  }, [highlightedFeatures, width, height]);

  const paths = useMemo(() => {
    if (width <= 0 || height <= 0) {
      return {
        landPath: null as SkPath | null,
        borderPath: null as SkPath | null,
        lakesPath: null as SkPath | null,
        riversPath: null as SkPath | null,
        highlightedFillPath: null as SkPath | null,
        selectedFillPath: null as SkPath | null,
      };
    }
    const ctx = createSkiaPathContext();
    const pg = geoPath(projection).context(ctx);

    const landPath = Skia.Path.Make();
    ctx.setPath(landPath);
    pg(landHiRes);

    const borderPath = Skia.Path.Make();
    ctx.setPath(borderPath);
    pg(bordersMeshHiRes);

    const lakesPath = Skia.Path.Make();
    ctx.setPath(lakesPath);
    pg(lakesHiRes);

    // Rivers — only draw major ones (scalerank ≤ 5). At world/continent
    // zoom levels the finer ranks become visual noise without adding
    // information, and the dropped rank is what NE intends for this scale.
    const riversPath = Skia.Path.Make();
    ctx.setPath(riversPath);
    const majorRivers: GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>[] =
      riversHiRes.features.filter((f) => {
        const rank = (f.properties as { scalerank?: number } | undefined)?.scalerank;
        return typeof rank === 'number' && rank <= 5;
      });
    pg({ type: 'FeatureCollection', features: majorRivers } as never);

    let highlightedFillPath: SkPath | null = null;
    if (highlightedFeatures.length > 0) {
      const p = Skia.Path.Make();
      ctx.setPath(p);
      pg({ type: 'FeatureCollection', features: highlightedFeatures } as never);
      highlightedFillPath = p;
    }

    let selectedFillPath: SkPath | null = null;
    if (selectedFeature) {
      const p = Skia.Path.Make();
      ctx.setPath(p);
      pg(selectedFeature);
      selectedFillPath = p;
    }
    return {
      landPath,
      borderPath,
      lakesPath,
      riversPath,
      highlightedFillPath,
      selectedFillPath,
    };
  }, [projection, highlightedFeatures, selectedFeature, width, height]);

  const selectedCentroid = useMemo(() => {
    if (!selectedFeature) return null;
    try {
      const c = geoCentroid(selectedFeature) as [number, number];
      const p = projection(c);
      return p ? { x: p[0], y: p[1] } : null;
    } catch {
      return null;
    }
  }, [selectedFeature, projection]);

  // Highlighted-country labels — one RN Text per centroid, positioned in the
  // unzoomed projection. Names come straight from the TopoJSON feature
  // properties (Natural Earth canonical names), matching what the countries
  // dataset itself uses for lookups. Rendered outside the Skia Group; each
  // label tracks the zoom via its own worklet (CountryLabel) so the names
  // stay glued to their countries when a chip is tapped.
  const highlightedLabels = useMemo(() => {
    if (highlightedFeatures.length === 0) return [];
    return highlightedFeatures
      .map((f) => {
        const name = (f.properties as { name?: string } | undefined)?.name;
        if (!name) return null;
        try {
          const c = geoCentroid(f) as [number, number];
          const p = projection(c);
          if (!p) return null;
          return { name, x: p[0], y: p[1] };
        } catch {
          return null;
        }
      })
      .filter((v): v is { name: string; x: number; y: number } => v != null);
  }, [highlightedFeatures, projection]);

  // Capital cities for each highlighted country — marker + label. Lookup is
  // ISO-2 → precomputed {name, lat, lng} (NE 50m populated places, filtered
  // to admin-0 capitals at build time). Projected once; the marker rides
  // inside the Skia Group so it zooms with the country, the label rides
  // outside with a zoom-tracking worklet.
  const capitalMarkers = useMemo(() => {
    if (width <= 0 || height <= 0) return [];
    return resolved
      .map((r) => {
        const cap = CAPITALS_BY_ISO2[r.code];
        if (!cap) return null;
        const p = projection([cap.lng, cap.lat]);
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
        if (p[0] < 0 || p[0] > width || p[1] < 0 || p[1] > height) return null;
        return { name: cap.name, x: p[0], y: p[1], code: r.code };
      })
      .filter((v): v is { name: string; x: number; y: number; code: string } => v != null);
  }, [resolved, projection, width, height]);

  // Named rivers, lakes, and seas to label — only populated when a country
  // is selected (zoomed-in view). In the fit-all view, water features draw
  // as shapes only; their names would clutter the map without a clear
  // focus. Label positions live in pre-zoom projected coords so the
  // `MapLabel` transform worklet can ride them to screen.
  const waterLabels = useMemo(() => {
    if (selectedIdx == null || !selectedFeature || width <= 0 || height <= 0) {
      return [] as { key: string; name: string; x: number; y: number; kind: 'water' }[];
    }
    const pg = geoPath(projection);
    let bounds: [[number, number], [number, number]];
    try {
      bounds = pg.bounds(selectedFeature as never);
    } catch {
      return [];
    }
    const [[bx0, by0], [bx1, by1]] = bounds;
    if (!Number.isFinite(bx0) || !Number.isFinite(by1)) return [];
    const inBounds = (x: number, y: number, pad = 0) =>
      x >= bx0 - pad && x <= bx1 + pad && y >= by0 - pad && y <= by1 + pad;

    const out: { key: string; name: string; x: number; y: number; kind: 'water' }[] = [];

    // Lakes: centroid inside the bbox.
    for (const f of lakesHiRes.features) {
      const name = (f.properties as { name?: string } | undefined)?.name;
      if (!name) continue;
      let cx: number;
      let cy: number;
      try {
        [cx, cy] = pg.centroid(f as never);
      } catch {
        continue;
      }
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      if (!inBounds(cx, cy)) continue;
      out.push({ key: `lake-${name}-${out.length}`, name, x: cx, y: cy, kind: 'water' });
    }

    // Rivers: project the longest constituent line; if the midpoint of any
    // contiguous in-bbox run lands inside the bbox, label there. Falls back
    // to the line midpoint when nothing crosses cleanly.
    for (const f of riversHiRes.features) {
      const props = f.properties as { name?: string; scalerank?: number } | undefined;
      const name = props?.name;
      const rank = props?.scalerank;
      if (!name || typeof rank !== 'number' || rank > 5) continue;
      const labelPt = riverLabelPointIn(f, projection, bx0, by0, bx1, by1);
      if (!labelPt) continue;
      out.push({
        key: `river-${name}-${out.length}`,
        name,
        x: labelPt[0],
        y: labelPt[1],
        kind: 'water',
      });
    }

    // Seas, bays, gulfs: centroid within a padded bbox (seas sit outside
    // land, so we inflate by 40% of the shorter side to catch adjacent
    // bodies like the Persian Gulf when zoomed to Kuwait).
    const padX = Math.max(40, (bx1 - bx0) * 0.4);
    const padY = Math.max(40, (by1 - by0) * 0.4);
    for (const s of SEAS) {
      const p = projection([s.lng, s.lat]);
      if (!p) continue;
      const [x, y] = p;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < bx0 - padX || x > bx1 + padX || y < by0 - padY || y > by1 + padY) continue;
      // Clamp into the actual canvas so off-canvas seas don't render
      // labels that end up over land on the opposite side of the map.
      if (x < 0 || x > width || y < 0 || y > height) continue;
      out.push({ key: `sea-${s.name}-${out.length}`, name: s.name, x, y, kind: 'water' });
    }

    return out;
  }, [selectedIdx, selectedFeature, projection, width, height]);

  const { targetScale, targetTx, targetTy } = useMemo(() => {
    if (!selectedFeature || width <= 0 || height <= 0) {
      return { targetScale: 1, targetTx: 0, targetTy: 0 };
    }
    try {
      const pg = geoPath(projection);
      const [[x0, y0], [x1, y1]] = pg.bounds(selectedFeature as never);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (!Number.isFinite(bw) || !Number.isFinite(bh) || bw <= 0 || bh <= 0) {
        return { targetScale: 1, targetTx: 0, targetTy: 0 };
      }
      // Half the base focus padding — the initial fitExtent already gave
      // the map a comfortable margin, so the zoom-in just needs enough
      // slack to keep the selected country off the frame edge, not another
      // full pad. Previously doubled the pad then squared it in the usable
      // formula, which left ~32% of the viewport as blank padding.
      const margin = Math.max(8, focusPadFor(width) * 0.5);
      const sx = Math.max(0, width - margin * 2) / bw;
      const sy = Math.max(0, height - margin * 2) / bh;
      // Cap bumped 8 → 12 so very small countries (Kuwait, Bahrain, Qatar)
      // zoom in enough to actually dominate the viewport.
      const s = Math.max(1.2, Math.min(12, Math.min(sx, sy)));
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      return {
        targetScale: s,
        targetTx: width / 2 - cx * s,
        targetTy: height / 2 - cy * s,
      };
    } catch {
      return { targetScale: 1, targetTx: 0, targetTy: 0 };
    }
  }, [selectedFeature, projection, width, height]);

  const animScale = useSharedValue(1);
  const animTx = useSharedValue(0);
  const animTy = useSharedValue(0);
  useEffect(() => {
    animScale.value = withTiming(targetScale, { duration: 420, easing: EASING.out });
    animTx.value = withTiming(targetTx, { duration: 420, easing: EASING.out });
    animTy.value = withTiming(targetTy, { duration: 420, easing: EASING.out });
  }, [targetScale, targetTx, targetTy, animScale, animTx, animTy]);

  const mapTransform = useDerivedValue(() => [
    { translateX: animTx.value },
    { translateY: animTy.value },
    { scale: animScale.value },
  ]);
  const inverseScale = useDerivedValue(() => 1 / Math.max(1, animScale.value));
  const borderStrokeWidth = useDerivedValue(() =>
    Math.max(StyleSheet.hairlineWidth, 0.6 * inverseScale.value),
  );
  const selectedStrokeWidth = useDerivedValue(() => 1.25 * inverseScale.value);

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (selectedIdx == null) return;
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: 500 });
  }, [selectedIdx, pulse]);

  const pulseR = useDerivedValue(() => (6 + pulse.value * 26) * inverseScale.value);
  const pulseStrokeWidth = useDerivedValue(() => 1.5 * inverseScale.value);
  const pulseOpacity = useDerivedValue(() => 0.6 * (1 - pulse.value));

  // Rivers at 1.5px core + 3px halo visual weight regardless of zoom.
  // Halo is a bg-colored stroke drawn underneath the core, giving every
  // river a high-contrast edge against the selected country's accent
  // fill — otherwise thin rivers like the Ganges dissolve into warm
  // background colors. Capital markers stay at 3px.
  const riverStrokeWidth = useDerivedValue(() =>
    Math.max(StyleSheet.hairlineWidth, 1.5 * inverseScale.value),
  );
  const riverHaloStrokeWidth = useDerivedValue(() =>
    Math.max(StyleSheet.hairlineWidth, 3.0 * inverseScale.value),
  );
  const capitalR = useDerivedValue(() => 3 * inverseScale.value);
  const capitalStrokeWidth = useDerivedValue(() => 1.25 * inverseScale.value);

  const toggleSelection = useCallback((idx: number) => {
    hapticImpact();
    setSelectedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  const openSelectedCountrySheet = useCallback(() => {
    if (selectedIdx == null || !onCountryPress) return;
    const r = resolved[selectedIdx];
    const name =
      (r?.feature?.properties as { name?: string } | undefined)?.name ??
      (r?.code ? (displayNameFromCode(r.code) ?? '') : '');
    const data = name ? (COUNTRY_DATA[name] ?? null) : null;
    if (!name) return;
    hapticImpact();
    onCountryPress({ countryName: name, data });
  }, [selectedIdx, resolved, onCountryPress]);

  const mapTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd((_e, success) => {
          'worklet';
          if (!success) return;
          runOnJS(openSelectedCountrySheet)();
        }),
    [openSelectedCountrySheet],
  );

  if (!showMap) return null;

  return (
    <View
      style={blockContainerStyle[isContext ? 'context' : 'article']}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {label ? (
        <Text variant="labelXs" style={[styles.label, { lineHeight: typography.sizeXs * 1.1 }]}>
          {label}
        </Text>
      ) : null}
      {showMap ? (
        <GestureDetector gesture={mapTapGesture}>
          <View onLayout={onLayout} style={[styles.mapWrap, { height }]}>
            {width > 0 && height > 0 ? (
              <Canvas style={{ width, height }}>
                <Group transform={mapTransform}>
                  {paths.landPath ? (
                    <Path
                      path={paths.landPath}
                      color={colors.textSecondary}
                      opacity={0.2}
                      style="fill"
                    />
                  ) : null}
                  {paths.highlightedFillPath ? (
                    <>
                      <Path
                        path={paths.highlightedFillPath}
                        color={colors.accent}
                        opacity={selectedFeature ? 0.22 : 0.4}
                        style="fill"
                      />
                      {/* Stroke the highlighted path itself — traces every
                          highlighted country's outline so adjacent selections
                          stay visibly distinct. The global `borderPath`
                          below is dim (0.3 opacity); this per-country stroke
                          in emphasis color guarantees the separation reads
                          clearly against the accent fill. */}
                      <Path
                        path={paths.highlightedFillPath}
                        color={colors.textEmphasis}
                        opacity={0.6}
                        style="stroke"
                        strokeWidth={borderStrokeWidth}
                      />
                    </>
                  ) : null}
                  {/* Global borders draw after the highlight fill so country
                      lines in non-highlighted regions remain visible. */}
                  {paths.borderPath ? (
                    <Path
                      path={paths.borderPath}
                      color={colors.textSecondary}
                      opacity={0.3}
                      style="stroke"
                      strokeWidth={borderStrokeWidth}
                    />
                  ) : null}
                  {paths.selectedFillPath ? (
                    <>
                      <Path
                        path={paths.selectedFillPath}
                        color={colors.accent}
                        opacity={0.7}
                        style="fill"
                      />
                      <Path
                        path={paths.selectedFillPath}
                        color={colors.textEmphasis}
                        style="stroke"
                        strokeWidth={selectedStrokeWidth}
                      />
                    </>
                  ) : null}
                  {/* Rivers with halo — bg-colored wider stroke underneath,
                      dark textEmphasis stroke on top. This two-layer pattern
                      survives any background: over the plain land tint the
                      halo barely registers (bg ≈ background); over the
                      warm accent of a selected country the halo gives the
                      river its own white edge so the dark line inside has
                      a clear boundary to read against. */}
                  {paths.riversPath ? (
                    <>
                      <Path
                        path={paths.riversPath}
                        color={colors.bg}
                        opacity={0.75}
                        style="stroke"
                        strokeWidth={riverHaloStrokeWidth}
                      />
                      <Path
                        path={paths.riversPath}
                        color={colors.textEmphasis}
                        opacity={0.8}
                        style="stroke"
                        strokeWidth={riverStrokeWidth}
                      />
                    </>
                  ) : null}
                  {/* Lakes on top — painted with bg so they "punch through"
                      land tint, highlight, and selected fill alike. A lake
                      reads as water regardless of which country owns it.
                      Drawn after rivers so a river flowing into the lake
                      doesn't draw a line across the lake's interior. */}
                  {paths.lakesPath ? (
                    <Path path={paths.lakesPath} color={colors.bg} style="fill" />
                  ) : null}
                  {/* Capital markers for each highlighted country — small
                      accent dot with a bg-colored ring so the marker reads
                      whether it sits over land, lake, or accent fill. */}
                  {capitalMarkers.map((cap) => (
                    <Group key={`cap-${cap.code}`}>
                      <Circle
                        cx={cap.x}
                        cy={cap.y}
                        r={capitalR}
                        color={colors.bg}
                        style="stroke"
                        strokeWidth={capitalStrokeWidth}
                      />
                      <Circle cx={cap.x} cy={cap.y} r={capitalR} color={colors.accent} />
                    </Group>
                  ))}
                  {selectedCentroid ? (
                    <Circle
                      cx={selectedCentroid.x}
                      cy={selectedCentroid.y}
                      r={pulseR}
                      color={colors.accent}
                      opacity={pulseOpacity}
                      style="stroke"
                      strokeWidth={pulseStrokeWidth}
                    />
                  ) : null}
                </Group>
              </Canvas>
            ) : null}
            {highlightedLabels.length + capitalMarkers.length + waterLabels.length > 0 ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {waterLabels.map((l) => (
                  <MapLabel
                    key={l.key}
                    text={l.name}
                    x={l.x}
                    y={l.y}
                    kind="water"
                    animScale={animScale}
                    animTx={animTx}
                    animTy={animTy}
                  />
                ))}
                {highlightedLabels.map((l) => (
                  <MapLabel
                    key={`country-${l.name}`}
                    text={l.name}
                    x={l.x}
                    y={l.y}
                    kind="country"
                    animScale={animScale}
                    animTx={animTx}
                    animTy={animTy}
                  />
                ))}
                {capitalMarkers.map((cap) => (
                  <MapLabel
                    key={`cap-label-${cap.code}`}
                    text={cap.name}
                    x={cap.x}
                    y={cap.y}
                    kind="capital"
                    animScale={animScale}
                    animTx={animTx}
                    animTy={animTy}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </GestureDetector>
      ) : null}

      {resolved.length > 0 ? (
        <View style={styles.chipRow}>
          {resolved.map((r, idx) => {
            const isSelected = idx === selectedIdx;
            const disabled = r.feature == null;
            return (
              <Pressable
                key={`${r.code}-${idx}`}
                onPress={disabled ? undefined : () => toggleSelection(idx)}
                disabled={disabled}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={displayNameFromCode(r.code)}
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityHint={
                  isSelected ? 'Double tap to zoom out' : 'Double tap to zoom to this country'
                }
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: isSelected ? colors.accent : colors.pillBg,
                    opacity: disabled ? OPACITY.disabled : 1,
                  },
                  pressed && PRESSED_STYLE,
                ]}
              >
                <RNText style={styles.chipFlag}>{ccToFlag(r.code)}</RNText>
                {/* Chip label: semiBold + sizeXs + bg-or-emphasis color —
                    captionEmphasis is semiBold + sizeSm; scale down to sizeXs. */}
                <Text
                  variant="captionEmphasis"
                  scale={typography.sizeXs / typography.sizeSm}
                  style={{ color: isSelected ? colors.bg : colors.textEmphasis }}
                >
                  {displayNameFromCode(r.code)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {caption ? (
        <Text variant="sectionHeading" tone="accent" style={styles.caption}>
          {caption}
        </Text>
      ) : null}

      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    marginBottom: SPACING.xxs,
  },
  mapWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: RADIUS.handle,
  },
  countryLabelWrap: {
    position: 'absolute',
    width: LABEL_WIDTH,
  },
  countryLabel: {
    width: LABEL_WIDTH,
    textAlign: 'center',
    // Bg-colored shadow on all four sides fakes a text halo — keeps labels
    // readable whether they land on sea, land tint, or accent fill.
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  chipFlag: {
    fontSize: FLAG.chip,
  },
  caption: {
    marginTop: SPACING.xs,
  },
});
