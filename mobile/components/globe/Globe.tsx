import {
  BlurMask,
  Canvas,
  Circle,
  Group,
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
  geoDistance,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import worldTopo from '../../data/world-110m.json';
import type { DotLocation } from './storyDots';

// ── Module-level constants (allocated once) ──

const land = feature(worldTopo as unknown as Topology, (worldTopo as any).objects.land);
const nightCircleGen = geoCircle();
const DEG = 180 / Math.PI;
const HALF_PI = Math.PI / 2;

const TO_RAD = Math.PI / 180;

const NIGHT_LAYERS = [
  { radius: 85, opacity: 0.1 },
  { radius: 72, opacity: 0.15 },
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

interface GlobeProps {
  dots: DotLocation[];
}

interface NightLayer {
  path: SkPath;
  opacity: number;
}

interface ProjectedDot {
  x: number;
  y: number;
  brightness: number;
}

interface ProjectionState {
  landPath: SkPath;
  dots: ProjectedDot[];
  nightLayers: NightLayer[];
  sunScreenX: number;
  sunScreenY: number;
  globeScale: number;
}

// ── Component ──

export function Globe({ dots }: GlobeProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const { width, height } = size;
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) / 2.3;

  // Gesture shared values
  const rotX = useSharedValue(30);
  const rotY = useSharedValue(-20);
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

  const gesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture],
  );

  // Cached projection + path generator — mutated in place, never re-created
  const projectionRef = useRef<GeoProjection | null>(null);
  const pathGenRef = useRef<GeoPath<any, GeoPermissibleObjects> | null>(null);

  // Dot data (stable between fetches)
  const dotCoords = useMemo(
    () => dots.map((d) => [d.coords[1], d.coords[0]] as [number, number]),
    [dots],
  );
  const dotBrightness = useMemo(() => {
    const now = Date.now();
    return dots.map((d) => Math.max(0.3, 1 - (now - d.addedAt) / (48 * 3600000)));
  }, [dots]);

  // Single batched projection state
  const [state, setState] = useState<ProjectionState>({
    landPath: Skia.Path.Make(),
    dots: [],
    nightLayers: [],
    sunScreenX: 0,
    sunScreenY: 0,
    globeScale: 1,
  });

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

    // Dots
    const rot = proj.rotate();
    const centerLng = -rot[0];
    const centerLat = -rot[1];
    const projected: ProjectedDot[] = [];
    for (let i = 0; i < dotCoords.length; i++) {
      const coord = dotCoords[i]!;
      if (geoDistance(coord, [centerLng, centerLat]) > HALF_PI) continue;
      const pt = proj(coord);
      if (pt) {
        projected.push({ x: pt[0], y: pt[1], brightness: dotBrightness[i]! });
      }
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

          {/* Land */}
          <Path path={state.landPath} color="#2a2a2a" />

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

          {/* Story dots — blur glow + bright core (2 elements vs 5 before) */}
          {state.dots.map((dot, i) => (
            <Group key={dots[i]?.slug ?? i} opacity={dot.brightness}>
              <Circle cx={dot.x} cy={dot.y} r={3} color="#e8e8e8">
                <BlurMask blur={4} style="solid" />
              </Circle>
              <Circle cx={dot.x} cy={dot.y} r={1.5} color="#e8e8e8" />
            </Group>
          ))}
        </Canvas>
      </GestureDetector>
    </View>
  );
}
