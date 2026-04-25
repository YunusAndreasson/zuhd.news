import { COUNTRY_DATA, type CountryData } from '@shared/countries/country-data';
import { CITY_TZ, COUNTRY_TZ, SOURCE_COORDS } from '@shared/globe/coordinates';
import type { Article, Chokepoint, HeatmapPoint } from '@shared/types';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Image,
  LinearGradient,
  Path,
  Picture,
  RadialGradient,
  Rect,
  Skia,
  Text as SkiaText,
  useFont,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import {
  geoCentroid,
  geoCircle,
  geoContains,
  geoDistance,
  geoGraticule,
  geoInterpolate,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet } from 'react-native';
import {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BLACK } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { displayCountryName, displayLocation, wrapCountryLabel } from '../../lib/place-names';
import { getLakeLabels, getMajorRiverFeatureCollection, getRiverLabels, SEAS } from './detail-geo';
import {
  ANTARCTIC_CIRCLE,
  ARCTIC_CIRCLE,
  clipAngleForCountry,
  DECAY_LAMBDA,
  findCountry,
  formatLocalTime,
  getMoonPhase,
  getSunPosition,
  HALF_PI,
  invalidateSunCaches,
  isNear,
  MAKKAH,
  NORTH_POLE,
  PLACES_APPEAR_CLIP,
  PLACES_FULL_CLIP,
  RIVERS_APPEAR_CLIP,
  SOUTH_POLE,
  withAlpha,
} from './projection';
import {
  bordersMesh,
  countries,
  countryAreas,
  countryBboxes,
  countryCentroidNames,
  countryCentroidPoints,
  countryCentroidUnits,
  countrySimplifiedByName,
  createSkiaPathContext,
  iceSheets,
  iceSheetsSimplified,
  landMedium,
  landSimplified,
} from './shared';
import { getCoords } from './storyDots';

interface GlowLayer {
  r: number;
  opacity: number;
  blur?: number;
}

/** Concentric circle glow — data-driven layers with optional blur */
function Glow({
  x,
  y,
  color,
  layers,
}: {
  x: number;
  y: number;
  color: string;
  layers: GlowLayer[];
}) {
  return (
    <>
      {layers.map((l, i) => (
        <Circle key={i} cx={x} cy={y} r={l.r} color={color} opacity={l.opacity}>
          {l.blur != null && <BlurMask blur={l.blur} style="solid" />}
        </Circle>
      ))}
    </>
  );
}

/** Skia text drawn with an opaque halo for primary-tier labels (focused
 *  country, chokepoint). Two passes — stroked bg behind the glyphs, then
 *  the fill — so the label reads over land tint, borders, and the highlight
 *  glow. Skia's <Text> has no textShadow primitive, hence the manual stroke. */
function HaloLabel({
  x,
  y,
  text,
  font,
  color,
  haloColor,
  opacity = 1,
  haloOpacity = 1,
  haloWidth = LABEL_HALO_WIDTH,
}: {
  x: number;
  y: number;
  text: string;
  font: ReturnType<typeof useFont>;
  color: string;
  haloColor: string;
  opacity?: number;
  haloOpacity?: number;
  haloWidth?: number;
}) {
  if (!font) return null;
  return (
    <>
      <SkiaText
        x={x}
        y={y}
        text={text}
        font={font}
        color={haloColor}
        opacity={haloOpacity}
        style="stroke"
        strokeWidth={haloWidth}
        strokeJoin="round"
      />
      <SkiaText x={x} y={y} text={text} font={font} color={color} opacity={opacity} />
    </>
  );
}

const skiaCtx = createSkiaPathContext();
const nightCircleGen = geoCircle();

// Equator + polar circles (Arctic 66.56°N, Antarctic 66.56°S)
const graticuleLines = geoGraticule()
  .stepMinor([360, 360]) // no minor lines
  .stepMajor([30, 30])(
  // meridians + parallels every 30°
);

const PULSE_EASING = Easing.out(Easing.cubic);
const ZOOM_EASING = Easing.inOut(Easing.cubic);
const ZOOM_DURATION = 260;

const MAKKAH_GLOW_LAYERS: GlowLayer[] = [
  { r: 12, opacity: 0.03, blur: 8 },
  { r: 5, opacity: 0.08, blur: 3 },
  { r: 2.5, opacity: 0.2, blur: 1.5 },
  { r: 1.2, opacity: 0.7 },
];

const DOT_GLOW_LAYERS: GlowLayer[] = [
  { r: 14, opacity: 0.04, blur: 10 },
  { r: 7, opacity: 0.12, blur: 5 },
  { r: 3.5, opacity: 0.28, blur: 2 },
  { r: 2, opacity: 0.8 },
];

// Ghost-pin layers: same shape as DOT_GLOW_LAYERS but smaller and fainter
// so neighboring articles whisper — they announce "what's nearby in the
// scroll" without competing with the settled story's pin.
const GHOST_GLOW_LAYERS: GlowLayer[] = [
  { r: 7, opacity: 0.03, blur: 5 },
  { r: 3.5, opacity: 0.08, blur: 2.5 },
  { r: 1.5, opacity: 0.22 },
];

// Scroll-order offsets for ghost pins (± settled index). Module constant so
// the literal doesn't reallocate every frame inside callReproject.
const GHOST_OFFSETS = [-2, -1, 1, 2] as const;
const GHOST_DEDUPE_PX2 = 900; // 30px²

// Disruption thresholds for chokepoint visual state. A chokepoint becomes
// "disrupted" at ±15% from baseline; intensity saturates at ±30% so the
// glow doesn't keep brightening forever during extreme events.
const CHOKEPOINT_DISRUPTED_DELTA = 0.15;
const CHOKEPOINT_SATURATION_DELTA = 0.3;

// Vertical advance between baselines of a wrapped country label. Tuned for
// 14px Source Sans 3 Regular — enough air to read both lines as a stack
// without the descenders touching the next ascenders.
const LABEL_LINE_HEIGHT = 16;
// Halo stroke width for primary-tier labels (focused country, chokepoint).
// Wide enough to read over land tint, borders, and the country highlight
// glow without bleeding into the glyphs.
const LABEL_HALO_WIDTH = 3;

/** Widest line in `lines`, measured by font width when loaded; otherwise
 *  approximated at `fallbackChar` pixels per character so first-paint
 *  collision packing still works before fonts resolve. */
function measureLines(
  lines: string[],
  font: { getTextWidth: (s: string) => number } | null,
  fallbackChar: number,
): number {
  let w = 0;
  for (const line of lines) {
    const lw = font ? font.getTextWidth(line) : line.length * fallbackChar;
    if (lw > w) w = lw;
  }
  return w;
}

export interface TapResult {
  countryName: string;
  location: string | null;
  localTime: string | null;
  data: CountryData | null;
  hotspotLabels?: string[];
  isHotspot?: boolean;
  /** Set when the tap landed on an ambient chokepoint ring. The parent
   *  resolves the ID to the full Chokepoint payload and opens ChokepointSheet. */
  chokepointId?: string;
}

export interface MiniGlobeRef {
  hitTest: (x: number, y: number) => TapResult | null;
  showPulse: (x: number, y: number) => void;
}

interface MiniGlobeProps {
  articles: Article[];
  heatmapPoints?: HeatmapPoint[];
  chokepoints?: Chokepoint[];
  scrollY: SharedValue<number>;
  itemHeight: number;
  width: number;
  height: number;
  /** User-driven zoom override. null = scroll-adaptive clip (default);
   *  a number forces that clip angle. Transitions animate via the
   *  overrideActive/overrideAngle pair inside MiniGlobe. */
  zoomClipOverride?: number | null;
  tick?: number;
  ref?: React.Ref<MiniGlobeRef>;
}

interface Hotspot {
  lat: number;
  lng: number;
  intensity: number; // 0–1 log-normalized
  recency: number; // 0–1, 1 = just now, decays with age
  labels: string[];
  countryName: string | null;
}

interface GlobeState {
  landPath: ReturnType<typeof Skia.Path.Make> | null;
  icePath: ReturnType<typeof Skia.Path.Make> | null;
  bordersPath: ReturnType<typeof Skia.Path.Make> | null;
  countryPath: ReturnType<typeof Skia.Path.Make> | null;
  countryName: string | null;
  nightPath: ReturnType<typeof Skia.Path.Make> | null;
  twilightPath: ReturnType<typeof Skia.Path.Make> | null;
  graticulePath: ReturnType<typeof Skia.Path.Make> | null;
  qiblaPath: ReturnType<typeof Skia.Path.Make> | null;
  sourceArcs: ReturnType<typeof Skia.Path.Make> | null;
  arcOpacity: number;
  northPole: { x: number; y: number } | null;
  southPole: { x: number; y: number } | null;
  dot: { x: number; y: number } | null;
  /** Neighboring articles in scroll order (±2 from the settled index). Fainter
   *  than the main dot and deduped against each other + the main dot so tight
   *  geographic clusters don't smudge into a single glow. */
  ghostDots: { x: number; y: number }[];
  dotLabel: { text: string; sub?: string; x: number; y: number } | null;
  /** Country name anchored near the highlighted country's centroid. Rendered
   *  at every zoom level (including fully zoomed-out) so the reader always
   *  has geographic context for the article. `lines` is normally length 1,
   *  but wraps to 2 for long names (e.g. "Bosnia and / Herzegovina") — see
   *  `wrapCountryLabel`. Null when the centroid falls on the globe's far
   *  side. The anchor `(x, y)` is the baseline of the FIRST line; subsequent
   *  lines stack below at LINE_HEIGHT spacing. */
  countryLabel: { lines: string[]; x: number; y: number } | null;
  makkah: { x: number; y: number } | null;
  hotspotGlows: {
    x: number;
    y: number;
    intensity: number;
    recency: number;
    labels: string[];
    countryName: string | null;
  }[];
  /** Ambient chokepoint rings — always projected (not gated by nearSettled)
   *  because they're reference geography rather than cosmetic detail.
   *  `intensity` ∈ [0,1] is |delta7vs90| / 0.3; `disrupted` fires above 15%. */
  chokepoints: {
    x: number;
    y: number;
    id: string;
    label: string;
    intensity: number;
    disrupted: boolean;
  }[];
  /** Neighbour-country labels — every country within the camera's visible
   *  hemisphere EXCEPT the highlighted one. Emerges when the camera is
   *  zoomed past PLACES_APPEAR_CLIP, giving the reader geographic context
   *  ("Pakistan is bordered by Iran / Afghanistan / India / China") without
   *  needing a second screen. `opacity` folds the zoom-band fade factor. */
  neighborLabels: {
    name: string;
    x: number;
    y: number;
    opacity: number;
  }[];
  /** Water-feature labels — named lakes, major rivers, seas/bays/gulfs.
   *  Same zoom gate as neighbour labels. Drawn at a lighter visual weight
   *  (secondary tone, lower opacity) so they read as tertiary context
   *  beneath country names. */
  waterLabels: {
    name: string;
    x: number;
    y: number;
    opacity: number;
    /** Visual distinction is subtle; `kind` is used mainly for keys. */
    kind: 'lake' | 'river' | 'sea';
  }[];
  /** Projected major-river linestrings. Drawn as a halo + dark stroke over
   *  land when the globe is zoomed past PLACES_APPEAR_CLIP. Null at default
   *  zoom — no path projection work runs. */
  riversPath: ReturnType<typeof Skia.Path.Make> | null;
  /** Opacity for riversPath — folds the zoom-band fade factor so rivers
   *  emerge smoothly as the camera tightens. */
  riversOpacity: number;
}

