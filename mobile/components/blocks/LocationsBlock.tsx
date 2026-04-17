import { Canvas, Circle, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { geoCentroid, geoEquirectangular, geoPath } from 'd3-geo';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { COUNTRY_DATA, type CountryData } from '../../constants/country-data';
import { EASING, MAX_FONT_SCALE, PRESSED_STYLE, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { hapticImpact } from '../../lib/haptics';
import { displayNameFromCode, topojsonNameFromCode } from '../../lib/iso-country';
import { bordersMesh, countries, createSkiaPathContext, land } from '../globe/shared';
import { type BlockVariant, blockContainerStyle } from './index';
import { SourceCaption } from './SourceCaption';

// ── Geometry ────────────────────────────────────────────────────────────────
// Canvas height auto-computed from width × aspect below — no cap, so the map
// can't get "cut" just because a hardcoded ceiling kicked in on a wider device.
/** Zero pad — features render edge-to-edge inside the canvas so the title
 *  above sits directly against the first row of land. */
const FOCUS_PAD = 0;

/** If the highlighted features span more than this many degrees of longitude
 *  we skip rendering the map entirely. A regional map reads cleanly on a
 *  phone; a globe-spanning strip doesn't, and ten attempts at making it work
 *  gave us diminishing returns. The chip row is still shown so taps open
 *  the per-country sheet. */
const MAX_LNG_SPAN_FOR_MAP = 120;

// Standard world-map aspect (2:1). Full sphere shows top/bottom polar areas
// as part of the picture — same as any atlas. Earlier tight clips squeezed
// the continents into a narrow horizontal strip which read as "not enough
// vertical space."
const WORLD_CLIP_ASPECT = 2.0;

// Module-level Sphere object so fitSize always sees the same identity — some
// d3-geo type-guard paths are string-literal-strict and can fall back to
// defaults if the input shape isn't exactly recognised.
const SPHERE = { type: 'Sphere' } as const;

/** Explicit equirectangular world fit. Scale k is set so the full 2π rad of
 *  longitude span fits the canvas width; translate places the sphere's center
 *  at the canvas center, which at AR 2:1 puts lat +90 at y=0 and lat -90 at
 *  y=H — Antarctica included in full. */
function fitWorldProjection(
  proj: ReturnType<typeof geoEquirectangular>,
  width: number,
  height: number,
): void {
  // Defensive fallback in case fitSize misbehaves — hand-set scale/translate.
  proj
    .rotate([0, 0])
    .center([0, 0])
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2]);
  // Then let d3 tighten the fit on the sphere for correctness.
  proj.fitSize([width, height], SPHERE);
}

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

type Feature = (typeof countries.features)[number];

