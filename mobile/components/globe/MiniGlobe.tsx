import { BlurMask, Canvas, Circle, Group, Image, Path, Skia, useImage } from '@shopify/react-native-skia';
import { geoCircle, geoContains, geoDistance, geoOrthographic, geoPath } from 'd3-geo';
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';
import type { Article } from '../../types';
import { type CountryData, COUNTRY_DATA } from '../../constants/country-data';
import { COUNTRY_TZ } from './coordinates';
import { countries, createSkiaPathContext, land } from './shared';
import { getCoords } from './storyDots';

const skiaCtx = createSkiaPathContext();
const nightCircleGen = geoCircle();
const HALF_PI = Math.PI / 2;

// Moon phase — synodic period from known new moon
const SYNODIC = 29.53059;
const KNOWN_NEW_MOON = Date.UTC(2025, 0, 29, 12, 36); // Jan 29, 2025 12:36 UTC

function getMoonPhase(): number {
  const days = (Date.now() - KNOWN_NEW_MOON) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC; // 0 = new, 0.5 = full
}


// Al-Aqsa / Dome of the Rock — [lng, lat] for d3-geo
const AL_AQSA = { coords: [35.2354, 31.7761] as [number, number], name: 'Al-Quds', tz: 'Asia/Hebron', country: 'Palestine' };

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

// Nudge offsets for coastal/border coordinate fallback (0.1° ≈ 11km)
const NUDGES: [number, number][] = [
  [0, 0],
  [0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1],
  [0.1, 0.1], [-0.1, 0.1], [0.1, -0.1], [-0.1, -0.1],
  [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2],
  [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3],
];

