import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Image,
  LinearGradient,
  Path,
  Picture,
  Rect,
  Skia,
  Text as SkiaText,
  useFont,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import type { GeoContext } from 'd3-geo';
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
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { COUNTRY_DATA, type CountryData } from '../../constants/country-data';
import { useTheme } from '../../hooks/useTheme';
import { displayLocation } from '../../lib/place-names';
import type { Article, HeatmapPoint } from '../../types';
import { CITY_TZ, COUNTRY_TZ, SOURCE_COORDS } from './coordinates';
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

// Manual overrides for cities that fall outside their country in 110m TopoJSON
const COUNTRY_OVERRIDES: Record<string, string> = {
  singapore: 'Singapore',
  gaza: 'Palestine',
  ramallah: 'Palestine',
  nablus: 'Palestine',
  hebron: 'Palestine',
  jenin: 'Palestine',
  'al-quds': 'Palestine',
};

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
}

export interface MiniGlobeRef {
  hitTest: (x: number, y: number) => TapResult | null;
}

interface MiniGlobeProps {
  articles: Article[];
  heatmapPoints?: HeatmapPoint[];
  scrollY: SharedValue<number>;
  /** Shared value that kicks to ~1 on snap and springs back to 0.
   *  Drives a brief clip-angle overshoot so the globe feels weighty. */
  settleBounce: SharedValue<number>;
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
  dotLabel: { text: string; sub?: string; x: number; y: number } | null;
  makkah: { x: number; y: number } | null;
  hotspotGlows: {
    x: number;
    y: number;
    intensity: number;
    labels: string[];
    countryName: string | null;
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
  dotLabel: null,
  makkah: null,
  hotspotGlows: [],
};

/** Clip angle for a country's spherical area — smaller countries get tighter clip (more zoom). */
function clipAngleForArea(area: number): number {
  if (area < 0.002) return 32;
  if (area < 0.03) return 32 + ((area - 0.002) / (0.03 - 0.002)) * 58;
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
  pg.context(ctx as unknown as GeoContext)(land);

  // Neighbouring country borders — mesh + no resampling for speed
  proj.precision(0);
  const bp = Skia.Path.Make();
  ctx.setPath(bp);
  pg.context(ctx as unknown as GeoContext)(bordersMesh);
  proj.precision(8);

  let cp: ReturnType<typeof Skia.Path.Make> | null = null;
  if (geo.country) {
    cp = Skia.Path.Make();
    ctx.setPath(cp);
    pg.context(ctx as unknown as GeoContext)(geo.country);
  }

  const [sunLng, sunLat] = getSunPosition();
  const nightCenter: [number, number] = [sunLng + 180, -sunLat];
  const np = Skia.Path.Make();
  ctx.setPath(np);
  pg.context(ctx as unknown as GeoContext)(nightCircleGen.center(nightCenter).radius(90)());

  // Low-sun band — softer gradient where sun is near the horizon (0–6° above)
  const tp = Skia.Path.Make();
  ctx.setPath(tp);
  pg.context(ctx as unknown as GeoContext)(nightCircleGen.center(nightCenter).radius(96)());

  // Equator + polar circles
  const gp = Skia.Path.Make();
  ctx.setPath(gp);
  pg.context(ctx as unknown as GeoContext)(graticuleLines);
  pg.context(ctx as unknown as GeoContext)(ARCTIC_CIRCLE);
  pg.context(ctx as unknown as GeoContext)(ANTARCTIC_CIRCLE);

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
    dotLabel: null,
    makkah,
    hotspotGlows: [],
  };
}

