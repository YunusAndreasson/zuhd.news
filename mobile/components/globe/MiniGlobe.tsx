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
import { COUNTRY_DATA, type CountryData } from '../../constants/country-data';
import { BLACK } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { displayLocation } from '../../lib/place-names';
import type { Article, Chokepoint, HeatmapPoint } from '../../types';
import { CITY_TZ, COUNTRY_OVERRIDES, COUNTRY_TZ, SOURCE_COORDS } from './coordinates';
import {
  bordersMesh,
  countries,
  countryAreas,
  countryBboxes,
  createSkiaPathContext,
  land,
} from './shared';
import { getCoords } from './storyDots';

/** Squared-distance hit test */
function isNear(x: number, y: number, px: number, py: number, r2: number): boolean {
  const dx = x - px;
  const dy = y - py;
  return dx * dx + dy * dy <= r2;
}

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

const skiaCtx = createSkiaPathContext();
const nightCircleGen = geoCircle();

// Equator + polar circles (Arctic 66.56°N, Antarctic 66.56°S)
const graticuleLines = geoGraticule()
  .stepMinor([360, 360]) // no minor lines
  .stepMajor([30, 30])(
  // meridians + parallels every 30°
);

const NORTH_POLE: [number, number] = [0, 90];
const SOUTH_POLE: [number, number] = [0, -90];
const ARCTIC_CIRCLE = geoCircle().center(NORTH_POLE).radius(23.44)();
const ANTARCTIC_CIRCLE = geoCircle().center(SOUTH_POLE).radius(23.44)();
const HALF_PI = Math.PI / 2;
const DECAY_LAMBDA = Math.LN2 / 18; // 18h half-life
const PULSE_EASING = Easing.out(Easing.cubic);

/** Append an alpha channel to a hex color. a ∈ [0, 1]. Clamped. */
function withAlpha(hex: string, a: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, a)) * 255);
  return `${hex}${byte.toString(16).padStart(2, '0')}`;
}

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

// Makkah — [lng, lat] for d3-geo (qibla direction reference)
const MAKKAH = {
  coords: [39.83, 21.42] as [number, number],
  name: 'Makkah',
};

// Moon phase — synodic period from known new moon
const SYNODIC = 29.53059;
const KNOWN_NEW_MOON = Date.UTC(2025, 0, 29, 12, 36); // Jan 29, 2025 12:36 UTC

