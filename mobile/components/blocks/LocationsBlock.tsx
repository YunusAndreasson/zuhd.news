import { Canvas, Circle, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { geoBounds, geoCentroid, geoEquirectangular, geoPath } from 'd3-geo';
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
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COUNTRY_DATA, type CountryData } from '../../constants/country-data';
import { ANIMATION, MAX_FONT_SCALE, PRESSED_STYLE, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { hapticImpact } from '../../lib/haptics';
import { displayNameFromCode, topojsonNameFromCode } from '../../lib/iso-country';
import { bordersMesh, countries, createSkiaPathContext, land } from '../globe/shared';
import { type BlockVariant, blockContainerStyle } from './index';
import { SourceCaption } from './SourceCaption';

// ── Geometry ────────────────────────────────────────────────────────────────
const MAP_ASPECT = 2;
const MAP_HEIGHT = { article: 200, context: 180 } as const;
/** Pixel pad inside the canvas when fitting. Kept modest so the focal region
 *  dominates — neighbors appear in the margin automatically. */
const FOCUS_PAD = 20;
/** If overview bbox spans more than this many degrees of longitude we fall
 *  back to the full-sphere view. */
const MAX_LNG_SPAN_FOR_FOCUS = 120;

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;

type Feature = (typeof countries.features)[number];

interface LocationsBlockProps {
  codes: string[];
  label?: string;
  caption?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

export const LocationsBlock = memo(function LocationsBlock({
  codes,
  label,
  caption,
  variant = 'article',
  sourceLabel,
}: LocationsBlockProps) {
  const { colors, font, typography, textStyles } = useTheme();
  const isContext = variant === 'context';
  const maxHeight = isContext ? MAP_HEIGHT.context : MAP_HEIGHT.article;

  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const height = Math.min(maxHeight, width / MAP_ASPECT);

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

  // Chip selection drives everything.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selected = selectedIdx != null ? (resolved[selectedIdx] ?? null) : null;
  const selectedFeature = selected?.feature ?? null;

  // Projection: zoom to the selected country when set, otherwise fit to the
  // overview region (or sphere if the region is too wide).
  const { projection, mode } = useMemo(() => {
    const proj = geoEquirectangular();
    if (width <= 0 || height <= 0) {
      proj.fitSize([width || 1, height || 1], { type: 'Sphere' });
      return { projection: proj, mode: 'world' as const };
    }
    const extent: [[number, number], [number, number]] = [
      [FOCUS_PAD, FOCUS_PAD],
      [width - FOCUS_PAD, height - FOCUS_PAD],
    ];
    if (selectedFeature) {
      proj.fitExtent(extent, selectedFeature as never);
      return { projection: proj, mode: 'country' as const };
    }
    if (highlightedFeatures.length === 0) {
      proj.fitSize([width, height], { type: 'Sphere' });
      return { projection: proj, mode: 'world' as const };
    }
    const fc = { type: 'FeatureCollection', features: highlightedFeatures } as const;
    const [[lngMin, latMin], [lngMax, latMax]] = geoBounds(fc);
    const lngSpanRaw = lngMax - lngMin;
    const lngSpan = lngSpanRaw >= 0 ? lngSpanRaw : 360 + lngSpanRaw;
    const latSpan = latMax - latMin;
    if (lngSpan > 0 && lngSpan < MAX_LNG_SPAN_FOR_FOCUS && latSpan > 0) {
      proj.fitExtent(extent, fc as never);
      return { projection: proj, mode: 'region' as const };
    }
    proj.fitSize([width, height], { type: 'Sphere' });
    return { projection: proj, mode: 'world' as const };
  }, [selectedFeature, highlightedFeatures, width, height]);

  // Skia paths — only the selected country is filled. Map is passive by default.
  const paths = useMemo(() => {
    if (width <= 0 || height <= 0) {
      return {
        landPath: null as SkPath | null,
        borderPath: null as SkPath | null,
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

    let selectedFillPath: SkPath | null = null;
    if (selectedFeature) {
      const p = Skia.Path.Make();
      ctx.setPath(p);
      pg(selectedFeature);
      selectedFillPath = p;
    }
    return { landPath, borderPath, selectedFillPath };
  }, [projection, selectedFeature, width, height]);

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

  // ── Selection feedback ─────────────────────────────────────────────────
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (selectedIdx == null) return;
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: 500 });
  }, [selectedIdx, pulse]);
  const pulseR = useDerivedValue(() => 6 + pulse.value * 26);
  const pulseOpacity = useDerivedValue(() => 0.6 * (1 - pulse.value));

  // Brief canvas dim during projection swap — masks the geometric snap between
  // zoom levels without needing a full projection interpolation. The effect
  // runs on every selectedIdx change even though the value itself isn't read.
  const canvasOpacity = useSharedValue(1);
  const canvasFadeStyle = useAnimatedStyle(() => ({ opacity: canvasOpacity.value }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — selectedIdx is the trigger
  useEffect(() => {
    canvasOpacity.value = withTiming(0.45, { duration: 90 });
    canvasOpacity.value = withTiming(1, { duration: 180 });
  }, [selectedIdx, canvasOpacity]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const toggleSelection = useCallback((idx: number) => {
    hapticImpact();
    setSelectedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  const clearSelection = useCallback(() => {
    if (selectedIdx == null) return;
    hapticImpact();
    setSelectedIdx(null);
  }, [selectedIdx]);

  // Map tap deselects (if anything is selected). No country selection via map —
  // that's the chip row's job and fixes the tiny-country tap-target problem.
  const mapTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd((_e, success) => {
          'worklet';
          if (!success) return;
          runOnJS(clearSelection)();
        }),
    [clearSelection],
  );

  // ── Readout + stats ────────────────────────────────────────────────────
  const selectedCode = selected?.code ?? null;
  const selectedName = selectedFeature
    ? ((selectedFeature.properties as { name?: string } | undefined)?.name ??
      (selectedCode ? displayNameFromCode(selectedCode) : ''))
    : '';
  const selectedFlag = selectedCode ? ccToFlag(selectedCode) : '';

  // COUNTRY_DATA keys on the same topojson name — usually matches; missing keys
  // just mean the stats grid stays hidden for that country.
  const countryData: CountryData | undefined = selectedName
    ? COUNTRY_DATA[selectedName]
    : undefined;
  const stats = useMemo(() => buildStatCells(countryData), [countryData]);

  return (
    <View style={blockContainerStyle[isContext ? 'context' : 'article']}>
      {label ? (
        <Text
          style={[styles.label, textStyles.smallCapsXs]}
          maxFontSizeMultiplier={MAX_FONT_SCALE.label}
        >
          {label}
        </Text>
      ) : null}

      <GestureDetector gesture={mapTapGesture}>
        <View onLayout={onLayout} style={[styles.mapWrap, { height }]}>
          {width > 0 && height > 0 ? (
            <Animated.View style={[StyleSheet.absoluteFillObject, canvasFadeStyle]}>
              <Canvas style={{ width, height }}>
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
                    strokeWidth={StyleSheet.hairlineWidth}
                  />
                ) : null}
                {paths.selectedFillPath ? (
                  <>
                    <Path
                      path={paths.selectedFillPath}
                      color={colors.accent}
                      opacity={0.55}
                      style="fill"
                    />
                    <Path
                      path={paths.selectedFillPath}
                      color={colors.textEmphasis}
                      style="stroke"
                      strokeWidth={1.25}
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
                    strokeWidth={1.5}
                  />
                ) : null}
              </Canvas>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {/* Readout — selected country or hint; mode + count on the right */}
      <View style={styles.readoutRow}>
        {selectedFeature ? (
          <Animated.View
            key={selectedCode ?? 'none'}
            entering={FadeIn.duration(ANIMATION.fast)}
            style={styles.readout}
          >
            <Text style={styles.readoutFlag} maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
              {selectedFlag}
            </Text>
            <Text
              style={{
                ...font.semiBold,
                fontSize: typography.sizeSm,
                color: colors.textEmphasis,
              }}
              maxFontSizeMultiplier={MAX_FONT_SCALE.body}
              numberOfLines={1}
            >
              {selectedName}
            </Text>
          </Animated.View>
        ) : (
          <Text
            style={[styles.hint, textStyles.smallCapsXs]}
            maxFontSizeMultiplier={MAX_FONT_SCALE.label}
          >
            tap a flag to zoom
          </Text>
        )}
        <Text
          style={[
            styles.counter,
            {
              ...font.regular,
              fontSize: typography.sizeXs,
              color: colors.textSecondary,
              fontVariant: ['oldstyle-nums'],
            },
          ]}
          maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
        >
          {mode}
          {'  \u00b7  '}
          {codes.length} countr{codes.length === 1 ? 'y' : 'ies'}
        </Text>
      </View>

      {/* Country stats — 2×2 grid of key facts, visible only when selected */}
      {stats.length > 0 ? (
        <Animated.View
          key={`stats-${selectedCode ?? 'none'}`}
          entering={FadeIn.duration(ANIMATION.fast)}
          style={[styles.statsGrid, { borderColor: colors.rule }]}
        >
          {stats.map((s, i) => {
            const isRightCol = i % 2 === 1;
            const isBottomRow = i >= stats.length - (stats.length % 2 === 0 ? 2 : 1);
            return (
              <View
                key={s.label}
                style={[
                  styles.statCell,
                  {
                    borderLeftColor: colors.rule,
                    borderBottomColor: colors.rule,
                    borderLeftWidth: isRightCol ? StyleSheet.hairlineWidth : 0,
                    borderBottomWidth: !isBottomRow ? StyleSheet.hairlineWidth : 0,
                  },
                ]}
              >
                <Text
                  style={[styles.statLabel, textStyles.smallCapsXs]}
                  maxFontSizeMultiplier={MAX_FONT_SCALE.label}
                >
                  {s.label}
                </Text>
                <Text
                  style={{
                    ...font.semiBold,
                    fontSize: typography.sizeSm,
                    color: colors.textEmphasis,
                    fontVariant: ['oldstyle-nums'],
                  }}
                  maxFontSizeMultiplier={MAX_FONT_SCALE.body}
                  numberOfLines={1}
                >
                  {s.value}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      ) : null}

      {/* Chip row — the primary interaction. Tap zooms in; tap again zooms out. */}
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
// Stats grid builder
// ---------------------------------------------------------------------------

/** Pick up to four "news-relevant" facts from the country dataset. Priority:
 *  capital, population, GDP, military spend. Missing values are skipped so
 *  the grid only shows what we actually know. */
function buildStatCells(data: CountryData | undefined): { label: string; value: string }[] {
  if (!data) return [];
  const cells: { label: string; value: string }[] = [];
  if (data.capital) cells.push({ label: 'capital', value: data.capital });
  if (data.population) cells.push({ label: 'population', value: data.population });
  if (data.gdp) cells.push({ label: 'gdp', value: data.gdp });
  if (data.military) {
    const pct = data.militaryPctGdp ? `  (${data.militaryPctGdp})` : '';
    cells.push({ label: 'military', value: `${data.military}${pct}` });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  label: {
    marginBottom: SPACING.xs,
  },
  mapWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 2,
    // Pull past the sheet-content horizontal padding so the map gets more
    // breathing room. Geographic content benefits from bleed; the chip row
    // and readout stay inside the content column for type alignment.
    marginHorizontal: -SPACING.sm,
  },
  readoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
    flexShrink: 1,
  },
  readoutFlag: {
    fontSize: 15,
  },
  hint: {
    flex: 1,
  },
  counter: {
    // right-aligned by parent
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.sm,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statCell: {
    width: '50%',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  statLabel: {
    marginBottom: SPACING.xxs,
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
    fontSize: 13,
  },
  caption: {
    marginTop: SPACING.xs,
  },
});