export const MiniGlobe = memo(function MiniGlobe({
  articles,
  heatmapPoints,
  scrollY,
  settleBounce,
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
    if (!heatmapPoints || heatmapPoints.length === 0) {
      const clusters = new Map<
        string,
        { lat: number; lng: number; total: number; countryName: string | null }
      >();
      for (let i = 0; i < articles.length; i++) {
        const geo = articleGeo[i];
        if (!geo) continue;
        const article = articles[i];
        if (!article) continue;
        const coverage = article.eventCoverage ?? 1;
        const key = `${Math.round(geo.lat * 2) / 2},${Math.round(geo.lng * 2) / 2}`;
        const existing = clusters.get(key);
        if (existing) existing.total += coverage;
        else
          clusters.set(key, {
            lat: geo.lat,
            lng: geo.lng,
            total: coverage,
            countryName: geo.countryName,
          });
      }
      const sorted = [...clusters.values()].sort((a, b) => b.total - a.total).slice(0, 8);
      const first = sorted[0];
      if (!first) return [];
      const logMax = Math.log(first.total + 1);
      return sorted.map((z) => ({
        lat: z.lat,
        lng: z.lng,
        intensity: Math.log(z.total + 1) / logMax,
        labels: [],
        countryName: z.countryName,
      }));
    }

    const now = Date.now();
    const clusters = new Map<
      string,
      { lat: number; lng: number; total: number; labels: Set<string> }
    >();

    for (const pt of heatmapPoints) {
      const ageHours = (now - pt.t) / 3_600_000;
      const decay = Math.exp(-DECAY_LAMBDA * ageHours);
      const weight = Math.max(pt.c, 1) * decay;
      if (weight < 0.05) continue;

      // 0.5° grid (~55km) merges nearby datelines
      const key = `${Math.round(pt.lat * 2) / 2},${Math.round(pt.lng * 2) / 2}`;
      const existing = clusters.get(key);
      if (existing) {
        existing.total += weight;
        if (pt.l) existing.labels.add(pt.l);
      } else {
        const labels = new Set<string>();
        if (pt.l) labels.add(pt.l);
        clusters.set(key, { lat: pt.lat, lng: pt.lng, total: weight, labels });
      }
    }

    // Resolve country names only for top clusters
    const sorted = [...clusters.values()].sort((a, b) => b.total - a.total).slice(0, 8);
    const first2 = sorted[0];
    if (!first2) return [];
    const logMax = Math.log(first2.total + 1);
    return sorted.map((z) => {
      const country = findCountry(z.lat, z.lng);
      return {
        lat: z.lat,
        lng: z.lng,
        intensity: Math.log(z.total + 1) / logMax,
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

  // Reusable Skia path objects — reset each frame instead of allocating new ones
  const landPathRef = useRef(Skia.Path.Make());
  const bordersPathRef = useRef(Skia.Path.Make());
  const countryPathRef = useRef(Skia.Path.Make());
  const nightPathRef = useRef(Skia.Path.Make());
  const twilightPathRef = useRef(Skia.Path.Make());
  const graticulePathRef = useRef(Skia.Path.Make());
  const qiblaPathRef = useRef(Skia.Path.Make());
  const sourceArcsRef = useRef(Skia.Path.Make());

  // Keep closure dependencies in refs so the reproject callback stays stable
  const articlesRef = useRef(articles);
  articlesRef.current = articles;
  const articleGeoRef = useRef(articleGeo);
  articleGeoRef.current = articleGeo;
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
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
      bounce: number,
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

      // Adaptive zoom with flyover — the camera pulls back proportionally to
      // the great-circle distance between articles, creating a "fly across the
      // earth" effect. Close stories get a gentle pan; intercontinental jumps
      // zoom out to an orbital view mid-swipe, then dive back in.
      const loCountry = geoData[loIndex]?.countryName ?? null;
      const hiCountry = geoData[hiIndex]?.countryName ?? null;
      const loClip = clipAngleForCountry(loCountry);
      const hiClip = clipAngleForCountry(hiCountry);
      const ef = frac * frac * (3 - 2 * frac); // Hermite smoothstep
      const baseClip = loClip + (hiClip - loClip) * ef;

      // Flyover boost — parabolic arc peaking at the midpoint of the swipe.
      // 4*t*(1-t) is a parabola: 0 at endpoints, 1.0 at t=0.5.
      const loGeo = geoData[loIndex];
      const hiGeo = geoData[hiIndex];
      let flyoverBoost = 0;
      if (loGeo && hiGeo) {
        const dist = geoDistance([loGeo.lng, loGeo.lat], [hiGeo.lng, hiGeo.lat]);
        const distDeg = dist * (180 / Math.PI);
        // Scale: 0° → 0 boost, 90° → 45° boost, 180° → 55° cap
        flyoverBoost = Math.min(55, distDeg * 0.5);
      }
      const parabola = 4 * frac * (1 - frac);
      const clipAngle = Math.min(90, baseClip + parabola * flyoverBoost);

      // Settle bounce — briefly zooms in ~1.5° past target on snap, then
      // springs back. settleBounce is kicked to 0.6 and springs to 0.
      const bounceClip = Math.max(15, clipAngle - bounce * 2.5);
      const projScale = r / Math.sin((bounceClip * Math.PI) / 180);

      const proj = projRef.current;
      proj
        .clipAngle(clipAngle)
        .rotate([-geoLng, -geoLat, 0])
        .scale(projScale)
        .translate([centerX, centerY]);

      const pg = pgRef.current;
      pg.projection(proj);

      // Land — reuse path object to avoid native memory accumulation
      const landPath = landPathRef.current;
      landPath.reset();
      skiaCtx.setPath(landPath);
      pg.context(skiaCtx as unknown as GeoContext)(land);

      // Dot
      let dot: { x: number; y: number } | null = null;
      if (geo) {
        const pt = proj([geo.lng, geo.lat]);
        if (pt) dot = { x: pt[0], y: pt[1] };
      }

      // Dot label — location name (primary), local time (secondary)
      let dotLabel: GlobeState['dotLabel'] = null;
      const settledCountry = cachedCountryRef.current?.properties?.name ?? null;
      if (dot && settledCountry) {
        const article = articlesRef.current[settledIndex];
        const loc = displayLocation(article?.location ?? null);
        if (loc) {
          // Look up IANA timezone: city first (handles large countries like US/Russia),
          // then fall back to country-level timezone.
          let sub: string | undefined;
          const cityKey = (article?.location ?? '').toLowerCase();
          const tz = CITY_TZ[cityKey] ?? (settledCountry ? COUNTRY_TZ[settledCountry] : undefined);
          if (tz) sub = formatLocalTime(tz) ?? undefined;
          dotLabel = { text: loc, sub, x: dot.x, y: dot.y };
        }
      }

      // Country highlight — reuse path object
      let countryPath: ReturnType<typeof Skia.Path.Make> | null = null;
      if (cachedCountryRef.current) {
        countryPath = countryPathRef.current;
        countryPath.reset();
        skiaCtx.setPath(countryPath);
        pg.context(skiaCtx as unknown as GeoContext)(cachedCountryRef.current);
      }

      // Neighbouring country borders — two optimizations:
      //  1. bordersMesh (topojson.mesh) = single MultiLineString, no duplicate edges
      //  2. precision(0) = skip adaptive resampling (invisible at 0.5px/0.22 opacity)
      const bordersPath = bordersPathRef.current;
      proj.precision(0);
      bordersPath.reset();
      skiaCtx.setPath(bordersPath);
      pg.context(skiaCtx as unknown as GeoContext)(bordersMesh);
      proj.precision(8);

      // Night shadow — reuse path object
      const [sunLng, sunLat] = getSunPosition();
      const nightCenter: [number, number] = [sunLng + 180, -sunLat];
      const nightGeo = nightCircleGen.center(nightCenter).radius(90)();
      const nightPath = nightPathRef.current;
      nightPath.reset();
      skiaCtx.setPath(nightPath);
      pg.context(skiaCtx as unknown as GeoContext)(nightGeo);

      // Low-sun band — softer gradient where sun is near the horizon (0–6° above)
      const twilightPath = twilightPathRef.current;
      twilightPath.reset();
      skiaCtx.setPath(twilightPath);
      pg.context(skiaCtx as unknown as GeoContext)(nightCircleGen.center(nightCenter).radius(96)());

      // Equator + polar circles
      const graticulePath = graticulePathRef.current;
      graticulePath.reset();
      skiaCtx.setPath(graticulePath);
      pg.context(skiaCtx as unknown as GeoContext)(graticuleLines);
      pg.context(skiaCtx as unknown as GeoContext)(ARCTIC_CIRCLE);
      pg.context(skiaCtx as unknown as GeoContext)(ANTARCTIC_CIRCLE);

      // Poles
      let northPole: GlobeState['northPole'] = null;
      let southPole: GlobeState['southPole'] = null;
      const npp = proj(NORTH_POLE);
      if (npp) northPole = { x: npp[0], y: npp[1] };
      const spp = proj(SOUTH_POLE);
      if (spp) southPole = { x: spp[0], y: spp[1] };

      // Makkah — qibla reference point
      let makkah: { x: number; y: number } | null = null;
      if (geoDistance(MAKKAH.coords, [geoLng, geoLat]) < HALF_PI) {
        const pt = proj(MAKKAH.coords);
        if (pt) makkah = { x: pt[0], y: pt[1] };
      }

      // Qibla + source arcs — only compute when near a settled position.
      // During mid-scroll these arcs are invisible behind the transitioning
      // globe, so skip interpolation steps. Smoothstep fade creates a natural
      // breathing rhythm instead of mechanical linear ramps.
      const ARC_WINDOW = 0.25; // wider window = arcs linger longer
      const nearSettled = frac < ARC_WINDOW || frac > 1 - ARC_WINDOW;
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
      qiblaP.reset();
      let hasQibla = false;
      if (nearSettled && geo) {
        const storyPt: [number, number] = [geo.lng, geo.lat];
        if (geoDistance(storyPt, MAKKAH.coords) > 0.02) {
          const interp = geoInterpolate(storyPt, MAKKAH.coords);
          let started = false;
          for (let i = 0; i <= 30; i++) {
            const p = proj(interp(i / 30));
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
      srcArcs.reset();
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
            for (let i = 0; i <= 20; i++) {
              const p = proj(interp(i / 20));
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

      // Coverage hotspot glows — project visible zones onto the front hemisphere
      const hotspotGlows: GlobeState['hotspotGlows'] = [];
      for (const zone of hotspotsRef.current) {
        const zoneCoords: [number, number] = [zone.lng, zone.lat];
        if (geoDistance(zoneCoords, [geoLng, geoLat]) < HALF_PI) {
          const pt = proj(zoneCoords);
          if (pt)
            hotspotGlows.push({
              x: pt[0],
              y: pt[1],
              intensity: zone.intensity,
              labels: zone.labels,
              countryName: zone.countryName,
            });
        }
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
        dotLabel,
        makkah,
        hotspotGlows,
      });
    },
    [],
  );

  // Throttle reprojection to 32ms (~30fps), skip throttle on first call.
  // 16ms overwhelms the JS thread (d3-geo projection + setState can't complete in one frame).
  const lastTimeRef = useSharedValue(0);
  const hasFired = useSharedValue(false);

  useAnimatedReaction(
    () => ({ sy: scrollY.value, len: coordsSV.value.length, sb: settleBounce.value }),
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

      runOnJS(callReproject)(lng, lat, settled, lo, hi, frac, settleBounce.value);
    },
  );

  // On app resume, invalidate sun/night caches and reproject the globe
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    if (!_tick) return; // skip initial render
    invalidateSunCaches();
    const last = lastReprojRef.current;
    if (last) callReproject(last.lng, last.lat, last.idx, last.idx, last.idx, 0, 0);
  }, [_tick]);

  // Re-project when hotspot data changes (e.g. heatmap fetch after app resume)
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is intentionally stale — perf-critical, uses ref for latest state
  useEffect(() => {
    const last = lastReprojRef.current;
    if (last) callReproject(last.lng, last.lat, last.idx, last.idx, last.idx, 0, 0);
  }, [hotspots]);

  useImperativeHandle(ref, () => ({
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

  // Stars + atmospheric halo — recorded into an immutable Picture so Skia
  // replays a single cached GPU command instead of re-evaluating ~40+ React
  // elements on every scroll-driven rerender.
  const starsPicture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(colors.accent));
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 40; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < globeRadius * globeRadius) continue;
      const r = 0.5 + rand() * 1.0;
      paint.setAlphaf(0.15 + rand() * 0.35);
      canvas.drawCircle(x, y, r, paint);
    }
    // Atmospheric halo — static blurred circle at globe edge
    const haloPaint = Skia.Paint();
    haloPaint.setColor(Skia.Color(colors.atmosphere));
    haloPaint.setAlphaf(0.12);
    haloPaint.setMaskFilter(Skia.MaskFilter.MakeBlur(0, globeRadius * 0.08, true));
    canvas.drawCircle(cx, cy, globeRadius * 1.05, haloPaint);
    return recorder.finishRecordingAsPicture();
  }, [width, height, cx, cy, globeRadius, colors.accent, colors.atmosphere]);

  // Synchronous scroll nudge — a cheap translateY on the Canvas wrapper
  // that responds in the SAME frame as the scroll (useDerivedValue is
  // synchronous, unlike useAnimatedReaction which has 1-frame lag).
  // This masks the d3 reprojection latency: the globe shifts instantly
  // in the scroll direction while the expensive path recalculation
  // catches up 1 frame later.
  const prevScrollY = useSharedValue(0);
  const scrollNudge = useDerivedValue(() => {
    'worklet';
    const delta = scrollY.value - prevScrollY.value;
    prevScrollY.value = scrollY.value;
    // Clamp to ±3px — just enough to feel responsive, not enough to
    // create visible misalignment with the projected paths.
    return Math.max(-3, Math.min(3, -delta * 0.08));
  });
  const nudgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollNudge.value }],
  }));

  return (
    <Animated.View style={[styles.canvas, { width, height }, nudgeStyle]} pointerEvents="none">
      <Canvas style={[styles.canvasInner, { width, height }]}>
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

        {/* Ocean disk — subtle sphere body behind land */}
        <Circle
          cx={cx}
          cy={cy}
          r={globeRadius}
          color={colors.atmosphere}
          opacity={light ? 0.12 : 0.07}
        />

        {/* Land silhouette */}
        {state.landPath && (
          <Path
            path={state.landPath}
            color={light ? colors.accent : colors.rule}
            opacity={light ? 0.25 : 0.4}
          />
        )}

        {/* Neighbouring country borders — visible when scroll is at rest */}
        {state.bordersPath && (
          <Path
            path={state.bordersPath}
            color={colors.accent}
            style="stroke"
            strokeWidth={0.5}
            opacity={0.22}
          />
        )}

        {/* Equator + polar circles */}
        {state.graticulePath && (
          <Path
            path={state.graticulePath}
            color={colors.accent}
            style="stroke"
            strokeWidth={0.4}
            opacity={light ? 0.12 : 0.08}
          />
        )}

        {/* Low-sun band — faint gradient where sun is near the horizon */}
        {state.twilightPath && (
          <Path path={state.twilightPath} color={colors.black} opacity={0.06} />
        )}

        {/* Night shadow — darker overlay on the unlit hemisphere */}
        {state.nightPath && <Path path={state.nightPath} color={colors.black} opacity={0.15} />}

        {/* Terminator — thin stroke at the day/night boundary */}
        {state.nightPath && (
          <Path
            path={state.nightPath}
            color={colors.atmosphere}
            style="stroke"
            strokeWidth={0.5}
            opacity={0.2}
          />
        )}

        {/* Coverage hotspot ambient glows — top coverage hotspots */}
        {state.hotspotGlows.map((z, i) => (
          <Glow
            key={i}
            x={z.x}
            y={z.y}
            color={colors.text}
            layers={[
              { r: 18 + z.intensity * 20, opacity: 0.04 + z.intensity * 0.08, blur: 12 },
              { r: 6 + z.intensity * 10, opacity: 0.06 + z.intensity * 0.1, blur: 4 },
            ]}
          />
        ))}

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

        {/* Story dot */}
        {state.dot && (
          <Glow
            x={state.dot.x}
            y={state.dot.y}
            color={colors.textEmphasis}
            layers={DOT_GLOW_LAYERS}
          />
        )}

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
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  canvasInner: {
    // Canvas fills the Animated.View wrapper — no extra positioning
  },
});