/** Memoized moon — skips React reconciliation during scroll since all props are stable. */
const Moon = memo(function Moon({
  x,
  y,
  r,
  phase,
  texture,
  clip,
  accentColor,
  bgAlpha,
}: {
  x: number;
  y: number;
  r: number;
  phase: number;
  texture: ReturnType<typeof useImage>;
  clip: ReturnType<typeof Skia.Path.Make>;
  accentColor: string;
  bgAlpha: (opacity: number) => string;
}) {
  if (!texture) return null;
  return (
    <>
      {/* Halo — tight glow around the moon */}
      <Circle
        cx={x + (phase < 0.5 ? r * 0.3 : -r * 0.3)}
        cy={y}
        r={r * 1.8}
        color={accentColor}
        opacity={0.025}
      >
        <BlurMask blur={r * 0.8} style="solid" />
      </Circle>
      {/* Limb glow — bright ring right at the disk edge */}
      <Circle cx={x} cy={y} r={r} color={accentColor} opacity={0.15}>
        <BlurMask blur={r * 0.25} style="outer" />
      </Circle>
      {/* Moon texture — full disk */}
      <Group clip={clip}>
        <BlurMask blur={r * 0.06} style="normal" />
        <Image image={texture} x={x - r} y={y - r} width={r * 2} height={r * 2} opacity={0.45} />
      </Group>
      {/* Gradient shadow — gradual terminator falloff */}
      <Group clip={clip}>
        <BlurMask blur={r * 0.04} style="normal" />
        <Rect x={x - r} y={y - r} width={r * 2} height={r * 2}>
          <LinearGradient
            start={vec(phase < 0.5 ? x + r : x - r, y)}
            end={vec(phase < 0.5 ? x - r : x + r, y)}
            colors={[bgAlpha(0), bgAlpha(0), bgAlpha(0.85), bgAlpha(0.95)]}
            positions={[
              0,
              Math.max(0, Math.abs(Math.cos(phase * 2 * Math.PI)) * 0.5),
              Math.min(1, 0.5 + Math.abs(Math.cos(phase * 2 * Math.PI)) * 0.35),
              1,
            ]}
          />
        </Rect>
      </Group>
    </>
  );
});

/** Country highlight — soft glow brighter than surrounding land.
 *  Small countries get stronger glow so they're visible at globe scale. */
const CountryHighlight = memo(function CountryHighlight({
  path: p,
  countryName,
  color,
}: {
  path: ReturnType<typeof Skia.Path.Make>;
  countryName: string | null;
  color: string;
}) {
  const area = countryName ? (countryAreas[countryName] ?? 0) : 0;
  const opacity = area < 0.001 ? 0.25 : area < 0.005 ? 0.18 : 0.12;
  return (
    <Path path={p} color={color} opacity={opacity}>
      <BlurMask blur={1} style="solid" />
    </Path>
  );
});

const EMPTY_GLOBE: GlobeState = {
  landPath: null,
  icePath: null,
  bordersPath: null,
  countryPath: null,
  countryName: null,
  nightPath: null,
  twilightPath: null,
  graticulePath: null,
  qiblaPath: null,
  sourceArcs: null,
  arcOpacity: 1,
  northPole: null,
  southPole: null,
  dot: null,
  ghostDots: [],
  dotLabel: null,
  countryLabel: null,
  makkah: null,
  hotspotGlows: [],
  chokepoints: [],
  neighborLabels: [],
  waterLabels: [],
  riversPath: null,
  riversOpacity: 0,
};

/** Pure projection — creates fresh Skia paths, no shared mutable state. */
function projectInitial(
  geo: { lat: number; lng: number; country: GeoJSON.Feature | null },
  r: number,
  centerX: number,
  centerY: number,
): GlobeState {
  const clipAngle = clipAngleForCountry(geo.country?.properties?.name ?? null);
  const projScale = r / Math.sin((clipAngle * Math.PI) / 180);
  const proj = geoOrthographic()
    .clipAngle(clipAngle)
    .precision(8)
    .rotate([-geo.lng, -geo.lat, 0])
    .scale(projScale)
    .translate([centerX, centerY]);
  const pg = geoPath(proj);
  const ctx = createSkiaPathContext();

  const lp = Skia.Path.Make();
  ctx.setPath(lp);
  pg.context(ctx)(landMedium);

  // Permanent ice sheets (Antarctica, Greenland) — drawn as a lighter fill
  // on top of the land silhouette so the globe reads climatologically.
  const ip = Skia.Path.Make();
  ctx.setPath(ip);
  pg.context(ctx)(iceSheets);

  // Neighbouring country borders — mesh + no resampling for speed
  proj.precision(0);
  const bp = Skia.Path.Make();
  ctx.setPath(bp);
  pg.context(ctx)(bordersMesh);
  proj.precision(8);

  let cp: ReturnType<typeof Skia.Path.Make> | null = null;
  if (geo.country) {
    cp = Skia.Path.Make();
    ctx.setPath(cp);
    pg.context(ctx)(geo.country);
  }

  const [sunLng, sunLat] = getSunPosition();
  const nightCenter: [number, number] = [sunLng + 180, -sunLat];
  const np = Skia.Path.Make();
  ctx.setPath(np);
  pg.context(ctx)(nightCircleGen.center(nightCenter).radius(90)());

  // Low-sun band — softer gradient where sun is near the horizon (0–6° above)
  const tp = Skia.Path.Make();
  ctx.setPath(tp);
  pg.context(ctx)(nightCircleGen.center(nightCenter).radius(96)());

  // Equator + polar circles
  const gp = Skia.Path.Make();
  ctx.setPath(gp);
  pg.context(ctx)(graticuleLines);
  pg.context(ctx)(ARCTIC_CIRCLE);
  pg.context(ctx)(ANTARCTIC_CIRCLE);

  // Poles
  let northPole: GlobeState['northPole'] = null;
  let southPole: GlobeState['southPole'] = null;
  const npp = proj(NORTH_POLE);
  if (npp) northPole = { x: npp[0], y: npp[1] };
  const spp = proj(SOUTH_POLE);
  if (spp) southPole = { x: spp[0], y: spp[1] };

  let dot: GlobeState['dot'] = null;
  const pt = proj([geo.lng, geo.lat]);
  if (pt) dot = { x: pt[0], y: pt[1] };

  // Makkah
  let makkah: GlobeState['makkah'] = null;
  if (geoDistance(MAKKAH.coords, [geo.lng, geo.lat]) < HALF_PI) {
    const mp = proj(MAKKAH.coords);
    if (mp) makkah = { x: mp[0], y: mp[1] };
  }

  // Qibla arc — great circle from story location to Makkah
  let qp: ReturnType<typeof Skia.Path.Make> | null = null;
  if (geoDistance([geo.lng, geo.lat], MAKKAH.coords) > 0.02) {
    const interp = geoInterpolate([geo.lng, geo.lat], MAKKAH.coords);
    qp = Skia.Path.Make();
    let started = false;
    for (let i = 0; i <= 30; i++) {
      const p = proj(interp(i / 30));
      if (!p) {
        started = false;
        continue;
      }
      if (!started) {
        qp.moveTo(p[0], p[1]);
        started = true;
      } else qp.lineTo(p[0], p[1]);
    }
  }

  return {
    landPath: lp,
    icePath: ip,
    bordersPath: bp,
    countryPath: cp,
    countryName: geo.country?.properties?.name ?? null,
    nightPath: np,
    twilightPath: tp,
    graticulePath: gp,
    qiblaPath: qp,
    sourceArcs: null,
    arcOpacity: 1,
    northPole,
    southPole,
    dot,
    ghostDots: [],
    dotLabel: null,
    countryLabel: null,
    makkah,
    hotspotGlows: [],
    chokepoints: [],
    neighborLabels: [],
    waterLabels: [],
    riversPath: null,
    riversOpacity: 0,
  };
}