// Manual overrides for cities that fall outside their country in 110m TopoJSON
const COUNTRY_OVERRIDES: Record<string, string> = {
  'singapore': 'Singapore',
  'gaza': 'Palestine',
  'ramallah': 'Palestine',
  'nablus': 'Palestine',
  'hebron': 'Palestine',
  'jenin': 'Palestine',
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

interface GlobeState {
  landPath: ReturnType<typeof Skia.Path.Make> | null;
  countryPath: ReturnType<typeof Skia.Path.Make> | null;
  nightPath: ReturnType<typeof Skia.Path.Make> | null;
  dot: { x: number; y: number } | null;
  aqsa: { x: number; y: number } | null;
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

  // Flat coord array for UI thread interpolation
  const coordsSV = useSharedValue<(number | null)[]>([]);
  useEffect(() => {
    coordsSV.value = articleGeo.flatMap((g) =>
      g ? [g.lat, g.lng] : [null, null],
    );
  }, [articleGeo, coordsSV]);

  // Projection refs (reused, never reallocated)
  const projRef = useRef<ReturnType<typeof geoOrthographic> | null>(null);
  const pgRef = useRef<ReturnType<typeof geoPath> | null>(null);
  const lastSettled = useRef(-1);

  const cachedCountryRef = useRef<GeoJSON.Feature | null>(null);

  // Keep closure dependencies in refs so the reproject callback stays stable
  const articleGeoRef = useRef(articleGeo);
  articleGeoRef.current = articleGeo;
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

    setState({ landPath, countryPath, nightPath, dot, aqsa });
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
      // Check article dot
      const dot = state.dot;
      if (!dot) return null;
      const dx = x - dot.x;
      const dy = y - dot.y;
      if (dx * dx + dy * dy > 3600) return null;

      const geoData = articleGeoRef.current[lastSettled.current];
      if (!geoData) return null;
      const countryName = geoData.countryName;
      if (!countryName) return null;

      const tz = COUNTRY_TZ[countryName];
      let localTime: string | null = null;
      if (tz) {
        try {
          localTime = new Date().toLocaleTimeString('en-GB', {
            timeZone: tz, hour: '2-digit', minute: '2-digit',
          });
        } catch {}
      }
      return { countryName, location: geoData.location, localTime, data: COUNTRY_DATA[countryName] ?? null };
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

  const moonShadowPath = useMemo(() => {
    const tc = Math.cos(moonPhase * 2 * Math.PI);
    const p = Skia.Path.Make();
    const steps = 16;
    if (tc > 0.01) {
      p.moveTo(moonX, moonY - moonR);
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        p.lineTo(moonX - Math.cos(a) * moonR, moonY + Math.sin(a) * moonR);
      }
      for (let i = steps; i >= 0; i--) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        p.lineTo(moonX + Math.cos(a) * moonR * tc, moonY + Math.sin(a) * moonR);
      }
      p.close();
    } else if (tc < -0.01) {
      p.moveTo(moonX, moonY - moonR);
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        p.lineTo(moonX + Math.cos(a) * moonR * tc, moonY + Math.sin(a) * moonR);
      }
      for (let i = steps; i >= 0; i--) {
        const a = -Math.PI / 2 + Math.PI * (i / steps);
        p.lineTo(moonX + Math.cos(a) * moonR, moonY + Math.sin(a) * moonR);
      }
      p.close();
    } else {
      if (moonPhase < 0.5) {
        p.addRect({ x: moonX - moonR, y: moonY - moonR, width: moonR, height: moonR * 2 });
      } else {
        p.addRect({ x: moonX, y: moonY - moonR, width: moonR, height: moonR * 2 });
      }
    }
    return p;
  }, [moonX, moonY, moonR, moonPhase]);

  // Stars — fixed positions, memoized once
  const stars = useMemo(() => {
    const s: { x: number; y: number; r: number; o: number }[] = [];
    // Seeded pseudo-random for deterministic positions
    let seed = 42;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
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
      {moonTexture && (
        <>
          {/* Halo — offset toward the lit side */}
          <Circle
            cx={moonX + (moonPhase < 0.5 ? moonR * 0.3 : -moonR * 0.3)}
            cy={moonY}
            r={moonR * 2}
            color={COLORS.accent}
            opacity={0.02}
          >
            <BlurMask blur={moonR} style="solid" />
          </Circle>
          <Group clip={moonClip}>
            <Image
              image={moonTexture}
              x={moonX - moonR}
              y={moonY - moonR}
              width={moonR * 2}
              height={moonR * 2}
              opacity={0.25}
            />
            <Path path={moonShadowPath} color={COLORS.bg} opacity={0.7} />
          </Group>
        </>
      )}

      {/* Atmospheric halo — thin glow at the globe's edge */}
      <Circle cx={cx} cy={cy} r={globeRadius * 1.03} color="#334455" opacity={0.08}>
        <BlurMask blur={globeRadius * 0.04} style="solid" />
      </Circle>

      {/* Land silhouette */}
      <Path path={state.landPath} color={COLORS.rule} opacity={0.4} />

      {/* Night shadow — darker overlay on the unlit hemisphere */}
      {state.nightPath && (
        <Path path={state.nightPath} color="#000000" opacity={0.15} />
      )}

      {/* Country highlight */}
      {state.countryPath && (
        <>
          <Path path={state.countryPath} color={COLORS.sheetBg} />
          <Path
            path={state.countryPath}
            color={COLORS.textSecondary}
            style="stroke"
            strokeWidth={1}
            opacity={0.6}
          />
        </>
      )}

      {/* Al-Aqsa — golden reference point */}
      {state.aqsa && (
        <>
          <Circle cx={state.aqsa.x} cy={state.aqsa.y} r={4} color={COLORS.dome} opacity={0.08}>
            <BlurMask blur={3} style="solid" />
          </Circle>
          <Circle cx={state.aqsa.x} cy={state.aqsa.y} r={1.5} color={COLORS.dome} opacity={0.8} />
        </>
      )}

      {/* Story dot */}
      {state.dot && (
        <>
          <Circle cx={state.dot.x} cy={state.dot.y} r={6} color={COLORS.text} opacity={0.5}>
            <BlurMask blur={5} style="solid" />
          </Circle>
          <Circle cx={state.dot.x} cy={state.dot.y} r={2.5} color={COLORS.text} />
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
