import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Image,
  LinearGradient,
  Path,
  Rect,
  Skia,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { geoCircle, geoContains, geoDistance, geoOrthographic, geoPath } from 'd3-geo';
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
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import { COUNTRY_DATA, type CountryData } from '../../constants/country-data';
import { COLORS, bgAlpha } from '../../constants/theme';
import type { Article } from '../../types';
import { COUNTRY_TZ } from './coordinates';
import { countries, createSkiaPathContext, land } from './shared';
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
function Glow({ x, y, color, layers }: { x: number; y: number; color: string; layers: GlowLayer[] }) {
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
const HALF_PI = Math.PI / 2;

// Moon phase — synodic period from known new moon
const SYNODIC = 29.53059;
const KNOWN_NEW_MOON = Date.UTC(2025, 0, 29, 12, 36); // Jan 29, 2025 12:36 UTC

function getMoonPhase(): number {
  const days = (Date.now() - KNOWN_NEW_MOON) / 86400000;
  return (((days % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC; // 0 = new, 0.5 = full
}

// Al-Aqsa / Dome of the Rock — [lng, lat] for d3-geo
const AL_AQSA = {
  coords: [35.2354, 31.7761] as [number, number],
  name: 'Al-Quds',
  tz: 'Asia/Hebron',
  country: 'Palestine',
};

// Sun position from UTC time (cached 60s)
let cachedSunPos: [number, number] = [0, 0];
let sunPosTs = 0;
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
let _isNight = false;
let _nightTs = 0;
function isLocalNight(): boolean {
  const now = Date.now();
  if (now - _nightTs < 60000) return _isNight;
  _nightTs = now;
  const [sunLng, sunLat] = getSunPosition();
  const userLng = -(new Date(now).getTimezoneOffset() / 60) * 15;
  _isNight = geoDistance([sunLng, sunLat], [userLng, 25]) > HALF_PI;
  return _isNight;
}

function formatLocalTime(tz: string): string | null {
  try {
    return new Date().toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    });
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
      return countries.features.find((f) => (f.properties as any)?.name === override) ?? null;
    }
  }
  for (const [dlat, dlng] of NUDGES) {
    const pt: [number, number] = [lng + dlng, lat + dlat];
    const found = countries.features.find((f) => geoContains(f, pt));
    if (found) return found;
  }
  return null;
}

export interface TapResult {
  countryName: string;
  location: string | null;
  localTime: string | null;
  data: CountryData | null;
  hotspotLabels?: string[];
}

export interface MiniGlobeRef {
  hitTest: (x: number, y: number) => TapResult | null;
}

interface MiniGlobeProps {
  articles: Article[];
  scrollY: SharedValue<number>;
  itemHeight: number;
  width: number;
  height: number;
  ref?: React.Ref<MiniGlobeRef>;
}

interface Hotspot {
  lat: number;
  lng: number;
  intensity: number; // 0–1 log-normalized
  label: string;
  countryName: string | null;
}

interface GlobeState {
  landPath: ReturnType<typeof Skia.Path.Make> | null;
  countryPath: ReturnType<typeof Skia.Path.Make> | null;
  nightPath: ReturnType<typeof Skia.Path.Make> | null;
  dot: { x: number; y: number } | null;
  aqsa: { x: number; y: number } | null;
  hotspotGlows: {
    x: number;
    y: number;
    intensity: number;
    label: string;
    countryName: string | null;
  }[];
}

export const MiniGlobe = memo(function MiniGlobe({
  articles,
  scrollY,
  itemHeight,
  width,
  height,
  ref,
}: MiniGlobeProps) {
  const globeRadius = width * 0.9;
  const cx = width / 2;
  const cy = height * 0.75;

  const [state, setState] = useState<GlobeState>({
    landPath: null,
    countryPath: null,
    nightPath: null,
    dot: null,
    aqsa: null,
    hotspotGlows: [],
  });

  // Precompute per-article: coords + country feature + names
  const articleGeo = useMemo(() => {
    return articles.map((a) => {
      const coords = getCoords(a);
      if (!coords) return null;
      const country = findCountry(coords[0], coords[1], a.location);
      const countryName = (country?.properties as any)?.name ?? null;
      return { lat: coords[0], lng: coords[1], country, countryName, location: a.location };
    });
  }, [articles]);

  // Cluster articles by location, rank by total eventCoverage → top 5 coverage hotspots
  const hotspots = useMemo((): Hotspot[] => {
    const clusters = new Map<
      string,
      {
        lat: number;
        lng: number;
        total: number;
        bestCov: number;
        label: string;
        countryName: string | null;
      }
    >();
    for (let i = 0; i < articles.length; i++) {
      const geo = articleGeo[i];
      if (!geo) continue;
      const a = articles[i]!;
      const coverage = a.eventCoverage ?? 0;
      if (coverage <= 0) continue;
      // threadLabel before the colon is the story name (e.g. "Iran-US-Israel war")
      const raw = a.threadLabel ?? a.title;
      const label = raw.includes(':') ? raw.slice(0, raw.indexOf(':')) : raw;
      // 0.5° grid (~55km) merges nearby datelines (e.g. Gaza + Ramallah)
      const key = `${Math.round(geo.lat * 2) / 2},${Math.round(geo.lng * 2) / 2}`;
      const existing = clusters.get(key);
      if (existing) {
        existing.total += coverage;
        if (coverage > existing.bestCov) {
          existing.bestCov = coverage;
          existing.label = label;
          existing.countryName = geo.countryName;
        }
      } else {
        clusters.set(key, {
          lat: geo.lat,
          lng: geo.lng,
          total: coverage,
          bestCov: coverage,
          label,
          countryName: geo.countryName,
        });
      }
    }
    const sorted = [...clusters.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    if (sorted.length === 0) return [];
    const logMax = Math.log(sorted[0]!.total + 1);
    return sorted.map((z) => ({
      lat: z.lat,
      lng: z.lng,
      intensity: Math.log(z.total + 1) / logMax,
      label: z.label,
      countryName: z.countryName,
    }));
  }, [articles, articleGeo]);

  // Flat coord array for UI thread interpolation
  const coordsSV = useSharedValue<(number | null)[]>([]);
  useEffect(() => {
    coordsSV.value = articleGeo.flatMap((g) => (g ? [g.lat, g.lng] : [null, null]));
  }, [articleGeo, coordsSV]);

  // Projection refs (reused, never reallocated)
  const projRef = useRef<ReturnType<typeof geoOrthographic> | null>(null);
  const pgRef = useRef<ReturnType<typeof geoPath> | null>(null);
  const lastSettled = useRef(-1);

  const cachedCountryRef = useRef<GeoJSON.Feature | null>(null);

  // Keep closure dependencies in refs so the reproject callback stays stable
  const articleGeoRef = useRef(articleGeo);
  articleGeoRef.current = articleGeo;
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  const layoutRef = useRef({ globeRadius, cx, cy });
  layoutRef.current = { globeRadius, cx, cy };

  const callReproject = useCallback((lng: number, lat: number, settledIndex: number) => {
    const { globeRadius: r, cx: centerX, cy: centerY } = layoutRef.current;
    const geoData = articleGeoRef.current;

    let proj = projRef.current;
    if (!proj) {
      proj = geoOrthographic().clipAngle(90).precision(8);
      projRef.current = proj;
    }
    proj.rotate([-lng, lat, 0]).scale(r).translate([centerX, centerY]);

    let pg = pgRef.current;
    if (!pg) {
      pg = geoPath(proj);
      pgRef.current = pg;
    } else {
      pg.projection(proj);
    }

    // Land
    const landPath = Skia.Path.Make();
    skiaCtx.setPath(landPath);
    pg.context(skiaCtx as any)(land);

    // Update which country to highlight when settled changes
    const geo = geoData[settledIndex];
    if (settledIndex !== lastSettled.current) {
      lastSettled.current = settledIndex;
      cachedCountryRef.current = geo?.country ?? null;
    }

    // Dot
    let dot: { x: number; y: number } | null = null;
    if (geo) {
      const pt = proj([geo.lng, geo.lat]);
      if (pt) dot = { x: pt[0], y: pt[1] };
    }

    // Country highlight — single feature, cheap to project every frame
    let countryPath: ReturnType<typeof Skia.Path.Make> | null = null;
    if (cachedCountryRef.current) {
      countryPath = Skia.Path.Make();
      skiaCtx.setPath(countryPath);
      pg.context(skiaCtx as any)(cachedCountryRef.current);
    }

    // Night shadow
    const [sunLng, sunLat] = getSunPosition();
    const nightGeo = nightCircleGen.center([sunLng + 180, -sunLat]).radius(80)();
    const nightPath = Skia.Path.Make();
    skiaCtx.setPath(nightPath);
    pg.context(skiaCtx as any)(nightGeo);

    // Al-Aqsa — golden reference point
    let aqsa: { x: number; y: number } | null = null;
    if (geoDistance(AL_AQSA.coords, [-lng, -lat]) < HALF_PI) {
      const pt = proj(AL_AQSA.coords);
      if (pt) aqsa = { x: pt[0], y: pt[1] };
    }

    // Coverage hotspot glows — project visible zones onto the front hemisphere
    const hotspotGlows: GlobeState['hotspotGlows'] = [];
    for (const zone of hotspotsRef.current) {
      const zoneCoords: [number, number] = [zone.lng, zone.lat];
      if (geoDistance(zoneCoords, [-lng, -lat]) < HALF_PI) {
        const pt = proj(zoneCoords);
        if (pt)
          hotspotGlows.push({
            x: pt[0],
            y: pt[1],
            intensity: zone.intensity,
            label: zone.label,
            countryName: zone.countryName,
          });
      }
    }

    setState({ landPath, countryPath, nightPath, dot, aqsa, hotspotGlows });
  }, []);

  // Throttle reprojection to 32ms (~30fps), skip throttle on first call
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
        lat = loLat + (hiLat - loLat) * frac;
        lng = loLng + (hiLng - loLng) * frac;
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

      runOnJS(callReproject)(lng, -lat, settled);
    },
  );

  useImperativeHandle(ref, () => ({
    hitTest(x: number, y: number): TapResult | null {
      // Collect all hotspot labels matching a country (a country may have multiple)
      const hotspotsFor = (name: string) => {
        const labels = state.hotspotGlows.filter((z) => z.countryName === name).map((z) => z.label);
        return labels.length > 0 ? labels : undefined;
      };

      // Check article dot first — news takes precedence
      const dot = state.dot;
      if (dot && isNear(x, y, dot.x, dot.y, 3600)) {
        const geoData = articleGeoRef.current[lastSettled.current];
        if (geoData?.countryName) {
          const tz = COUNTRY_TZ[geoData.countryName];
          return {
            countryName: geoData.countryName,
            location: geoData.location,
            localTime: tz ? formatLocalTime(tz) : null,
            data: COUNTRY_DATA[geoData.countryName] ?? null,
            hotspotLabels: hotspotsFor(geoData.countryName),
          };
        }
      }

      // Then check Al-Aqsa
      if (state.aqsa && isNear(x, y, state.aqsa.x, state.aqsa.y, 3600)) {
        return {
          countryName: AL_AQSA.country,
          location: AL_AQSA.name,
          localTime: formatLocalTime(AL_AQSA.tz),
          data: COUNTRY_DATA['Palestine'] ?? null,
          hotspotLabels: hotspotsFor('Palestine'),
        };
      }

      // Then check hotspot glows directly
      for (const z of state.hotspotGlows) {
        if (isNear(x, y, z.x, z.y, 900)) {
          return {
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            hotspotLabels: [z.label],
          };
        }
      }

      return null;
    },
  }));

  // Moon — NASA texture with phase shadow
  const moonTexture = useImage(require('../../assets/moon.png'));
  const moonPhase = getMoonPhase();
  const moonR = globeRadius * 0.05;
  const moonX = cx;
  const moonY = cy - globeRadius - moonR * 5;

  const moonClip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(moonX, moonY, moonR);
    return p;
  }, [moonX, moonY, moonR]);

  // Lit-side clip: circle minus the shadow region — texture only draws on the lit part
  const moonLitClip = useMemo(() => {
    const tc = Math.cos(moonPhase * 2 * Math.PI);
    const shadow = Skia.Path.Make();
    const steps = 16;
    shadow.moveTo(moonX, moonY - moonR);
    if (moonPhase < 0.5) {
      // Waxing: shadow on the left — left semicircle + right terminator ellipse
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        shadow.lineTo(moonX - Math.cos(a) * moonR, moonY + Math.sin(a) * moonR);
      }
      for (let i = steps; i >= 0; i--) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        shadow.lineTo(moonX + Math.cos(a) * moonR * tc, moonY + Math.sin(a) * moonR);
      }
    } else {
      // Waning: shadow on the right — right semicircle + left terminator ellipse
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        shadow.lineTo(moonX + Math.cos(a) * moonR, moonY + Math.sin(a) * moonR);
      }
      for (let i = steps; i >= 0; i--) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        shadow.lineTo(moonX - Math.cos(a) * moonR * tc, moonY + Math.sin(a) * moonR);
      }
    }
    shadow.close();
    const lit = moonClip.copy();
    lit.op(shadow, 0); // 0 = Difference: circle minus shadow = lit area
    return lit;
  }, [moonClip, moonX, moonY, moonR, moonPhase]);

  // Stars — fixed positions, memoized once
  const stars = useMemo(() => {
    const s: { x: number; y: number; r: number; o: number }[] = [];
    // Seeded pseudo-random for deterministic positions
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 40; i++) {
      const x = rand() * width;
      const y = rand() * height;
      // Skip stars that would be behind the globe
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < globeRadius * globeRadius) continue;
      s.push({
        x,
        y,
        r: 0.5 + rand() * 1.0, // 0.5–1.5px
        o: 0.15 + rand() * 0.35, // 15–50% opacity
      });
    }
    return s;
  }, [width, height, cx, cy, globeRadius]);

  if (!state.landPath) return null;

  return (
    <Canvas style={[styles.canvas, { width, height }]} pointerEvents="none">
      {/* Stars — tiny fixed points */}
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} color={COLORS.accent} opacity={s.o} />
      ))}

      {/* Moon — NASA texture with phase shadow */}
      {moonTexture && isLocalNight() && (
        <>
          {/* Halo — tight glow around the moon */}
          <Circle
            cx={moonX + (moonPhase < 0.5 ? moonR * 0.3 : -moonR * 0.3)}
            cy={moonY}
            r={moonR * 1.8}
            color={COLORS.accent}
            opacity={0.025}
          >
            <BlurMask blur={moonR * 0.8} style="solid" />
          </Circle>
          {/* Limb glow — bright ring right at the disk edge */}
          <Circle cx={moonX} cy={moonY} r={moonR} color={COLORS.accent} opacity={0.15}>
            <BlurMask blur={moonR * 0.25} style="outer" />
          </Circle>
          {/* Moon texture — full disk */}
          <Group clip={moonClip}>
            <BlurMask blur={moonR * 0.06} style="normal" />
            <Image
              image={moonTexture}
              x={moonX - moonR}
              y={moonY - moonR}
              width={moonR * 2}
              height={moonR * 2}
              opacity={0.45}
            />
          </Group>
          {/* Gradient shadow — gradual terminator falloff */}
          <Group clip={moonClip}>
            <BlurMask blur={moonR * 0.04} style="normal" />
            <Rect x={moonX - moonR} y={moonY - moonR} width={moonR * 2} height={moonR * 2}>
              <LinearGradient
                start={vec(moonPhase < 0.5 ? moonX + moonR : moonX - moonR, moonY)}
                end={vec(moonPhase < 0.5 ? moonX - moonR : moonX + moonR, moonY)}
                colors={[
                  bgAlpha(0),
                  bgAlpha(0),
                  bgAlpha(0.85),
                  bgAlpha(0.95),
                ]}
                positions={[
                  0,
                  Math.max(0, Math.abs(Math.cos(moonPhase * 2 * Math.PI)) * 0.5),
                  Math.min(1, 0.5 + Math.abs(Math.cos(moonPhase * 2 * Math.PI)) * 0.35),
                  1,
                ]}
              />
            </Rect>
          </Group>
        </>
      )}

      {/* Atmospheric halo — thin glow at the globe's edge */}
      <Circle cx={cx} cy={cy} r={globeRadius * 1.03} color={COLORS.atmosphere} opacity={0.08}>
        <BlurMask blur={globeRadius * 0.04} style="solid" />
      </Circle>

      {/* Land silhouette */}
      <Path path={state.landPath} color={COLORS.rule} opacity={0.4} />

      {/* Night shadow — darker overlay on the unlit hemisphere */}
      {state.nightPath && <Path path={state.nightPath} color={COLORS.black} opacity={0.15} />}

      {/* Coverage hotspot ambient glows — top coverage hotspots */}
      {state.hotspotGlows.map((z, i) => (
        <Glow key={i} x={z.x} y={z.y} color={COLORS.text} layers={[
          { r: 16 + z.intensity * 18, opacity: 0.02 + z.intensity * 0.04, blur: 12 },
          { r: 5 + z.intensity * 8, opacity: 0.03 + z.intensity * 0.06, blur: 4 },
        ]} />
      ))}

      {/* Country highlight */}
      {state.countryPath && (
        <>
          <Path path={state.countryPath} color={COLORS.sheetBg} opacity={0.8}>
            <BlurMask blur={0.5} style="normal" />
          </Path>
          <Path
            path={state.countryPath}
            color={COLORS.accent}
            style="stroke"
            strokeWidth={1}
            opacity={0.55}
          />
        </>
      )}

      {/* Al-Aqsa — golden reference point */}
      {state.aqsa && (
        <Glow x={state.aqsa.x} y={state.aqsa.y} color={COLORS.dome} layers={[
          { r: 12, opacity: 0.03, blur: 8 },
          { r: 5, opacity: 0.08, blur: 3 },
          { r: 2.5, opacity: 0.2, blur: 1.5 },
          { r: 1.2, opacity: 0.7 },
        ]} />
      )}

      {/* Story dot */}
      {state.dot && (
        <Glow x={state.dot.x} y={state.dot.y} color={COLORS.text} layers={[
          { r: 14, opacity: 0.04, blur: 10 },
          { r: 7, opacity: 0.12, blur: 5 },
          { r: 3.5, opacity: 0.3, blur: 2 },
          { r: 2, opacity: 1 },
        ]} />
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