interface LocationsBlockProps {
  codes: string[];
  label?: string;
  caption?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
  /** Tap on a country chip opens the app-wide CountrySheet (deep dive). The
   *  block is intentionally agnostic to how the sheet is presented — the
   *  parent wires the ref + state. */
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
  const { colors, font, typography, textStyles } = useTheme();
  const isContext = variant === 'context';

  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  // Resolve ISO-2 codes → features. Keep `codes` alignment so chip index ↔
  // feature index line up. Unresolved codes render as disabled chips.
  const resolved = useMemo(() => {
    return codes.map((code) => {
      const name = topojsonNameFromCode(code);
      const feature = name
        ? (countries.features.find(
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

  // Decide whether the feature set fits on a single regional map. If the lng
  // span is too wide, we skip the canvas entirely and just show chips. We
  // compute bounds MANUALLY from each feature's raw coordinates instead of
  // using d3's geoBounds — d3's spherical geometry returns a degenerate
  // bbox (small span at the antimeridian) for globally-spanning feature
  // collections, which fooled the earlier gate into thinking the set was
  // regional and produced a 600px-tall near-empty canvas.
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
      const availableW = Math.max(1, width - 2 * FOCUS_PAD);
      const degreesPerPixel = lngSpan > 0 ? lngSpan / availableW : 1;
      const computed = latSpan / degreesPerPixel + 2 * FOCUS_PAD;
      if (!Number.isFinite(computed) || computed <= 0) return fallback;
      return {
        height: Math.round(Math.max(1, Math.min(600, computed))),
        showMap: true,
      };
    } catch {
      return fallback;
    }
  }, [highlightedFeatures, width]);

  // Chip selection drives everything.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selected = selectedIdx != null ? (resolved[selectedIdx] ?? null) : null;
  const selectedFeature = selected?.feature ?? null;

  // Always fit to the highlighted features — the user found the regional fit
  // perfect and the full-globe fallback broken, so we skip the world view
  // entirely. If no features resolve, fall back to world (rarely hit — dev
  // demo always has resolved countries).
  const projection = useMemo(() => {
    const proj = geoEquirectangular();
    const w = Math.max(width, 1);
    const h = Math.max(height, 1);
    if (highlightedFeatures.length === 0) {
      fitWorldProjection(proj, w, h);
      return proj;
    }
    const extent: [[number, number], [number, number]] = [
      [FOCUS_PAD, FOCUS_PAD],
      [Math.max(FOCUS_PAD + 1, w - FOCUS_PAD), Math.max(FOCUS_PAD + 1, h - FOCUS_PAD)],
    ];
    try {
      const fc = { type: 'FeatureCollection', features: highlightedFeatures } as const;
      proj.fitExtent(extent, fc as never);
    } catch {
      // Defensive: some degenerate bounds (coincident points, antimeridian
      // wrap edge cases) have been observed to throw inside d3-geo. Fall
      // back to the world fit so the sheet still renders instead of
      // crashing the whole app.
      fitWorldProjection(proj, w, h);
    }
    return proj;
  }, [highlightedFeatures, width, height]);

  // Skia paths — highlighted countries are always filled at low opacity so the
  // map is legible before any tap; selected country gets a stronger overlay.
  const paths = useMemo(() => {
    if (width <= 0 || height <= 0) {
      return {
        landPath: null as SkPath | null,
        borderPath: null as SkPath | null,
        highlightedFillPath: null as SkPath | null,
        selectedFillPath: null as SkPath | null,
      };
    }
    const ctx = createSkiaPathContext();
    const pg = geoPath(projection).context(ctx);

    const landPath = Skia.Path.Make();
    ctx.setPath(landPath);
    pg(land);

    const borderPath = Skia.Path.Make();
    ctx.setPath(borderPath);
    pg(bordersMesh);

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
    return { landPath, borderPath, highlightedFillPath, selectedFillPath };
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

  // Target transform: when a country is selected, scale the canvas so the
  // country's projected bounding box fills the viewport, then translate to
  // center it. Formula derives from Skia's transform order — the array
  // `[translateX, translateY, scale]` composes as T·S (matrix product), so
  // scale is applied first (around origin), then translate:
  //   p' = (cx·s + tx, cy·s + ty)
  // Solving p' = (W/2, H/2) gives tx = W/2 − cx·s, ty = H/2 − cy·s.
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
      const margin = FOCUS_PAD * 2;
      const sx = Math.max(0, width - margin * 2) / bw;
      const sy = Math.max(0, height - margin * 2) / bh;
      const s = Math.max(1.2, Math.min(8, Math.min(sx, sy)));
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

  // Applied inside Skia so paths re-rasterize at the target scale (vector zoom)
  // instead of scaling the Canvas output as a bitmap.
  const mapTransform = useDerivedValue(() => [
    { translateX: animTx.value },
    { translateY: animTy.value },
    { scale: animScale.value },
  ]);
  const inverseScale = useDerivedValue(() => 1 / Math.max(1, animScale.value));
  // Stroke widths scale with the Group transform, so divide-by-scale keeps
  // borders crisp without inflating into slabs at high zoom.
  const borderStrokeWidth = useDerivedValue(() =>
    Math.max(StyleSheet.hairlineWidth, 0.6 * inverseScale.value),
  );
  const selectedStrokeWidth = useDerivedValue(() => 1.25 * inverseScale.value);

  // ── Selection feedback ─────────────────────────────────────────────────
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (selectedIdx == null) return;
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: 500 });
  }, [selectedIdx, pulse]);
  // Pulse renders inside the transformed Group, so cancel out both the radius
  // growth and the stroke thickening that the scale would otherwise introduce.
  const pulseR = useDerivedValue(() => (6 + pulse.value * 26) * inverseScale.value);
  const pulseStrokeWidth = useDerivedValue(() => 1.5 * inverseScale.value);
  const pulseOpacity = useDerivedValue(() => 0.6 * (1 - pulse.value));

  // ── Handlers ───────────────────────────────────────────────────────────
  // Two-step interaction: chip tap ONLY zooms to the country. Tapping the
  // zoomed country on the map opens the CountrySheet. Keeps the chip row
  // predictable (tap = navigate the map) and reserves the "deep dive" for
  // the sheet, which is consistent with how country sheets open elsewhere.
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

  // Map tap: if a country is zoomed in, this opens the CountrySheet for it.
  // If nothing is zoomed, tap is a no-op — chips are the only way to select.
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

  // If the feature set doesn't produce a clean regional map, we render nothing
  // — label, chips, caption, source all disappear together. The editorial
  // assumption: if we can't show these countries on one map, their grouping
  // isn't spatially meaningful enough to merit a standalone block.
  if (!showMap) return null;

  return (
    <View
      style={blockContainerStyle[isContext ? 'context' : 'article']}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {label ? (
        <Text
          style={[textStyles.smallCapsXs, styles.label, { lineHeight: typography.sizeXs * 1.1 }]}
          maxFontSizeMultiplier={MAX_FONT_SCALE.label}
        >
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
                  {paths.borderPath ? (
                    <Path
                      path={paths.borderPath}
                      color={colors.textSecondary}
                      opacity={0.3}
                      style="stroke"
                      strokeWidth={borderStrokeWidth}
                    />
                  ) : null}
                  {paths.highlightedFillPath ? (
                    <Path
                      path={paths.highlightedFillPath}
                      color={colors.accent}
                      opacity={selectedFeature ? 0.22 : 0.4}
                      style="fill"
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
          </View>
        </GestureDetector>
      ) : null}

      {/* Chip row — the primary interaction. Tap zooms the map (when the map
          is visible) AND opens the shared CountrySheet via onCountryPress.
          If the bbox is too wide to render a map, chips are the whole UI. */}
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
                    opacity: disabled ? 0.4 : 1,
                  },
                  pressed && PRESSED_STYLE,
                ]}
              >
                <Text style={styles.chipFlag} maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
                  {ccToFlag(r.code)}
                </Text>
                <Text
                  style={{
                    ...font.semiBold,
                    fontSize: typography.sizeXs,
                    letterSpacing: typography.trackingCaps,
                    color: isSelected ? colors.bg : colors.textEmphasis,
                  }}
                  maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
                >
                  {r.code.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {caption ? (
        <Text
          style={[
            styles.caption,
            {
              ...font.italic,
              fontSize: typography.sizeSm,
              lineHeight: typography.sizeSm * typography.leadingBody,
              color: colors.accent,
            },
          ]}
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
        >
          {caption}
        </Text>
      ) : null}

      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  label: {
    marginBottom: SPACING.xxs,
  },
  mapWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 2,
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
    fontSize: 16,
  },
  caption: {
    marginTop: SPACING.xs,
  },
});
