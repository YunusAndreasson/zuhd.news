import { COUNTRY_DATA, type CountryData } from '@shared/countries/country-data';
import { CITY_TZ, COUNTRY_TZ, SOURCE_COORDS } from '@shared/globe/coordinates';
import type { Article, Chokepoint, ConflictEvent, GdacsAlert, HeatmapPoint } from '@shared/types';
import {
  Atlas,
  BlurMask,
  Canvas,
  Circle,
  ColorMatrix,
  CubicSampling,
  DashPathEffect,
  FontEdging,
  FontHinting,
  Group,
  Image,
  LinearGradient,
  Path,
  Picture,
  RadialGradient,
  Rect,
  rect,
  Skia,
  Text as SkiaText,
  type SkPath,
  type SkPathBuilder,
  useFont,
  useImage,
  useTexture,
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
  type SharedValue,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { BLACK, WHITE, withAlpha } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { eventAgeDays } from '../../lib/conflict';
import { alertAgeDays } from '../../lib/gdacs';
import { displayCountryName, displayLocation, wrapCountryLabel } from '../../lib/place-names';
import {
  CITY_LIGHT_COORDS,
  CITY_LIGHT_COUNT,
  CITY_LIGHT_DEEP_NIGHT_DOT,
  CITY_LIGHT_RADIUS,
  CITY_LIGHT_UNITS,
} from './city-lights';
import {
  getLakeLabels,
  getMajorRiverFeatureCollection,
  getRiverLabels,
  getSeas,
} from './detail-geo';
import { CHOKEPOINT_PATH, GLYPH_HALF, getGlyphPath } from './disaster-glyphs';
import {
  ANCHOR_COUNTRY_AREA,
  ANCHOR_NAMES_EXTRA,
  ANTARCTIC_CIRCLE,
  ARCTIC_CIRCLE,
  clipAngleForCountry,
  DECAY_LAMBDA,
  findCountry,
  formatLocalTime,
  getMoonPhase,
  getSunPosition,
  invalidateSunCaches,
  isNear,
  MAKKAH,
  NORTH_POLE,
  PLACES_APPEAR_CLIP,
  PLACES_FULL_CLIP,
  RIVERS_APPEAR_CLIP,
  SOUTH_POLE,
} from './projection';
import {
  bordersMeshMedium,
  bordersMeshSimplified,
  countries,
  countryAreas,
  countryBboxes,
  countryCentroidNames,
  countryCentroidPoints,
  countryCentroids,
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

/** Bake a GlowSpec into a Skia texture once per color. The concentric
 *  circles + BlurMasks are drawn into an offscreen image so the runtime
 *  cost of the glow is one Atlas draw call regardless of layer count. */
function useGlowTexture(spec: GlowSpec, color: string) {
  return useTexture(
    <Group>
      {spec.layers.map((l, i) => (
        <Circle key={i} cx={spec.center} cy={spec.center} r={l.r} color={color} opacity={l.opacity}>
          {l.blur != null && <BlurMask blur={l.blur} style="solid" />}
        </Circle>
      ))}
    </Group>,
    spec.size,
    [color],
  );
}

/** Build Atlas inputs (sprites + translate-only RSXforms) for a glow at the
 *  given points. Returns null when there are no points to draw. */
function glowAtlas(spec: GlowSpec, points: { x: number; y: number }[]) {
  if (points.length === 0) return null;
  return {
    sprites: points.map(() => spec.srcRect),
    transforms: points.map((p) => Skia.RSXform(1, 0, p.x - spec.center, p.y - spec.center)),
  };
}

/** Atlas inputs for the conflict layer. Same pipeline as glowAtlas — the
 *  conflict layer reuses the ghost-pin baked texture, just at a different
 *  point set — plus a per-instance color carrying the recency fade.
 *  White at `recencyAlpha` multiplied into the sprite via
 *  `colorBlendMode="modulate"` scales the baked glow's alpha uniformly.
 *  The explicit modulate mode is load-bearing, not stylistic: Atlas's
 *  default colors blend is `dstOver`, which paints each color *behind*
 *  the sprite — filling its transparent bounding box with solid squares. */
function conflictAtlas(spec: GlowSpec, marks: { x: number; y: number; recencyAlpha: number }[]) {
  if (marks.length === 0) return null;
  return {
    sprites: marks.map(() => spec.srcRect),
    transforms: marks.map((m) => Skia.RSXform(1, 0, m.x - spec.center, m.y - spec.center)),
    colors: marks.map((m) => Float32Array.of(1, 1, 1, m.recencyAlpha)),
  };
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

// A glow rendered to a baked texture and stamped via Atlas. `size` must
// exceed the largest (r + blur) of any layer × 2 with comfortable slack.
interface GlowSpec {
  layers: GlowLayer[];
  size: { width: number; height: number };
  center: number;
  srcRect: ReturnType<typeof rect>;
}

function makeGlowSpec(layers: GlowLayer[], size: number): GlowSpec {
  return {
    layers,
    size: { width: size, height: size },
    center: size / 2,
    srcRect: rect(0, 0, size, size),
  };
}

// Ghost: max r+blur ≈ 12 → 32px. Dot: max ≈ 24 → 56px. Makkah: max ≈ 20 → 48px.
const GHOST_GLOW = makeGlowSpec(GHOST_GLOW_LAYERS, 32);
const DOT_GLOW = makeGlowSpec(DOT_GLOW_LAYERS, 56);
const MAKKAH_GLOW = makeGlowSpec(MAKKAH_GLOW_LAYERS, 48);

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
// 12pt Source Sans 3 SemiBold (countryFont) — enough air to read both lines
// as a stack without the descenders touching the next ascenders. Was 16
// when the country label rendered at 14pt; shrunk to track the smaller
// secondary-tier font.
const LABEL_LINE_HEIGHT = 14;
// Neighbour-tier sibling of LABEL_LINE_HEIGHT — same ratio applied to the
// 11.5pt neighborFont (14 × 11.5/12 ≈ 13.4, rounded down so the two-line
// stack stays compact at the smaller size).
const NEIGHBOR_LINE_HEIGHT = 13;
// Halo stroke width for primary-tier labels (focused country, chokepoint).
// 2.4 reads as a soft cushion behind the glyphs without becoming a visible
// plate; 3+ starts to feel like a solid background rectangle at 14px text.
const LABEL_HALO_WIDTH = 2.4;
// Unified halo opacity — every haloed label on the globe uses the same pair
// so the labels read as one material. Slightly lower in dark mode where the
// bg is already low-contrast against the land tint.
const LABEL_HALO_OPACITY_LIGHT = 0.7;
const LABEL_HALO_OPACITY_DARK = 0.55;
// Disrupted-chokepoint bump — same family, just a touch more presence so the
// alarm label stays legible over a busy ring. Capped well below 1 so it
// never becomes an opaque plate.
const LABEL_HALO_OPACITY_LIGHT_STRONG = 0.85;
const LABEL_HALO_OPACITY_DARK_STRONG = 0.7;
// Secondary tier — softer halo for the demoted country label so its smaller
// 12pt text doesn't punch above its hierarchy slot. The dot/location label
// now carries the primary-tier halo.
const LABEL_HALO_OPACITY_LIGHT_SOFT = 0.5;
const LABEL_HALO_OPACITY_DARK_SOFT = 0.4;
// Floor opacity for anchor-tier neighbour labels at 1× ambient zoom —
// quiet orientation, never competing with the focused country's primary
// label. As the user zooms, anchors strengthen via `Math.max(floor,
// labelOpacity)` so they never dim below their ambient floor while
// smaller countries fade in around them.
//
// Mode-split floors: the same 0.45 floor composites to very different
// WCAG contrast per mode — ~3.4:1 on dark-mode land (a legible whisper)
// but ~1.9:1 on light-mode land (below every threshold; near-invisible
// for low-vision readers). 0.75 in light restores perceptual parity
// (~3.2–5:1, AA-large tier) while staying clearly below the focused
// label's 5.5+:1, so the whisper hierarchy survives in both modes.
// Audited against WCAG 2.2 SC 1.4.3 with the full layer compositing —
// see scratch script map-contrast.mjs from the 2026-07-04 audit.
const ANCHOR_LABEL_OPACITY_DARK = 0.45;
const ANCHOR_LABEL_OPACITY_LIGHT = 0.75;

/** Widest line in `lines`, measured by font width when loaded; otherwise
 *  approximated at `fallbackChar` pixels per character so first-paint
 *  collision packing still works before fonts resolve. */
function measureLines(
  lines: string[],
  font: { measureText: (s: string) => { width: number } } | null,
  fallbackChar: number,
): number {
  let w = 0;
  for (const line of lines) {
    const lw = font ? font.measureText(line).width : line.length * fallbackChar;
    if (lw > w) w = lw;
  }
  return w;
}

// Neighbour-label lines, precomputed at module load. Display-name
// normalization ("United States of America" → "United States") and the
// 1–2 line wrap (word boundary nearest the middle, same convention as
// the focused country label) are both static per name, so the per-frame
// projection loop indexes this array instead of re-scanning strings.
// Index-parallel to countryCentroidNames.
const countryCentroidLabelLines: string[][] = countryCentroidNames.map((name) =>
  wrapCountryLabel(displayCountryName(name) ?? name),
);

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
  /** Set when the tap landed on a GDACS disaster marker. The parent resolves
   *  the eventid against the alerts list and opens DisasterSheet. */
  gdacsEventId?: string;
  /** Set when the tap landed on a conflict-event marker. The parent
   *  resolves the id against the events list and opens ConflictSheet. */
  conflictEventId?: string;
  /** Populated when the tap lands on 2+ overlapping markers. The parent
   *  presents a chooser sheet listing these candidates; tapping one
   *  re-dispatches that candidate through the same hit handler. When set,
   *  it has length ≥ 2 and the outer fields (`countryName`, etc.) carry
   *  no meaning — read from the candidates instead. */
  candidates?: TapResult[];
}

export interface MiniGlobeRef {
  hitTest: (x: number, y: number) => TapResult | null;
  showPulse: (x: number, y: number) => void;
}

interface MiniGlobeProps {
  articles: Article[];
  heatmapPoints?: HeatmapPoint[];
  chokepoints?: Chokepoint[];
  gdacsAlerts?: GdacsAlert[];
  conflictEvents?: ConflictEvent[];
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
  landPath: SkPath | null;
  icePath: SkPath | null;
  bordersPath: SkPath | null;
  countryPath: SkPath | null;
  countryName: string | null;
  nightPath: SkPath | null;
  twilightPath: SkPath | null;
  graticulePath: SkPath | null;
  qiblaPath: SkPath | null;
  sourceArcs: SkPath | null;
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
  /** Subsolar point — projected position of `[sunLng, sunLat]` (the spot
   *  where the sun sits directly overhead). Null when the subsolar point
   *  is on the far side of the globe. Drives the day-side ocean specular
   *  highlight: a small bright disc that gives the lit hemisphere a sense
   *  of material reflectance. Land paints on top, so the spot only shows
   *  where it falls on water. */
  subsolar: { x: number; y: number } | null;
  hotspotGlows: {
    x: number;
    y: number;
    /** Source lat/lng — propagated so the React key stays stable across
     *  frames (x/y change every frame as the globe rotates). */
    lat: number;
    lng: number;
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
  /** GDACS disaster markers — Orange/Red current events. Projected every
   *  frame like chokepoints (small set, reference signal). `recencyAlpha`
   *  ∈ [0.5, 1] fades events older than ~7 days. */
  gdacsMarks: {
    x: number;
    y: number;
    eventid: string;
    eventtype: GdacsAlert['eventtype'];
    alertlevel: GdacsAlert['alertlevel'];
    recencyAlpha: number;
  }[];
  /** Conflict-event markers — rendered as the ghost-dot glow family
   *  (same visual register as neighbor-article pins) so the layer reads
   *  as ambient density rather than as its own pictogram vocabulary.
   *  `recencyAlpha` ∈ [0.4, 1] fades across the 14-day window relative
   *  to the dataset's latest event; the render side folds it in as a
   *  per-sprite Atlas color (white × alpha, modulate blend). */
  conflictMarks: {
    x: number;
    y: number;
    id: string;
    recencyAlpha: number;
  }[];
  /** Neighbour-country labels — every country within the camera's visible
   *  hemisphere EXCEPT the highlighted one. Emerges when the camera is
   *  zoomed past PLACES_APPEAR_CLIP, giving the reader geographic context
   *  ("Pakistan is bordered by Iran / Afghanistan / India / China") without
   *  needing a second screen. `opacity` folds the zoom-band fade factor.
   *  `lines` is the precomputed 1–2 line wrap of the display name; `y` is
   *  the vertical center of the block — render and packer splay lines
   *  around it at NEIGHBOR_LINE_HEIGHT spacing. `name` is the raw Natural
   *  Earth name, kept as the stable React key. */
  neighborLabels: {
    name: string;
    lines: string[];
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
  riversPath: SkPath | null;
  /** Opacity for riversPath — folds the zoom-band fade factor so rivers
   *  emerge smoothly as the camera tightens. */
  riversOpacity: number;
  /** Night-side city pinpricks, deep-night tier (sun depressed past civil
   *  twilight). Painted brightest. Null when no cities qualify on the
   *  visible hemisphere — first paint and globe-noon framings are common
   *  cases. The ~190-entry input loop is two dot products per entry plus
   *  an optional proj() — fits comfortably alongside the existing GDACS /
   *  conflict / hotspot loops. */
  cityLightsNightPath: SkPath | null;
  /** Civil-twilight tier — same path family, painted at half opacity. The
   *  two-tier render gives the terminator a soft lighting-up gradient
   *  instead of a hard on/off seam. */
  cityLightsTwilightPath: SkPath | null;
  /** Zoom-fade multiplier for the civil-twilight tier (0 at 1× ambient → 1
   *  at full zoom). Holds the dim terminator-edge speckle out of the
   *  resting view; the deep-night tier ignores it and always paints. */
  cityTwilightOpacity: number;
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
  clip: SkPath;
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
      {/* Moon texture — full disk. CubicSampling: <Image>'s default sampler
          is Nearest+Nearest, which pixelates the moon photo at our small
          render radius. Cubic gives a smooth downscale at negligible cost
          for a single static image.
          ColorMatrix: pure-luminance desaturation (Rec. 709 weights) locks
          the moon into the monochrome palette so the source PNG's warm cast
          can never drift against the cool dark-mode atmosphere or fight the
          accent-tinted halo. Single shader uniform — no per-pixel JS cost,
          and it's a static image so the filter is baked once at first
          composite. */}
      <Group clip={clip}>
        <BlurMask blur={r * 0.06} style="normal" />
        <Image
          image={texture}
          x={x - r}
          y={y - r}
          width={r * 2}
          height={r * 2}
          opacity={0.45}
          sampling={CubicSampling}
        >
          <ColorMatrix
            // prettier-ignore
            matrix={[
              0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0,
              0, 0, 0, 0, 1, 0,
            ]}
          />
        </Image>
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

/** Country highlight — the focal "figure" of the globe: a soft glow for body
 *  plus a crisp outline for definition. Small countries get a stronger glow so
 *  they stay visible at globe scale. The outline is what separates the focused
 *  country from the quiet ground — the soft fill alone (0.12–0.25) read almost
 *  identically to the 0.3 neighbour borders, so nothing popped. */
const CountryHighlight = memo(function CountryHighlight({
  path: p,
  countryName,
  color,
}: {
  path: SkPath;
  countryName: string | null;
  color: string;
}) {
  const area = countryName ? (countryAreas[countryName] ?? 0) : 0;
  const opacity = area < 0.001 ? 0.25 : area < 0.005 ? 0.18 : 0.12;
  return (
    <>
      <Path path={p} color={color} opacity={opacity}>
        <BlurMask blur={1} style="solid" />
      </Path>
      {/* Crisp focal outline — no blur, brighter than the borders/coastline so
          the focused country clearly leads the figure-ground hierarchy. */}
      <Path
        path={p}
        color={color}
        style="stroke"
        strokeWidth={1}
        strokeJoin="round"
        opacity={0.5}
      />
    </>
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
  subsolar: null,
  hotspotGlows: [],
  chokepoints: [],
  gdacsMarks: [],
  conflictMarks: [],
  neighborLabels: [],
  waterLabels: [],
  riversPath: null,
  riversOpacity: 0,
  cityLightsNightPath: null,
  cityLightsTwilightPath: null,
  cityTwilightOpacity: 0,
};

/** City-light pass — fills `nightPath` and `twilightPath` with small circles
 *  at every city visible on the camera's clip cone whose local sun position
 *  is at or below the horizon. Two paths split civil twilight from deep
 *  night so each tier can paint at its own opacity, giving the terminator a
 *  soft lighting-up gradient instead of a hard on/off seam. Mutates the
 *  paths (does not rewind) — caller is responsible for rewind/Make. */
function collectCityLights(
  proj: (point: [number, number]) => [number, number] | null,
  sunUnitX: number,
  sunUnitY: number,
  sunUnitZ: number,
  camUnitX: number,
  camUnitY: number,
  camUnitZ: number,
  clipCos: number,
  nightPath: SkPathBuilder,
  twilightPath: SkPathBuilder,
  collectTwilight: boolean,
): { hasNight: boolean; hasTwilight: boolean } {
  let hasNight = false;
  let hasTwilight = false;
  const tmp: [number, number] = [0, 0];
  for (let i = 0; i < CITY_LIGHT_COUNT; i++) {
    const i3 = i * 3;
    const ux = CITY_LIGHT_UNITS[i3] as number;
    const uy = CITY_LIGHT_UNITS[i3 + 1] as number;
    const uz = CITY_LIGHT_UNITS[i3 + 2] as number;
    // Hemisphere + clip-cone cull (precomputed cartesian dot, no trig).
    if (ux * camUnitX + uy * camUnitY + uz * camUnitZ <= clipCos) continue;
    // Sun-overhead dot: > 0 = day side, ≤ 0 = night side.
    const sunDot = ux * sunUnitX + uy * sunUnitY + uz * sunUnitZ;
    if (sunDot > 0) continue;
    // Tier is known from sunDot before projecting, so the zoom-gated
    // twilight tier skips its proj() entirely at 1× ambient.
    const isDeepNight = sunDot < CITY_LIGHT_DEEP_NIGHT_DOT;
    if (!isDeepNight && !collectTwilight) continue;
    const i2 = i * 2;
    tmp[0] = CITY_LIGHT_COORDS[i2] as number;
    tmp[1] = CITY_LIGHT_COORDS[i2 + 1] as number;
    const pt = proj(tmp);
    if (!pt) continue;
    if (isDeepNight) {
      nightPath.addCircle(pt[0], pt[1], CITY_LIGHT_RADIUS);
      hasNight = true;
    } else {
      twilightPath.addCircle(pt[0], pt[1], CITY_LIGHT_RADIUS);
      hasTwilight = true;
    }
  }
  return { hasNight, hasTwilight };
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

  const landBuilder = Skia.PathBuilder.Make();
  ctx.setPath(landBuilder);
  pg.context(ctx)(landMedium);
  const lp = landBuilder.detach();

  // Permanent ice sheets (Antarctica, Greenland) — drawn as a lighter fill
  // on top of the land silhouette so the globe reads climatologically.
  const iceBuilder = Skia.PathBuilder.Make();
  ctx.setPath(iceBuilder);
  pg.context(ctx)(iceSheets);
  const ip = iceBuilder.detach();

  // Neighbouring country borders — mesh + no resampling for speed
  proj.precision(0);
  const bordersBuilder = Skia.PathBuilder.Make();
  ctx.setPath(bordersBuilder);
  pg.context(ctx)(bordersMeshMedium);
  const bp = bordersBuilder.detach();
  proj.precision(8);

  let cp: GlobeState['countryPath'] = null;
  if (geo.country) {
    const builder = Skia.PathBuilder.Make();
    ctx.setPath(builder);
    pg.context(ctx)(geo.country);
    cp = builder.detach();
  }

  const [sunLng, sunLat] = getSunPosition();
  const nightCenter: [number, number] = [sunLng + 180, -sunLat];
  const nightBuilder = Skia.PathBuilder.Make();
  ctx.setPath(nightBuilder);
  pg.context(ctx)(nightCircleGen.center(nightCenter).radius(90)());
  const np = nightBuilder.detach();

  // Low-sun band — softer gradient where sun is near the horizon (0–6° above)
  const twilightBuilder = Skia.PathBuilder.Make();
  ctx.setPath(twilightBuilder);
  pg.context(ctx)(nightCircleGen.center(nightCenter).radius(96)());
  const tp = twilightBuilder.detach();

  // Equator + polar circles
  const graticuleBuilder = Skia.PathBuilder.Make();
  ctx.setPath(graticuleBuilder);
  pg.context(ctx)(graticuleLines);
  pg.context(ctx)(ARCTIC_CIRCLE);
  pg.context(ctx)(ANTARCTIC_CIRCLE);
  const gp = graticuleBuilder.detach();

  // Point markers below are culled against the clip cone, not the hemisphere:
  // direct point projection ignores `.clipAngle` (d3 clips streams only), so a
  // point between clipRad and 90° projects outside the disk, and a far-side
  // point comes back mirrored *inside* it — proj() never returns null.
  const clipRad = (clipAngle * Math.PI) / 180;

  // Poles
  let northPole: GlobeState['northPole'] = null;
  let southPole: GlobeState['southPole'] = null;
  if (geoDistance(NORTH_POLE, [geo.lng, geo.lat]) < clipRad) {
    const npp = proj(NORTH_POLE);
    if (npp) northPole = { x: npp[0], y: npp[1] };
  }
  if (geoDistance(SOUTH_POLE, [geo.lng, geo.lat]) < clipRad) {
    const spp = proj(SOUTH_POLE);
    if (spp) southPole = { x: spp[0], y: spp[1] };
  }

  let dot: GlobeState['dot'] = null;
  const pt = proj([geo.lng, geo.lat]);
  if (pt) dot = { x: pt[0], y: pt[1] };

  // Makkah
  let makkah: GlobeState['makkah'] = null;
  if (geoDistance(MAKKAH.coords, [geo.lng, geo.lat]) < clipRad) {
    const mp = proj(MAKKAH.coords);
    if (mp) makkah = { x: mp[0], y: mp[1] };
  }

  // Subsolar point — projected position of [sunLng, sunLat]
  let subsolar: GlobeState['subsolar'] = null;
  if (geoDistance([sunLng, sunLat], [geo.lng, geo.lat]) < clipRad) {
    const sp = proj([sunLng, sunLat]);
    if (sp) subsolar = { x: sp[0], y: sp[1] };
  }

  // City lights — first-paint pass. The reaction tick (~32 ms later) will
  // rebuild these into ref'd paths, but computing them here too means the
  // very first frame after mount already shows the night-side glow rather
  // than popping in on next tick.
  const DEG2RAD = Math.PI / 180;
  const sunLatR0 = sunLat * DEG2RAD;
  const sunLngR0 = sunLng * DEG2RAD;
  const sunCosLat0 = Math.cos(sunLatR0);
  const sunUnitX0 = sunCosLat0 * Math.cos(sunLngR0);
  const sunUnitY0 = sunCosLat0 * Math.sin(sunLngR0);
  const sunUnitZ0 = Math.sin(sunLatR0);
  const camLatR0 = geo.lat * DEG2RAD;
  const camLngR0 = geo.lng * DEG2RAD;
  const camCosLat0 = Math.cos(camLatR0);
  const camUnitX0 = camCosLat0 * Math.cos(camLngR0);
  const camUnitY0 = camCosLat0 * Math.sin(camLngR0);
  const camUnitZ0 = Math.sin(camLatR0);
  const clipCos0 = Math.cos((clipAngle * Math.PI) / 180);
  // Civil-twilight city tier is zoom-gated identically to the per-frame
  // pass, so the first paint matches what the next tick will draw.
  const cityTwilightOpacity0 =
    clipAngle < PLACES_APPEAR_CLIP
      ? Math.min(
          1,
          Math.max(0, (PLACES_APPEAR_CLIP - clipAngle) / (PLACES_APPEAR_CLIP - PLACES_FULL_CLIP)),
        )
      : 0;
  const cityNightBuilder0 = Skia.PathBuilder.Make();
  const cityTwilightBuilder0 = Skia.PathBuilder.Make();
  const cityRes0 = collectCityLights(
    proj,
    sunUnitX0,
    sunUnitY0,
    sunUnitZ0,
    camUnitX0,
    camUnitY0,
    camUnitZ0,
    clipCos0,
    cityNightBuilder0,
    cityTwilightBuilder0,
    cityTwilightOpacity0 > 0,
  );

  // Qibla arc — great circle from story location to Makkah. Interpolated
  // points are culled against the clip cone explicitly (see the clipRad note
  // above): beyond-cone points would draw the arc into the sky and far-side
  // points would fold it back mirrored across the disk.
  let qp: GlobeState['qiblaPath'] = null;
  if (geoDistance([geo.lng, geo.lat], MAKKAH.coords) > 0.02) {
    const interp = geoInterpolate([geo.lng, geo.lat], MAKKAH.coords);
    const builder = Skia.PathBuilder.Make();
    let started = false;
    for (let i = 0; i <= 30; i++) {
      const ll = interp(i / 30);
      if (geoDistance(ll, [geo.lng, geo.lat]) >= clipRad) {
        started = false;
        continue;
      }
      const p = proj(ll);
      if (!p) {
        started = false;
        continue;
      }
      if (!started) {
        builder.moveTo(p[0], p[1]);
        started = true;
      } else builder.lineTo(p[0], p[1]);
    }
    qp = builder.detach();
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
    subsolar,
    hotspotGlows: [],
    chokepoints: [],
    gdacsMarks: [],
    conflictMarks: [],
    neighborLabels: [],
    waterLabels: [],
    riversPath: null,
    riversOpacity: 0,
    cityLightsNightPath: cityRes0.hasNight ? cityNightBuilder0.detach() : null,
    cityLightsTwilightPath: cityRes0.hasTwilight ? cityTwilightBuilder0.detach() : null,
    cityTwilightOpacity: cityTwilightOpacity0,
  };
}

export const MiniGlobe = memo(function MiniGlobe({
  articles,
  heatmapPoints,
  chokepoints,
  gdacsAlerts,
  conflictEvents,
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
  // Gates the globe's two *discrete* animations (zoom transition, tap pulse
  // expansion) per DESIGN.md's Reduce Motion rule. The scroll-driven rotation
  // is deliberately NOT gated: it tracks the user's finger, and direct
  // manipulation is exactly what Reduce Motion is not meant to suppress.
  const reduceMotion = useReducedMotion();

  // Glow textures baked once per color so each glow renders as a single
  // Atlas draw instead of N concentric Circle+BlurMask draws.
  const ghostTexture = useGlowTexture(GHOST_GLOW, colors.textEmphasis);
  const dotTexture = useGlowTexture(DOT_GLOW, colors.textEmphasis);
  const makkahTexture = useGlowTexture(MAKKAH_GLOW, colors.dome);

  const globeRadius = width * 0.9;
  const cx = width / 2;
  // Vertical center sits on the lower rule-of-thirds line (2/3 from top).
  // Was 0.75 — pulled up a touch so the globe disk reads as the lower
  // composition anchor rather than crowding the bottom edge.
  const cy = height * (2 / 3);
  // Cartographic typography:
  //   - Dot label  → SemiBold mixed case + halo. The *only* Title-Case label
  //     on the globe; intentionally non-atlas-style because it's the editorial
  //     marker, not a place name. The reader's eye finds "where the news
  //     happened" by spotting the one label that doesn't look atlas-like.
  //   - Country labels (focused + neighbours) → True small caps. Standard
  //     atlas convention for political features. Same family (SourceSans3SC).
  //   - Water labels (lakes, rivers, seas) and chokepoints → Italic mixed
  //     case. Standard atlas convention for hydrography and named passages.
  //   - subFont (SemiBold 11) stays for the dot-label sub (HH:MM time) since
  //     that line is part of the dot-label editorial marker, not atlas chrome.
  const labelFont = useFont(require('../../assets/fonts/SourceSans3-SemiBold.ttf'), 14);
  const subFont = useFont(require('../../assets/fonts/SourceSans3-SemiBold.ttf'), 11);
  const countryFont = useFont(require('../../assets/fonts/SourceSans3SC-SemiBold.ttf'), 12);
  const neighborFont = useFont(require('../../assets/fonts/SourceSans3SC-SemiBold.ttf'), 11.5);
  const waterFont = useFont(require('../../assets/fonts/SourceSans3-Italic.ttf'), 11);
  // Dynamic-text rendering polish for every map label. Skia's defaults
  // (integer-snapped positioning, outline hinting, plain anti-alias) are
  // tuned for static UI text. Each frame on the globe nudges every label to
  // fractional pixel coordinates as the projection rotates — with the
  // defaults, glyphs visibly shimmer between pixel-aligned and unaligned
  // states. Canonical map/CAD recipe: subpixel positioning + subpixel AA
  // edging + no hinting, so glyphs slide smoothly through fractional
  // positions instead of snapping. One-time mutation per font instance.
  //
  // Note: setSubpixel's native binding calls `asNumber()` on its argument
  // despite the TS type declaring `boolean`, so we pass `1` cast through
  // unknown to satisfy the type while shipping the value the C++ side
  // actually wants (a 0/1 numeric flag).
  useEffect(() => {
    const fonts = [labelFont, subFont, countryFont, neighborFont, waterFont];
    for (const f of fonts) {
      if (!f) continue;
      f.setSubpixel(1 as unknown as boolean);
      f.setEdging(FontEdging.SubpixelAntiAlias);
      f.setHinting(FontHinting.None);
    }
  }, [labelFont, subFont, countryFont, neighborFont, waterFont]);
  // Fonts mirrored into refs so callReproject (a useCallback with `[]` deps,
  // stable closure) can measure text width for label-collision detection.
  // The fonts load asynchronously, so the ref pointer can flip from null to
  // the loaded font mid-session — each frame reads the current value.
  const labelFontRef = useRef(labelFont);
  labelFontRef.current = labelFont;
  const countryFontRef = useRef(countryFont);
  countryFontRef.current = countryFont;
  const subFontRef = useRef(subFont);
  subFontRef.current = subFont;
  const neighborFontRef = useRef(neighborFont);
  neighborFontRef.current = neighborFont;
  const waterFontRef = useRef(waterFont);
  waterFontRef.current = waterFont;
  // Anchor-label ambient floor mirrored into a ref for the same reason as
  // the fonts above: callReproject is a stable `[]`-deps closure and can't
  // see the theme, but the floor is mode-dependent (see the constant pair).
  const anchorFloorRef = useRef(ANCHOR_LABEL_OPACITY_DARK);
  anchorFloorRef.current = light ? ANCHOR_LABEL_OPACITY_LIGHT : ANCHOR_LABEL_OPACITY_DARK;

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
  // are warm before the first swipe (avoids useEffect → reaction → scheduleOnRN lag)
  const [state, setState] = useState<GlobeState>(() => {
    const firstGeo = articleGeo.find((g) => g != null);
    if (!firstGeo) return EMPTY_GLOBE;
    return projectInitial(firstGeo, globeRadius, cx, cy);
  });

  // Cluster heatmap points with 18h half-life time-decay → top 8 coverage hotspots
  const hotspots = useMemo((): Hotspot[] => {
    // `_tick` is an explicit clock invalidation signal: recency below is
    // derived from Date.now(), which React cannot infer as a dependency.
    void _tick;
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
  }, [heatmapPoints, articles, articleGeo, _tick]);

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

  // Reusable mutable builders retain their internal buffers between frames;
  // each frame publishes immutable SkPath snapshots for rendering.
  const landPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const icePathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const bordersPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const countryPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const nightPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const twilightPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const graticulePathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const qiblaPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const sourceArcsRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const riversPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  // City-light tier builders — reset each frame, populated by collectCityLights.
  // Two paths (deep night vs civil twilight) so each tier paints at its own
  // opacity in the JSX without needing per-instance Atlas alpha.
  const cityLightsNightPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
  const cityLightsTwilightPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));

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
        // Mixed case (not UPPERCASE): chokepoints are passages — straits,
        // canals, channels — which sit in the hydrography tier alongside
        // rivers and seas. Atlas convention for hydrography is italic
        // mixed case; uppercase reads as alarm even at baseline, fighting
        // the "ambient reference geography" intent.
        label: cp.name,
        coords: [cp.lng, cp.lat] as [number, number],
        absDelta: Math.abs(cp.delta7vs90[cp.primaryField] ?? 0),
      })),
    [chokepoints],
  );
  const chokepointsRef = useRef(enrichedChokepoints);
  chokepointsRef.current = enrichedChokepoints;
  // GDACS alerts — precompute per-frame derivations once per snapshot:
  // [lng,lat] tuple and recency alpha (fade events older than 14 days down
  // to ~0.5; the data layer drops anything past 30 days). Greens are
  // round-robin'd across event types and capped at GREEN_CAP — round-robin
  // surfaces visual diversity (floods, droughts, fires, quakes) instead of
  // letting the most frequent type monopolise (EQ + WF typically own ~80%
  // of the raw count). The cap is set generously since perf isn't the
  // constraint: today's feed of ~90 Greens fits comfortably; the cap only
  // kicks in for pathological future feed sizes. Orange/Red are uncapped
  // and pass through directly. Render order is Green → Orange → Red so
  // consequential markers always paint over ambient ones.
  const enrichedGdacs = useMemo(() => {
    // Recompute age-derived opacity after an app-resume clock tick even when
    // the alert array itself is referentially unchanged.
    void _tick;
    const alerts = gdacsAlerts ?? [];
    const GREEN_CAP = 100;
    const TYPES: GdacsAlert['eventtype'][] = ['EQ', 'TC', 'FL', 'VO', 'DR', 'WF'];
    const byType: Record<string, GdacsAlert[]> = {};
    for (const t of TYPES) byType[t] = [];
    for (const a of alerts) {
      if (a.alertlevel === 'Green') byType[a.eventtype]?.push(a);
    }
    for (const t of TYPES) {
      byType[t]?.sort((a, b) => Date.parse(b.modifiedDate) - Date.parse(a.modifiedDate));
    }
    // Round-robin: take the most-recent of each type, then 2nd most-recent
    // of each, etc., until we hit GREEN_CAP or every list is exhausted.
    const greens: GdacsAlert[] = [];
    let round = 0;
    let progressed = true;
    while (greens.length < GREEN_CAP && progressed) {
      progressed = false;
      for (const t of TYPES) {
        const list = byType[t];
        if (!list || round >= list.length) continue;
        const item = list[round];
        if (!item) continue;
        greens.push(item);
        progressed = true;
        if (greens.length >= GREEN_CAP) break;
      }
      round++;
    }
    const oranges = alerts.filter((a) => a.alertlevel === 'Orange');
    const reds = alerts.filter((a) => a.alertlevel === 'Red');
    return [...greens, ...oranges, ...reds].map((a) => ({
      eventid: a.eventid,
      eventtype: a.eventtype,
      alertlevel: a.alertlevel,
      coords: [a.lng, a.lat] as [number, number],
      recencyAlpha: Math.max(0.5, 1 - alertAgeDays(a) / 14),
    }));
  }, [gdacsAlerts, _tick]);
  const gdacsAlertsRef = useRef(enrichedGdacs);
  gdacsAlertsRef.current = enrichedGdacs;
  // Conflict events — pre-shape into the same coords/recency pair the GDACS
  // loop uses, so the per-frame projection cost is identical. Recency
  // anchors on the *dataset's* latest event rather than Date.now(): the
  // upstream (UCDP candidate today, ACLED later) always trails real-time
  // by some lag, and "today" as the reference would push every marker to
  // minimum opacity whenever the snapshot is more than ~14 days stale.
  // Anchoring on the dataset tail keeps the freshest available data at
  // full weight and fades older events relative to that.
  const enrichedConflict = useMemo(() => {
    const events = conflictEvents ?? [];
    if (events.length === 0) return [];
    let latestMs = 0;
    for (const e of events) {
      const t = Date.parse(e.eventDate);
      if (Number.isFinite(t) && t > latestMs) latestMs = t;
    }
    return events.map((e) => ({
      id: e.id,
      coords: [e.lng, e.lat] as [number, number],
      recencyAlpha: Math.max(0.4, 1 - eventAgeDays(e, latestMs) / 14),
    }));
  }, [conflictEvents]);
  const conflictEventsRef = useRef(enrichedConflict);
  conflictEventsRef.current = enrichedConflict;
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
        // follow rotation. Reads from the precomputed map (which uses the
        // largest-polygon centroid for MultiPolygon features), keeping the
        // focused-country label on the primary landmass even when overseas
        // territories would otherwise drag the geometric centroid into a
        // neighbour (e.g. France → French Guiana drags into Spain).
        cachedCountryCentroidRef.current = settledName
          ? (countryCentroids[settledName] ?? null)
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
      // Cull cone for labels and ambient markers. d3-geo's `.clipAngle` only
      // clips path generation, not direct point projection — so without an
      // explicit cone test, a chokepoint or neighbour label on the visible
      // hemisphere but beyond the zoom cone projects to coordinates well
      // outside the disk (projScale = r / sin(clipAngle) blows up as
      // clipAngle shrinks). Reject everything past clipRad so labels can't
      // float in the "sky" outside the globe.
      const clipRad = (clipAngle * Math.PI) / 180;
      const clipCos = Math.cos(clipRad);

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

      // Land — reset reuses the PathBuilder's underlying buffer.
      // Mid-scroll uses the ~2k-vertex simplified topology (vs 5k full); at
      // rest we switch back to the full coastline so static reading is crisp.
      const landBuilder = landPathRef.current;
      landBuilder.reset();
      skiaCtx.setPath(landBuilder);
      pg.context(skiaCtx)(nearSettled ? landMedium : landSimplified);
      const landPath = landBuilder.build();

      // Ice sheets — Antarctica + Greenland. Swapped to simplified during
      // scroll the same way land is. Projecting every frame (not gated) so
      // the ice layer tracks rotation without flicker.
      const iceBuilder = icePathRef.current;
      iceBuilder.reset();
      skiaCtx.setPath(iceBuilder);
      pg.context(skiaCtx)(nearSettled ? iceSheets : iceSheetsSimplified);
      const icePath = iceBuilder.build();

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
        // Cull against the zoom cone, not the hemisphere — direct point
        // projection ignores `.clipAngle` (see clipRad note above), so a
        // ghost between clipRad and 90° would stamp its glow in the sky.
        if (geoDistance([g.lng, g.lat], [geoLng, geoLat]) >= clipRad) continue;
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
      let countryPath: GlobeState['countryPath'] = null;
      if (cachedCountryRef.current) {
        const countryBuilder = countryPathRef.current;
        countryBuilder.reset();
        skiaCtx.setPath(countryBuilder);
        const src =
          nearSettled || !cachedCountrySimplifiedRef.current
            ? cachedCountryRef.current
            : cachedCountrySimplifiedRef.current;
        pg.context(skiaCtx)(src);
        countryPath = countryBuilder.build();
      }

      // Country name label — project the cached centroid onto the current
      // frame, culled against the clip cone first: direct point projection
      // ignores `.clipAngle` (it never returns null for a clipped point), so
      // without the cone test a centroid far from the camera — e.g. Russia's
      // centroid while the story sits in Vladivostok at zoom clip 18° — would
      // project past the disk and float in the sky. One geoDistance + one
      // projection op per frame; the centroid itself is pre-computed on
      // settled-country change.
      // Default offset: 14px below the centroid so the label sits under
      // the highlight. Overridden further below if it would collide with
      // the dot label (location · time).
      let countryLabel: GlobeState['countryLabel'] = null;
      const COUNTRY_LABEL_OFFSET = 14;
      const centroid = cachedCountryCentroidRef.current;
      const countryName = cachedCountryRef.current?.properties?.name as string | undefined;
      if (centroid && countryName && geoDistance(centroid, [geoLng, geoLat]) < clipRad) {
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

      // Neighbouring country borders — projected every frame so they rotate
      // with the globe instead of popping at settle. Settled uses medium
      // (matches landMedium arcs); mid-scroll uses the 0.5-weight simplified
      // mesh (matches landSimplified). ~30% cheaper at rest, ~56% cheaper
      // during scroll vs the original full-topology mesh.
      const bordersBuilder = bordersPathRef.current;
      bordersBuilder.reset();
      skiaCtx.setPath(bordersBuilder);
      pg.context(skiaCtx)(nearSettled ? bordersMeshMedium : bordersMeshSimplified);
      const bordersPath = bordersBuilder.build();

      // --- Always-on cheap layers: project every frame so they stay present
      // during scroll instead of popping in/out at the nearSettled boundary.
      // These are visually prominent (night terminator, makkah glow, pole
      // markers) but cost is small — single circle paths or 1-2 point
      // projections per frame. The original gating saved ~3-6 frames in the
      // central window of a fast swipe, but the perceived "things vanishing
      // as I swipe" cost more in UX than the few-ms savings bought back.

      // Night shadow
      const [sunLng, sunLat] = getSunPosition();
      const nightCenter: [number, number] = [sunLng + 180, -sunLat];
      const nightGeo = nightCircleGen.center(nightCenter).radius(90)();
      const nightBuilder = nightPathRef.current;
      nightBuilder.reset();
      skiaCtx.setPath(nightBuilder);
      pg.context(skiaCtx)(nightGeo);
      const nightPath = nightBuilder.build();

      // Low-sun band
      const twilightBuilder = twilightPathRef.current;
      twilightBuilder.reset();
      skiaCtx.setPath(twilightBuilder);
      pg.context(skiaCtx)(nightCircleGen.center(nightCenter).radius(96)());
      const twilightPath = twilightBuilder.build();

      // Poles — culled against the clip cone like every other point marker:
      // proj() never nulls a far-side point, it mirrors it back inside the
      // disk (a camera at 30°N would paint the south-pole cross at the screen
      // position of front-side 60°S).
      let northPole: GlobeState['northPole'] = null;
      let southPole: GlobeState['southPole'] = null;
      if (geoDistance(NORTH_POLE, [geoLng, geoLat]) < clipRad) {
        const npp = proj(NORTH_POLE);
        if (npp) northPole = { x: npp[0], y: npp[1] };
      }
      if (geoDistance(SOUTH_POLE, [geoLng, geoLat]) < clipRad) {
        const spp = proj(SOUTH_POLE);
        if (spp) southPole = { x: spp[0], y: spp[1] };
      }

      // Makkah
      let makkah: { x: number; y: number } | null = null;
      if (geoDistance(MAKKAH.coords, [geoLng, geoLat]) < clipRad) {
        const pt = proj(MAKKAH.coords);
        if (pt) makkah = { x: pt[0], y: pt[1] };
      }

      // Subsolar point — drives the day-side ocean specular highlight.
      // The night layer above already computes (sunLng, sunLat); the
      // subsolar point is just the antipode of nightCenter, i.e. the
      // direct sunLng/sunLat. Culled against the clip cone — point
      // projection doesn't clip, so a sun between clipRad and 90° away
      // would center the specular blob outside the disk near the limb.
      let subsolar: { x: number; y: number } | null = null;
      if (geoDistance([sunLng, sunLat], [geoLng, geoLat]) < clipRad) {
        const pt = proj([sunLng, sunLat]);
        if (pt) subsolar = { x: pt[0], y: pt[1] };
      }

      // Equator + polar circles — projected every frame; cost is small
      // (~650 verts) and the layer is barely visible at α 0.08 anyway.
      const graticuleBuilder = graticulePathRef.current;
      graticuleBuilder.reset();
      skiaCtx.setPath(graticuleBuilder);
      pg.context(skiaCtx)(graticuleLines);
      pg.context(skiaCtx)(ARCTIC_CIRCLE);
      pg.context(skiaCtx)(ANTARCTIC_CIRCLE);
      const graticulePath = graticuleBuilder.build();

      // Dot label — the only remaining nearSettled gate. Two reasons:
      //   1. Intl.formatLocalTime is the single most expensive call in this
      //      hot path (full Intl.DateTimeFormat construction + format).
      //   2. settledIndex flips at frac=0.5, so mid-rotation the label
      //      would change cities ("Bamako · 12:34" → "Lima · 06:34") —
      //      more confusing than absent. The label appearing once you've
      //      committed to an article is correct UX.
      let dotLabel: GlobeState['dotLabel'] = null;
      if (nearSettled) {
        const settledCountry = cachedCountryRef.current?.properties?.name ?? null;
        if (dot && settledCountry) {
          const article = articlesRef.current[settledIndex];
          const loc = displayLocation(article?.location ?? null);
          if (loc) {
            let sub: string | undefined;
            // Strip diacritics so an accented dateline ("Culiacán", "São Paulo")
            // matches the ASCII-keyed CITY_TZ table; without this it falls
            // through to the country zone — wrong for any city in a non-default
            // zone (e.g. Sinaloa is UTC−7, not Mexico City's UTC−6).
            const cityKey = (article?.location ?? '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');
            const tz =
              CITY_TZ[cityKey] ?? (settledCountry ? COUNTRY_TZ[settledCountry] : undefined);
            if (tz) sub = formatLocalTime(tz) ?? undefined;
            dotLabel = { text: loc, sub, x: dot.x, y: dot.y };
          }
        }
      }

      // Qibla + source arcs — paths projected every frame (cheap: ≤57 point
      // projections), but rendered with a smoothstep opacity fade. The fade
      // is load-bearing UX, not perf: arcs anchor to settledIndex, which
      // flips at frac=0.5, so without the fade they'd visibly snap to a
      // new origin mid-swipe. Fading to 0 across the central swipe band
      // hides the jump. Skia skips 0-alpha draws on the GPU side, so the
      // wasted projection cost is JS-thread only and small.
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

      const qiblaBuilder = qiblaPathRef.current;
      qiblaBuilder.reset();
      let hasQibla = false;
      if (geo) {
        const storyPt: [number, number] = [geo.lng, geo.lat];
        if (geoDistance(storyPt, MAKKAH.coords) > 0.02) {
          const interp = geoInterpolate(storyPt, MAKKAH.coords);
          let started = false;
          for (let i = 0; i <= 16; i++) {
            const ll = interp(i / 16);
            // Explicit cone cull — point projection ignores `.clipAngle`, so
            // a beyond-cone point would draw the arc into the sky and a
            // far-side point would fold it back mirrored across the disk.
            if (geoDistance(ll, [geoLng, geoLat]) >= clipRad) {
              started = false;
              continue;
            }
            const p = proj(ll);
            if (!p) {
              started = false;
              continue;
            }
            if (!started) {
              qiblaBuilder.moveTo(p[0], p[1]);
              started = true;
            } else qiblaBuilder.lineTo(p[0], p[1]);
          }
          hasQibla = true;
        }
      }

      // Source arcs — great circle lines from each source's HQ to the article location
      const sourceArcsBuilder = sourceArcsRef.current;
      sourceArcsBuilder.reset();
      let hasSourceArcs = false;
      if (geo) {
        const storyPt: [number, number] = [geo.lng, geo.lat];
        const article = articlesRef.current[settledIndex];
        if (article?.sources) {
          for (const src of article.sources) {
            const srcCoords = SOURCE_COORDS[src.name];
            if (!srcCoords) continue;
            const srcPt: [number, number] = [srcCoords[1], srcCoords[0]]; // [lng, lat] from [lat, lng]
            // Skip if source is at the same location as the story
            if (geoDistance(srcPt, storyPt) < 0.05) continue;
            const interp = geoInterpolate(srcPt, storyPt);
            let started = false;
            for (let i = 0; i <= 10; i++) {
              const ll = interp(i / 10);
              // Per-point cone cull (not an endpoint check): the source HQ is
              // routinely outside the zoom cone while the story-side stretch
              // of the arc is visible — and point projection ignores
              // `.clipAngle`, so unculled points would land in the sky or
              // fold back mirrored across the disk.
              if (geoDistance(ll, [geoLng, geoLat]) >= clipRad) {
                started = false;
                continue;
              }
              const p = proj(ll);
              if (!p) {
                started = false;
                continue;
              }
              if (!started) {
                sourceArcsBuilder.moveTo(p[0], p[1]);
                started = true;
              } else sourceArcsBuilder.lineTo(p[0], p[1]);
            }
            hasSourceArcs = true;
          }
        }
      }

      // Coverage hotspot glows — projected every frame so the bright halos
      // rotate smoothly with the globe instead of popping at the settle
      // boundary. ≤12 point projections per frame, negligible cost.
      const hotspotGlows: GlobeState['hotspotGlows'] = [];
      for (const zone of hotspotsRef.current) {
        const zoneCoords: [number, number] = [zone.lng, zone.lat];
        if (geoDistance(zoneCoords, [geoLng, geoLat]) < clipRad) {
          const pt = proj(zoneCoords);
          if (pt)
            hotspotGlows.push({
              x: pt[0],
              y: pt[1],
              lat: zone.lat,
              lng: zone.lng,
              intensity: zone.intensity,
              recency: zone.recency,
              labels: zone.labels,
              countryName: zone.countryName,
            });
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

      // Sun unit vector — computed alongside the camera vector so the city-
      // light pass below can score sun-overhead-ness with a dot product.
      // Cached sun position only changes once per minute, but the unit
      // vector is cheap and avoids a dependency on cache hits.
      const sunLatR = sunLat * DEG2RAD;
      const sunLngR = sunLng * DEG2RAD;
      const sunCosLat = Math.cos(sunLatR);
      const sunUnitX = sunCosLat * Math.cos(sunLngR);
      const sunUnitY = sunCosLat * Math.sin(sunLngR);
      const sunUnitZ = Math.sin(sunLatR);

      // Zoom-band label ramp (0 at PLACES_APPEAR_CLIP=25° → 1 at
      // PLACES_FULL_CLIP=10°). Hoisted above the marker loops so the
      // zoom-gated layers below all share it: the dim civil-twilight city
      // tier (here), the green-tier disaster gate (GDACS loop), and the
      // country/water label pipeline further down.
      const placesActive = clipAngle < PLACES_APPEAR_CLIP;
      const labelOpacity = placesActive
        ? Math.min(
            1,
            Math.max(0, (PLACES_APPEAR_CLIP - clipAngle) / (PLACES_APPEAR_CLIP - PLACES_FULL_CLIP)),
          )
        : 0;

      // City lights — refresh both tier paths. Two dot products + one
      // optional proj() per entry × ~190 entries; the dot products handle
      // the hemisphere/clip cull and the day-side cull before any
      // projection runs, so worst case is the visible-night-hemisphere
      // count of proj() calls (typically 50–80). The dim civil-twilight tier
      // is zoom-gated — held back at 1× ambient (labelOpacity 0) so the
      // terminator-edge speckle doesn't clutter the resting view, and faded
      // in via `cityTwilightOpacity` past 25°. Deep-night dots always show.
      const cityNightBuilder = cityLightsNightPathRef.current;
      cityNightBuilder.reset();
      const cityTwilightBuilder = cityLightsTwilightPathRef.current;
      cityTwilightBuilder.reset();
      const cityRes = collectCityLights(
        (p) => proj(p),
        sunUnitX,
        sunUnitY,
        sunUnitZ,
        camUnitX,
        camUnitY,
        camUnitZ,
        clipCos,
        cityNightBuilder,
        cityTwilightBuilder,
        labelOpacity > 0,
      );

      // Chokepoints — always projected (unlike hotspots). The set is small
      // (≤11) and the markers are geographic reference, not cosmetic detail,
      // so they shouldn't blink out during a fast scroll.
      const chokepointMarks: GlobeState['chokepoints'] = [];
      const cameraCoords: [number, number] = [geoLng, geoLat];
      for (const cp of chokepointsRef.current) {
        if (geoDistance(cp.coords, cameraCoords) >= clipRad) continue;
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

      // GDACS alerts — same cull + project pattern as chokepoints. Per-tier
      // cap upstream (Green ≤30 most-recent; Orange/Red uncapped). Green-tier
      // alerts are the low-severity bulk of the feed, so they're zoom-gated:
      // skipped entirely at 1× ambient (labelOpacity 0) and faded in past 25°,
      // folded into recencyAlpha since render multiplies stroke opacity by it.
      // Orange/Red are rare + consequential, so they always show.
      const gdacsMarks: GlobeState['gdacsMarks'] = [];
      for (const a of gdacsAlertsRef.current) {
        const isGreen = a.alertlevel === 'Green';
        if (isGreen && labelOpacity <= 0) continue;
        if (geoDistance(a.coords, cameraCoords) >= clipRad) continue;
        const pt = proj(a.coords);
        if (!pt) continue;
        gdacsMarks.push({
          x: pt[0],
          y: pt[1],
          eventid: a.eventid,
          eventtype: a.eventtype,
          alertlevel: a.alertlevel,
          recencyAlpha: isGreen ? a.recencyAlpha * labelOpacity : a.recencyAlpha,
        });
      }

      // Conflict events — same cull+project pattern. The hook narrows
      // upstream's 7-day window to the most-recent calendar day, so this
      // loop sees ~40 events. Each marker carries only what render
      // needs: position + recencyAlpha for the per-instance fade.
      const conflictMarks: GlobeState['conflictMarks'] = [];
      for (const e of conflictEventsRef.current) {
        if (geoDistance(e.coords, cameraCoords) >= clipRad) continue;
        const pt = proj(e.coords);
        if (!pt) continue;
        conflictMarks.push({
          x: pt[0],
          y: pt[1],
          id: e.id,
          recencyAlpha: e.recencyAlpha,
        });
      }

      // Country + water-feature labels.
      //   • Anchor-tier countries (`area ≥ ANCHOR_COUNTRY_AREA`) render at
      //     all zooms with a floor opacity, so the reader always has
      //     continental orientation without touching the zoom pill.
      //   • Non-anchor countries + water features stay zoom-gated, fading
      //     in past PLACES_APPEAR_CLIP and reaching full opacity at
      //     PLACES_FULL_CLIP.
      // Hierarchy: focused country (haloed primary) ≻ anchors (quiet) ≻
      // zoomed neighbours ≻ water features. Iterates the precomputed label
      // sets, skips the highlighted country, filters by camera-visible
      // hemisphere, projects. Lakes/rivers/seas precompute lazily on first
      // zoom (see detail-geo.ts), so a reader who never zooms past
      // PLACES_APPEAR_CLIP pays zero cost for those layers.
      const neighborLabels: GlobeState['neighborLabels'] = [];
      const waterLabels: GlobeState['waterLabels'] = [];
      let riversPath: GlobeState['riversPath'] = null;
      let riversOpacity = 0;
      // `placesActive` + `labelOpacity` are computed once above the marker
      // loops (the green-disaster gate shares them) and reused here.
      const settledName = cachedCountryRef.current?.properties?.name as string | undefined;

      // Country centroids — hemisphere cull uses a precomputed cartesian
      // dot product against the camera axis (~900 trig ops saved per
      // frame vs. geoDistance haversine). Two passes so anchors win
      // collisions in the greedy packer below: pass 1 collects anchors
      // (always), pass 2 collects non-anchors (only when zoomed past
      // PLACES_APPEAR_CLIP). Iteration is over the parallel arrays
      // (names/points/units) populated in shared.ts. Projects every
      // frame — the gate that used to hide labels mid-swipe was
      // perceptually worse than the cost it saved (anchors visibly
      // popped out and back in during slow scrolls).
      const anchorBuf: GlobeState['neighborLabels'] = [];
      const otherBuf: GlobeState['neighborLabels'] = [];
      for (let i = 0; i < countryCentroidNames.length; i++) {
        const name = countryCentroidNames[i];
        if (!name || name === settledName) continue;
        // Anchors come from two pools: spherical-area giants
        // (`ANCHOR_COUNTRY_AREA`) and a curated recognition-tier list
        // (`ANCHOR_NAMES_EXTRA`). The latter rebalances Europe and Asia,
        // which are underweighted by area alone — see projection.ts.
        const isAnchor =
          (countryAreas[name] ?? 0) >= ANCHOR_COUNTRY_AREA || ANCHOR_NAMES_EXTRA.has(name);
        if (!placesActive && !isAnchor) continue;
        const unit = countryCentroidUnits[i];
        if (!unit) continue;
        if (unit[0] * camUnitX + unit[1] * camUnitY + unit[2] * camUnitZ <= clipCos) continue;
        const coords = countryCentroidPoints[i];
        if (!coords) continue;
        const pt = proj(coords);
        if (!pt) continue;
        // Precomputed display-name wrap (1–2 lines) — long names stack like
        // the focused country label instead of running as one wide line
        // whose AABB evicts every neighbour it crosses in the packer.
        const lines = countryCentroidLabelLines[i];
        if (!lines) continue;
        // Anchor labels never dim below their ambient floor as zoom
        // increases — the larger of (floor, zoom-band ramp) wins, so a
        // continuous strengthening replaces the prior all-or-nothing gate.
        const opacity = isAnchor ? Math.max(anchorFloorRef.current, labelOpacity) : labelOpacity;
        (isAnchor ? anchorBuf : otherBuf).push({
          name,
          lines,
          x: pt[0],
          y: pt[1],
          opacity,
        });
      }
      for (const a of anchorBuf) neighborLabels.push(a);
      for (const o of otherBuf) neighborLabels.push(o);

      if (placesActive) {
        // Lakes — filter to visually-significant size at globe scale
        // (~8000 km² floor = Lake Tanganyika scale). Keeps labels to the
        // ~20-30 giants worldwide; anything smaller is invisible through
        // the 110m coastline anyway.
        const LAKE_MIN_AREA = 2e-4; // steradians; ≈ 8000 km²
        for (const lake of getLakeLabels()) {
          if (lake.area < LAKE_MIN_AREA) continue;
          const lu = lake.unit;
          if (lu[0] * camUnitX + lu[1] * camUnitY + lu[2] * camUnitZ <= clipCos) continue;
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
          if (ru[0] * camUnitX + ru[1] * camUnitY + ru[2] * camUnitZ <= clipCos) continue;
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
        for (const sea of getSeas()) {
          const su = sea.unit;
          if (su[0] * camUnitX + su[1] * camUnitY + su[2] * camUnitZ <= clipCos) continue;
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
          const riverBuilder = riversPathRef.current;
          riverBuilder.reset();
          skiaCtx.setPath(riverBuilder);
          pg.context(skiaCtx)(getMajorRiverFeatureCollection() as never);
          riversPath = riverBuilder.build();
          const riverSpan = RIVERS_APPEAR_CLIP - PLACES_FULL_CLIP;
          riversOpacity = Math.min(1, Math.max(0, (RIVERS_APPEAR_CLIP - clipAngle) / riverSpan));
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
        const cfont = countryFontRef.current;
        const sfont = subFontRef.current;
        // Text widths — fall back to char-count approximation (6px per char
        // for countryFont 12pt, 7px for labelFont 14pt, 5px for subFont)
        // before fonts finish loading. Country label is multi-line (1–2
        // rows): use the widest row.
        const cWidth = measureLines(countryLabel.lines, cfont, 6);
        const dWidth = lfont ? lfont.measureText(dotLabel.text).width : dotLabel.text.length * 7;
        const sWidth = dotLabel.sub
          ? sfont
            ? sfont.measureText(dotLabel.sub).width
            : dotLabel.sub.length * 5
          : 0;
        // Country label AABB — centered on x, first baseline at y, each
        // additional line stacks LABEL_LINE_HEIGHT below. Ascender ≈ 10 for
        // 12pt SemiBold (was 12 when this label rendered at 14pt).
        const cX0 = countryLabel.x - cWidth / 2;
        const cX1 = cX0 + cWidth;
        const cY0 = countryLabel.y - 10;
        const cY1 = countryLabel.y + (countryLabel.lines.length - 1) * LABEL_LINE_HEIGHT + 3;
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
      // sweep, seeded with the country + dot labels (always shown).
      // Anchors populate `neighborLabels` even at 1× (water arrays are
      // still empty until clip < PLACES_APPEAR_CLIP), so the loop runs
      // at every zoom. Priority ladder:
      //   dotLabel ≻ countryLabel ≻ anchor neighbours ≻ non-anchor
      //   neighbours ≻ waters
      // Within each tier, input order is area-DESC (centroid arrays in
      // shared.ts are pre-sorted), so the larger / more visually dominant
      // member of a collision survives. Inside waters the input order
      // (lakes → rivers → seas) acts as sub-priority. N² on ≤ ~100 rects
      // stays sub-ms on the JS thread.
      let keptNeighbours = neighborLabels;
      let keptWaters = waterLabels;
      if (neighborLabels.length > 0 || waterLabels.length > 0) {
        const lfont = labelFontRef.current;
        const cfont = countryFontRef.current;
        const sfont = subFontRef.current;
        const nfont = neighborFontRef.current;
        const wfont = waterFontRef.current;
        const occupied: { x0: number; y0: number; x1: number; y1: number }[] = [];
        // Label spacing widens at ambient zoom and tightens as the reader
        // zooms in. A generous gap thins crowded continents (Europe is the
        // densest cluster on the globe) at 1×, while 3× framings — where the
        // reader has opted into detail — pack tighter so the atlas fills in.
        // Linear 2px @ PLACES_FULL_CLIP (10°) → 7px @ PLACES_APPEAR_CLIP (25°),
        // clamped, so big-country 1× clips (up to 70°) also get the wide gap.
        const pad =
          2 +
          5 *
            Math.min(
              1,
              Math.max(0, (clipAngle - PLACES_FULL_CLIP) / (PLACES_APPEAR_CLIP - PLACES_FULL_CLIP)),
            );
        if (countryLabel) {
          const w = measureLines(countryLabel.lines, cfont, 6);
          occupied.push({
            x0: countryLabel.x - w / 2 - pad,
            x1: countryLabel.x + w / 2 + pad,
            y0: countryLabel.y - 10,
            y1: countryLabel.y + (countryLabel.lines.length - 1) * LABEL_LINE_HEIGHT + 3,
          });
        }
        if (dotLabel) {
          const dw = lfont ? lfont.measureText(dotLabel.text).width : dotLabel.text.length * 7;
          const sw = dotLabel.sub
            ? sfont
              ? sfont.measureText(dotLabel.sub).width
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
          const w = measureLines(n.lines, nfont, 5);
          // Wrapped labels center vertically on n.y — the first baseline
          // shifts up half the extra stack height, so the AABB here must
          // track what the render side draws.
          const firstY = n.y - ((n.lines.length - 1) * NEIGHBOR_LINE_HEIGHT) / 2;
          const x0 = n.x - w / 2 - pad;
          const x1 = n.x + w / 2 + pad;
          const y0 = firstY - 10 - pad;
          const y1 = firstY + (n.lines.length - 1) * NEIGHBOR_LINE_HEIGHT + 3 + pad;
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
          const tw = wfont ? wfont.measureText(w.name).width : w.name.length * 5;
          // River labels render 7px above their coord (see render side),
          // everything else at its coord.
          const yc = w.kind === 'river' ? w.y - 7 : w.y;
          const x0 = w.x - tw / 2 - pad;
          const x1 = w.x + tw / 2 + pad;
          const y0 = yc - 10 - pad;
          const y1 = yc + 3 + pad;
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
        qiblaPath: hasQibla ? qiblaBuilder.build() : null,
        sourceArcs: hasSourceArcs ? sourceArcsBuilder.build() : null,
        arcOpacity,
        northPole,
        southPole,
        dot,
        ghostDots,
        dotLabel,
        countryLabel,
        makkah,
        subsolar,
        hotspotGlows,
        chokepoints: chokepointMarks,
        gdacsMarks,
        conflictMarks,
        neighborLabels: keptNeighbours,
        waterLabels: keptWaters,
        riversPath,
        riversOpacity,
        cityLightsNightPath: cityRes.hasNight ? cityNightBuilder.build() : null,
        cityLightsTwilightPath: cityRes.hasTwilight ? cityTwilightBuilder.build() : null,
        cityTwilightOpacity: labelOpacity,
      });
    },
    [],
  );

  // Throttle reprojection to 32ms (~30fps), skip throttle on first call.
  // 16ms overwhelms the JS thread (d3-geo projection + setState can't complete in one frame).
  const lastTimeRef = useSharedValue(0);
  const hasFired = useSharedValue(false);
  // No-op coalescing — last derived inputs handed to scheduleOnRN. The reaction
  // tick still fires every 32ms while withTiming animations ease, but if the
  // resulting (lng, lat, frac, oA, oG) round to the same values as last
  // frame, skip the JS hop + d3-geo reproject + setState entirely. Epsilons
  // chosen so any change that would move a pixel or shift a sub-degree of
  // rotation still passes through.
  const lastReactSy = useSharedValue(Number.NaN);
  const lastReactLng = useSharedValue(Number.NaN);
  const lastReactLat = useSharedValue(Number.NaN);
  const lastReactFrac = useSharedValue(Number.NaN);
  const lastReactOA = useSharedValue(Number.NaN);
  const lastReactOG = useSharedValue(Number.NaN);
  const lastReactSettled = useSharedValue(-1);

  useAnimatedReaction(
    () => ({
      sy: scrollY.value,
      oA: overrideActive.value,
      oG: overrideAngle.value,
      len: coordsSV.value.length,
    }),
    ({ sy, oA, oG, len }) => {
      if (len === 0) return;

      const now = performance.now();
      if (hasFired.value && now - lastTimeRef.value < 32) return;
      hasFired.value = true;
      lastTimeRef.value = now;

      const coords = coordsSV.value;
      const articleCount = len / 2;
      const rawIndex = Math.max(0, sy / itemHeight);
      const lo = Math.min(Math.floor(rawIndex), articleCount - 1);
      const hi = Math.min(lo + 1, articleCount - 1);
      // Clamp: `lo` is capped at the last article but rawIndex is not, so
      // bottom rubber-band overscroll would push frac past 1 — and the
      // smoothstep fades downstream extrapolate to negative opacity there.
      const frac = Math.min(1, rawIndex - lo);

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

      // No-op short-circuit — bail when nothing meaningful changed since the
      // last frame. Skipping when sy is stable handles the steady-state
      // post-swipe case; checking lng/lat/frac/oA/oG handles the case where
      // a withTiming animation has settled at its target but the reaction
      // ticker is still firing. settledIndex change always passes through
      // (drives country highlight + label swap).
      if (
        settled === lastReactSettled.value &&
        Math.abs(sy - lastReactSy.value) < 0.5 &&
        Math.abs(lng - lastReactLng.value) < 0.01 &&
        Math.abs(lat - lastReactLat.value) < 0.01 &&
        Math.abs(frac - lastReactFrac.value) < 1e-3 &&
        Math.abs(oA - lastReactOA.value) < 1e-4 &&
        Math.abs(oG - lastReactOG.value) < 0.01
      ) {
        return;
      }
      lastReactSy.value = sy;
      lastReactLng.value = lng;
      lastReactLat.value = lat;
      lastReactFrac.value = frac;
      lastReactOA.value = oA;
      lastReactOG.value = oG;
      lastReactSettled.value = settled;

      scheduleOnRN(callReproject, lng, lat, settled, lo, hi, frac, oA, oG);
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
  //
  // The settle finalizer runs from a JS-side timer, NOT a withTiming
  // completion callback: with reanimated 4.5.0 / worklets 0.10.0,
  // `scheduleOnRN` from an animation-completion worklet SIGABRTs the app
  // (JSI `isObject()` assert in libworklets on mqt_v_js) — reproduced on
  // every zoom tap on the Android dev build, 2026-07-04. Every other
  // scheduleOnRN in the app runs from gesture/reaction worklets and is
  // fine. withTiming is wall-clock–based, so a timeout at duration plus
  // one frame of slack lands after the animation deterministically; the
  // effect cleanup mirrors the old `finished` guard by cancelling the
  // finalize of an interrupted (re-targeted) zoom.
  useEffect(() => {
    const prev = prevOverrideRef.current;
    prevOverrideRef.current = zoomClipOverride;
    // Reduce Motion: land on the target immediately instead of easing the
    // camera across. The zoom is a discrete, tap-triggered transition, so a
    // cut is the accessible equivalent — the destination framing is identical.
    const duration = reduceMotion ? 0 : ZOOM_DURATION;
    const opts = { duration, easing: ZOOM_EASING };
    if (zoomClipOverride === null) {
      overrideActive.value = withTiming(0, opts);
    } else if (prev === null) {
      overrideAngle.value = zoomClipOverride;
      overrideActive.value = withTiming(1, opts);
    } else {
      overrideAngle.value = withTiming(zoomClipOverride, opts);
    }
    const timer = setTimeout(finalizeReproject, duration + 50);
    return () => clearTimeout(timer);
  }, [zoomClipOverride, overrideActive, overrideAngle, finalizeReproject, reduceMotion]);

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
      // Stroked-ring pulse (vs. the prior blurred fill) shows much less ink
      // per pixel — peak opacity bumped from 0.35 to 0.6 so the ring reads
      // as a deliberate selection cartouche rather than a faint hairline.
      pulseOpacity.value = 0.6;
      // Reduce Motion: keep the ring — it is the only confirmation that the
      // tap registered on a pointerEvents:none canvas — but draw it at its
      // final radius and cross-fade it out instead of expanding it. Fading
      // is the sanctioned substitute for scaling motion.
      pulseR.value = reduceMotion ? 34 : 5;
      if (!reduceMotion) {
        pulseR.value = withTiming(34, { duration: 400, easing: PULSE_EASING });
      }
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

      // Collect every marker tier hit within its calibrated tap zone, then
      // decide: 0 hits → fall through to country-mass fallback; 1 hit →
      // return it directly (current behaviour); 2+ hits → return a
      // candidates list so the parent can show a disambiguation chooser.
      // Tier order here is the priority used when only a single hit
      // resolves and (more importantly) the order in which candidates
      // appear in the chooser.
      const candidates: TapResult[] = [];

      // Hotspot glows — tight hit area (r²=900) signals precise intent.
      for (const z of state.hotspotGlows) {
        if (isNear(x, y, z.x, z.y, 900)) {
          const name = z.countryName ?? '';
          const tz = name ? COUNTRY_TZ[name] : undefined;
          candidates.push({
            countryName: name,
            location: null,
            localTime: tz ? formatLocalTime(tz) : null,
            data: name ? (COUNTRY_DATA[name] ?? null) : null,
            hotspotLabels: z.labels.length > 0 ? z.labels : undefined,
            isHotspot: true,
          });
        }
      }

      // Chokepoint rings — ambient markers. 36px tap zone, generous so small
      // rings are still reliably tappable, but smaller than the article-dot
      // window so chokepoints near the settled pin don't eat its taps.
      for (const c of state.chokepoints) {
        if (isNear(x, y, c.x, c.y, 1296)) {
          candidates.push({
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            chokepointId: c.id,
          });
        }
      }

      // GDACS disaster markers — 36px tap zone across all three tiers,
      // matching the chokepoint pattern. The previous tighter 20px zone
      // for Green-tier compensated for an invisible-feeling 2px ambient
      // dot; with the unified 22px glyph the visual now matches the
      // tap target across severity levels.
      for (const m of state.gdacsMarks) {
        if (isNear(x, y, m.x, m.y, 1296)) {
          candidates.push({
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            gdacsEventId: m.eventid,
          });
        }
      }

      // Conflict-event markers — same 36px tap zone. Conflict density in a
      // theatre like Sudan or Gaza will produce overlapping hits regularly;
      // those resolve to the disambiguation chooser via the candidates path.
      for (const m of state.conflictMarks) {
        if (isNear(x, y, m.x, m.y, 1296)) {
          candidates.push({
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            conflictEventId: m.id,
          });
        }
      }

      // Article dot — wider catch zone.
      const dot = state.dot;
      if (dot && isNear(x, y, dot.x, dot.y, 3600)) {
        const geoData = articleGeoRef.current[lastSettled.current];
        if (geoData?.countryName) {
          const tz = COUNTRY_TZ[geoData.countryName];
          candidates.push({
            countryName: geoData.countryName,
            location: displayLocation(geoData.location) ?? geoData.location,
            localTime: tz ? formatLocalTime(tz) : null,
            data: COUNTRY_DATA[geoData.countryName] ?? null,
            hotspotLabels: storiesFor(geoData.countryName),
          });
        }
      }

      // Makkah pin.
      if (state.makkah && isNear(x, y, state.makkah.x, state.makkah.y, 3600)) {
        candidates.push({
          countryName: 'Saudi Arabia',
          location: MAKKAH.name,
          localTime: formatLocalTime('Asia/Riyadh'),
          data: COUNTRY_DATA['Saudi Arabia'] ?? null,
          hotspotLabels: storiesFor('Saudi Arabia'),
        });
      }

      if (candidates.length === 1) return candidates[0] ?? null;
      if (candidates.length > 1) {
        return {
          countryName: '',
          location: null,
          localTime: null,
          data: null,
          candidates,
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
    return Skia.Path.Circle(moonPos.x, moonPos.y, moonR);
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

    // Three tints — mostly neutral (accent), a pinch of cool (atmosphere) and warm (dome).
    // AA explicit: imperative Skia.Paint() defaults antialias *off* (declarative
    // primitives default it on). Without it, sub-pixel stars (r=0.2..1.6) render
    // as aliased blocks instead of soft pinpricks.
    const neutral = Skia.Paint();
    neutral.setColor(Skia.Color(colors.accent));
    neutral.setAntiAlias(true);
    const cool = Skia.Paint();
    cool.setColor(Skia.Color(colors.atmosphere));
    cool.setAntiAlias(true);
    const warm = Skia.Paint();
    warm.setColor(Skia.Color(colors.dome));
    warm.setAntiAlias(true);

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

  // Day-side ocean specular highlight stops. Soft additive lift centered on
  // the projected subsolar point — reads as the sun glint a real lit sphere
  // shows from orbit. WHITE is the right primitive here: the phenomenon is
  // brighter-than-ambient in *both* modes, and the bg-inverting text/bg
  // tokens reverse polarity in light mode (would draw a dark spot). Light
  // mode runs at lower alpha because the cream ocean tone leaves less
  // contrast headroom; the highlight is still perceptible as a subtle
  // warming of the disk near the sun.
  const specularColors = useMemo(
    () => [`${WHITE}${light ? '14' : '24'}`, `${WHITE}${light ? '08' : '10'}`, `${WHITE}00`],
    [light],
  );

  // Inner-limb atmospheric glaze. The outer rim renders atmosphere *outside*
  // the disk; this complementary inner ring catches grazing-angle refraction
  // along the curved limb so the disk reads as a sphere with volume rather
  // than a flat circle with a halo. Stops cluster at 92–99% of the radius:
  // transparent core, brightest just inside the limb, fading to zero at the
  // edge so it composites cleanly against the outer rim. Single declarative
  // gradient — no per-frame work.
  const limbGlazeColors = useMemo(() => {
    const atm = colors.atmosphere;
    return [
      `${atm}00`,
      `${atm}00`,
      `${atm}${light ? '20' : '18'}`,
      `${atm}${light ? '38' : '28'}`,
      `${atm}00`,
    ];
  }, [colors.atmosphere, light]);

  // Per-glow Atlas inputs. Single-instance glows pass a one-element array.
  const ghostAtlas = useMemo(() => glowAtlas(GHOST_GLOW, state.ghostDots), [state.ghostDots]);
  // Conflict markers ride the SAME baked texture as ghost dots, just
  // with per-instance alpha encoded into the colors array. One Skia
  // draw call regardless of marker count, no separate texture bake.
  const conflictGlowAtlas = useMemo(
    () => conflictAtlas(GHOST_GLOW, state.conflictMarks),
    [state.conflictMarks],
  );
  const dotAtlas = useMemo(() => glowAtlas(DOT_GLOW, state.dot ? [state.dot] : []), [state.dot]);
  const makkahAtlas = useMemo(
    () => glowAtlas(MAKKAH_GLOW, state.makkah ? [state.makkah] : []),
    [state.makkah],
  );

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
          Single declarative draw, no per-frame cost.
          `dither` on this and every other low-alpha atmosphere gradient
          (ocean disk, specular, limb glaze, hotspot halos, chokepoint
          glow): these ramps span only a few 8-bit steps over the near-
          black dark-mode bg, which quantizes into visible concentric
          bands. Dithering distributes the error — GPU-side, free. */}
      <Circle cx={cx} cy={cy} r={globeRadius * 1.25} dither>
        <RadialGradient
          c={vec(cx, cy)}
          r={globeRadius * 1.25}
          colors={rimColors}
          positions={[0, 0.78, 0.84, 0.93, 1]}
        />
      </Circle>

      {/* Ocean disk — subtle Fresnel gradient reads as a 3D sphere instead of a flat circle */}
      <Circle cx={cx} cy={cy} r={globeRadius} dither>
        <RadialGradient c={vec(cx, cy)} r={globeRadius} colors={oceanColors} positions={[0, 1]} />
      </Circle>

      {/* Subsolar specular highlight — additive WHITE radial gradient at the
          projected sun-overhead point. Land draws on top, so the spot is
          only visible where it falls on water (which is the physically
          correct behaviour: ocean reflects, land doesn't). Hidden when the
          subsolar point is on the far side of the globe. Radius scales with
          the globe so the spot reads at the same proportion across screen
          sizes. Single Skia draw, no per-frame allocation. */}
      {state.subsolar && (
        <Circle cx={state.subsolar.x} cy={state.subsolar.y} r={globeRadius * 0.55} dither>
          <RadialGradient
            c={vec(state.subsolar.x, state.subsolar.y)}
            r={globeRadius * 0.55}
            colors={specularColors}
            positions={[0, 0.45, 1]}
          />
        </Circle>
      )}

      {/* Land silhouette — a faint fill for body plus a crisp coastline edge
          for definition. The edge (not a brighter fill) is what lifts the map
          out of the "faded" register: a defined outline reads as cartography
          and matches the line-led typographic brand, where a louder fill would
          just smear. Drawn in `text` (brighter than the `accent` interior
          borders below) so the coast > borders hierarchy reads. Reuses the
          already-projected `landPath`, so it's one extra GPU-batched stroke. */}
      {state.landPath && (
        <Path path={state.landPath} color={colors.accent} opacity={light ? 0.32 : 0.1} />
      )}
      {state.landPath && (
        <Path
          path={state.landPath}
          color={colors.text}
          style="stroke"
          strokeWidth={0.6}
          strokeJoin="round"
          // Light mode leans harder on the coastline: cream ocean vs the gentle
          // `accent` land fill is a low-contrast pair, so the crisp `text` edge
          // is what actually carries figure-ground there (dark mode already has
          // the near-black ocean doing that work). Stays "definition over
          // brightness" — a sharper line, not a louder fill.
          opacity={light ? 0.5 : 0.3}
        />
      )}

      {/* Permanent ice sheets — Antarctica + Greenland. Scientifically the two
          land masses covered in year-round ice; rendered as a bright fill over
          `landPath` so the globe reads climatologically correct. Opacity kept
          modest so Greenland doesn't punch through the article backdrop.
          Ice is the one globe layer whose semantic color shouldn't flip with
          mode — snow is white in both. `colors.text` flips polarity (light
          on dark / dark on light), so reusing it here painted Greenland and
          Antarctica *darker* than the surrounding land in light mode (alpha-
          composited ~#9A over ~#CE land — climatologically inverted). Hard-
          coding white in light mode keeps ice brighter than land in both. */}
      {state.icePath && (
        <Path
          path={state.icePath}
          color={light ? WHITE : colors.text}
          opacity={light ? 0.32 : 0.16}
        />
      )}

      {/* Neighbouring country borders — visible when scroll is at rest */}
      {state.bordersPath && (
        <Path
          path={state.bordersPath}
          color={colors.accent}
          style="stroke"
          strokeWidth={0.7}
          strokeJoin="round"
          opacity={0.3}
        />
      )}

      {/* Equator + polar circles */}
      {state.graticulePath && (
        <Path
          path={state.graticulePath}
          color={colors.accent}
          style="stroke"
          strokeWidth={0.5}
          opacity={light ? 0.15 : 0.08}
        />
      )}

      {/* Low-sun band — faint gradient where sun is near the horizon (0–6°
          below). Dark-mode bump mirrors the night-shadow rationale below:
          BLACK at 0.06 over the dark-mode ocean composite (~rgb(16,17,20))
          is only a ~1 unit per-channel step — invisible — so the dawn/dusk
          annulus disappeared and the day/night seam read as a hard edge.
          0.12 lifts it to ~2 units (perceptible) while staying well under
          the 0.28 night opacity so the ladder twilight < night still reads.
          Light mode at 0.06 already gives ~15 units against the cream bg
          — leave it. */}
      {state.twilightPath && (
        <Path path={state.twilightPath} color={BLACK} opacity={light ? 0.06 : 0.12} />
      )}

      {/* Night shadow — darker overlay on the unlit hemisphere.
          Dark mode needs a heavier hand: dark-mode ocean composites to
          ~rgb(16,17,20), so BLACK at 0.15 produced only a 2–3 unit per-
          channel step — below perceptual threshold, leaving day and night
          visually identical on water. 0.20 lifts the differential to ~4
          units (readable) without driving the unlit hemisphere to near-
          black — at 0.28 the night side swallowed the land/coastline detail,
          reading as a dead zone. The terminator stroke + twilight band still
          carry the seam, so the softer fill loses no day/night legibility.
          Light mode already had ~36 units of contrast at 0.15 — leave it. */}
      {state.nightPath && (
        <Path path={state.nightPath} color={BLACK} opacity={light ? 0.15 : 0.2} />
      )}

      {/* Terminator — thin stroke at the day/night boundary */}
      {state.nightPath && (
        <Path
          path={state.nightPath}
          color={colors.atmosphere}
          style="stroke"
          strokeWidth={0.7}
          opacity={0.12}
        />
      )}

      {/* Night-side city lights — drawn AFTER the night veil so the dim of
          the unlit hemisphere darkens land but not the lights themselves.
          Two tiers: civil-twilight cities sit at half opacity for a soft
          gradient across the terminator, deep-night cities render brighter.
          `textEmphasis` inverts with mode (white-on-dark vs dark-on-light)
          so the dots have contrast against the night-side land tint in
          both palettes — a single hardcoded white would vanish on the
          light-mode cream-and-gray composite. The story dot still owns the
          night side visually: city pinpricks are 0.9-px hard pixels with
          no glow, while the editorial dot is a multi-layer baked Atlas
          glow at ~14 px — different visual register entirely. */}
      {state.cityLightsTwilightPath && (
        <Path
          path={state.cityLightsTwilightPath}
          color={colors.textEmphasis}
          opacity={(light ? 0.22 : 0.32) * state.cityTwilightOpacity}
        />
      )}
      {state.cityLightsNightPath && (
        <Path
          path={state.cityLightsNightPath}
          color={colors.textEmphasis}
          opacity={light ? 0.42 : 0.6}
        />
      )}

      {/* Inner-limb atmospheric glaze — companion to the outer rim. Reads
          as the slice of atmosphere refracting light around the curved
          limb (the "Earthrise" wisp). Stops sit in the last 8% of the
          radius, brightest just inside the edge, fading to zero at the
          silhouette so it composites cleanly against the outer-rim halo
          without a doubled-line seam. Drawn AFTER the night veil so
          atmosphere reads as a continuous wrap across both hemispheres
          and BEFORE editorial markers so dots and labels paint on top. */}
      <Circle cx={cx} cy={cy} r={globeRadius} dither>
        <RadialGradient
          c={vec(cx, cy)}
          r={globeRadius}
          colors={limbGlazeColors}
          positions={[0, 0.9, 0.97, 0.995, 1]}
        />
      </Circle>

      {/* Coverage hotspots — RadialGradient halo + sharp core dot.
          Gradient shader gives smoother falloff than stacked BlurMask circles
          and skips the blur pass entirely. Recency fades older hotspots:
          fresh stories are prominent, stale ones whisper. Opacities lifted
          (core 0.42→0.6, halo peak/mid roughly doubled, recency floor
          0.3→0.45) so coverage clusters — where the news is concentrated —
          actually read as warmth on the globe instead of staying subliminal.
          Stays monochrome (`colors.text`); the diffuse blurred halo reads as a
          different texture from the sharp editorial story dot, so the dot
          remains the brightest, most-focal point. */}
      {state.hotspotGlows.map((z) => {
        const fade = 0.45 + 0.55 * z.recency;
        const haloR = 18 + z.intensity * 16;
        const peak = withAlpha(colors.text, (0.18 + z.intensity * 0.18) * fade);
        const mid = withAlpha(colors.text, (0.08 + z.intensity * 0.1) * fade);
        const edge = withAlpha(colors.text, 0);
        const coreR = 0.9 + z.intensity * 0.7;
        // Key by lat,lng so reconciliation stays stable across heatmap
        // refetches (top-12 list reorders frequently — index keys would
        // reuse Group children for unrelated hotspots).
        return (
          <Group key={`${z.lat.toFixed(2)},${z.lng.toFixed(2)}`}>
            <Circle cx={z.x} cy={z.y} r={haloR} dither>
              <RadialGradient
                c={vec(z.x, z.y)}
                r={haloR}
                colors={[peak, mid, edge]}
                positions={[0, 0.35, 1]}
              />
            </Circle>
            <Circle cx={z.x} cy={z.y} r={coreR} color={colors.text} opacity={0.6 * fade} />
          </Group>
        );
      })}

      {/* Chokepoint glyphs — strait pictogram (two facing coastline arcs +
          center mark) so the marker reads semantically as a narrow water
          passage rather than as an anonymous ring. Same family as the
          disaster glyphs — 22pt box, stroked, transformed into position.
          Quiet when transit flow is near baseline, accent-tinted when
          disrupted (±>15% from 90d average). Label is always drawn. */}
      {state.chokepoints.map((c) => {
        const glyphOpacity = 0.35 + 0.45 * c.intensity;
        const glyphColor = c.disrupted ? colors.accent : colors.rule;
        // Label centering uses measureText when the font has loaded;
        // before that we fall back to a char-count approximation so the
        // first frame doesn't misplace the text.
        const labelTx = waterFont
          ? c.x - waterFont.measureText(c.label).width / 2
          : c.x - c.label.length * 2.5;
        const labelTy = c.y + 20;
        return (
          <Group key={c.id}>
            {c.disrupted && (
              <Circle cx={c.x} cy={c.y} r={12} dither>
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
            <Path
              path={CHOKEPOINT_PATH}
              color={glyphColor}
              style="stroke"
              strokeWidth={1.0}
              strokeJoin="round"
              strokeCap="round"
              opacity={glyphOpacity}
              transform={[{ translateX: c.x - GLYPH_HALF }, { translateY: c.y - GLYPH_HALF }]}
            />
            <HaloLabel
              x={labelTx}
              y={labelTy}
              text={c.label}
              font={waterFont}
              // Baseline ink is body `text`, not `textSecondary`: chokepoint
              // labels are steady-state text visible at every zoom, and
              // textSecondary at whisper opacity bottomed out at 1.8–2.8:1
              // against the night-side ocean composite (WCAG 2.2 AA needs
              // 4.5:1 at this size; audit 2026-07-04). text at 0.55 dark /
              // 0.7 light clears AA on all ocean surfaces while the
              // quiet-vs-disrupted hierarchy still reads through the accent
              // ink, glow ring, and stronger halo of the disrupted state.
              color={c.disrupted ? colors.accent : colors.text}
              haloColor={colors.bg}
              opacity={c.disrupted ? 0.9 : light ? 0.7 : 0.55}
              haloOpacity={
                c.disrupted
                  ? light
                    ? LABEL_HALO_OPACITY_LIGHT_STRONG
                    : LABEL_HALO_OPACITY_DARK_STRONG
                  : light
                    ? LABEL_HALO_OPACITY_LIGHT
                    : LABEL_HALO_OPACITY_DARK
              }
            />
          </Group>
        );
      })}

      {/* GDACS disaster markers — three tiers. Green is the ambient pulse:
          a tiny tinted dot (no glyph, no backdrop, tight tap zone) — many
          appear, none shouts. Orange and Red are read-and-tap landmarks:
          backdrop disc + stroked event-type glyph at chokepoint-tier
          weight (no glow, so the editorial story dot stays dominant).
          Recency fades all tiers; anything past 30 days is dropped at the
          data layer. Render order is Green → Orange → Red (set upstream
          in enrichedGdacs) so consequential markers always paint over
          ambient ones. Keys by eventid for stable reconciliation across
          feed refetches. */}
      {state.gdacsMarks.map((m) => {
        // Monochrome disaster glyphs — severity expressed through stroke
        // weight, opacity, and (high-tier only) an outer alarm ring.
        // Foundation rule "color carries meaning only" applied strictly:
        // the editorial story dot, focused-country highlight, Makkah
        // dome, and night terminator already do all the semantic
        // colour-lifting on the globe; piling three alert hues on top
        // would chase its own monochrome restraint and force the reader
        // to disambiguate by hue. Severity now reads from glyph weight
        // alone — low/medium/high are visually distinct without any
        // chromatic vocabulary, and the high-tier ring is the universal
        // "this is the consequential one" mark. Sheet UIs (CountrySheet,
        // DisasterSheet, DisambiguationSheet) keep the tinted chips —
        // flat chrome on a sheet bg is a different semantic context
        // where colour coding doesn't compete with editorial layers.
        const isHigh = m.alertlevel === 'Red';
        const isLow = m.alertlevel === 'Green';
        const strokeWidth = isHigh ? 1.8 : isLow ? 1.0 : 1.4;
        const strokeOpacity = (isHigh ? 0.95 : isLow ? 0.45 : 0.75) * m.recencyAlpha;
        const tx = m.x - GLYPH_HALF;
        const ty = m.y - GLYPH_HALF;
        return (
          <Group key={`gdacs-${m.eventid}`} transform={[{ translateX: tx }, { translateY: ty }]}>
            {isHigh && (
              <Circle
                cx={GLYPH_HALF}
                cy={GLYPH_HALF}
                r={GLYPH_HALF + 2.5}
                color={colors.text}
                style="stroke"
                strokeWidth={1}
                opacity={0.55 * m.recencyAlpha}
              />
            )}
            <Path
              path={getGlyphPath(m.eventtype)}
              color={colors.text}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeJoin="round"
              strokeCap="round"
              opacity={strokeOpacity}
            />
          </Group>
        );
      })}

      {/* Conflict-event markers — ghost-dot glow family, batched. Same
          baked texture as the neighbour-article pins (no separate bake;
          shared `ghostTexture` above), stamped at every event location
          via a single <Atlas/> call. The kinetic/unrest distinction
          stays in the data and shows up in ConflictSheet's eyebrow +
          DisambiguationSheet's row icon, where pictograms earn their
          place. The globe just gets quiet dots so the layer reads as
          ambient context rather than its own pictogram vocabulary. One
          Skia draw call regardless of marker count — the perf cost is
          the same whether the layer shows 5 events or 200. Per-instance
          recency fade rides the `colors` array (white × recencyAlpha,
          modulate blend — see conflictAtlas() for why the explicit
          blend mode is required), so older events whisper relative to
          fresh ones whenever the data window spans multiple days. */}
      {conflictGlowAtlas && (
        <Atlas
          image={ghostTexture}
          sprites={conflictGlowAtlas.sprites}
          transforms={conflictGlowAtlas.transforms}
          colors={conflictGlowAtlas.colors}
          colorBlendMode="modulate"
        />
      )}

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
            strokeJoin="round"
            strokeCap="round"
            opacity={(light ? 0.8 : 0.65) * state.riversOpacity}
          />
          <Path
            path={state.riversPath}
            color={colors.textEmphasis}
            style="stroke"
            strokeWidth={1.2}
            strokeJoin="round"
            strokeCap="round"
            opacity={(light ? 0.85 : 0.55) * state.riversOpacity}
          />
        </>
      )}

      {/* Source arcs — information flow lines from source HQs to story
          location. Dashed (long-short cadence) so the arcs read as movement /
          flow rather than as solid borders — same color family as
          bordersPath, but a different visual rhythm so the reader's eye
          doesn't conflate "where info came from" with "country boundary".
          Distinct cadence from the qibla arc (3-3) which uses an even
          contemplative rhythm. Single GPU pass per frame. */}
      {state.sourceArcs && (
        <Path
          path={state.sourceArcs}
          color={colors.accent}
          style="stroke"
          strokeWidth={0.5}
          opacity={(light ? 0.25 : 0.15) * state.arcOpacity}
        >
          <DashPathEffect intervals={[6, 3]} />
        </Path>
      )}

      {/* Qibla arc — great circle toward Makkah. Dashed so it reads as a
          direction/intention rather than as a fact line — same monochrome
          tone, different cadence from sourceArcs and bordersPath, which are
          both solid strokes in the same color family. Path effects are GPU-
          applied at draw time, no JS cost.
          Visibility tuning: dashing halves the visible ink, so the prior
          0.2/0.12 opacities (set when the arc was solid) made the dashed
          version vanish. Compensated three ways:
            • opacity ~1.7× (light 0.34, dark 0.2) — restores the perceived
              ink density of the original solid arc
            • intervals [4, 2] not [3, 3] — denser cadence, ~67% on instead
              of 50%, still unambiguously dashed
            • strokeWidth 1.2 + strokeCap round — round caps add ~1px of ink
              per dash end so each segment reads as a deliberate token
              instead of a thin sliver. */}
      {state.qiblaPath && (
        <Path
          path={state.qiblaPath}
          color={colors.dome}
          style="stroke"
          strokeWidth={1.2}
          strokeCap="round"
          opacity={(light ? 0.34 : 0.2) * state.arcOpacity}
        >
          <DashPathEffect intervals={[4, 2]} />
        </Path>
      )}

      {/* Makkah — golden qibla reference point, baked Atlas. */}
      {makkahAtlas && (
        <Atlas
          image={makkahTexture}
          sprites={makkahAtlas.sprites}
          transforms={makkahAtlas.transforms}
        />
      )}

      {/* Ghost dots — adjacent articles in the scroll, rendered under the
          main dot so the settled story always reads brightest. Drawn as a
          single Atlas call against a baked glow texture (one draw + N
          transforms instead of N × 3 Circle+BlurMask draws). */}
      {ghostAtlas && (
        <Atlas
          image={ghostTexture}
          sprites={ghostAtlas.sprites}
          transforms={ghostAtlas.transforms}
        />
      )}

      {/* Story dot — single Atlas draw against the baked dot texture. */}
      {dotAtlas && (
        <Atlas image={dotTexture} sprites={dotAtlas.sprites} transforms={dotAtlas.transforms} />
      )}

      {/* Tap pulse — stroked ring (selection cartouche) rather than a blurred
          fill. The globe's vocabulary is *rings* (chokepoint arcs, earthquake
          glyphs, hotspot halos, GDACS Red alarm ring); a soft-blur ripple
          read as generic mobile-UI chrome borrowed from any other app. The
          stroke now belongs to the same drawing family as everything else
          on the canvas, so the gesture confirmation feels diegetic. No
          BlurMask = one less filter pass per tap. */}
      <Circle
        cx={pulseX}
        cy={pulseY}
        r={pulseR}
        color={colors.textEmphasis}
        opacity={pulseOpacity}
        style="stroke"
        strokeWidth={1.4}
      />

      {/* Water-feature labels — named lakes (major only), major rivers,
          seas/bays/gulfs. Italic per atlas convention (hydrography). Drawn
          lightest of the three label tiers so the visual hierarchy reads:
          focused country > neighbours > waters.
          Halo deliberately removed: stroked-text rasterization dominated
          the settled-frame budget (path widening + stroke pass per
          glyph × ~50 labels). textSecondary at high opacity reads
          cleanly against bg and the 20% land tint; river strokes only
          cross labels briefly and the collision packer already keeps
          labels off the densest overlaps. */}
      {waterFont &&
        state.waterLabels.map((w, i) => {
          const tx = w.x - waterFont.measureText(w.name).width / 2;
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
              font={waterFont}
              // Light mode borrows the body-text ink at reduced opacity
              // instead of `textSecondary` at full: #666-on-cream sitting
              // over the pale land tint washed out to near-invisible.
              // 0.92 is the WCAG floor for this tier — the worst composite
              // (river label over night-side land) sits at 4.59:1 there,
              // clearing AA; the prior 0.78 bottomed out at 3.6:1. Still
              // below the neighbour multiplier (0.95 × text), so the
              // "lightest tier" rank survives alongside the italic-vs-
              // small-caps distinction. Dark mode is untouched.
              color={light ? colors.text : colors.textSecondary}
              opacity={(light ? 0.92 : 0.9) * w.opacity}
            />
          );
        })}

      {/* Neighbour country labels — emerge at 2x zoom, fade toward full
          opacity as zoom tightens. Small caps per atlas convention; one
          step smaller than the focused country so the hierarchy reads:
          highlighted country = primary, neighbours = secondary.
          Long names wrap to two lines (Google Maps convention, same
          balanced split as the focused label); the block centers
          vertically on the centroid and each line centers independently.
          Rendered BEFORE the highlighted country label so the focused
          country's name draws on top if they collide. Halo removed for
          the same perf reason as water labels; readability comes from
          the body-text color tone + a high tier-multiplier instead. */}
      {neighborFont &&
        state.neighborLabels.map((n) => {
          const firstY = n.y - ((n.lines.length - 1) * NEIGHBOR_LINE_HEIGHT) / 2;
          return (
            <Group key={n.name}>
              {n.lines.map((line, i) => (
                <SkiaText
                  key={`${n.name}-${i}`}
                  x={n.x - neighborFont.measureText(line).width / 2}
                  y={firstY + i * NEIGHBOR_LINE_HEIGHT}
                  text={line}
                  font={neighborFont}
                  // `text` (not `textSecondary`) — the muted gray was getting
                  // eaten by the land tint, especially in dark mode where #999
                  // sits within ~1px of the terrain shade. Body-text tone keeps
                  // the hierarchy intact (focused label still owns `textEmphasis`
                  // + halo) while making neighbours legible without re-adding
                  // the per-frame halo passes that the comment above warns off.
                  color={colors.text}
                  opacity={(light ? 0.95 : 0.92) * n.opacity}
                />
              ))}
            </Group>
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
        countryFont &&
        (() => {
          const cl = state.countryLabel;
          return cl.lines.map((line, i) => {
            const tx = cl.x - countryFont.measureText(line).width / 2;
            const ty = cl.y + i * LABEL_LINE_HEIGHT;
            return (
              <HaloLabel
                key={`country-${i}`}
                x={tx}
                y={ty}
                text={line}
                font={countryFont}
                color={colors.textEmphasis}
                haloColor={colors.bg}
                opacity={light ? 0.85 : 0.8}
                haloOpacity={light ? LABEL_HALO_OPACITY_LIGHT_SOFT : LABEL_HALO_OPACITY_DARK_SOFT}
              />
            );
          });
        })()}

      {/* Dot label — location · local time. Primary tier: the *location*
          where the news happened is the most important text on the globe,
          so it carries a halo and the heavier 14pt SemiBold weight while
          the country label below sits at the secondary 12pt tier. */}
      {state.dotLabel && labelFont && (
        <>
          <HaloLabel
            x={state.dotLabel.x + 6}
            y={state.dotLabel.y + 4}
            text={state.dotLabel.text}
            font={labelFont}
            color={colors.textEmphasis}
            haloColor={colors.bg}
            opacity={light ? 0.95 : 0.95}
            haloOpacity={light ? LABEL_HALO_OPACITY_LIGHT : LABEL_HALO_OPACITY_DARK}
          />
          {state.dotLabel.sub && subFont && (
            <HaloLabel
              x={state.dotLabel.x + 6}
              y={state.dotLabel.y + 18}
              text={state.dotLabel.sub}
              font={subFont}
              color={colors.textEmphasis}
              haloColor={colors.bg}
              opacity={light ? 0.7 : 0.75}
              haloOpacity={light ? LABEL_HALO_OPACITY_LIGHT_SOFT : LABEL_HALO_OPACITY_DARK_SOFT}
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
            opacity={light ? 0.25 : 0.2}
          />
          <Rect
            x={state.northPole.x - 0.4}
            y={state.northPole.y - 3}
            width={0.8}
            height={6}
            color={colors.accent}
            opacity={light ? 0.25 : 0.2}
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
            opacity={light ? 0.25 : 0.2}
          />
          <Rect
            x={state.southPole.x - 0.4}
            y={state.southPole.y - 3}
            width={0.8}
            height={6}
            color={colors.accent}
            opacity={light ? 0.25 : 0.2}
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
