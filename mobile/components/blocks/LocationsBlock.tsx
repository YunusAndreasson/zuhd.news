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
import { runOnJS, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { COUNTRY_DATA, type CountryData } from '../../constants/country-data';
import { EASING, FLAG, OPACITY, PRESSED_STYLE, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { hapticImpact } from '../../lib/haptics';
import { displayNameFromCode, topojsonNameFromCode } from '../../lib/iso-country';
import { bordersMesh, countries, createSkiaPathContext, land } from '../globe/shared';
import { Text } from '../primitives';
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

type Feature = (typeof countries.features)[number];

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
      const margin = focusPadFor(width) * 2;
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
