import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Oval,
  Path,
  RadialGradient,
  Skia,
  type SkPath,
  vec,
} from '@shopify/react-native-skia';
import {
  type GeoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
  geoCircle,
  geoContains,
  geoDistance,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import { startTransition, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { COLORS } from '../../constants/theme';
import countriesTopo from '../../data/countries-110m.json';
import worldTopo from '../../data/world-110m.json';
import { useHaptic } from '../../hooks/useHaptic';
import type { DotLocation } from './storyDots';

// ── Module-level constants (allocated once) ──

const land = feature(worldTopo as unknown as Topology, (worldTopo as any).objects.land);
const countries = feature(
  countriesTopo as unknown as Topology,
  (countriesTopo as any).objects.countries,
) as unknown as GeoJSON.FeatureCollection;
const nightCircleGen = geoCircle();
const DEG = 180 / Math.PI;
const HALF_PI = Math.PI / 2;

const TO_RAD = Math.PI / 180;

// The three holy sites — [lng, lat] for d3-geo
const MECCA: [number, number] = [39.8262, 21.4225]; // Kaaba
const MEDINA: [number, number] = [39.6112, 24.4686]; // Al-Masjid an-Nabawi
const AL_AQSA: [number, number] = [35.2354, 31.7761]; // Dome of the Rock
const HOLY_SITES = [
  { coords: MECCA, r: 4, blur: 5, coreR: 1.8 }, // largest — the center
  { coords: MEDINA, r: 2.5, blur: 3, coreR: 1 },
  { coords: AL_AQSA, r: 2.5, blur: 3, coreR: 1 },
] as const;

const NIGHT_LAYERS = [
  { radius: 85, opacity: 0.15 },
  { radius: 72, opacity: 0.25 },
] as const;

// ── Reusable Skia path context ──
// Single context object, swap the target path via setPath() to avoid
// allocating a new object per path per frame (was 5 objects/frame).

const skiaCtx = {
  _path: null as SkPath | null,
  setPath(p: SkPath) {
    this._path = p;
  },
  beginPath() {},
  moveTo(x: number, y: number) {
    this._path!.moveTo(x, y);
  },
  lineTo(x: number, y: number) {
    this._path!.lineTo(x, y);
  },
  arc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
    this._path!.addArc(
      { x: x - r, y: y - r, width: r * 2, height: r * 2 },
      startAngle * DEG,
      (endAngle - startAngle) * DEG,
    );
  },
  closePath() {
    this._path!.close();
  },
};

// ── Moon phase (cached per day) ──
// Returns 0-1 where 0 = new moon, 0.5 = full moon, 1 = next new moon.
// Based on synodic period of 29.53 days from a known new moon epoch.

let cachedMoonPhase = 0;
let moonPhaseDay = -1;

function getMoonPhase(): number {
  const now = new Date();
  const today = now.getUTCDate();
  if (today === moonPhaseDay) return cachedMoonPhase;
  moonPhaseDay = today;

  // Known new moon: Jan 29, 2025 12:36 UTC
  const epoch = 1738151760000;
  const synodicPeriod = 29.53058770576;
  const daysSinceEpoch = (now.getTime() - epoch) / 86400000;
  cachedMoonPhase = ((daysSinceEpoch % synodicPeriod) + synodicPeriod) % synodicPeriod / synodicPeriod;
  return cachedMoonPhase;
}

// Hijri date — cached per day, zero dependencies
let cachedHijriDate = '';
let hijriDateDay = -1;

function getHijriDate(): string {
  const now = new Date();
  const today = now.getUTCDate();
  if (today === hijriDateDay) return cachedHijriDate;
  hijriDateDay = today;

  cachedHijriDate = new Intl.DateTimeFormat('en-u-ca-islamic', {
    day: 'numeric',
    month: 'long',
  }).format(now).replace(' AH', '');
  return cachedHijriDate;
}

// ── Sun position (cached 60s) ──

let cachedSunPos: [number, number] = [0, 0];
let sunPosTimestamp = 0;

function getSunPosition(): [number, number] {
  const now = Date.now();
  if (now - sunPosTimestamp < 60000) return cachedSunPos;
  sunPosTimestamp = now;

  const date = new Date(now);
  const dayOfYear = Math.floor((now - new Date(date.getUTCFullYear(), 0, 0).getTime()) / 86400000);
  const declination = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  cachedSunPos = [180 - hours * 15, declination];
  return cachedSunPos;
}

// ── Types ──

export interface GlobeRef {
  recenter: () => void;
}

interface GlobeProps {
  dots: DotLocation[];
  visible: boolean;
  onDotTap?: (dot: DotLocation, country: string | null) => void;
  onSiteTap?: (index: number) => void;
  onCountryTap?: (name: string) => void;
  ref?: React.Ref<GlobeRef>;
}

interface NightLayer {
  path: SkPath;
  opacity: number;
}

interface ProjectedDot {
  x: number;
  y: number;
  brightness: number;
  radius: number;
  dotIndex: number; // index into the dots[] prop for tap lookup
}

interface ProjectedSite {
  x: number;
  y: number;
  r: number;
  blur: number;
  coreR: number;
}

interface ProjectionState {
  landPath: SkPath;
  dots: ProjectedDot[];
  holySites: ProjectedSite[];
  meccaCentered: boolean;
  highlightPath: SkPath | null;
  nightLayers: NightLayer[];
  sunScreenX: number;
  sunScreenY: number;
  globeScale: number;
}

// ── Component ──

export function Globe({ dots, visible, onDotTap, onSiteTap, onCountryTap, ref }: GlobeProps) {
  const { impact, notification } = useHaptic();

  useImperativeHandle(ref, () => ({
    recenter: () => {
      rotX.value = withTiming(MECCA[0], { duration: 2000, easing: Easing.out(Easing.cubic) });
      rotY.value = withTiming(-MECCA[1], { duration: 2000, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(1, { duration: 500 });
    },
  }));

  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const { width, height } = size;
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) / 2.3;

  // Gesture shared values — start at Washington, animate to Mecca on reveal
  const rotX = useSharedValue(-77); // Washington DC longitude
  const rotY = useSharedValue(-38); // Washington DC latitude
  const hasRevealed = useRef(false);
  const wasCentered = useRef(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onChange((e) => {
          'worklet';
          rotX.value -= e.changeX * 0.3;
          rotY.value = Math.max(-80, Math.min(80, rotY.value - e.changeY * 0.3));
        })
        .onEnd((e) => {
          'worklet';
          rotX.value = withDecay({ velocity: -e.velocityX * 0.3, deceleration: 0.997 });
          rotY.value = withDecay({
            velocity: -e.velocityY * 0.3,
            deceleration: 0.997,
            clamp: [-80, 80],
            rubberBandEffect: true,
          });
        }),
    [rotX, rotY],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          savedScale.value = scale.value;
        })
        .onUpdate((e) => {
          'worklet';
          scale.value = Math.max(0.8, Math.min(3, savedScale.value * e.scale));
        })
        .onEnd(() => {
          'worklet';
          if (scale.value < 1.1) {
            scale.value = withTiming(1, { duration: 200 });
          }
        }),
    [scale, savedScale],
  );

  const handleTap = useCallback(
    (x: number, y: number) => {
      const cur = stateRef.current;

      // Check holy sites first (smaller targets, need priority)
      for (let i = 0; i < cur.holySites.length; i++) {
        const site = cur.holySites[i]!;
        const dx = site.x - x;
        const dy = site.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < 25) {
          impact();
          onSiteTap?.(i);
          return;
        }
      }

      // Check news dots
      let bestDist = 30;
      let bestIdx = -1;
      for (const dot of cur.dots) {
        const dx = dot.x - x;
        const dy = dot.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = dot.dotIndex;
        }
      }
      // Find country under tap — reverse-project to lat/lng, then geoContains
      const proj = projectionRef.current;
      if (!proj) return;
      const geo = proj.invert?.([x, y]);
      if (!geo) return;

      const found = countries.features.find((f) => geoContains(f, geo));
      const countryName = (found?.properties as any)?.name ?? null;

      if (found) {
        highlightedCountry.current = found;
        reprojectRef.current(rotX.value, rotY.value, scale.value);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => {
          highlightedCountry.current = null;
          reprojectRef.current(rotX.value, rotY.value, scale.value);
        }, 3000);
      }

      // Fire the appropriate callback with country info
      if (bestIdx >= 0) {
        impact();
        onDotTap?.(dots[bestIdx]!, countryName);
      } else if (countryName) {
        impact();
        onCountryTap?.(countryName);
      }
    },
    [onDotTap, onSiteTap, onCountryTap, dots, rotX, rotY, scale, impact],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        'worklet';
        runOnJS(handleTap)(e.x, e.y);
      }),
    [handleTap],
  );

  const gesture = useMemo(
    () => Gesture.Race(Gesture.Simultaneous(panGesture, pinchGesture), tapGesture),
    [panGesture, pinchGesture, tapGesture],
  );

  // Currently highlighted country feature — re-projected each frame while active
  const highlightedCountry = useRef<GeoJSON.Feature | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cached projection + path generator — mutated in place, never re-created
  const projectionRef = useRef<GeoProjection | null>(null);
  const pathGenRef = useRef<GeoPath<any, GeoPermissibleObjects> | null>(null);

  // Dot data (stable between fetches)
  const dotCoords = useMemo(
    () => dots.map((d) => [d.coords[1], d.coords[0]] as [number, number]),
    [dots],
  );
  const dotMeta = useMemo(() => {
    const now = Date.now();
    return dots.map((d) => ({
      brightness: Math.max(0.3, 1 - (now - d.newestAt) / (48 * 3600000)),
      // Scale radius: 1 article = 1x, 5+ articles = 2x (sqrt for gentle scaling)
      radius: Math.min(2, Math.sqrt(d.count)),
    }));
  }, [dots]);

  // Single batched projection state
  const [state, setState] = useState<ProjectionState>({
    landPath: Skia.Path.Make(),
    dots: [],
    holySites: [],
    meccaCentered: false,
    highlightPath: null,
    nightLayers: [],
    sunScreenX: 0,
    sunScreenY: 0,
    globeScale: 1,
  });

  // Ref to access current state from tap handler without stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Stable callback ref pattern
  const reprojectRef = useRef<(rx: number, ry: number, s: number) => void>(() => {});
  reprojectRef.current = (rx: number, ry: number, s: number) => {
    if (width === 0) return;
    // Reuse projection
    let proj = projectionRef.current;
    if (!proj) {
      proj = geoOrthographic().clipAngle(90).precision(4);
      projectionRef.current = proj;
    }
    proj
      .rotate([-rx, ry, 0])
      .scale(baseRadius * s)
      .translate([cx, cy]);

    // Reuse path generator
    let pg = pathGenRef.current;
    if (!pg) {
      pg = geoPath(proj);
      pathGenRef.current = pg;
    } else {
      pg.projection(proj);
    }

    // Land — reuse single context object
    const landSkPath = Skia.Path.Make();
    skiaCtx.setPath(landSkPath);
    pg.context(skiaCtx as any)(land);

    // Dots — sized by article count (heatmap-like)
    const rot = proj.rotate();
    const center: [number, number] = [-rot[0], -rot[1]];
    const projected: ProjectedDot[] = [];
    for (let i = 0; i < dotCoords.length; i++) {
      const coord = dotCoords[i]!;
      const angDist = geoDistance(coord, center);
      if (angDist > HALF_PI) continue;
      const pt = proj(coord);
      if (pt) {
        const meta = dotMeta[i]!;
        // Fade dots near the limb — simulates foreshortening at steep viewing angles
        const limbFade = Math.cos(angDist);
        projected.push({
          x: pt[0],
          y: pt[1],
          brightness: meta.brightness * limbFade,
          radius: meta.radius,
          dotIndex: i,
        });
      }
    }

    // Holy sites — project visible ones, check if Mecca is centered
    const sites: ProjectedSite[] = [];
    let meccaNear = false;
    for (const site of HOLY_SITES) {
      const dist = geoDistance(site.coords, center);
      if (dist > HALF_PI) continue;
      const pt = proj(site.coords);
      if (pt) {
        const isMecca = site.coords === MECCA;
        const centered = isMecca && dist < 0.08;
        if (centered) meccaNear = true;
        sites.push({
          x: pt[0],
          y: pt[1],
          r: centered ? site.r * 1.5 : site.r,
          blur: centered ? site.blur * 1.5 : site.blur,
          coreR: centered ? site.coreR * 1.5 : site.coreR,
        });
      }
    }

    // Highlighted country border — only 1 country at a time, ~100 points
    let highlight: SkPath | null = null;
    if (highlightedCountry.current) {
      const hPath = Skia.Path.Make();
      skiaCtx.setPath(hPath);
      pg.context(skiaCtx as any)(highlightedCountry.current);
      highlight = hPath;
    }

    // Night layers
    const [sunLng, sunLat] = getSunPosition();
    const antiSunLng = sunLng + 180;
    const antiSunLat = -sunLat;
    const layers: NightLayer[] = [];
    for (const def of NIGHT_LAYERS) {
      const geo = nightCircleGen.center([antiSunLng, antiSunLat]).radius(def.radius)();
      const p = Skia.Path.Make();
      skiaCtx.setPath(p);
      pg.context(skiaCtx as any)(geo);
      layers.push({ path: p, opacity: def.opacity });
    }

    // Sun screen position for halo
    const dLng = (sunLng - rx) * TO_RAD;
    const sLat = sunLat * TO_RAD;
    const viewRy = ry * TO_RAD;
    const cosLat = Math.cos(sLat);
    const sinLat = Math.sin(sLat);
    const cosDLng = Math.cos(dLng);
    const r = baseRadius * s;

    // React 19 concurrent: mark globe re-renders as non-urgent so user
    // interactions (swiping to article tabs) are never blocked
    startTransition(() => {
      setState({
        landPath: landSkPath,
        dots: projected,
        holySites: sites,
        meccaCentered: meccaNear,
        highlightPath: highlight,
        nightLayers: layers,
        sunScreenX: cx + r * cosLat * Math.sin(dLng),
        sunScreenY: cy - r * (sinLat * Math.cos(viewRy) - cosLat * cosDLng * Math.sin(viewRy)),
        globeScale: s,
      });
    });
  };

  const callReproject = useCallback((rx: number, ry: number, s: number) => {
    reprojectRef.current(rx, ry, s);
  }, []);

  useEffect(() => {
    projectionRef.current = null;
    pathGenRef.current = null;
    callReproject(rotX.value, rotY.value, scale.value);
  }, [width, baseRadius, dotCoords]); // eslint-disable-line

  // Haptic feedback when Mecca comes to center — once per session
  useEffect(() => {
    if (state.meccaCentered && !wasCentered.current) {
      wasCentered.current = true;
      notification();
    }
  }, [state.meccaCentered, notification]);

  // Intro reveal: one slow rotation to Al-Aqsa when the globe tab becomes visible
  useEffect(() => {
    if (visible && !hasRevealed.current && width > 0) {
      hasRevealed.current = true;
      rotX.value = withTiming(MECCA[0], { duration: 3500, easing: Easing.out(Easing.cubic) });
      rotY.value = withTiming(-MECCA[1], { duration: 3500, easing: Easing.out(Easing.cubic) });
    }
  }, [visible, width]); // eslint-disable-line

  const lastProjectionTime = useSharedValue(0);
  useAnimatedReaction(
    () => [rotX.value, rotY.value, scale.value] as const,
    ([rx, ry, s]) => {
      'worklet';
      const now = Date.now();
      if (now - lastProjectionTime.value > 40) {
        lastProjectionTime.value = now;
        runOnJS(callReproject)(rx, ry, s);
      }
    },
  );

  const globeRadius = baseRadius * state.globeScale;

  if (width === 0) {
    return <View style={{ flex: 1 }} onLayout={onLayout} />;
  }

  // Halo offset — precompute once per render, not inline in JSX
  const haloOffsetX1 = cx + (state.sunScreenX - cx) * 0.15;
  const haloOffsetY1 = cy + (state.sunScreenY - cy) * 0.15;
  const haloOffsetX2 = cx + (state.sunScreenX - cx) * 0.1;
  const haloOffsetY2 = cy + (state.sunScreenY - cy) * 0.1;

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas style={{ flex: 1 }}>
          {/* Atmospheric limb halo — offset toward sun for day/night asymmetry */}
          <Circle cx={cx} cy={cy} r={globeRadius * 1.06}>
            <RadialGradient
              c={vec(haloOffsetX1, haloOffsetY1)}
              r={globeRadius * 1.06}
              colors={['rgba(180,180,170,0)', 'rgba(180,180,170,0.04)', 'rgba(180,180,170,0)']}
              positions={[0.85, 0.94, 1.0]}
            />
          </Circle>
          <Circle cx={cx} cy={cy} r={globeRadius * 1.03}>
            <RadialGradient
              c={vec(haloOffsetX2, haloOffsetY2)}
              r={globeRadius * 1.03}
              colors={['rgba(200,200,190,0)', 'rgba(200,200,190,0.08)', 'rgba(200,200,190,0)']}
              positions={[0.88, 0.96, 1.0]}
            />
          </Circle>

          {/* Ocean */}
          <Circle cx={cx} cy={cy} r={globeRadius} color="#1a1a1a" />

          {/* Land fill + coastline stroke */}
          <Path path={state.landPath} color="#2a2a2a" />
          <Path path={state.landPath} color="#333333" style="stroke" strokeWidth={0.5} />

          {/* Highlighted country border — flashes on tap, fades after 3s */}
          {state.highlightPath && (
            <>
              <Path path={state.highlightPath} color="#3a3a3a" />
              <Path
                path={state.highlightPath}
                color={COLORS.textSecondary}
                style="stroke"
                strokeWidth={1}
                opacity={0.6}
              />
            </>
          )}

          {/* Limb darkening */}
          <Circle cx={cx} cy={cy} r={globeRadius}>
            <RadialGradient
              c={vec(cx, cy)}
              r={globeRadius}
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
              positions={[0.45, 1.0]}
            />
          </Circle>

          {/* Night — stacked twilight layers */}
          {state.nightLayers.map((layer, i) => (
            <Path key={i} path={layer.path} color="black" opacity={layer.opacity} />
          ))}

          {/* Story dots — glow layer (shared blur) then core layer */}
          <Group>
            <BlurMask blur={4} style="solid" />
            {state.dots.map((dot, i) => (
              <Circle
                key={dots[i]?.key ?? i}
                cx={dot.x}
                cy={dot.y}
                r={3 * dot.radius}
                color="#e8e8e8"
                opacity={dot.brightness}
              />
            ))}
          </Group>
          {state.dots.map((dot, i) => (
            <Circle
              key={dots[i]?.key ?? i}
              cx={dot.x}
              cy={dot.y}
              r={1.5 * dot.radius}
              color="#e8e8e8"
              opacity={dot.brightness}
            />
          ))}

          {/* Holy sites — Mecca (large), Medina + Al-Aqsa (small) */}
          {state.holySites.map((site, i) => (
            <Group key={i}>
              <Circle cx={site.x} cy={site.y} r={site.r} color={COLORS.dome}>
                <BlurMask blur={site.blur} style="solid" />
              </Circle>
              <Circle cx={site.x} cy={site.y} r={site.coreR} color={COLORS.dome} />
            </Group>
          ))}

        </Canvas>
      </GestureDetector>
    </View>
  );
}