function getMoonPhase(): number {
  const days = (Date.now() - KNOWN_NEW_MOON) / 86400000;
  return (((days % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC; // 0 = new, 0.5 = full
}

// Sun position from UTC time (cached 60s)
let cachedSunPos: [number, number] = [0, 0];
let sunPosTs = 0;
/** Bust sun/night caches so the next call recalculates immediately. */
function invalidateSunCaches() {
  sunPosTs = 0;
}
function getSunPosition(): [number, number] {
  const now = Date.now();
  if (now - sunPosTs < 60000) return cachedSunPos;
  sunPosTs = now;
  const d = new Date(now);
  const dayOfYear = Math.floor((now - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000);
  const declination = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const hourAngle = ((d.getUTCHours() + d.getUTCMinutes() / 60) / 24) * 360 - 180;
  cachedSunPos = [-hourAngle, declination];
  return cachedSunPos;
}

// Night check — is the sun below the horizon at the user's approximate location?
// Uses timezone offset for longitude, 25°N as latitude proxy (primary audience band).
// Cached 60s (matches sun position cache).
const localTimeCache = new Map<string, { ts: number; value: string }>();
function formatLocalTime(tz: string): string | null {
  const now = Date.now();
  const cached = localTimeCache.get(tz);
  if (cached && now - cached.ts < 30_000) return cached.value;
  try {
    const value = new Date(now).toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    });
    localTimeCache.set(tz, { ts: now, value });
    return value;
  } catch {
    return null;
  }
}

// Nudge offsets for coastal/border coordinate fallback (0.1° ≈ 11km)
const NUDGES: [number, number][] = [
  [0, 0],
  [0.1, 0],
  [-0.1, 0],
  [0, 0.1],
  [0, -0.1],
  [0.1, 0.1],
  [-0.1, 0.1],
  [0.1, -0.1],
  [-0.1, -0.1],
  [0.2, 0],
  [-0.2, 0],
  [0, 0.2],
  [0, -0.2],
  [0.3, 0],
  [-0.3, 0],
  [0, 0.3],
  [0, -0.3],
];

function findCountry(lat: number, lng: number, location?: string | null): GeoJSON.Feature | null {
  // Check manual overrides first
  if (location) {
    const override = COUNTRY_OVERRIDES[location.toLowerCase()];
    if (override) {
      return countries.features.find((f) => f.properties?.name === override) ?? null;
    }
  }
  for (const [dlat, dlng] of NUDGES) {
    const ptLng = lng + dlng;
    const ptLat = lat + dlat;
    const pt: [number, number] = [ptLng, ptLat];
    for (let i = 0; i < countries.features.length; i++) {
      const bbox = countryBboxes[i];
      const feat = countries.features[i];
      if (!bbox || !feat) continue;
      const [minLng, minLat, maxLng, maxLat] = bbox;
      if (ptLng < minLng || ptLng > maxLng || ptLat < minLat || ptLat > maxLat) continue;
      if (geoContains(feat, pt)) return feat;
    }
  }
  return null;
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
  makkah: null,
  hotspotGlows: [],
  chokepoints: [],
};

/** Clip angle for a country's spherical area — smaller countries get tighter clip (more zoom). */
function clipAngleForArea(area: number): number {
  if (area < 0.002) return 25;
  if (area < 0.03) return 25 + ((area - 0.002) / (0.03 - 0.002)) * 65;
  return 90;
}

/** Clip angle for a country name. */
function clipAngleForCountry(countryName: string | null): number {
  const area = countryName ? (countryAreas[countryName] ?? 1) : 1;
  return clipAngleForArea(area);
}

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
  pg.context(ctx)(land);

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
    makkah,
    hotspotGlows: [],
    chokepoints: [],
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

  // Projection + path generator — created eagerly so the first scroll frame is warm
  const projRef = useRef(geoOrthographic().clipAngle(90).precision(8));
  const pgRef = useRef(geoPath(projRef.current));
  const lastSettled = useRef(-1);
  const lastSettledSlug = useRef<string | null>(null);

  const cachedCountryRef = useRef<GeoJSON.Feature | null>(null);

  // Reusable Skia path objects — rewound each frame instead of allocating new ones.
  // setIsVolatile(true) tells Skia to skip GPU-side caching since these change every frame;
  // rewind() (vs reset()) keeps internal storage allocated between frames.
  const landPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const bordersPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const countryPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const nightPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const twilightPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const graticulePathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const qiblaPathRef = useRef(Skia.Path.Make().setIsVolatile(true));
  const sourceArcsRef = useRef(Skia.Path.Make().setIsVolatile(true));

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
      }

      // Adaptive zoom — interpolate clip angle between adjacent articles.
      // Smoothstep easing gives a cinematic camera-move feel: the zoom
      // eases out of the current framing and eases into the next.
      const loCountry = geoData[loIndex]?.countryName ?? null;
      const hiCountry = geoData[hiIndex]?.countryName ?? null;
      const loClip = clipAngleForCountry(loCountry);
      const hiClip = clipAngleForCountry(hiCountry);
      const ef = frac * frac * (3 - 2 * frac); // Hermite smoothstep
      const clipAngle = loClip + (hiClip - loClip) * ef;
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

      // Land — rewind reuses the underlying buffer (vs reset which frees it)
      const landPath = landPathRef.current;
      landPath.rewind();
      skiaCtx.setPath(landPath);
      pg.context(skiaCtx)(land);

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

      // Country highlight — reuse path object
      let countryPath: ReturnType<typeof Skia.Path.Make> | null = null;
      if (cachedCountryRef.current) {
        countryPath = countryPathRef.current;
        countryPath.rewind();
        skiaCtx.setPath(countryPath);
        pg.context(skiaCtx)(cachedCountryRef.current);
      }

      // Near-settled check — reused for cosmetic layers AND arc visibility.
      const ARC_WINDOW = 0.25;
      const nearSettled = frac < ARC_WINDOW || frac > 1 - ARC_WINDOW;

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

      setState({
        landPath,
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
        makkah,
        hotspotGlows,
        chokepoints: chokepointMarks,
      });
    },
    [],
  );

  // Throttle reprojection to 32ms (~30fps), skip throttle on first call.
  // 16ms overwhelms the JS thread (d3-geo projection + setState can't complete in one frame).
  const lastTimeRef = useSharedValue(0);
  const hasFired = useSharedValue(false);

  useAnimatedReaction(
    () => ({ sy: scrollY.value, len: coordsSV.value.length }),
    ({ sy, len }) => {
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

      runOnJS(callReproject)(lng, lat, settled, lo, hi, frac);
    },
  );

  // On app resume, invalidate sun/night caches and reproject the globe
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    if (!_tick) return; // skip initial render
    invalidateSunCaches();
    const last = lastReprojRef.current;
    if (last) callReproject(last.lng, last.lat, last.idx, last.idx, last.idx, 0);
  }, [_tick]);

  // Re-project when hotspot data changes (e.g. heatmap fetch after app resume)
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    const last = lastReprojRef.current;
    if (last) callReproject(last.lng, last.lat, last.idx, last.idx, last.idx, 0);
  }, [hotspots]);

  // Re-project when chokepoint data arrives (first API fetch, or a cycle-level refresh)
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    const last = lastReprojRef.current;
    if (last) callReproject(last.lng, last.lat, last.idx, last.idx, last.idx, 0);
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
            {subFont && (
              <SkiaText
                x={c.x - c.label.length * 2.5}
                y={c.y + 20}
                text={c.label}
                font={subFont}
                color={c.disrupted ? colors.accent : colors.textSecondary}
                opacity={c.disrupted ? 0.9 : 0.55}
              />
            )}
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