export const MiniGlobe = memo(function MiniGlobe({
  articles,
  heatmapPoints,
  chokepoints,
  scrollY,
  itemHeight,
  width,
  height,
  zoomClipOverride = null,
  tick: _tick,
  ref,
}: MiniGlobeProps) {
  const { colors, bgAlpha, resolvedAppearance } = useTheme();
  const light = resolvedAppearance === 'light';
  const globeRadius = width * 0.9;
  const cx = width / 2;
  const cy = height * 0.75;
  const labelFont = useFont(require('../../assets/fonts/SourceSans3-Regular.ttf'), 14);
  const subFont = useFont(require('../../assets/fonts/SourceSans3-SemiBold.ttf'), 11);
  // Fonts mirrored into refs so callReproject (a useCallback with `[]` deps,
  // stable closure) can measure text width for label-collision detection.
  // The fonts load asynchronously, so the ref pointer can flip from null to
  // the loaded font mid-session — each frame reads the current value.
  const labelFontRef = useRef(labelFont);
  labelFontRef.current = labelFont;
  const subFontRef = useRef(subFont);
  subFontRef.current = subFont;

  // Precompute per-article: coords + country feature + names (before useState so initializer can use it)
  const articleGeo = useMemo(() => {
    return articles.map((a) => {
      const coords = getCoords(a);
      if (!coords) return null;
      const country = findCountry(coords[0], coords[1], a.location);
      const countryName = country?.properties?.name ?? null;
      return { lat: coords[0], lng: coords[1], country, countryName, location: a.location };
    });
  }, [articles]);

  // Eager initial state — project synchronously on mount so the Canvas + Skia shaders
  // are warm before the first swipe (avoids useEffect → reaction → runOnJS lag)
  const [state, setState] = useState<GlobeState>(() => {
    const firstGeo = articleGeo.find((g) => g != null);
    if (!firstGeo) return EMPTY_GLOBE;
    return projectInitial(firstGeo, globeRadius, cx, cy);
  });

  // Cluster heatmap points with 18h half-life time-decay → top 8 coverage hotspots
  const hotspots = useMemo((): Hotspot[] => {
    // Fallback to article-based clustering when heatmap data unavailable
    const now = Date.now();
    if (!heatmapPoints || heatmapPoints.length === 0) {
      const clusters = new Map<
        string,
        { lat: number; lng: number; total: number; newestT: number; countryName: string | null }
      >();
      for (let i = 0; i < articles.length; i++) {
        const geo = articleGeo[i];
        if (!geo) continue;
        const article = articles[i];
        if (!article) continue;
        const coverage = article.eventCoverage ?? 1;
        const key = `${Math.round(geo.lat * 2) / 2},${Math.round(geo.lng * 2) / 2}`;
        const existing = clusters.get(key);
        if (existing) {
          existing.total += coverage;
          if (article.addedAt > existing.newestT) existing.newestT = article.addedAt;
        } else
          clusters.set(key, {
            lat: geo.lat,
            lng: geo.lng,
            total: coverage,
            newestT: article.addedAt,
            countryName: geo.countryName,
          });
      }
      const sorted = [...clusters.values()].sort((a, b) => b.total - a.total).slice(0, 12);
      const first = sorted[0];
      if (!first) return [];
      const logMax = Math.log(first.total + 1);
      return sorted.map((z) => ({
        lat: z.lat,
        lng: z.lng,
        intensity: Math.log(z.total + 1) / logMax,
        recency: Math.exp(-DECAY_LAMBDA * ((now - z.newestT) / 3_600_000)),
        labels: [],
        countryName: z.countryName,
      }));
    }

    const clusters = new Map<
      string,
      { lat: number; lng: number; total: number; newestT: number; labels: Set<string> }
    >();

    for (const pt of heatmapPoints) {
      const ageHours = (now - pt.t) / 3_600_000;
      const decay = Math.exp(-DECAY_LAMBDA * ageHours);
      const weight = Math.max(pt.c, 1) * decay;
      if (weight < 0.03) continue;

      // 0.5° grid (~55km) merges nearby datelines
      const key = `${Math.round(pt.lat * 2) / 2},${Math.round(pt.lng * 2) / 2}`;
      const existing = clusters.get(key);
      if (existing) {
        existing.total += weight;
        if (pt.t > existing.newestT) existing.newestT = pt.t;
        if (pt.l) existing.labels.add(pt.l);
      } else {
        const labels = new Set<string>();
        if (pt.l) labels.add(pt.l);
        clusters.set(key, { lat: pt.lat, lng: pt.lng, total: weight, newestT: pt.t, labels });
      }
    }

    // Resolve country names only for top clusters
    const sorted = [...clusters.values()].sort((a, b) => b.total - a.total).slice(0, 12);
    const first2 = sorted[0];
    if (!first2) return [];
    const logMax = Math.log(first2.total + 1);
    return sorted.map((z) => {
      const country = findCountry(z.lat, z.lng);
      return {
        lat: z.lat,
        lng: z.lng,
        intensity: Math.log(z.total + 1) / logMax,
        recency: Math.exp(-DECAY_LAMBDA * ((now - z.newestT) / 3_600_000)),
        labels: [...z.labels],
        countryName: country?.properties?.name ?? null,
      };
    });
  }, [heatmapPoints, articles, articleGeo]);

  // Flat coord array for UI thread interpolation
  const coordsSV = useSharedValue<(number | null)[]>([]);
  useEffect(() => {
    coordsSV.value = articleGeo.flatMap((g) => (g ? [g.lat, g.lng] : [null, null]));
  }, [articleGeo, coordsSV]);

  // Zoom control — two shared values that together describe the effective
  // clip angle each frame:
  //   clip = rawClip + (overrideAngle - rawClip) * overrideActive
  // overrideActive ∈ [0,1] fades between scroll-adaptive (0) and a fixed
  // override (1). overrideAngle is the fixed target in degrees. Keeping them
  // separate lets 2×→3× (override→override) animate by sliding overrideAngle
  // alone, while 1×↔N× fades overrideActive without the angle ever glitching.
  const overrideActive = useSharedValue(0);
  const overrideAngle = useSharedValue(90);
  const prevOverrideRef = useRef<number | null>(null);
  // Last overrideAngleVal seen by callReproject — compared frame-over-frame
  // to decide whether an override→override slide is in flight.
  const lastOverrideAngleRef = useRef(90);

  // Projection + path generator — created eagerly so the first scroll frame is warm
  const projRef = useRef(geoOrthographic().clipAngle(90).precision(8));
  const pgRef = useRef(geoPath(projRef.current));
  const lastSettled = useRef(-1);
  const lastSettledSlug = useRef<string | null>(null);

  const cachedCountryRef = useRef<GeoJSON.Feature | null>(null);
  // Mid-scroll projection uses a simplified variant of the settled country
  // (~50% fewer vertices, same topology). Swapped to the full-detail feature
  // once the scroll settles. Keeping the pair in parallel refs avoids a
  // per-frame name lookup inside callReproject.
  const cachedCountrySimplifiedRef = useRef<GeoJSON.Feature | null>(null);
  // Spherical centroid of the currently settled country, cached alongside
  // the feature. geoCentroid is O(n vertices) — computing it once per
  // settled-country change (instead of per frame) is what keeps this new
  // label layer effectively free inside callReproject.
  const cachedCountryCentroidRef = useRef<[number, number] | null>(null);

  // Reusable Skia path objects — rewound each frame instead of allocating new ones.
  // setIsVolatile(true) tells Skia to skip GPU-side caching since these change every frame;
  // rewind() (vs reset()) keeps internal storage allocated between frames.
  const landPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const icePathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const bordersPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const countryPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const nightPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const twilightPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const graticulePathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const qiblaPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const sourceArcsRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const riversPathRef = useRef(Skia.Path.Make().setIsVolatile(true));

  // Keep closure dependencies in refs so the reproject callback stays stable
  const articlesRef = useRef(articles);
  articlesRef.current = articles;
  const articleGeoRef = useRef(articleGeo);
  articleGeoRef.current = articleGeo;
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  // Precompute the per-frame derivations once per snapshot: uppercase label,
  // [lng,lat] tuple (reused inside geoDistance + proj), and absolute delta
  // of the primary vessel class (drives intensity + disrupted flag).
  const enrichedChokepoints = useMemo(
    () =>
      (chokepoints ?? []).map((cp) => ({
        id: cp.id,
        label: cp.name.toUpperCase(),
        coords: [cp.lng, cp.lat] as [number, number],
        absDelta: Math.abs(cp.delta7vs90[cp.primaryField] ?? 0),
      })),
    [chokepoints],
  );
  const chokepointsRef = useRef(enrichedChokepoints);
  chokepointsRef.current = enrichedChokepoints;
  const layoutRef = useRef({ globeRadius, cx, cy });
  layoutRef.current = { globeRadius, cx, cy };
  // Mirror of last reproject args — avoids reading SharedValues outside worklets
  const lastReprojRef = useRef<{ lng: number; lat: number; idx: number } | null>(null);

  const callReproject = useCallback(
    (
      geoLng: number,
      geoLat: number,
      settledIndex: number,
      loIndex: number,
      hiIndex: number,
      frac: number,
      overrideActiveVal: number,
      overrideAngleVal: number,
    ) => {
      lastReprojRef.current = { lng: geoLng, lat: geoLat, idx: settledIndex };
      const { globeRadius: r, cx: centerX, cy: centerY } = layoutRef.current;
      const geoData = articleGeoRef.current;

      // Update which country to highlight when settled article changes.
      // Compare both index AND article slug — index alone misses category
      // switches where scroll resets to 0 but the article is different.
      const geo = geoData[settledIndex];
      const slug = articlesRef.current[settledIndex]?.slug ?? null;
      const settled = settledIndex !== lastSettled.current || slug !== lastSettledSlug.current;
      if (settled) {
        lastSettled.current = settledIndex;
        lastSettledSlug.current = slug;
        cachedCountryRef.current = geo?.country ?? null;
        const settledName = cachedCountryRef.current?.properties?.name as string | undefined;
        cachedCountrySimplifiedRef.current = settledName
          ? (countrySimplifiedByName[settledName] ?? null)
          : null;
        // Centroid cached alongside the feature — projected per frame to
        // follow rotation, but the expensive sphere-centroid math runs only
        // when the settled country actually changes.
        cachedCountryCentroidRef.current = cachedCountryRef.current
          ? (geoCentroid(cachedCountryRef.current) as [number, number])
          : null;
      }

      // Adaptive zoom — interpolate clip angle between adjacent articles.
      // Smoothstep easing gives a cinematic camera-move feel: the zoom
      // eases out of the current framing and eases into the next.
      const loCountry = geoData[loIndex]?.countryName ?? null;
      const hiCountry = geoData[hiIndex]?.countryName ?? null;
      const loClip = clipAngleForCountry(loCountry);
      const hiClip = clipAngleForCountry(hiCountry);
      const ef = frac * frac * (3 - 2 * frac); // Hermite smoothstep
      const rawClip = loClip + (hiClip - loClip) * ef;
      // Blend the scroll-driven clip with the user override. Each withTiming
      // call supplying these values is already eased, so no extra shaping.
      const clipAngle = rawClip + (overrideAngleVal - rawClip) * overrideActiveVal;
      const projScale = r / Math.sin((clipAngle * Math.PI) / 180);

      const proj = projRef.current;
      // precision(0) globally — skip adaptive resampling. At globe scale
      // with 110m Natural Earth data, resampled midpoints are invisible.
      // This is the single biggest perf win (~30-40% of projection time).
      proj
        .clipAngle(clipAngle)
        .precision(0)
        .rotate([-geoLng, -geoLat, 0])
        .scale(projScale)
        .translate([centerX, centerY]);

      const pg = pgRef.current;
      pg.projection(proj);

      // Near-settled gate — hoisted up so land/ice/country-highlight can pick
      // between full-detail and simplified topology per frame. Everything
      // gated on !nearSettled uses the Visvalingam-simplified variants; at
      // rest we switch back to the full 110m data. `zoomInFlight` detects
      // both the overrideActive fade and the override→override angle slide
      // so the heavy layers stay off the JS thread during zoom animations.
      const ARC_WINDOW = 0.25;
      const lastAngle = lastOverrideAngleRef.current;
      lastOverrideAngleRef.current = overrideAngleVal;
      const activeMid = overrideActiveVal > 0.001 && overrideActiveVal < 0.999;
      const angleChanging = Math.abs(overrideAngleVal - lastAngle) > 0.01;
      const zoomInFlight = activeMid || angleChanging;
      const nearSettled = !zoomInFlight && (frac < ARC_WINDOW || frac > 1 - ARC_WINDOW);

      // Land — rewind reuses the underlying buffer (vs reset which frees it).
      // Mid-scroll uses the ~2k-vertex simplified topology (vs 5k full); at
      // rest we switch back to the full coastline so static reading is crisp.
      const landPath = landPathRef.current;
      landPath.rewind();
      skiaCtx.setPath(landPath);
      pg.context(skiaCtx)(nearSettled ? landMedium : landSimplified);

      // Ice sheets — Antarctica + Greenland. Swapped to simplified during
      // scroll the same way land is. Projecting every frame (not gated) so
      // the ice layer tracks rotation without flicker.
      const icePath = icePathRef.current;
      icePath.rewind();
      skiaCtx.setPath(icePath);
      pg.context(skiaCtx)(nearSettled ? iceSheets : iceSheetsSimplified);

      // Dot
      let dot: { x: number; y: number } | null = null;
      if (geo) {
        const pt = proj([geo.lng, geo.lat]);
        if (pt) dot = { x: pt[0], y: pt[1] };
      }

      // Ghost dots — ±2 articles on either side of the settled one. Skipped
      // when behind the globe or when they'd visually smudge into the main
      // dot / an earlier ghost (30px proximity dedupe, ~1° at default zoom).
      const ghostDots: { x: number; y: number }[] = [];
      const accepted: { x: number; y: number }[] = dot ? [dot] : [];
      for (const offset of GHOST_OFFSETS) {
        const idx = settledIndex + offset;
        if (idx < 0 || idx >= geoData.length) continue;
        const g = geoData[idx];
        if (!g) continue;
        if (geoDistance([g.lng, g.lat], [geoLng, geoLat]) >= HALF_PI) continue;
        const pt = proj([g.lng, g.lat]);
        if (!pt) continue;
        const [gx, gy] = pt;
        if (accepted.some((a) => isNear(gx, gy, a.x, a.y, GHOST_DEDUPE_PX2))) continue;
        accepted.push({ x: gx, y: gy });
        ghostDots.push({ x: gx, y: gy });
      }

      // Country highlight — reuse path object. Large countries (Russia,
      // Canada, Brazil) can push this past 1k vertices; during mid-scroll
      // we project the simplified variant if available, otherwise fall
      // back to the full-detail feature (small countries aren't worth a
      // simplified copy). On settle, always full-detail.
      let countryPath: ReturnType<typeof Skia.Path.Make> | null = null;
      if (cachedCountryRef.current) {
        countryPath = countryPathRef.current;
        countryPath.rewind();
        skiaCtx.setPath(countryPath);
        const src =
          nearSettled || !cachedCountrySimplifiedRef.current
            ? cachedCountryRef.current
            : cachedCountrySimplifiedRef.current;
        pg.context(skiaCtx)(src);
      }

      // Country name label — project the cached centroid onto the current
      // frame. `proj` returns null when the point is clipped (far side of
      // the globe), which is what we want: hide the label until the
      // country rotates into view. One projection op per frame; the
      // centroid itself is pre-computed on settled-country change.
      // Default offset: 14px below the centroid so the label sits under
      // the highlight. Overridden further below if it would collide with
      // the dot label (location · time).
      let countryLabel: GlobeState['countryLabel'] = null;
      const COUNTRY_LABEL_OFFSET = 14;
      const centroid = cachedCountryCentroidRef.current;
      const countryName = cachedCountryRef.current?.properties?.name as string | undefined;
      if (centroid && countryName) {
        const pt = proj(centroid);
        if (pt) {
          const display = displayCountryName(countryName) ?? countryName;
          countryLabel = {
            lines: wrapCountryLabel(display),
            x: pt[0],
            y: pt[1] + COUNTRY_LABEL_OFFSET,
          };
        }
      }

      // Neighbouring country borders — large mesh, skip during mid-scroll.
      // Borders are visually imperceptible during fast rotation and this
      // is one of the heaviest projection operations per frame.
      let bordersPath: ReturnType<typeof Skia.Path.Make> | null = null;
      if (nearSettled) {
        bordersPath = bordersPathRef.current;
        bordersPath.rewind();
        skiaCtx.setPath(bordersPath);
        pg.context(skiaCtx)(bordersMesh);
      }

      // --- Cosmetic layers: skip during mid-scroll for perf (~15-20% savings).
      // These are invisible during fast rotation; reproject them only when
      // near a settled position (same window as arc visibility).
      let nightPath: ReturnType<typeof Skia.Path.Make> | null = null;
      let twilightPath: ReturnType<typeof Skia.Path.Make> | null = null;
      let graticulePath: ReturnType<typeof Skia.Path.Make> | null = null;
      let northPole: GlobeState['northPole'] = null;
      let southPole: GlobeState['southPole'] = null;
      let makkah: { x: number; y: number } | null = null;
      let dotLabel: GlobeState['dotLabel'] = null;

      if (nearSettled) {
        // Night shadow
        const [sunLng, sunLat] = getSunPosition();
        const nightCenter: [number, number] = [sunLng + 180, -sunLat];
        const nightGeo = nightCircleGen.center(nightCenter).radius(90)();
        const np = nightPathRef.current;
        np.rewind();
        skiaCtx.setPath(np);
        pg.context(skiaCtx)(nightGeo);
        nightPath = np;

        // Low-sun band
        const tp = twilightPathRef.current;
        tp.rewind();
        skiaCtx.setPath(tp);
        pg.context(skiaCtx)(nightCircleGen.center(nightCenter).radius(96)());
        twilightPath = tp;

        // Equator + polar circles
        const gp = graticulePathRef.current;
        gp.rewind();
        skiaCtx.setPath(gp);
        pg.context(skiaCtx)(graticuleLines);
        pg.context(skiaCtx)(ARCTIC_CIRCLE);
        pg.context(skiaCtx)(ANTARCTIC_CIRCLE);
        graticulePath = gp;

        // Poles
        const npp = proj(NORTH_POLE);
        if (npp) northPole = { x: npp[0], y: npp[1] };
        const spp = proj(SOUTH_POLE);
        if (spp) southPole = { x: spp[0], y: spp[1] };

        // Makkah
        if (geoDistance(MAKKAH.coords, [geoLng, geoLat]) < HALF_PI) {
          const pt = proj(MAKKAH.coords);
          if (pt) makkah = { x: pt[0], y: pt[1] };
        }

        // Dot label — only compute when settled (timezone lookup is expensive)
        const settledCountry = cachedCountryRef.current?.properties?.name ?? null;
        if (dot && settledCountry) {
          const article = articlesRef.current[settledIndex];
          const loc = displayLocation(article?.location ?? null);
          if (loc) {
            let sub: string | undefined;
            const cityKey = (article?.location ?? '').toLowerCase();
            const tz =
              CITY_TZ[cityKey] ?? (settledCountry ? COUNTRY_TZ[settledCountry] : undefined);
            if (tz) sub = formatLocalTime(tz) ?? undefined;
            dotLabel = { text: loc, sub, x: dot.x, y: dot.y };
          }
        }
      }

      // Qibla + source arcs — only compute when near a settled position.
      // During mid-scroll these arcs are invisible behind the transitioning
      // globe, so skip interpolation steps. Smoothstep fade creates a natural
      // breathing rhythm instead of mechanical linear ramps.
      let arcOpacity: number;
      if (frac < ARC_WINDOW) {
        const t = frac / ARC_WINDOW; // 0→1 as we scroll away
        arcOpacity = 1 - t * t * (3 - 2 * t); // smoothstep fade-out
      } else if (frac > 1 - ARC_WINDOW) {
        const t = (frac - (1 - ARC_WINDOW)) / ARC_WINDOW; // 0→1 as we approach
        arcOpacity = t * t * (3 - 2 * t); // smoothstep fade-in
      } else {
        arcOpacity = 0;
      }

      const qiblaP = qiblaPathRef.current;
      qiblaP.rewind();
      let hasQibla = false;
      if (nearSettled && geo) {
        const storyPt: [number, number] = [geo.lng, geo.lat];
        if (geoDistance(storyPt, MAKKAH.coords) > 0.02) {
          const interp = geoInterpolate(storyPt, MAKKAH.coords);
          let started = false;
          for (let i = 0; i <= 16; i++) {
            const p = proj(interp(i / 16));
            if (!p) {
              started = false;
              continue;
            }
            if (!started) {
              qiblaP.moveTo(p[0], p[1]);
              started = true;
            } else qiblaP.lineTo(p[0], p[1]);
          }
          hasQibla = true;
        }
      }

      // Source arcs — great circle lines from each source's HQ to the article location
      const srcArcs = sourceArcsRef.current;
      srcArcs.rewind();
      let hasSourceArcs = false;
      if (nearSettled && geo) {
        const storyPt: [number, number] = [geo.lng, geo.lat];
        const article = articlesRef.current[settledIndex];
        if (article?.sources) {
          for (const src of article.sources) {
            const srcCoords = SOURCE_COORDS[src.name];
            if (!srcCoords) continue;
            const srcPt: [number, number] = [srcCoords[1], srcCoords[0]]; // [lng, lat] from [lat, lng]
            // Skip if source is at the same location as the story or not visible
            if (geoDistance(srcPt, storyPt) < 0.05) continue;
            if (geoDistance(srcPt, [geoLng, geoLat]) >= HALF_PI) continue;
            const interp = geoInterpolate(srcPt, storyPt);
            let started = false;
            for (let i = 0; i <= 10; i++) {
              const p = proj(interp(i / 10));
              if (!p) {
                started = false;
                continue;
              }
              if (!started) {
                srcArcs.moveTo(p[0], p[1]);
                started = true;
              } else srcArcs.lineTo(p[0], p[1]);
            }
            hasSourceArcs = true;
          }
        }
      }

      // Coverage hotspot glows — skip during mid-scroll (cosmetic)
      const hotspotGlows: GlobeState['hotspotGlows'] = [];
      if (nearSettled) {
        for (const zone of hotspotsRef.current) {
          const zoneCoords: [number, number] = [zone.lng, zone.lat];
          if (geoDistance(zoneCoords, [geoLng, geoLat]) < HALF_PI) {
            const pt = proj(zoneCoords);
            if (pt)
              hotspotGlows.push({
                x: pt[0],
                y: pt[1],
                intensity: zone.intensity,
                recency: zone.recency,
                labels: zone.labels,
                countryName: zone.countryName,
              });
          }
        }
      }

      // Camera unit vector — precomputed once per frame so hemisphere culls
      // on static point sets (neighbour centroids, etc.) can use a dot
      // product instead of d3-geo's haversine. Standard lng/lat → Cartesian
      // with Z pointing through the north pole; dot > 0 ⇔ visible hemisphere.
      const DEG2RAD = Math.PI / 180;
      const camLatR = geoLat * DEG2RAD;
      const camLngR = geoLng * DEG2RAD;
      const camCosLat = Math.cos(camLatR);
      const camUnitX = camCosLat * Math.cos(camLngR);
      const camUnitY = camCosLat * Math.sin(camLngR);
      const camUnitZ = Math.sin(camLatR);

      // Chokepoints — always projected (unlike hotspots). The set is small
      // (≤11) and the markers are geographic reference, not cosmetic detail,
      // so they shouldn't blink out during a fast scroll.
      const chokepointMarks: GlobeState['chokepoints'] = [];
      const cameraCoords: [number, number] = [geoLng, geoLat];
      for (const cp of chokepointsRef.current) {
        if (geoDistance(cp.coords, cameraCoords) >= HALF_PI) continue;
        const pt = proj(cp.coords);
        if (!pt) continue;
        chokepointMarks.push({
          x: pt[0],
          y: pt[1],
          id: cp.id,
          label: cp.label,
          intensity: Math.min(1, cp.absDelta / CHOKEPOINT_SATURATION_DELTA),
          disrupted: cp.absDelta > CHOKEPOINT_DISRUPTED_DELTA,
        });
      }

      // Neighbour country + water-feature labels — zoom-gated on clipAngle
      // so they only appear once the camera is genuinely zoomed past
      // PLACES_APPEAR_CLIP. Iterates the precomputed
      // label sets, skips the highlighted country, filters by camera-visible
      // hemisphere, and projects. Lakes/rivers/seas precompute lazily on
      // first zoom (see detail-geo.ts), so a reader who never zooms in
      // pays zero cost for these layers.
      const neighborLabels: GlobeState['neighborLabels'] = [];
      const waterLabels: GlobeState['waterLabels'] = [];
      let riversPath: GlobeState['riversPath'] = null;
      let riversOpacity = 0;
      if (clipAngle < PLACES_APPEAR_CLIP) {
        const span = PLACES_APPEAR_CLIP - PLACES_FULL_CLIP;
        const labelOpacity = Math.min(1, Math.max(0, (PLACES_APPEAR_CLIP - clipAngle) / span));
        const settledName = cachedCountryRef.current?.properties?.name as string | undefined;

        // Neighbour + water layers are all nearSettled-gated — labels are
        // illegible during fast rotation anyway, and at the small-country
        // 1× clip angle where PLACES_APPEAR_CLIP fires (~25°), projecting
        // + rendering ~60 country centroids + ~100 water labels every
        // scroll frame was the dominant 1× cost. Labels + river path
        // return together on settle so the visual contract stays intact.
        if (nearSettled) {
          // Neighbour country centroids — hemisphere cull uses a
          // precomputed cartesian dot product against the camera axis
          // (~900 trig ops saved per frame vs. geoDistance haversine).
          // Iteration is over the parallel arrays (names/points/units)
          // populated in shared.ts.
          for (let i = 0; i < countryCentroidNames.length; i++) {
            const name = countryCentroidNames[i];
            if (!name || name === settledName) continue;
            const unit = countryCentroidUnits[i];
            if (!unit) continue;
            if (unit[0] * camUnitX + unit[1] * camUnitY + unit[2] * camUnitZ <= 0) continue;
            const coords = countryCentroidPoints[i];
            if (!coords) continue;
            const pt = proj(coords);
            if (!pt) continue;
            // Apply display-name normalization (e.g. "United States of America"
            // → "United States") so neighbour labels match the focused country
            // label and read like a real atlas. Single-line for perf — the
            // collision packer drops long ones rather than wrapping them.
            const display = displayCountryName(name) ?? name;
            neighborLabels.push({ name: display, x: pt[0], y: pt[1], opacity: labelOpacity });
          }
          // Lakes — filter to visually-significant size at globe scale
          // (~8000 km² floor = Lake Tanganyika scale). Keeps labels to the
          // ~20-30 giants worldwide; anything smaller is invisible through
          // the 110m coastline anyway.
          const LAKE_MIN_AREA = 2e-4; // steradians; ≈ 8000 km²
          for (const lake of getLakeLabels()) {
            if (lake.area < LAKE_MIN_AREA) continue;
            const lu = lake.unit;
            if (lu[0] * camUnitX + lu[1] * camUnitY + lu[2] * camUnitZ <= 0) continue;
            const pt = proj(lake.coords);
            if (!pt) continue;
            waterLabels.push({
              name: lake.name,
              x: pt[0],
              y: pt[1],
              opacity: labelOpacity,
              kind: 'lake',
            });
          }

          // Rivers — rank ≤ 3 filter already applied at precompute time.
          for (const river of getRiverLabels()) {
            const ru = river.unit;
            if (ru[0] * camUnitX + ru[1] * camUnitY + ru[2] * camUnitZ <= 0) continue;
            const pt = proj(river.coords);
            if (!pt) continue;
            waterLabels.push({
              name: river.name,
              x: pt[0],
              y: pt[1],
              opacity: labelOpacity,
              kind: 'river',
            });
          }

          // Seas / bays / gulfs — 54 entries, all relevant at globe scale.
          for (const sea of SEAS) {
            const su = sea.unit;
            if (su[0] * camUnitX + su[1] * camUnitY + su[2] * camUnitZ <= 0) continue;
            const pt = proj([sea.lng, sea.lat]);
            if (!pt) continue;
            waterLabels.push({
              name: sea.name,
              x: pt[0],
              y: pt[1],
              opacity: labelOpacity,
              kind: 'sea',
            });
          }

          // Major river lines — the single heaviest per-frame projection
          // (~9k vertices). Gated on a tighter threshold than the cheap
          // layers above so that small-country 1× framings (clip ≈ 25°)
          // get the whisper of neighbour labels + water names without
          // triggering the river-path settle-frame spike. Path is rewound
          // (not reset) so the underlying buffer stays allocated between
          // frames. Opacity uses its own fade band so rivers ease in
          // independently as the reader zooms past 22°.
          if (clipAngle < RIVERS_APPEAR_CLIP) {
            const rp = riversPathRef.current;
            rp.rewind();
            skiaCtx.setPath(rp);
            pg.context(skiaCtx)(getMajorRiverFeatureCollection() as never);
            riversPath = rp;
            const riverSpan = RIVERS_APPEAR_CLIP - PLACES_FULL_CLIP;
            riversOpacity = Math.min(1, Math.max(0, (RIVERS_APPEAR_CLIP - clipAngle) / riverSpan));
          }
        }
      }

      // Label collision — dot label (location · time) versus country name
      // label. Small countries where the story dot sits near the polygon
      // centroid (e.g. Islamabad in Pakistan) can stack the two. Compute
      // AABBs using the loaded font widths (approximated to character
      // count when fonts aren't loaded yet), push the country label below
      // the dot-label block if they overlap. Dot label stays fixed since
      // it anchors to the story location; country label is secondary.
      if (countryLabel && dotLabel) {
        const lfont = labelFontRef.current;
        const sfont = subFontRef.current;
        // Text widths — fall back to char-count approximation (7px per char
        // for labelFont, 5px for subFont) before fonts finish loading. The
        // country label is multi-line (1–2 rows): use the widest row.
        const cWidth = measureLines(countryLabel.lines, lfont, 7);
        const dWidth = lfont ? lfont.getTextWidth(dotLabel.text) : dotLabel.text.length * 7;
        const sWidth = dotLabel.sub
          ? sfont
            ? sfont.getTextWidth(dotLabel.sub)
            : dotLabel.sub.length * 5
          : 0;
        // Country label AABB — centered on x, first baseline at y, each
        // additional line stacks LABEL_LINE_HEIGHT below.
        const cX0 = countryLabel.x - cWidth / 2;
        const cX1 = cX0 + cWidth;
        const cY0 = countryLabel.y - 12; // ascender of first line
        const cY1 = countryLabel.y + (countryLabel.lines.length - 1) * LABEL_LINE_HEIGHT + 4;
        // Dot label block AABB — dot label at (dot.x + 6, dot.y + 4), sub
        // offset another 14px down. Covers both rows.
        const dX0 = dotLabel.x + 6;
        const dX1 = dX0 + Math.max(dWidth, sWidth);
        const dY0 = dotLabel.y + 4 - 12;
        const dY1 = dotLabel.y + (dotLabel.sub ? 18 : 4) + 4;
        const overlap = !(cX1 < dX0 || cX0 > dX1 || cY1 < dY0 || cY0 > dY1);
        if (overlap) {
          // Push country label below the dot block with a small gap.
          countryLabel = { ...countryLabel, y: dY1 + 14 };
        }
      }

      // Label packing — drop neighbour / water labels that overlap a
      // higher-priority label or an already-placed peer. Greedy AABB
      // sweep, seeded with the country + dot labels (always shown). Runs
      // only when zoomed in enough for neighbours / waters to populate;
      // arrays are empty at 1× so the loops skip. Priority ladder:
      //   dotLabel ≻ countryLabel ≻ neighbours ≻ waters
      // Inside waters the input order (lakes → rivers → seas) acts as
      // sub-priority. N² on ≤ ~100 rects stays sub-ms on the JS thread.
      let keptNeighbours = neighborLabels;
      let keptWaters = waterLabels;
      if (neighborLabels.length > 0 || waterLabels.length > 0) {
        const lfont = labelFontRef.current;
        const sfont = subFontRef.current;
        const occupied: { x0: number; y0: number; x1: number; y1: number }[] = [];
        const pad = 2;
        if (countryLabel) {
          const w = measureLines(countryLabel.lines, lfont, 7);
          occupied.push({
            x0: countryLabel.x - w / 2 - pad,
            x1: countryLabel.x + w / 2 + pad,
            y0: countryLabel.y - 12,
            y1: countryLabel.y + (countryLabel.lines.length - 1) * LABEL_LINE_HEIGHT + 4,
          });
        }
        if (dotLabel) {
          const dw = lfont ? lfont.getTextWidth(dotLabel.text) : dotLabel.text.length * 7;
          const sw = dotLabel.sub
            ? sfont
              ? sfont.getTextWidth(dotLabel.sub)
              : dotLabel.sub.length * 5
            : 0;
          occupied.push({
            x0: dotLabel.x + 6 - pad,
            x1: dotLabel.x + 6 + Math.max(dw, sw) + pad,
            y0: dotLabel.y + 4 - 12,
            y1: dotLabel.y + (dotLabel.sub ? 18 : 4) + 4,
          });
        }

        const nkept: GlobeState['neighborLabels'] = [];
        for (const n of neighborLabels) {
          const w = sfont ? sfont.getTextWidth(n.name) : n.name.length * 5;
          const x0 = n.x - w / 2 - pad;
          const x1 = n.x + w / 2 + pad;
          const y0 = n.y - 10;
          const y1 = n.y + 3;
          let collides = false;
          for (const o of occupied) {
            if (x0 < o.x1 && x1 > o.x0 && y0 < o.y1 && y1 > o.y0) {
              collides = true;
              break;
            }
          }
          if (!collides) {
            nkept.push(n);
            occupied.push({ x0, y0, x1, y1 });
          }
        }
        keptNeighbours = nkept;

        const wkept: GlobeState['waterLabels'] = [];
        for (const w of waterLabels) {
          const tw = sfont ? sfont.getTextWidth(w.name) : w.name.length * 5;
          // River labels render 7px above their coord (see render side),
          // everything else at its coord.
          const yc = w.kind === 'river' ? w.y - 7 : w.y;
          const x0 = w.x - tw / 2 - pad;
          const x1 = w.x + tw / 2 + pad;
          const y0 = yc - 10;
          const y1 = yc + 3;
          let collides = false;
          for (const o of occupied) {
            if (x0 < o.x1 && x1 > o.x0 && y0 < o.y1 && y1 > o.y0) {
              collides = true;
              break;
            }
          }
          if (!collides) {
            wkept.push(w);
            occupied.push({ x0, y0, x1, y1 });
          }
        }
        keptWaters = wkept;
      }

      setState({
        landPath,
        icePath,
        bordersPath,
        countryPath,
        countryName: cachedCountryRef.current?.properties?.name ?? null,
        nightPath,
        twilightPath,
        graticulePath,
        qiblaPath: hasQibla ? qiblaP : null,
        sourceArcs: hasSourceArcs ? srcArcs : null,
        arcOpacity,
        northPole,
        southPole,
        dot,
        ghostDots,
        dotLabel,
        countryLabel,
        makkah,
        hotspotGlows,
        chokepoints: chokepointMarks,
        neighborLabels: keptNeighbours,
        waterLabels: keptWaters,
        riversPath,
        riversOpacity,
      });
    },
    [],
  );

  // Throttle reprojection to 32ms (~30fps), skip throttle on first call.
  // 16ms overwhelms the JS thread (d3-geo projection + setState can't complete in one frame).
  const lastTimeRef = useSharedValue(0);
  const hasFired = useSharedValue(false);

  useAnimatedReaction(
    () => ({
      sy: scrollY.value,
      oA: overrideActive.value,
      oG: overrideAngle.value,
      len: coordsSV.value.length,
    }),
    ({ sy, oA, oG, len }) => {
      if (len === 0) return;

      const now = Date.now();
      if (hasFired.value && now - lastTimeRef.value < 32) return;
      hasFired.value = true;
      lastTimeRef.value = now;

      const coords = coordsSV.value;
      const articleCount = len / 2;
      const rawIndex = Math.max(0, sy / itemHeight);
      const lo = Math.min(Math.floor(rawIndex), articleCount - 1);
      const hi = Math.min(lo + 1, articleCount - 1);
      const frac = rawIndex - lo;

      const loLat = coords[lo * 2];
      const loLng = coords[lo * 2 + 1];
      const hiLat = coords[hi * 2];
      const hiLng = coords[hi * 2 + 1];

      let lat: number;
      let lng: number;

      if (loLat != null && loLng != null && hiLat != null && hiLng != null) {
        // Great-circle interpolation (slerp) — the globe rotates along the
        // surface of the sphere between story locations, like tracing a path
        // on a physical globe. Linear lat/lng would cut through the interior.
        const DEG2RAD = Math.PI / 180;
        const RAD2DEG = 180 / Math.PI;
        const lat0 = loLat * DEG2RAD;
        const lng0 = loLng * DEG2RAD;
        const lat1 = hiLat * DEG2RAD;
        const lng1 = hiLng * DEG2RAD;

        // Convert to unit-sphere cartesian
        const cosLat0 = Math.cos(lat0);
        const cosLat1 = Math.cos(lat1);
        const x0 = cosLat0 * Math.cos(lng0);
        const y0 = cosLat0 * Math.sin(lng0);
        const z0 = Math.sin(lat0);
        const x1 = cosLat1 * Math.cos(lng1);
        const y1 = cosLat1 * Math.sin(lng1);
        const z1 = Math.sin(lat1);

        // Angular distance between the two points
        const dot = x0 * x1 + y0 * y1 + z0 * z1;
        const omega = Math.acos(Math.min(1, Math.max(-1, dot)));

        if (omega > 0.001) {
          // Slerp — spherical linear interpolation
          const sinO = Math.sin(omega);
          const a = Math.sin((1 - frac) * omega) / sinO;
          const b = Math.sin(frac * omega) / sinO;
          const rx = a * x0 + b * x1;
          const ry = a * y0 + b * y1;
          const rz = a * z0 + b * z1;
          lat = Math.asin(Math.min(1, Math.max(-1, rz))) * RAD2DEG;
          lng = Math.atan2(ry, rx) * RAD2DEG;
        } else {
          // Points nearly coincident — fall back to linear
          lat = loLat + (hiLat - loLat) * frac;
          let dLng = hiLng - loLng;
          if (dLng > 180) dLng -= 360;
          if (dLng < -180) dLng += 360;
          lng = loLng + dLng * frac;
        }
      } else if (loLat != null && loLng != null) {
        lat = loLat;
        lng = loLng;
      } else if (hiLat != null && hiLng != null) {
        lat = hiLat;
        lng = hiLng;
      } else {
        return;
      }

      const settled = Math.min(Math.round(rawIndex), articleCount - 1);

      runOnJS(callReproject)(lng, lat, settled, lo, hi, frac, oA, oG);
    },
  );

  // On app resume, invalidate sun/night caches and reproject the globe
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    if (!_tick) return; // skip initial render
    invalidateSunCaches();
    const last = lastReprojRef.current;
    if (last)
      callReproject(
        last.lng,
        last.lat,
        last.idx,
        last.idx,
        last.idx,
        0,
        overrideActive.value,
        overrideAngle.value,
      );
  }, [_tick]);

  // Once an animation settles the SharedValues stop changing, so the animated
  // reaction stops firing and the last in-flight frame left zoomInFlight=true
  // (angle delta vs prior frame crossed the 0.01° gate). Without this
  // finalizer, cosmetic layers — borders, dot label, night, graticule —
  // stayed invisible until the user scrolled. Running one more reproject
  // with the now-stable overrides re-evaluates zoomInFlight as false.
  const finalizeReproject = useCallback(() => {
    const last = lastReprojRef.current;
    if (!last) return;
    // Prime the angle ref so callReproject's frame-delta check sees a zero
    // delta. Without this, the last in-flight frame left lastAngleRef at a
    // pre-target value, and finalize itself would still treat the zoom as
    // in-flight — suppressing the very cosmetic redraw it was meant to
    // trigger (most noticeable at 0.5× where the angle swing is largest).
    lastOverrideAngleRef.current = overrideAngle.value;
    callReproject(
      last.lng,
      last.lat,
      last.idx,
      last.idx,
      last.idx,
      0,
      overrideActive.value,
      overrideAngle.value,
    );
  }, [callReproject, overrideActive, overrideAngle]);

  // Zoom prop → animated override. Three transition shapes:
  //   override → null       : fade overrideActive to 0 (angle untouched)
  //   null      → override  : snap overrideAngle to target, fade active to 1
  //   override → override   : slide overrideAngle to new target, active stays 1
  useEffect(() => {
    const prev = prevOverrideRef.current;
    prevOverrideRef.current = zoomClipOverride;
    const onDone = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(finalizeReproject)();
    };
    const opts = { duration: ZOOM_DURATION, easing: ZOOM_EASING };
    if (zoomClipOverride === null) {
      overrideActive.value = withTiming(0, opts, onDone);
    } else if (prev === null) {
      overrideAngle.value = zoomClipOverride;
      overrideActive.value = withTiming(1, opts, onDone);
    } else {
      overrideAngle.value = withTiming(zoomClipOverride, opts, onDone);
    }
  }, [zoomClipOverride, overrideActive, overrideAngle, finalizeReproject]);

  // Re-project when hotspot data changes (e.g. heatmap fetch after app resume)
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    const last = lastReprojRef.current;
    if (last)
      callReproject(
        last.lng,
        last.lat,
        last.idx,
        last.idx,
        last.idx,
        0,
        overrideActive.value,
        overrideAngle.value,
      );
  }, [hotspots]);

  // Re-project when chokepoint data arrives (first API fetch, or a cycle-level refresh)
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    const last = lastReprojRef.current;
    if (last)
      callReproject(
        last.lng,
        last.lat,
        last.idx,
        last.idx,
        last.idx,
        0,
        overrideActive.value,
        overrideAngle.value,
      );
  }, [chokepoints]);

  // Tap pulse — radial ring that expands and fades on globe tap
  const pulseX = useSharedValue(0);
  const pulseY = useSharedValue(0);
  const pulseR = useSharedValue(0);
  const pulseOpacity = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    showPulse(x: number, y: number) {
      pulseX.value = x;
      pulseY.value = y;
      pulseR.value = 3;
      pulseOpacity.value = 0.35;
      pulseR.value = withTiming(32, { duration: 400, easing: PULSE_EASING });
      pulseOpacity.value = withTiming(0, { duration: 400, easing: PULSE_EASING });
    },
    hitTest(x: number, y: number): TapResult | null {
      // Collect unique story labels (or titles) for a country from the current article set
      const storiesFor = (name: string) => {
        const seen = new Set<string>();
        const geoArr = articleGeoRef.current;
        const artArr = articlesRef.current;
        for (let i = 0; i < geoArr.length; i++) {
          const geo = geoArr[i];
          if (!geo || geo.countryName !== name) continue;
          const a = artArr[i];
          if (!a) continue;
          if (a.threadLabel) {
            const label = a.threadLabel.includes(':')
              ? a.threadLabel.slice(0, a.threadLabel.indexOf(':'))
              : a.threadLabel;
            seen.add(label);
          } else if (a.title) {
            seen.add(a.title);
          }
        }
        return seen.size > 0 ? [...seen] : undefined;
      };

      // Check hotspot glows first — tight hit area (r²=900) signals precise intent
      for (const z of state.hotspotGlows) {
        if (isNear(x, y, z.x, z.y, 900)) {
          const name = z.countryName ?? '';
          const tz = name ? COUNTRY_TZ[name] : undefined;
          return {
            countryName: name,
            location: null,
            localTime: tz ? formatLocalTime(tz) : null,
            data: name ? (COUNTRY_DATA[name] ?? null) : null,
            hotspotLabels: z.labels.length > 0 ? z.labels : undefined,
            isHotspot: true,
          };
        }
      }

      // Chokepoint rings — ambient markers. 36px tap zone, generous so small
      // rings are still reliably tappable, but smaller than the article-dot
      // window so chokepoints near the settled pin don't eat its taps.
      for (const c of state.chokepoints) {
        if (isNear(x, y, c.x, c.y, 1296)) {
          return {
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            chokepointId: c.id,
          };
        }
      }

      // Then article dot (wider catch zone)
      const dot = state.dot;
      if (dot && isNear(x, y, dot.x, dot.y, 3600)) {
        const geoData = articleGeoRef.current[lastSettled.current];
        if (geoData?.countryName) {
          const tz = COUNTRY_TZ[geoData.countryName];
          return {
            countryName: geoData.countryName,
            location: displayLocation(geoData.location) ?? geoData.location,
            localTime: tz ? formatLocalTime(tz) : null,
            data: COUNTRY_DATA[geoData.countryName] ?? null,
            hotspotLabels: storiesFor(geoData.countryName),
          };
        }
      }

      // Then Makkah
      if (state.makkah && isNear(x, y, state.makkah.x, state.makkah.y, 3600)) {
        return {
          countryName: 'Saudi Arabia',
          location: MAKKAH.name,
          localTime: formatLocalTime('Asia/Riyadh'),
          data: COUNTRY_DATA['Saudi Arabia'] ?? null,
          hotspotLabels: storiesFor('Saudi Arabia'),
        };
      }

      // Full-globe fallback — tap any visible land mass to identify the country
      const { cx: hitCx, cy: hitCy, globeRadius: hitR } = layoutRef.current;
      const gdx = x - hitCx;
      const gdy = y - hitCy;
      if (gdx * gdx + gdy * gdy <= hitR * hitR) {
        const coords = projRef.current.invert?.([x, y]);
        if (coords) {
          const [lng, lat] = coords;
          let feature: GeoJSON.Feature | undefined;
          for (let i = 0; i < countries.features.length; i++) {
            const bbox = countryBboxes[i];
            const feat = countries.features[i];
            if (!bbox || !feat) continue;
            const [minLng, minLat, maxLng, maxLat] = bbox;
            if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
            if (geoContains(feat, coords)) {
              feature = feat;
              break;
            }
          }
          if (feature) {
            const name = feature.properties?.name ?? '';
            const tz = name ? COUNTRY_TZ[name] : undefined;
            return {
              countryName: name,
              location: null,
              localTime: tz ? formatLocalTime(tz) : null,
              data: name ? (COUNTRY_DATA[name] ?? null) : null,
              hotspotLabels: storiesFor(name),
            };
          }
        }
      }

      return null;
    },
  }));

  // Moon — NASA texture with phase shadow
  const moonTexture = useImage(require('../../assets/moon.png'));
  // biome-ignore lint/correctness/useExhaustiveDependencies: _tick forces recalc on app resume
  const moonPhase = useMemo(() => getMoonPhase(), [_tick]);
  const moonR = globeRadius * 0.05;

  // Position moon astronomically: elongation from sun determines sky position.
  // At new moon (phase=0) it's near the sun → day side → hidden.
  // At full moon (phase=0.5) it's opposite → night side → prominent.
  // Moon position: above the globe, offset horizontally by elongation from sun.
  // Full moon (phase=0.5) centers above; crescents drift toward the sun side.
  const moonPos = useMemo(() => {
    // Elongation maps phase to horizontal offset: 0=sun side, 0.5=opposite, 1=sun side
    const elongation = Math.sin(moonPhase * Math.PI); // 0 at new/full → 1 at quarters
    const side = moonPhase < 0.5 ? 1 : -1; // waxing=right, waning=left
    const maxDrift = globeRadius * 0.6;
    const x = cx + side * elongation * maxDrift;
    const y = cy - globeRadius - moonR * 4;
    // Hide near new moon (phase < 0.07 or > 0.93)
    const visible = moonPhase > 0.07 && moonPhase < 0.93;
    return { x, y, visible };
  }, [moonPhase, cx, cy, globeRadius, moonR]);

  const moonClip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(moonPos.x, moonPos.y, moonR);
    return p;
  }, [moonPos.x, moonPos.y, moonR]);

  // Stars — recorded into an immutable Picture so Skia replays a single cached
  // GPU command instead of re-evaluating dozens of React elements per rerender.
  // Size distribution (cubed) mimics a real sky: mostly tiny, rare bright stars.
  // Bright stars get a subtle 4-point glint (long-exposure photography look).
  const starsPicture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));

    // Park–Miller LCG — deterministic positions for a stable night sky
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    // Three tints — mostly neutral (accent), a pinch of cool (atmosphere) and warm (dome)
    const neutral = Skia.Paint();
    neutral.setColor(Skia.Color(colors.accent));
    const cool = Skia.Paint();
    cool.setColor(Skia.Color(colors.atmosphere));
    const warm = Skia.Paint();
    warm.setColor(Skia.Color(colors.dome));

    const glint = Skia.Paint();
    glint.setColor(Skia.Color(colors.accent));
    glint.setStrokeWidth(0.35);
    glint.setAntiAlias(true);

    // Exclude a ring slightly larger than the globe so stars don't clash with the rim glow
    const exclusionR2 = globeRadius * globeRadius * 1.05;

    for (let i = 0; i < 90; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < exclusionR2) continue;

      // Cubed random: heavily skewed toward small values — most stars pinpricks.
      const t = rand();
      const r = 0.2 + t * t * t * 1.6;

      // Color roll: 78% neutral, 12% cool, 10% warm
      const hue = rand();
      const paint = hue < 0.12 ? cool : hue < 0.22 ? warm : neutral;

      // Subtle alpha range — stars should be atmospheric dust, not focal points
      const alpha = 0.07 + t * 0.22;
      paint.setAlphaf(alpha);
      canvas.drawCircle(x, y, r, paint);

      // Only the rarest (largest) stars get a very faint cross-glint
      if (r > 1.45) {
        glint.setAlphaf(alpha * 0.22);
        const len = r * 2.4;
        canvas.drawLine(x - len, y, x + len, y, glint);
        canvas.drawLine(x, y - len, x, y + len, glint);
      }
    }

    return recorder.finishRecordingAsPicture();
  }, [width, height, cx, cy, globeRadius, colors.accent, colors.atmosphere, colors.dome]);

  // Atmospheric rim + ocean-disk gradient stops. Memoized per-theme so the
  // declarative RadialGradient props stay referentially stable during scroll.
  const rimColors = useMemo(() => {
    const atm = colors.atmosphere;
    return [
      `${atm}00`,
      `${atm}00`,
      `${atm}${light ? '55' : '40'}`,
      `${atm}${light ? '18' : '14'}`,
      `${atm}00`,
    ];
  }, [colors.atmosphere, light]);

  const oceanColors = useMemo(() => {
    const atm = colors.atmosphere;
    // Subtle Fresnel — slightly dimmer at center, brighter toward the rim
    return [`${atm}${light ? '14' : '0A'}`, `${atm}${light ? '29' : '19'}`];
  }, [colors.atmosphere, light]);

  return (
    <Canvas style={[styles.canvas, { width, height }]} pointerEvents="none">
      {/* Stars — single cached Picture, no per-frame React overhead */}
      <Picture picture={starsPicture} />

      {/* Moon — memoized to skip re-reconciliation during scroll */}
      {moonPos.visible && (
        <Moon
          x={moonPos.x}
          y={moonPos.y}
          r={moonR}
          phase={moonPhase}
          texture={moonTexture}
          clip={moonClip}
          accentColor={colors.accent}
          bgAlpha={bgAlpha}
        />
      )}

      {/* Atmospheric rim — radial gradient ring just outside the globe edge.
          Single declarative draw, no per-frame cost. */}
      <Circle cx={cx} cy={cy} r={globeRadius * 1.25}>
        <RadialGradient
          c={vec(cx, cy)}
          r={globeRadius * 1.25}
          colors={rimColors}
          positions={[0, 0.78, 0.84, 0.93, 1]}
        />
      </Circle>

      {/* Ocean disk — subtle Fresnel gradient reads as a 3D sphere instead of a flat circle */}
      <Circle cx={cx} cy={cy} r={globeRadius}>
        <RadialGradient c={vec(cx, cy)} r={globeRadius} colors={oceanColors} positions={[0, 1]} />
      </Circle>

      {/* Land silhouette */}
      {state.landPath && (
        <Path path={state.landPath} color={colors.accent} opacity={light ? 0.25 : 0.1} />
      )}

      {/* Permanent ice sheets — Antarctica + Greenland. Scientifically the two
          land masses covered in year-round ice; rendered as a bright fill over
          `landPath` so the globe reads climatologically correct. */}
      {state.icePath && (
        <Path path={state.icePath} color={colors.text} opacity={light ? 0.55 : 0.35} />
      )}

      {/* Neighbouring country borders — visible when scroll is at rest */}
      {state.bordersPath && (
        <Path
          path={state.bordersPath}
          color={colors.accent}
          style="stroke"
          strokeWidth={0.7}
          opacity={light ? 0.3 : 0.3}
        />
      )}

      {/* Equator + polar circles */}
      {state.graticulePath && (
        <Path
          path={state.graticulePath}
          color={colors.accent}
          style="stroke"
          strokeWidth={0.4}
          opacity={light ? 0.12 : 0.05}
        />
      )}

      {/* Low-sun band — faint gradient where sun is near the horizon */}
      {state.twilightPath && <Path path={state.twilightPath} color={BLACK} opacity={0.06} />}

      {/* Night shadow — darker overlay on the unlit hemisphere */}
      {state.nightPath && <Path path={state.nightPath} color={BLACK} opacity={0.15} />}

      {/* Terminator — thin stroke at the day/night boundary */}
      {state.nightPath && (
        <Path
          path={state.nightPath}
          color={colors.atmosphere}
          style="stroke"
          strokeWidth={0.5}
          opacity={0.12}
        />
      )}

      {/* Coverage hotspots — RadialGradient halo + sharp core dot.
          Gradient shader gives smoother falloff than stacked BlurMask circles
          and skips the blur pass entirely. Recency fades older hotspots:
          fresh stories are prominent, stale ones whisper. */}
      {state.hotspotGlows.map((z, i) => {
        const fade = 0.3 + 0.7 * z.recency;
        const haloR = 18 + z.intensity * 16;
        const peak = withAlpha(colors.text, (0.1 + z.intensity * 0.13) * fade);
        const mid = withAlpha(colors.text, (0.04 + z.intensity * 0.06) * fade);
        const edge = `${colors.text}00`;
        const coreR = 0.9 + z.intensity * 0.7;
        return (
          <Group key={i}>
            <Circle cx={z.x} cy={z.y} r={haloR}>
              <RadialGradient
                c={vec(z.x, z.y)}
                r={haloR}
                colors={[peak, mid, edge]}
                positions={[0, 0.35, 1]}
              />
            </Circle>
            <Circle cx={z.x} cy={z.y} r={coreR} color={colors.text} opacity={0.42 * fade} />
          </Group>
        );
      })}

      {/* Chokepoint rings — ambient reference geography. Quiet when transit
          flow is near baseline, accent-fill when disrupted (±>15% from 90d
          average). Label is always drawn so the reader learns the geography. */}
      {state.chokepoints.map((c) => {
        const ringOpacity = 0.35 + 0.45 * c.intensity;
        const ringColor = c.disrupted ? colors.accent : colors.rule;
        // Label centering uses getTextWidth when the font has loaded;
        // before that we fall back to a char-count approximation so the
        // first frame doesn't misplace the text.
        const labelTx = subFont
          ? c.x - subFont.getTextWidth(c.label) / 2
          : c.x - c.label.length * 2.5;
        const labelTy = c.y + 20;
        return (
          <Group key={c.id}>
            {c.disrupted && (
              <Circle cx={c.x} cy={c.y} r={12}>
                <RadialGradient
                  c={vec(c.x, c.y)}
                  r={12}
                  colors={[
                    withAlpha(colors.accent, 0.22 * c.intensity),
                    withAlpha(colors.accent, 0.08 * c.intensity),
                    withAlpha(colors.accent, 0),
                  ]}
                  positions={[0, 0.5, 1]}
                />
              </Circle>
            )}
            <Circle
              cx={c.x}
              cy={c.y}
              r={6}
              color={ringColor}
              opacity={ringOpacity}
              style="stroke"
              strokeWidth={1.25}
            />
            <Circle
              cx={c.x}
              cy={c.y}
              r={1}
              color={ringColor}
              opacity={Math.min(1, ringOpacity + 0.2)}
            />
            <HaloLabel
              x={labelTx}
              y={labelTy}
              text={c.label}
              font={subFont}
              color={c.disrupted ? colors.accent : colors.textSecondary}
              haloColor={colors.bg}
              opacity={c.disrupted ? 0.9 : 0.55}
              haloOpacity={c.disrupted ? 1 : 0.75}
            />
          </Group>
        );
      })}

      {/* Country highlight — opacity scales with area so small nations pop */}
      {state.countryPath && (
        <CountryHighlight
          path={state.countryPath}
          countryName={state.countryName}
          color={colors.text}
        />
      )}

      {/* Major river lines — zoom-gated so nothing draws at globe scale.
          Rendered AFTER the country highlight so rivers crossing the
          highlighted country (Ganges through India, Volga through Russia)
          stay visible. Halo (bg, 2.5px) underneath a dark textEmphasis
          stroke (1.2px) gives the rivers a high-contrast edge over both
          the plain land tint and the highlight's soft glow. */}
      {state.riversPath && (
        <>
          <Path
            path={state.riversPath}
            color={colors.bg}
            style="stroke"
            strokeWidth={2.5}
            opacity={(light ? 0.8 : 0.65) * state.riversOpacity}
          />
          <Path
            path={state.riversPath}
            color={colors.textEmphasis}
            style="stroke"
            strokeWidth={1.2}
            opacity={(light ? 0.85 : 0.75) * state.riversOpacity}
          />
        </>
      )}

      {/* Source arcs — information flow lines from source HQs to story location */}
      {state.sourceArcs && (
        <Path
          path={state.sourceArcs}
          color={colors.accent}
          style="stroke"
          strokeWidth={0.5}
          opacity={(light ? 0.15 : 0.08) * state.arcOpacity}
        />
      )}

      {/* Qibla arc — great circle toward Makkah */}
      {state.qiblaPath && (
        <Path
          path={state.qiblaPath}
          color={colors.dome}
          style="stroke"
          strokeWidth={0.8}
          opacity={(light ? 0.2 : 0.12) * state.arcOpacity}
        />
      )}

      {/* Makkah — golden qibla reference point */}
      {state.makkah && (
        <Glow
          x={state.makkah.x}
          y={state.makkah.y}
          color={colors.dome}
          layers={MAKKAH_GLOW_LAYERS}
        />
      )}

      {/* Ghost dots — adjacent articles in the scroll, rendered under the
          main dot so the settled story always reads brightest. */}
      {state.ghostDots.map((g, i) => (
        <Glow
          key={`ghost-${i}`}
          x={g.x}
          y={g.y}
          color={colors.textEmphasis}
          layers={GHOST_GLOW_LAYERS}
        />
      ))}

      {/* Story dot */}
      {state.dot && (
        <Glow
          x={state.dot.x}
          y={state.dot.y}
          color={colors.textEmphasis}
          layers={DOT_GLOW_LAYERS}
        />
      )}

      {/* Tap pulse — expanding ring on globe tap */}
      <Circle cx={pulseX} cy={pulseY} r={pulseR} color={colors.textEmphasis} opacity={pulseOpacity}>
        <BlurMask blur={6} style="solid" />
      </Circle>

      {/* Water-feature labels — named lakes (major only), major rivers,
          seas/bays/gulfs. Drawn lightest of the three label tiers so the
          visual hierarchy reads: focused country > neighbours > waters.
          Halo deliberately removed: stroked-text rasterization dominated
          the settled-frame budget (path widening + stroke pass per
          glyph × ~50 labels). textSecondary at high opacity reads
          cleanly against bg and the 20% land tint; river strokes only
          cross labels briefly and the collision packer already keeps
          labels off the densest overlaps. */}
      {subFont &&
        state.waterLabels.map((w, i) => {
          const tx = w.x - subFont.getTextWidth(w.name) / 2;
          // River labels land directly on the river line — nudge them up
          // by ~7px (one x-height) so the label sits just above the line
          // rather than bisecting it. Lakes and seas stay at their centroid.
          const ty = w.kind === 'river' ? w.y - 7 : w.y;
          return (
            <SkiaText
              key={`${w.kind}-${w.name}-${i}`}
              x={tx}
              y={ty}
              text={w.name}
              font={subFont}
              color={colors.textSecondary}
              opacity={(light ? 0.95 : 0.9) * w.opacity}
            />
          );
        })}

      {/* Neighbour country labels — emerge at 2x zoom, fade toward full
          opacity as zoom tightens. Drawn with subFont (smaller than the
          focused country's labelFont) so visual hierarchy reads: the
          highlighted country = primary text; neighbours = secondary.
          Rendered BEFORE the highlighted country label so the focused
          country's name draws on top if they collide. Halo removed for
          the same perf reason as water labels; the text tier is quiet
          enough that a slight opacity bump restores readability. */}
      {subFont &&
        state.neighborLabels.map((n) => {
          const tx = n.x - subFont.getTextWidth(n.name) / 2;
          return (
            <SkiaText
              key={n.name}
              x={tx}
              y={n.y}
              text={n.name}
              font={subFont}
              color={colors.textSecondary}
              opacity={(light ? 0.85 : 0.7) * n.opacity}
            />
          );
        })}

      {/* Country name — always rendered (every zoom level) when a country is
          highlighted and its centroid is on the visible hemisphere. Anchored
          below the centroid so it stays clear of the city/time dot label.
          Long names wrap to two lines (Google Maps convention) — see
          `wrapCountryLabel`. Each line is centered independently so the
          stack reads as a balanced block. The state's `(x, y)` is the
          baseline of the FIRST line; subsequent lines stack at LABEL_LINE_HEIGHT. */}
      {state.countryLabel &&
        labelFont &&
        (() => {
          const cl = state.countryLabel;
          return cl.lines.map((line, i) => {
            const tx = cl.x - labelFont.getTextWidth(line) / 2;
            const ty = cl.y + i * LABEL_LINE_HEIGHT;
            return (
              <HaloLabel
                key={`country-${i}`}
                x={tx}
                y={ty}
                text={line}
                font={labelFont}
                color={colors.textEmphasis}
                haloColor={colors.bg}
                opacity={light ? 0.95 : 0.9}
                haloOpacity={light ? 0.85 : 0.7}
              />
            );
          });
        })()}

      {/* Dot label — location · local time */}
      {state.dotLabel && labelFont && (
        <>
          <SkiaText
            x={state.dotLabel.x + 6}
            y={state.dotLabel.y + 4}
            text={state.dotLabel.text}
            font={labelFont}
            color={colors.textEmphasis}
            opacity={light ? 0.65 : 0.8}
          />
          {state.dotLabel.sub && subFont && (
            <SkiaText
              x={state.dotLabel.x + 6}
              y={state.dotLabel.y + 18}
              text={state.dotLabel.sub}
              font={subFont}
              color={colors.textEmphasis}
              opacity={light ? 0.45 : 0.55}
            />
          )}
        </>
      )}

      {/* Pole markers — tiny crosses */}
      {state.northPole && (
        <>
          <Rect
            x={state.northPole.x - 3}
            y={state.northPole.y - 0.4}
            width={6}
            height={0.8}
            color={colors.accent}
            opacity={light ? 0.2 : 0.15}
          />
          <Rect
            x={state.northPole.x - 0.4}
            y={state.northPole.y - 3}
            width={0.8}
            height={6}
            color={colors.accent}
            opacity={light ? 0.2 : 0.15}
          />
        </>
      )}
      {state.southPole && (
        <>
          <Rect
            x={state.southPole.x - 3}
            y={state.southPole.y - 0.4}
            width={6}
            height={0.8}
            color={colors.accent}
            opacity={light ? 0.2 : 0.15}
          />
          <Rect
            x={state.southPole.x - 0.4}
            y={state.southPole.y - 3}
            width={0.8}
            height={6}
            color={colors.accent}
            opacity={light ? 0.2 : 0.15}
          />
        </>
      )}
    </Canvas>
  );
});

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
