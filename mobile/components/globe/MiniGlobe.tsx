import { COUNTRY_DATA, type CountryData } from '@shared/countries/country-data';
import { CITY_TZ, COUNTRY_TZ, SOURCE_COORDS } from '@shared/globe/coordinates';
import type { Article, Chokepoint, ConflictEvent, GdacsAlert, HeatmapPoint } from '@shared/types';
import {
  BlendMode,
  BlurMask,
  BlurStyle,
  Canvas,
  Circle,
  ColorMatrix,
  CubicSampling,
  FontEdging,
  FontHinting,
  Group,
  Image,
  LinearGradient,
  PaintStyle,
  Path,
  Picture,
  Rect,
  rect,
  type SkCanvas,
  type SkColor,
  type SkFont,
  type SkImage,
  Skia,
  type SkPaint,
  type SkPath,
  type SkPathBuilder,
  type SkPicture,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type Transforms3d,
  useFont,
  useImage,
  usePathValue,
  useTexture,
  vec,
} from '@shopify/react-native-skia';
import {
  type GeoProjection,
  geoContains,
  geoDistance,
  geoInterpolate,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet } from 'react-native';
import {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ANIMATION,
  BLACK,
  type ColorPalette,
  categoryMarkColor,
  WHITE,
} from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { articleTime } from '../../lib/article-utils';
import { eventAgeDays } from '../../lib/conflict';
import { alertAgeDays } from '../../lib/gdacs';
import { reachFor, swipeClip, viewAngleFor } from '../../lib/globe-camera';
import { coverageRanks } from '../../lib/now';
import {
  type FamineArea,
  famineAlpha,
  famineBlocks,
  type GenocideSituation,
  type ThermalEvent,
  thermalAlpha,
  thermalScale,
} from '../../lib/overlays';
import { displayCountryName, displayLocation, wrapCountryLabel } from '../../lib/place-names';
import {
  type FoundProgress,
  type StoryPlace,
  topUnfound,
  unfoundSlugs,
} from '../../lib/story-places';
import { chokepointValence } from '../../lib/valence';
import { type CapCuller, createCapCuller } from './cap-cull';
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
import { CHOKEPOINT_PATH, GLYPH_HALF, getGlyphPath, MARKET_PATH } from './disaster-glyphs';
import {
  FAMINE_FRAME_PATH,
  FAMINE_FRAME_STROKE,
  getFamineBlocksPath,
  THERMAL_CORE_PATH,
  THERMAL_RAY_STROKE,
  THERMAL_RAYS_PATH,
} from './overlay-glyphs';
import {
  ANCHOR_COUNTRY_AREA,
  ANCHOR_NAMES_EXTRA,
  ANTARCTIC_CIRCLE,
  ARCTIC_CIRCLE,
  clipAngleForCountry,
  DECAY_LAMBDA,
  findCountry,
  formatLocalTime,
  GRATICULE_LINES,
  getMoonPhase,
  getNightCircles,
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
  bordersMeshFull,
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
  landFull,
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

interface PlaceMark {
  /** Every story here is found: a quiet ring, not a beacon. */
  read: boolean;
  coords: [number, number];
  slug: string;
  color: string;
  rgb: readonly [number, number, number];
  scale: number;
  alpha: number;
  count: number;
  contested: boolean;
}

const EMPTY_FOUND: ReadonlySet<string> = new Set();

/** `#rrggbb` → 0–1 channels, for the Atlas colour channel. */
function hexRgb(hex: string): readonly [number, number, number] {
  const m = hex.replace('#', '');
  return [
    Number.parseInt(m.slice(0, 2), 16) / 255,
    Number.parseInt(m.slice(2, 4), 16) / 255,
    Number.parseInt(m.slice(4, 6), 16) / 255,
  ];
}

/** Atlas inputs for the story layer: one baked white sprite, per-instance
 *  scale, and the category hue × recency alpha in the colour channel.
 *  `RSXform`'s first component is scale·cos θ, so a uniform scale is free —
 *  and the translate has to be scaled with it or a shrunk sprite drifts off
 *  its own centre. `colorBlendMode="modulate"` is mandatory at the call site:
 *  Atlas's default colours blend is `dstOver`, which fills each sprite's
 *  transparent box with a solid square. */
function storyAtlas(size: number, src: ReturnType<typeof rect>, marks: GlobeState['storyMarks']) {
  if (marks.length === 0) return null;
  const center = size / 2;
  const sprites: ReturnType<typeof rect>[] = [];
  const transforms: ReturnType<typeof Skia.RSXform>[] = [];
  const colors: Float32Array[] = [];
  for (const m of marks) {
    sprites.push(src);
    transforms.push(Skia.RSXform(m.scale, 0, m.x - center * m.scale, m.y - center * m.scale));
    colors.push(Float32Array.of(m.rgb[0], m.rgb[1], m.rgb[2], m.alpha));
  }
  return { sprites, transforms, colors };
}

/** Atlas inputs for a hazard layer stamped from the baked sprite sheet: the
 *  cell per mark, a third of the baked size times the mark's own scale, and
 *  the layer's hue × the mark's alpha. Modulate blend, as for stories. */
function overlayAtlas(
  marks: readonly { x: number; y: number; alpha: number; scale: number }[],
  srcFor: (index: number) => ReturnType<typeof rect>,
  rgb: readonly [number, number, number],
) {
  if (marks.length === 0) return null;
  const half = OVERLAY_CELL / 2;
  const sprites: ReturnType<typeof rect>[] = [];
  const transforms: ReturnType<typeof Skia.RSXform>[] = [];
  const colors: Float32Array[] = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (!m) continue;
    const k = m.scale / OVERLAY_RES;
    sprites.push(srcFor(i));
    transforms.push(Skia.RSXform(k, 0, m.x - half * k, m.y - half * k));
    colors.push(Float32Array.of(rgb[0], rgb[1], rgb[2], m.alpha));
  }
  return { sprites, transforms, colors };
}

/** Atlas inputs for the conflict layer. Same pipeline as glowAtlas — the
 *  conflict layer reuses the ghost-pin baked texture, just at a different
 *  point set — plus a per-instance color carrying the recency fade.
 *  White at `recencyAlpha` multiplied into the sprite via
 *  `colorBlendMode="modulate"` scales the baked glow's alpha uniformly.
 *  The explicit modulate mode is load-bearing, not stylistic: Atlas's
 *  default colors blend is `dstOver`, which paints each color *behind*
 *  the sprite — filling its transparent bounding box with solid squares. */
function conflictAtlas(
  spec: GlowSpec,
  marks: { x: number; y: number; recencyAlpha: number }[],
  rgb: readonly [number, number, number],
) {
  if (marks.length === 0) return null;
  return {
    sprites: marks.map(() => spec.srcRect),
    transforms: marks.map((m) => Skia.RSXform(1, 0, m.x - spec.center, m.y - spec.center)),
    colors: marks.map((m) => Float32Array.of(rgb[0], rgb[1], rgb[2], m.recencyAlpha)),
  };
}

const skiaCtx = createSkiaPathContext();

// Label widths, by font. The labels are a fixed vocabulary — countries,
// straits, exchanges, water — but each measurement is a JSI call into Skia,
// and the frame loop's collision packer plus the render that follows it made
// about eighty of them per frame. Cleared for a font when its rendering flags
// change: subpixel positioning and hinting move advance widths.
const textWidths = new WeakMap<SkFont, Map<string, number>>();
function textWidth(font: SkFont, text: string): number {
  let widths = textWidths.get(font);
  if (!widths) {
    widths = new Map();
    textWidths.set(font, widths);
  }
  let w = widths.get(text);
  if (w === undefined) {
    w = font.measureText(text).width;
    widths.set(text, w);
  }
  return w;
}

const PULSE_EASING = Easing.out(Easing.cubic);
/** The found burst's length. The screen waits this long before flying the
 *  camera, so the burst plays where the mark was rather than being dragged. */
export const COLLECT_MS = 420;
/** The still-to-find ring: its distance outside the disc, and its weight. */
const RING_GAP = 6;
const RING_WIDTH = 2;
const COLLECT_REDUCED_MS = 150;

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

// Story beacons — the web's filled circle with a dark rim, over a soft halo in
// the same hue. Both are baked white and tinted per instance through the Atlas
// colour channel, so four categories still cost two draw calls. There is no
// screen-space dedupe any more: marks are places now, a place already merges
// its stories, and two places that overlap at a wide zoom are both tappable —
// the hit test takes the nearest, as the web's does.
const STORY_HALO_LAYERS: GlowLayer[] = [
  { r: 11, opacity: 0.1, blur: 6 },
  { r: 6.5, opacity: 0.24, blur: 3 },
];
const STORY_HALO = makeGlowSpec(STORY_HALO_LAYERS, 40);
const BEACON_SIZE = 16;
const BEACON_CENTER = BEACON_SIZE / 2;
/** Scaled 0.62–1.15 by coverage, which lands on the web's 3.4–6.3 px radius. */
const BEACON_R = 5.5;
/** A place whose stories are all found keeps a hollow ring this size: small
 *  enough that the beacons still to find stay the loud marks, visible enough to
 *  say where the reader has been. */
const READ_R = 3.5;
const READ_ALPHA = 0.7;
const BEACON_SRC = rect(0, 0, BEACON_SIZE, BEACON_SIZE);
/** The web's `sentimentDivergence` bar for the contested ring. */
const CONTESTED_DIVERGENCE = 0.35;
/** A story tap's catch radius, squared (32 px). */
const STORY_HIT_PX2 = 1024;
/** Web: a strait is disrupted past ±15% of its 90-day normal. */
const STRAIT_SURGE_DELTA = 0.15;

/**
 * The hazard glyphs are baked at 3× into one white sprite sheet and stamped
 * back at a third, so a 22 pt glyph stays crisp on a 3× screen and a hundred
 * famine columns cost one draw call. Cells, left to right: the famine column
 * with 0, 1, 2 and 3 blocks filled, then the thermal burst.
 */
const OVERLAY_RES = 3;
const OVERLAY_CELL = GLYPH_HALF * 2 * OVERLAY_RES;
const OVERLAY_CELLS = 5;
const THERMAL_CELL = 4;
const overlayCell = (i: number) => rect(i * OVERLAY_CELL, 0, OVERLAY_CELL, OVERLAY_CELL);
const FAMINE_SRC = [overlayCell(0), overlayCell(1), overlayCell(2), overlayCell(3)] as const;
const THERMAL_SRC = overlayCell(THERMAL_CELL);
/** A famine column's drawn frame is 10 × 14 of its 16-unit box, at up to
 *  1.1× scale — about 15 × 21 pt. Two columns closer than that on both axes
 *  overlap, and the lesser one is not drawn. */
const FAMINE_COLLIDE_X = 16;
const FAMINE_COLLIDE_Y = 22;
/** The catch radius every reference mark shares, squared (36 px). */
const MARK_HIT_PX2 = 1296;

/**
 * How a story mark says how big the story is, and how fresh.
 *
 * Every article in the column gets a mark now, not just the two either side
 * of the settled one. As a backdrop, ±2 was right: the globe was ground under
 * the story you were reading and the neighbours were a hint of where you were
 * going. As the home screen it is a map of the day, and a map of the day that
 * plots three of forty stories is a map of nothing.
 *
 * Two channels, both ported from the web map's rules, which record what was
 * measured to arrive at them:
 *
 *   **size** is the percentile rank of `eventCoverage` over the stories that
 *   publish one — never the raw figure, and never a log curve. The field is
 *   absent on roughly two thirds of articles and occasionally holds nonsense
 *   (the corpus has values in the tens of thousands, which is not a number of
 *   outlets), so both alternatives pin most of the map at the minimum radius
 *   while a handful of bad rows saturate the top. A story with no figure
 *   draws at `STORY_UNKNOWN_RANK`, deliberately above the minimum: that says
 *   "unknown", where the smallest mark would say "least covered".
 *
 *   **alpha** decays on a 72-hour half-life with a floor, so a three-day-old
 *   story is present but quiet. Note this is *not* the 18h curve the hotspot
 *   layer uses: 18 hours over a 72-hour window is right for a density field
 *   and puts a column of individual marks almost entirely on the floor.
 */
const STORY_SCALE_MIN = 0.62;
const STORY_SCALE_MAX = 1.15;
const STORY_UNKNOWN_RANK = 0.28;
const STORY_ALPHA_FLOOR = 0.45;
const STORY_HALF_LIFE_HOURS = 72;

// How bright a disrupted chokepoint glows. Magnitude only — *whether* it is
// disrupted is `chokepointValence`'s answer and nobody else's.
//
// This used to hold its own threshold: `absDelta > 0.15`, against
// `lib/valence.ts`'s 0.1 and `straitCards`' 0.3 materiality gate. That is the
// exact shape the valence module was created to end — the same strait
// reading disrupted on a card and quiet in the sheet that card opens, with
// nothing in either file saying the other existed. It was also *absolute*,
// so a strait running 20% **above** its normal lit the alarm tint: traffic
// rerouted *to* a passage is the same disruption seen from the other end,
// and the app's stated position is to name the squeeze and leave the busy
// side slate.
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
function measureLines(lines: string[], font: SkFont | null, fallbackChar: number): number {
  let w = 0;
  for (const line of lines) {
    const lw = font ? textWidth(font, line) : line.length * fallbackChar;
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

// Bounding-cap cullers for every path the frame loop projects, built once at
// module load. A part wholly outside the view cone is dropped before d3-geo
// rotates, clips and winding-tests it, which is most of the planet at any
// zoom tighter than a hemisphere — see `cap-cull.ts` for why the result is
// exact rather than approximate.
const landFullCull = createCapCuller(landFull);
const landSimplifiedCull = createCapCuller(landSimplified);
const iceSheetsCull = createCapCuller(iceSheets);
const iceSheetsSimplifiedCull = createCapCuller(iceSheetsSimplified);
const bordersFullCull = createCapCuller(bordersMeshFull);
const bordersSimplifiedCull = createCapCuller(bordersMeshSimplified);
const arcticCircleCull = createCapCuller(ARCTIC_CIRCLE);
const antarcticCircleCull = createCapCuller(ANTARCTIC_CIRCLE);
const graticuleCull = createCapCuller(GRATICULE_LINES);

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
  /** Set when the tap landed on an exchange whose index has moved. The
   *  parent resolves it against the ranked instruments and opens the card. */
  marketSignalId?: string;
  /** Set when the tap landed on a story mark: the newest story at that place
   *  the reader has not found yet. The parent opens it in the sheet, and the
   *  mark stops being drawn once the found store records it. */
  storySlug?: string;
  /** The tapped mark's hue, so the found burst is drawn in the same colour. */
  storyColor?: string;
  /** An IPC famine classification — opens `OverlaySheet`. */
  famineAreaId?: string;
  /** A FIRMS thermal anomaly — opens `OverlaySheet`. */
  thermalEventId?: string;
  /** A UN genocide determination — opens `OverlaySheet`. */
  genocideId?: string;
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
  /** The found burst: a story mark's own hue swelling and fading at `x, y`. */
  collect: (x: number, y: number, color: string) => void;
  /** Redraw the last camera at full detail — after a pinch, whose frames drew
   *  the in-motion tier and which no later camera movement will replace. */
  settle: () => void;
}

interface MiniGlobeProps {
  articles: Article[];
  heatmapPoints?: HeatmapPoint[];
  chokepoints?: Chokepoint[];
  gdacsAlerts?: GdacsAlert[];
  conflictEvents?: ConflictEvent[];
  /**
   * The river grouped into places (`lib/story-places.ts`). Each place with a
   * story the reader has not found is one tappable mark, in the category hue
   * of its newest unfound story.
   */
  places?: StoryPlace[];
  /** Stories the reader has opened. A place whose stories are all found keeps a
   *  hollow ring rather than a beacon. */
  foundSlugs?: ReadonlySet<string>;
  /** Found stories of those with a place — the ring outside the globe. */
  foundProgress?: FoundProgress;
  /** IPC famine classifications, from `/api/ipc.json`. */
  famineAreas?: FamineArea[];
  /** FIRMS thermal anomalies joined to coverage, from `/api/firms.json`. */
  thermalEvents?: ThermalEvent[];
  /** UN genocide determinations, from `/api/genocide.json`. */
  genocideSituations?: GenocideSituation[];
  /**
   * Exchanges behind an index the server flagged as having moved.
   *
   * Pre-resolved to coordinates by the screen rather than derived here: the
   * placement ladder (the signal's own `lat`/`lng`, else its country's
   * centroid, else no mark) belongs with the ranking that produced the list,
   * and this component should not have to know what a `MarketSignal` is.
   */
  marketMarks?: {
    id: string;
    label: string;
    lat: number;
    lng: number;
    direction?: 'up' | 'down' | 'flat';
  }[];
  /**
   * Where the reader is in the river, in stories: `2` is the third story,
   * `2.4` is a finger partway from it to the fourth.
   *
   * It used to be a scroll offset in pixels plus the height of one item, and
   * the two had to be swapped together whenever a different surface came to
   * the front — a sheet row and a full-screen page are different distances
   * through the same river. Every surface now publishes the same unit, so
   * nothing has to be swapped and nothing can be swapped out of step.
   */
  storyProgress: SharedValue<number>;
  /**
   * What the camera flies along, as a flat `[lat, lng, lat, lng, …]` array —
   * one pair per story, `null, null` for a story with no place.
   *
   * Defaults to the article set. The screen supplies its own track rather
   * than having the globe guess that story *n* is article *n*. Marks are
   * unaffected: they come from `articleGeo`, which stays the article set on
   * every surface.
   */
  cameraTrack?: (number | null)[];
  /**
   * Who is moving the camera: `0` the list, `1` a finger on the globe.
   *
   * A drag decouples from the list rather than fighting it — while the finger
   * owns the camera the settled row, its country highlight and its label all
   * hold still, so releasing does not snap the reader somewhere they did not
   * scroll to. The next list scroll takes ownership back.
   */
  cameraOwner?: SharedValue<number>;
  /** Where the finger has put the camera. Read only while `cameraOwner` is 1. */
  cameraLat?: SharedValue<number>;
  cameraLng?: SharedValue<number>;
  width: number;
  height: number;
  /** Globe disc radius in px. Defaults to the backdrop's `0.9 × width`. */
  radius?: number;
  /** Globe centre, px from the top of the canvas. Defaults to `height × 2/3`. */
  centerY?: number;
  /**
   * The zoom override, written by a pinch. The clip each frame is
   * `rawClip + (zoomAngle − rawClip) · zoomActive`: 0 follows the story's own
   * framing, 1 holds `zoomAngle`, and a value between is a hand-back easing.
   */
  zoomActive: SharedValue<number>;
  zoomAngle: SharedValue<number>;
  /** Published by every projection: the clip in effect, and the story's own. */
  clipOut?: SharedValue<number>;
  storyClipOut?: SharedValue<number>;
  /**
   * Published by every projection request: where the camera is being drawn,
   * whoever owns it. A gesture that takes the camera starts here — `cameraLat`
   * and `cameraLng` go stale while the deck owns it.
   */
  viewLat?: SharedValue<number>;
  viewLng?: SharedValue<number>;
  /**
   * The grown-story transform, applied to the drawing inside the canvas. A
   * view transform would scale the canvas's pixels and cut a zoomed globe at
   * the canvas's edge; this one shrinks ground the projection drew past it.
   */
  canvasTransform?: SharedValue<Transforms3d>;
  /** How far from the globe's centre the projection must reach: past the
   *  screen when `canvasTransform` can shrink it (`grownReach`). */
  canvasReach?: number;
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
  /** The limb on screen — the projection's scale, which outgrows the resting
   *  disc (and the canvas) as the globe zooms in. */
  discRadius: number;
  dayPath: SkPath | null;
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
  /** Every article in the column that is on the near side of the globe, one
   *  mark each. `scale` is coverage percentile, `alpha` is recency — see
   *  `STORY_SCALE_MIN` and friends. The settled story is not in here: it
   *  keeps its own larger glow and its label. */
  storyMarks: {
    x: number;
    y: number;
    scale: number;
    alpha: number;
    slug: string;
    color: string;
    rgb: readonly [number, number, number];
    /** Unfound stories at this place. */
    count: number;
    contested: boolean;
  }[];
  /** Stack counts show beside places with at least this many unfound stories. */
  storyCountMin: number;
  /** Places whose stories are all found. Tappable, below any beacon in reach. */
  readMarks: { x: number; y: number; slug: string; color: string }[];
  famineMarks: { x: number; y: number; id: string; blocks: number; alpha: number; scale: number }[];
  thermalMarks: { x: number; y: number; id: string; alpha: number; scale: number }[];
  genocideMarks: { x: number; y: number; id: string; label: string }[];
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
    /** Traffic well above its normal — the web's teal strait. */
    surge: boolean;
  }[];
  /** Exchanges with a flagged index move. Projected every frame like
   *  chokepoints: the set is at most three and it is the thing the opening
   *  camera is most often pointed at, so it must not blink out mid-scroll. */
  marketMarks: {
    x: number;
    y: number;
    id: string;
    label: string;
    direction?: 'up' | 'down' | 'flat';
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

/** Country highlight opacity — scaled by area so small nations still read at
 *  globe scale. The soft glow is the body; a crisp outline (drawn separately,
 *  brighter than the borders and coastline) is what makes the focused country
 *  lead the figure-ground hierarchy. */
function countryHighlightOpacity(countryName: string | null): number {
  const area = countryName ? (countryAreas[countryName] ?? 0) : 0;
  return area < 0.001 ? 0.25 : area < 0.005 ? 0.18 : 0.12;
}

const EMPTY_GLOBE: GlobeState = {
  landPath: null,
  icePath: null,
  bordersPath: null,
  countryPath: null,
  countryName: null,
  discRadius: 0,
  dayPath: null,
  nightPath: null,
  twilightPath: null,
  graticulePath: null,
  qiblaPath: null,
  sourceArcs: null,
  arcOpacity: 1,
  northPole: null,
  southPole: null,
  dot: null,
  storyMarks: [],
  storyCountMin: 3,
  readMarks: [],
  famineMarks: [],
  thermalMarks: [],
  genocideMarks: [],
  dotLabel: null,
  countryLabel: null,
  makkah: null,
  subsolar: null,
  hotspotGlows: [],
  chokepoints: [],
  marketMarks: [],
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

// ── Frame recording ───────────────────────────────────────────────────────
//
// The globe's moving layers — land, night, borders, every mark and every label
// — were about 150 declarative Skia nodes fed by a `setState` per projection.
// A drag frame spent ~35 ms in React reconciling them on the JS thread (dev
// build, emulator), on top of the projection, before the UI thread saw a pixel.
//
// They are now recorded straight into three `SkPicture`s per projection and
// handed to the canvas as shared values, which Skia redraws on the UI thread
// with no React render at all — the route its docs give for a scene whose
// command count changes frame to frame. Three rather than one because two
// declarative layers sit between them: the static limb glaze (under the marks)
// and the tap pulse and found burst, which animate on the UI thread under the
// labels.
//
// A label `Picture` was tried once before and reverted with no commit gain.
// That one still arrived through `setState`, so React still reconciled a tree
// per frame; this one removes the render, which is where the time went.
//
// The helpers below reproduce what the declarative nodes did, from
// `@shopify/react-native-skia/src/sksg/Recorder`: a node's `color` sets the
// paint colour, its `opacity` multiplies that colour's own alpha, and paints
// antialias. Keep draw order in step with the comments beside each layer.

const frameRecorder = Skia.PictureRecorder();
/** Reset before every draw. The recorder copies a paint when a draw is
 *  recorded, so one mutable paint serves the whole frame. */
const framePaint = Skia.Paint();
const BASE_PAINT = Skia.Paint();
BASE_PAINT.setAntiAlias(true);
const SOURCE_ARC_DASH = Skia.PathEffect.MakeDash([6, 3], 0);
const QIBLA_DASH = Skia.PathEffect.MakeDash([4, 2], 0);
const HIGHLIGHT_BLUR = Skia.MaskFilter.MakeBlur(BlurStyle.Solid, 1, true);

function recordEmptyPicture(): SkPicture {
  frameRecorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return frameRecorder.finishRecordingAsPicture();
}
const EMPTY_PICTURE = recordEmptyPicture();

/** Theme colours are a small fixed vocabulary; each is parsed once. */
const parsedColors = new Map<string, SkColor>();
function skColor(color: string): SkColor {
  let c = parsedColors.get(color);
  if (!c) {
    c = Skia.Color(color);
    parsedColors.set(color, c);
  }
  return c;
}

/** `color` with its alpha replaced — `withAlpha`, without a string to parse. */
function tint(color: string, alpha: number): SkColor {
  const c = skColor(color);
  return Float32Array.of(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, alpha);
}

function plainPaint(): SkPaint {
  framePaint.assign(BASE_PAINT);
  return framePaint;
}

/** A fill in `color` at `opacity`, as `<Path color opacity>` drew it. */
function fillPaint(color: string, opacity = 1): SkPaint {
  const c = skColor(color);
  const paint = plainPaint();
  paint.setColor(c);
  paint.setAlphaf((c[3] ?? 1) * opacity);
  return paint;
}

function strokePaint(
  color: string,
  opacity: number,
  width: number,
  join?: StrokeJoin,
  cap?: StrokeCap,
): SkPaint {
  const paint = fillPaint(color, opacity);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  if (join !== undefined) paint.setStrokeJoin(join);
  if (cap !== undefined) paint.setStrokeCap(cap);
  return paint;
}

const RIM_POSITIONS = [0, 0.78, 0.84, 0.93, 1];
const OCEAN_POSITIONS = [0, 1];
const GLAZE_POSITIONS = [0, 0.9, 0.97, 0.995, 1];
let atmosphereCache: {
  key: string;
  rim: SkColor[];
  ocean: SkColor[];
  glaze: SkColor[];
} | null = null;

/**
 * The three atmosphere ramps around and on the planet, per theme: the rim just
 * outside the limb, the ocean's Fresnel (dimmer at the centre, brighter toward
 * the rim, so the disc reads as a sphere) and the inner-limb glaze — the slice
 * of atmosphere refracting light around the curve, brightest just inside the
 * edge and zero at the silhouette so it meets the rim without a seam. Parsed
 * once per theme, not per frame.
 */
function atmosphereStops(atm: string, light: boolean) {
  const key = `${atm}${light}`;
  if (atmosphereCache?.key !== key) {
    atmosphereCache = {
      key,
      rim: [
        `${atm}00`,
        `${atm}00`,
        `${atm}${light ? '55' : '40'}`,
        `${atm}${light ? '18' : '14'}`,
        `${atm}00`,
      ].map(skColor),
      ocean: [`${atm}${light ? '14' : '0A'}`, `${atm}${light ? '29' : '19'}`].map(skColor),
      glaze: [
        `${atm}00`,
        `${atm}00`,
        `${atm}${light ? '20' : '18'}`,
        `${atm}${light ? '38' : '28'}`,
        `${atm}00`,
      ].map(skColor),
    };
  }
  return atmosphereCache;
}

/** A `<Circle dither>` holding a `<RadialGradient>`. */
function drawGlow(
  canvas: SkCanvas,
  x: number,
  y: number,
  r: number,
  colors: SkColor[],
  positions: number[],
) {
  const paint = plainPaint();
  paint.setDither(true);
  paint.setShader(Skia.Shader.MakeRadialGradient(vec(x, y), r, colors, positions, TileMode.Clamp));
  canvas.drawCircle(x, y, r, paint);
}

/** A 22 pt glyph path, placed by its box's top-left corner. */
function drawGlyph(canvas: SkCanvas, path: SkPath, x: number, y: number, paint: SkPaint) {
  canvas.save();
  canvas.translate(x - GLYPH_HALF, y - GLYPH_HALF);
  canvas.drawPath(path, paint);
  canvas.restore();
}

/**
 * Text with an opaque halo, for primary-tier labels (focused country,
 * chokepoint). Two passes — a stroked halo behind the glyphs, then the fill —
 * so the label reads over land tint, borders and the highlight glow. Skia text
 * has no shadow primitive, hence the manual stroke.
 */
function drawHaloText(
  canvas: SkCanvas,
  text: string,
  x: number,
  y: number,
  font: SkFont,
  color: string,
  haloColor: string,
  opacity: number,
  haloOpacity: number,
) {
  canvas.drawText(
    text,
    x,
    y,
    strokePaint(haloColor, haloOpacity, LABEL_HALO_WIDTH, StrokeJoin.Round),
    font,
  );
  canvas.drawText(text, x, y, fillPaint(color, opacity), font);
}

type AtlasInputs = {
  sprites: ReturnType<typeof rect>[];
  transforms: ReturnType<typeof Skia.RSXform>[];
  colors?: Float32Array[];
} | null;

/** An `<Atlas>`; tinted atlases modulate, for the reason `storyAtlas` gives. */
function drawAtlasLayer(canvas: SkCanvas, image: SkImage | null, atlas: AtlasInputs) {
  if (!image || !atlas) return;
  if (atlas.colors) {
    canvas.drawAtlas(
      image,
      atlas.sprites,
      atlas.transforms,
      plainPaint(),
      BlendMode.Modulate,
      atlas.colors,
    );
  } else {
    canvas.drawAtlas(image, atlas.sprites, atlas.transforms, plainPaint());
  }
}

interface GlobeTextures {
  ghost: SkImage | null;
  storyHalo: SkImage | null;
  beacon: SkImage | null;
  overlay: SkImage | null;
  dot: SkImage | null;
  makkah: SkImage | null;
}

const NO_TEXTURES: GlobeTextures = {
  ghost: null,
  storyHalo: null,
  beacon: null,
  overlay: null,
  dot: null,
  makkah: null,
};

interface FrameStyle {
  width: number;
  height: number;
  globeRadius: number;
  cx: number;
  cy: number;
  colors: ColorPalette;
  light: boolean;
  fonts: {
    label: SkFont | null;
    sub: SkFont | null;
    country: SkFont | null;
    neighbor: SkFont | null;
    water: SkFont | null;
  };
  textures: GlobeTextures;
}

/** One projected frame, recorded as the three pictures the canvas draws. */
interface FramePictures {
  ground: SkPicture;
  marks: SkPicture;
  labels: SkPicture;
}

/** What the canvas reads per projection: the pictures and the limb they were
 *  drawn to, so the sky behind the planet and the ring around it follow the
 *  zoom in the same replay. */
interface FrameOut extends FramePictures {
  disc: number;
}

function recordGlobeFrame(f: GlobeState, s: FrameStyle): FramePictures {
  const { colors, light, fonts, textures } = s;
  // Recorded well past the canvas: a grown story shrinks the drawing, and what
  // lies outside the screen at rest has to come into it (`canvasTransform`).
  const bounds = Skia.XYWHRect(-s.width, -s.height, 3 * s.width, 3 * s.height);
  const haloOpacity = light ? LABEL_HALO_OPACITY_LIGHT : LABEL_HALO_OPACITY_DARK;
  const haloOpacitySoft = light ? LABEL_HALO_OPACITY_LIGHT_SOFT : LABEL_HALO_OPACITY_DARK_SOFT;

  // ── Ground: between the ocean disc and the limb glaze ──────────────────
  let c = frameRecorder.beginRecording(bounds);
  // The limb the projection drew to. The rim and both discs follow it, so a
  // zoomed globe keeps its real horizon — or loses it past the screen's edge —
  // rather than having one painted around a magnified patch. `dither` on each
  // ramp: over the near-black dark ground they span a few 8-bit steps and band.
  const disc = f.discRadius > 0 ? f.discRadius : s.globeRadius;
  const atmosphere = atmosphereStops(colors.atmosphere, light);
  drawGlow(c, s.cx, s.cy, disc * 1.25, atmosphere.rim, RIM_POSITIONS);
  drawGlow(c, s.cx, s.cy, disc, atmosphere.ocean, OCEAN_POSITIONS);

  // Subsolar specular highlight — additive WHITE at the projected
  // sun-overhead point. Land draws on top, so it only shows on water, which
  // is the physically correct behaviour: ocean reflects, land doesn't.
  // WHITE because the phenomenon is brighter-than-ambient in both modes.
  if (f.subsolar) {
    drawGlow(
      c,
      f.subsolar.x,
      f.subsolar.y,
      disc * 0.55,
      [
        skColor(`${WHITE}${light ? '14' : '24'}`),
        skColor(`${WHITE}${light ? '08' : '10'}`),
        skColor(`${WHITE}00`),
      ],
      [0, 0.45, 1],
    );
  }

  // Daylight, under the land. Night cannot carry the terminator over water on
  // its own: darkening a near-black sea moves it a value or two, so day and
  // night read as a property of the continents and stop at every coastline.
  // Lifting the lit hemisphere is the web map's answer (`day-shade`), and it
  // puts the sun's side of the planet on the ocean too.
  if (f.dayPath) c.drawPath(f.dayPath, fillPaint(colors.daylight, light ? 0.14 : 0.07));

  // The graticule, under the land like the web's: it crosses no country, and a
  // grid line quiet enough on the sea would vanish on land or shout over it.
  // 0.8 wide, not 0.5 — a hairline under a device pixel never reaches its own
  // alpha, which is how the web's grid spent a month not being on screen.
  if (f.graticulePath) {
    c.drawPath(f.graticulePath, strokePaint(colors.accent, light ? 0.16 : 0.1, 0.8));
  }

  // Land — a faint fill for body plus a crisp coastline for definition. The
  // edge, not a brighter fill, lifts the map out of the faded register, and
  // light mode leans on it harder: cream ocean against the `accent` land fill
  // is a low-contrast pair.
  if (f.landPath) {
    c.drawPath(f.landPath, fillPaint(colors.accent, light ? 0.32 : 0.1));
    c.drawPath(f.landPath, strokePaint(colors.text, light ? 0.5 : 0.3, 0.6, StrokeJoin.Round));
  }

  // Permanent ice — Antarctica and Greenland. The one layer whose colour must
  // not flip with mode: `text` darkens in light mode, which painted the ice
  // darker than the land around it.
  if (f.icePath) {
    c.drawPath(f.icePath, fillPaint(light ? WHITE : colors.text, light ? 0.32 : 0.16));
  }

  if (f.bordersPath) {
    c.drawPath(f.bordersPath, strokePaint(colors.accent, 0.3, 0.7, StrokeJoin.Round));
  }

  // Low-sun band, then the night veil and the terminator stroke. Dark mode
  // needs a heavier hand on both: over the near-black ocean, BLACK at the
  // light-mode opacities moved a channel by one or two units and the seam
  // vanished.
  if (f.twilightPath) c.drawPath(f.twilightPath, fillPaint(BLACK, light ? 0.06 : 0.12));
  if (f.nightPath) {
    c.drawPath(f.nightPath, fillPaint(BLACK, light ? 0.15 : 0.2));
    // The terminator itself: in daylight's tone on dark ground, where the
    // atmosphere slate was two values off the sea.
    c.drawPath(
      f.nightPath,
      light ? strokePaint(colors.atmosphere, 0.3, 0.7) : strokePaint(colors.daylight, 0.18, 0.7),
    );
  }

  // Night-side city lights, after the veil so it darkens land but not them.
  // `textEmphasis` inverts with mode so the dots contrast in both palettes.
  if (f.cityLightsTwilightPath) {
    c.drawPath(
      f.cityLightsTwilightPath,
      fillPaint(colors.textEmphasis, (light ? 0.22 : 0.32) * f.cityTwilightOpacity),
    );
  }
  if (f.cityLightsNightPath) {
    c.drawPath(f.cityLightsNightPath, fillPaint(colors.textEmphasis, light ? 0.42 : 0.6));
  }

  drawGlow(c, s.cx, s.cy, disc, atmosphere.glaze, GLAZE_POSITIONS);
  const ground = frameRecorder.finishRecordingAsPicture();

  // ── Marks: between the limb glaze and the tap pulse ─────────────────────
  c = frameRecorder.beginRecording(bounds);

  // Coverage hotspots — a gradient halo and a sharp core. Monochrome, and a
  // diffuse texture unlike the story beacons, so a story stays the focal point.
  for (const z of f.hotspotGlows) {
    const fade = 0.45 + 0.55 * z.recency;
    drawGlow(
      c,
      z.x,
      z.y,
      18 + z.intensity * 16,
      [
        tint(colors.text, (0.18 + z.intensity * 0.18) * fade),
        tint(colors.text, (0.08 + z.intensity * 0.1) * fade),
        tint(colors.text, 0),
      ],
      [0, 0.35, 1],
    );
    c.drawCircle(z.x, z.y, 0.9 + z.intensity * 0.7, fillPaint(colors.text, 0.6 * fade));
  }

  // Chokepoints — the strait pictogram in the web's three states: slate at
  // rest, gold when traffic is pinched below its normal, teal when it surges.
  // Always labelled; the label's ink and halo are WCAG-audited (2026-07-04).
  const water = fonts.water;
  for (const cp of f.chokepoints) {
    const glyphColor = cp.disrupted
      ? colors.markStraitPinch
      : cp.surge
        ? colors.markStraitSurge
        : colors.markStrait;
    if (cp.disrupted || cp.surge) {
      drawGlow(
        c,
        cp.x,
        cp.y,
        12,
        [
          tint(glyphColor, 0.22 * cp.intensity),
          tint(glyphColor, 0.08 * cp.intensity),
          tint(glyphColor, 0),
        ],
        [0, 0.5, 1],
      );
    }
    drawGlyph(
      c,
      CHOKEPOINT_PATH,
      cp.x,
      cp.y,
      strokePaint(glyphColor, 0.6 + 0.35 * cp.intensity, 1.0, StrokeJoin.Round, StrokeCap.Round),
    );
    if (water) {
      drawHaloText(
        c,
        cp.label,
        cp.x - textWidth(water, cp.label) / 2,
        cp.y + 20,
        water,
        cp.disrupted ? colors.markStraitPinch : colors.text,
        colors.bg,
        cp.disrupted ? 0.9 : light ? 0.7 : 0.55,
        cp.disrupted
          ? light
            ? LABEL_HALO_OPACITY_LIGHT_STRONG
            : LABEL_HALO_OPACITY_DARK_STRONG
          : haloOpacity,
      );
    }
  }

  // Exchanges whose index moved — a candle, directionless in shape (the
  // strip's delta owns direction), always labelled so the earth reads as
  // addressable.
  for (const m of f.marketMarks) {
    drawGlyph(
      c,
      MARKET_PATH,
      m.x,
      m.y,
      strokePaint(
        m.direction === 'up'
          ? colors.markMarketUp
          : m.direction === 'down'
            ? colors.markMarketDown
            : colors.markStrait,
        0.95,
        1.2,
        StrokeJoin.Round,
        StrokeCap.Round,
      ),
    );
    if (water) {
      drawHaloText(
        c,
        m.label,
        m.x - textWidth(water, m.label) / 2,
        m.y + 20,
        water,
        colors.text,
        colors.bg,
        light ? 0.75 : 0.55,
        haloOpacity,
      );
    }
  }

  // GDACS — one hazard hue; severity is stroke weight, opacity and (Red only)
  // an outer alarm ring. Upstream order is Green → Orange → Red.
  for (const m of f.gdacsMarks) {
    const isHigh = m.alertlevel === 'Red';
    const isLow = m.alertlevel === 'Green';
    c.save();
    c.translate(m.x - GLYPH_HALF, m.y - GLYPH_HALF);
    if (isHigh) {
      c.drawCircle(
        GLYPH_HALF,
        GLYPH_HALF,
        GLYPH_HALF + 2.5,
        strokePaint(colors.markGdacs, 0.55 * m.recencyAlpha, 1),
      );
    }
    c.drawPath(
      getGlyphPath(m.eventtype),
      strokePaint(
        colors.markGdacs,
        (isHigh ? 0.95 : isLow ? 0.45 : 0.75) * m.recencyAlpha,
        isHigh ? 1.8 : isLow ? 1.0 : 1.4,
        StrokeJoin.Round,
        StrokeCap.Round,
      ),
    );
    c.restore();
  }

  // Conflict events — the ghost glow, one Atlas, recency in the colour channel.
  drawAtlasLayer(
    c,
    textures.ghost,
    conflictAtlas(GHOST_GLOW, f.conflictMarks, hexRgb(colors.markConflict)),
  );

  // Country highlight — soft glow, then the crisp focal outline.
  if (f.countryPath) {
    const glow = fillPaint(colors.text, countryHighlightOpacity(f.countryName));
    glow.setMaskFilter(HIGHLIGHT_BLUR);
    c.drawPath(f.countryPath, glow);
    c.drawPath(f.countryPath, strokePaint(colors.text, 0.5, 1, StrokeJoin.Round));
  }

  // Major rivers — after the highlight so a river through the focused country
  // stays visible; a `bg` halo under a `textEmphasis` stroke.
  if (f.riversPath) {
    c.drawPath(
      f.riversPath,
      strokePaint(
        colors.bg,
        (light ? 0.8 : 0.65) * f.riversOpacity,
        2.5,
        StrokeJoin.Round,
        StrokeCap.Round,
      ),
    );
    c.drawPath(
      f.riversPath,
      strokePaint(
        colors.textEmphasis,
        (light ? 0.85 : 0.55) * f.riversOpacity,
        1.2,
        StrokeJoin.Round,
        StrokeCap.Round,
      ),
    );
  }

  // Source arcs (long-short dash: flow) and the qibla arc (denser, round-capped
  // dash: direction). Dashing halves the ink, so the qibla carries ~1.7× the
  // opacity it had as a solid line.
  if (f.sourceArcs) {
    const paint = strokePaint(colors.accent, (light ? 0.25 : 0.15) * f.arcOpacity, 0.5);
    paint.setPathEffect(SOURCE_ARC_DASH);
    c.drawPath(f.sourceArcs, paint);
  }
  if (f.qiblaPath) {
    const paint = strokePaint(
      colors.dome,
      (light ? 0.34 : 0.2) * f.arcOpacity,
      1.2,
      undefined,
      StrokeCap.Round,
    );
    paint.setPathEffect(QIBLA_DASH);
    c.drawPath(f.qiblaPath, paint);
  }

  drawAtlasLayer(c, textures.makkah, glowAtlas(MAKKAH_GLOW, f.makkah ? [f.makkah] : []));

  // Famine and thermal — the ground a story happens on, so under the stories.
  const famine = f.famineMarks;
  drawAtlasLayer(
    c,
    textures.overlay,
    overlayAtlas(
      famine,
      (i) => FAMINE_SRC[famine[i]?.blocks ?? 0] ?? FAMINE_SRC[0],
      hexRgb(colors.markFamine),
    ),
  );
  drawAtlasLayer(
    c,
    textures.overlay,
    overlayAtlas(f.thermalMarks, () => THERMAL_SRC, hexRgb(colors.markThermal)),
  );

  // Places read to the end — a hollow ring in the story's hue, under the
  // beacons, so the lights still to find stay the loud ones.
  for (const m of f.readMarks) {
    c.drawCircle(m.x, m.y, READ_R, strokePaint(m.color, READ_ALPHA, 1.2));
  }
  // Story beacons — halo, then the rimmed disc.
  drawAtlasLayer(
    c,
    textures.storyHalo,
    storyAtlas(STORY_HALO.size.width, STORY_HALO.srcRect, f.storyMarks),
  );
  drawAtlasLayer(c, textures.beacon, storyAtlas(BEACON_SIZE, BEACON_SRC, f.storyMarks));
  // The web's ring on a story its sources disagree sharply about.
  for (const m of f.storyMarks) {
    if (!m.contested) continue;
    c.drawCircle(
      m.x,
      m.y,
      BEACON_R * m.scale + 3,
      strokePaint(colors.markContested, 0.85 * m.alpha, 1.2),
    );
  }
  // How many stories are still to find at a place.
  const sub = fonts.sub;
  if (sub) {
    for (const m of f.storyMarks) {
      if (m.count < f.storyCountMin) continue;
      drawHaloText(
        c,
        String(m.count),
        m.x + BEACON_R * m.scale + 3,
        m.y - 4,
        sub,
        colors.textEmphasis,
        colors.bg,
        0.9,
        haloOpacity,
      );
    }
  }

  // Genocide, as determined by a UN body — above every story, and never ambient.
  for (const g of f.genocideMarks) {
    c.drawCircle(g.x, g.y, 9, fillPaint(colors.markGenocideCore));
    c.drawCircle(g.x, g.y, 9, strokePaint(colors.markGenocide, 1, 1.6));
    c.drawCircle(g.x, g.y, 3, fillPaint(colors.markGenocide));
    if (sub) {
      drawHaloText(
        c,
        g.label,
        g.x + 13,
        g.y + 4,
        sub,
        colors.markGenocide,
        colors.bg,
        1,
        haloOpacity,
      );
    }
  }

  // The settled story's dot.
  drawAtlasLayer(c, textures.dot, glowAtlas(DOT_GLOW, f.dot ? [f.dot] : []));
  const marks = frameRecorder.finishRecordingAsPicture();

  // ── Labels: above the tap pulse ─────────────────────────────────────────
  c = frameRecorder.beginRecording(bounds);

  // Water — lightest tier, no halo (stroked text dominated the settled-frame
  // budget). Light mode borrows body ink at 0.92, the WCAG floor for this tier.
  if (water) {
    const ink = light ? colors.text : colors.textSecondary;
    const inkAlpha = skColor(ink)[3] ?? 1;
    const paint = fillPaint(ink);
    for (const w of f.waterLabels) {
      paint.setAlphaf(inkAlpha * (light ? 0.92 : 0.9) * w.opacity);
      // River labels sit one x-height above their line rather than bisecting it.
      c.drawText(
        w.name,
        w.x - textWidth(water, w.name) / 2,
        w.kind === 'river' ? w.y - 7 : w.y,
        paint,
        water,
      );
    }
  }

  // Neighbour countries — small caps, body ink, centred per line on the block.
  const neighbor = fonts.neighbor;
  if (neighbor) {
    const inkAlpha = skColor(colors.text)[3] ?? 1;
    const paint = fillPaint(colors.text);
    for (const n of f.neighborLabels) {
      paint.setAlphaf(inkAlpha * (light ? 0.95 : 0.92) * n.opacity);
      const firstY = n.y - ((n.lines.length - 1) * NEIGHBOR_LINE_HEIGHT) / 2;
      for (let i = 0; i < n.lines.length; i++) {
        const line = n.lines[i];
        if (!line) continue;
        c.drawText(
          line,
          n.x - textWidth(neighbor, line) / 2,
          firstY + i * NEIGHBOR_LINE_HEIGHT,
          paint,
          neighbor,
        );
      }
    }
  }

  // The focused country — secondary tier, soft halo, first baseline at (x, y).
  const country = fonts.country;
  const cl = f.countryLabel;
  if (country && cl) {
    for (let i = 0; i < cl.lines.length; i++) {
      const line = cl.lines[i];
      if (!line) continue;
      drawHaloText(
        c,
        line,
        cl.x - textWidth(country, line) / 2,
        cl.y + i * LABEL_LINE_HEIGHT,
        country,
        colors.textEmphasis,
        colors.bg,
        light ? 0.85 : 0.8,
        haloOpacitySoft,
      );
    }
  }

  // Location · local time — primary tier: where the news happened is the most
  // important text on the globe.
  const dl = f.dotLabel;
  if (dl && fonts.label) {
    drawHaloText(
      c,
      dl.text,
      dl.x + 6,
      dl.y + 4,
      fonts.label,
      colors.textEmphasis,
      colors.bg,
      0.95,
      haloOpacity,
    );
    if (dl.sub && sub) {
      drawHaloText(
        c,
        dl.sub,
        dl.x + 6,
        dl.y + 18,
        sub,
        colors.textEmphasis,
        colors.bg,
        light ? 0.7 : 0.75,
        haloOpacitySoft,
      );
    }
  }

  // Pole markers — tiny crosses.
  const poleInk = fillPaint(colors.accent, light ? 0.25 : 0.2);
  for (const pole of [f.northPole, f.southPole]) {
    if (!pole) continue;
    c.drawRect(Skia.XYWHRect(pole.x - 3, pole.y - 0.4, 6, 0.8), poleInk);
    c.drawRect(Skia.XYWHRect(pole.x - 0.4, pole.y - 3, 0.8, 6), poleInk);
  }
  const labels = frameRecorder.finishRecordingAsPicture();

  return { ground, marks, labels };
}

/**
 * Trace the great circle from `from` to `to` into `builder` in `steps`
 * segments, lifting the pen wherever the arc leaves the camera's cone or a
 * point will not project.
 *
 * The cull is per point, not per endpoint: a source's headquarters is routinely
 * outside the zoom cone while the story-side stretch of its arc is visible. And
 * point projection ignores `.clipAngle`, so an unculled point would draw the arc
 * into the sky, or fold a far-side stretch back mirrored across the disk.
 */
function traceGreatCircle(
  builder: SkPathBuilder,
  from: [number, number],
  to: [number, number],
  steps: number,
  camera: [number, number],
  clipRad: number,
  proj: GeoProjection,
): void {
  const interp = geoInterpolate(from, to);
  let started = false;
  for (let i = 0; i <= steps; i++) {
    const ll = interp(i / steps);
    const p = geoDistance(ll, camera) < clipRad ? proj(ll) : null;
    if (!p) {
      started = false;
      continue;
    }
    if (!started) {
      builder.moveTo(p[0], p[1]);
      started = true;
    } else builder.lineTo(p[0], p[1]);
  }
}

export const MiniGlobe = memo(function MiniGlobe({
  articles,
  heatmapPoints,
  chokepoints,
  gdacsAlerts,
  conflictEvents,
  marketMarks,
  places,
  foundSlugs,
  foundProgress,
  famineAreas,
  thermalEvents,
  genocideSituations,
  storyProgress,
  canvasTransform,
  canvasReach = 0,
  cameraTrack,
  cameraOwner,
  cameraLat,
  cameraLng,
  width,
  height,
  radius,
  centerY,
  zoomActive,
  zoomAngle,
  clipOut,
  storyClipOut,
  viewLat,
  viewLng,
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
  // Baked white and tinted per instance (conflict hue). Baking in
  // `textEmphasis` tinted near-black in light mode, where modulate multiplies
  // a hue by almost zero.
  const ghostTexture = useGlowTexture(GHOST_GLOW, WHITE);
  const storyHaloTexture = useGlowTexture(STORY_HALO, WHITE);
  const beaconTexture = useTexture(
    <Group>
      <Circle cx={BEACON_CENTER} cy={BEACON_CENTER} r={BEACON_R + 1.2} color={BLACK} />
      <Circle cx={BEACON_CENTER} cy={BEACON_CENTER} r={BEACON_R} color={WHITE} />
    </Group>,
    { width: BEACON_SIZE, height: BEACON_SIZE },
    [],
  );
  const overlayTexture = useTexture(
    <Group>
      {FAMINE_SRC.map((_, blocks) => (
        <Group
          key={`famine-${blocks}`}
          transform={[{ translateX: blocks * OVERLAY_CELL }, { scale: OVERLAY_RES }]}
        >
          <Path
            path={FAMINE_FRAME_PATH}
            color={WHITE}
            style="stroke"
            strokeWidth={FAMINE_FRAME_STROKE}
          />
          <Path path={getFamineBlocksPath(blocks)} color={WHITE} />
        </Group>
      ))}
      <Group transform={[{ translateX: THERMAL_CELL * OVERLAY_CELL }, { scale: OVERLAY_RES }]}>
        <Path path={THERMAL_CORE_PATH} color={WHITE} />
        <Path
          path={THERMAL_RAYS_PATH}
          color={WHITE}
          style="stroke"
          strokeWidth={THERMAL_RAY_STROKE}
          strokeCap="round"
        />
      </Group>
    </Group>,
    { width: OVERLAY_CELL * OVERLAY_CELLS, height: OVERLAY_CELL },
    [],
  );
  const dotTexture = useGlowTexture(DOT_GLOW, colors.textEmphasis);
  const makkahTexture = useGlowTexture(MAKKAH_GLOW, colors.dome);

  // Where the earth sits, in canvas pixels.
  //
  // The defaults are the backdrop geometry this component was born with — a
  // disk wider than the screen, centred on the lower rule-of-thirds line, so
  // it bleeds off both sides and reads as ground under the prose. The map
  // screen overrides both: there the earth is a bounded disc in the band
  // between the indicator strip and the sheet, and a radius of `0.9 × width`
  // would put most of it behind the list.
  //
  // Passed in rather than derived from a mode flag because only the screen
  // knows how much of its height the sheet is taking.
  const globeRadius = radius ?? width * 0.9;
  const cx = width / 2;
  const cy = centerY ?? height * (2 / 3);
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
      textWidths.delete(f);
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

  // Precompute per-article: coords + country feature + names + the two mark
  // channels. All of it is static per snapshot, so none of it belongs in
  // `callReproject` — the frame loop projects and culls, it does not rank.
  //
  // `_tick` is in the dependency list for the same reason the hotspot memo
  // has it: alpha is derived from `Date.now()`, which React cannot infer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: _tick is an explicit clock invalidation for the recency decay below
  const articleGeo = useMemo(() => {
    const ranks = coverageRanks(articles);
    const now = Date.now();
    const lambda = Math.LN2 / STORY_HALF_LIFE_HOURS;
    return articles.map((a) => {
      const coords = getCoords(a);
      if (!coords) return null;
      const country = findCountry(coords[0], coords[1], a.location);
      const countryName = country?.properties?.name ?? null;
      const rank = ranks.get(a.slug) ?? STORY_UNKNOWN_RANK;
      const ageHours = Math.max(0, (now - articleTime(a)) / 3_600_000);
      return {
        lat: coords[0],
        lng: coords[1],
        country,
        countryName,
        location: a.location,
        scale: STORY_SCALE_MIN + (STORY_SCALE_MAX - STORY_SCALE_MIN) * rank,
        alpha: STORY_ALPHA_FLOOR + (1 - STORY_ALPHA_FLOOR) * Math.exp(-lambda * ageHours),
      };
    });
  }, [articles, _tick]);

  // Places → what each story mark draws: its newest unfound story, that
  // story's category hue, and the widest coverage and freshest alpha among the
  // stories still unfound there. Static per snapshot and per find, so the frame
  // loop only culls and projects.
  const placeMarks = useMemo(() => {
    const found = foundSlugs ?? EMPTY_FOUND;
    const indexBySlug = new Map<string, number>();
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      if (a) indexBySlug.set(a.slug, i);
    }
    const marks: PlaceMark[] = [];
    for (const place of places ?? []) {
      const slug = topUnfound(place, found);
      if (!slug) {
        // Every story here is found. The place keeps a ring in its newest
        // story's hue: a globe that empties as it is read hides where the
        // reader has been, and a tap there can still reopen the story.
        const newest = place.slugs[0];
        const i = newest == null ? undefined : indexBySlug.get(newest);
        if (newest == null || i == null) continue;
        const category = (articles[i] as { category?: string } | undefined)?.category;
        const color = categoryMarkColor(category, colors);
        marks.push({
          read: true,
          coords: [place.lng, place.lat],
          slug: newest,
          color,
          rgb: hexRgb(color),
          scale: STORY_SCALE_MIN,
          alpha: 1,
          count: 0,
          contested: false,
        });
        continue;
      }
      const top = indexBySlug.get(slug);
      if (top == null) continue;
      let scale = 0;
      let alpha = 0;
      let count = 0;
      let contested = false;
      for (const s of unfoundSlugs(place, found)) {
        const i = indexBySlug.get(s);
        if (i == null) continue;
        count += 1;
        const g = articleGeo[i];
        if (g && g.scale > scale) scale = g.scale;
        if (g && g.alpha > alpha) alpha = g.alpha;
        if ((articles[i]?.sentimentDivergence ?? 0) >= CONTESTED_DIVERGENCE) contested = true;
      }
      // The river is `RiverArticle[]`; the prop is typed as the wider `Article`.
      const category = (articles[top] as { category?: string } | undefined)?.category;
      const color = categoryMarkColor(category, colors);
      marks.push({
        read: false,
        coords: [place.lng, place.lat],
        slug,
        color,
        rgb: hexRgb(color),
        scale: scale || STORY_SCALE_MIN,
        alpha: alpha || STORY_ALPHA_FLOOR,
        count,
        contested,
      });
    }
    return marks;
  }, [places, foundSlugs, articles, articleGeo, colors]);
  const placeMarksRef = useRef(placeMarks);
  placeMarksRef.current = placeMarks;

  // The last projected frame: what `hitTest` reads, and what a redraw replays
  // when only the style changed (theme, a font, a texture).
  const frameRef = useRef<GlobeState>(EMPTY_GLOBE);
  // The moving layers, recorded once per projection and published as ONE
  // shared value — see "Frame recording" above. Skia's canvas re-records its
  // whole command list on the UI thread whenever any shared value it reads
  // changes (`NativeReanimatedContainer` starts one mapper over all of them),
  // so three separate writes replayed the canvas up to three times per
  // projection: 60 of 64 drag frames flagged a slow UI thread. The derived
  // values below are flushed before that mapper, which then runs once.
  const framePictures = useSharedValue<FrameOut>({
    ground: EMPTY_PICTURE,
    marks: EMPTY_PICTURE,
    labels: EMPTY_PICTURE,
    disc: globeRadius,
  });
  const groundPicture = useDerivedValue(() => framePictures.value.ground);
  const marksPicture = useDerivedValue(() => framePictures.value.marks);
  const labelsPicture = useDerivedValue(() => framePictures.value.labels);
  // Outside the limb, wherever the zoom has put it: the stars and the moon
  // are behind the planet, and a zoomed globe covers them.
  const discClip = useDerivedValue(() => Skia.Path.Circle(cx, cy, framePictures.value.disc));
  // Textures bake on the UI thread; they reach here once each, by reaction,
  // rather than being read synchronously on every frame.
  const texturesRef = useRef<GlobeTextures>(NO_TEXTURES);
  // Assigned every render so a draw always sees the current theme and fonts;
  // `callReproject` is a stable closure and calls through it.
  const drawRef = useRef<(frame: GlobeState) => void>(() => {});
  drawRef.current = (frame: GlobeState) => {
    const pictures = recordGlobeFrame(frame, {
      width,
      height,
      globeRadius,
      cx,
      cy,
      colors,
      light,
      fonts: {
        label: labelFont,
        sub: subFont,
        country: countryFont,
        neighbor: neighborFont,
        water: waterFont,
      },
      textures: texturesRef.current,
    });
    framePictures.value = {
      ...pictures,
      disc: frame.discRadius > 0 ? frame.discRadius : globeRadius,
    };
  };

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

  // Flat coord array for UI thread interpolation. `cameraTrack` wins where a
  // surface supplies one; the article set is the default because that is what
  // the reader scrolls.
  const coordsSV = useSharedValue<(number | null)[]>([]);
  useEffect(() => {
    coordsSV.value = cameraTrack ?? articleGeo.flatMap((g) => (g ? [g.lat, g.lng] : [null, null]));
  }, [articleGeo, cameraTrack, coordsSV]);

  // Zoom control — two shared values that together describe the effective
  // clip angle each frame:
  //   clip = rawClip + (overrideAngle - rawClip) * overrideActive
  // overrideActive ∈ [0,1] fades between scroll-adaptive (0) and a fixed
  // override (1). overrideAngle is the fixed target in degrees. Keeping them
  // separate lets 2×→3× (override→override) animate by sliding overrideAngle
  // alone, while 1×↔N× fades overrideActive without the angle ever glitching.
  // Owned by the screen and written by a pinch (`GlobeGestureLayer`).
  const overrideActive = zoomActive;
  const overrideAngle = zoomAngle;
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
  // Cullers for the pair above, rebuilt only when the settled country changes:
  // Russia, Canada and the United States are MultiPolygons whose far-flung
  // parts are usually off the disc.
  const cachedCountryCullRef = useRef<CapCuller | null>(null);
  const cachedCountrySimplifiedCullRef = useRef<CapCuller | null>(null);
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
  const dayPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
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
  // Same shape as the chokepoint enrichment below: a `[lng, lat]` tuple built
  // once per snapshot rather than per frame, because `geoDistance` and `proj`
  // both want one and building it inside the loop allocates forty times a
  // second for no reason.
  const enrichedMarketMarks = useMemo(
    () =>
      (marketMarks ?? []).map((m) => ({
        id: m.id,
        label: m.label,
        direction: m.direction,
        coords: [m.lng, m.lat] as [number, number],
      })),
    [marketMarks],
  );

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
        // Signed, because direction decides meaning here and magnitude only
        // decides brightness.
        delta: cp.delta7vs90[cp.primaryField] ?? 0,
        absDelta: Math.abs(cp.delta7vs90[cp.primaryField] ?? 0),
      })),
    [chokepoints],
  );
  const chokepointsRef = useRef(enrichedChokepoints);
  chokepointsRef.current = enrichedChokepoints;
  const marketMarksRef = useRef(enrichedMarketMarks);
  marketMarksRef.current = enrichedMarketMarks;
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
  // The hazard layers ported from the web, shaped once per snapshot like the
  // conflict events above so the frame loop only culls and projects.
  const enrichedFamine = useMemo(
    () =>
      (famineAreas ?? [])
        .map((a) => {
          const blocks = famineBlocks(a.phase);
          return {
            id: a.id,
            coords: [a.lng, a.lat] as [number, number],
            blocks,
            alpha: famineAlpha(a.ageMonths),
            // Web: the gravest phase draws larger, and on top.
            scale: 0.8 + 0.1 * blocks,
          };
        })
        .sort((p, q) => p.blocks - q.blocks),
    [famineAreas],
  );
  const famineRef = useRef(enrichedFamine);
  famineRef.current = enrichedFamine;
  const enrichedThermal = useMemo(
    () =>
      (thermalEvents ?? []).map((e) => ({
        id: e.id,
        coords: [e.lng, e.lat] as [number, number],
        alpha: thermalAlpha(e.confidence),
        scale: thermalScale(e.frp),
      })),
    [thermalEvents],
  );
  const thermalRef = useRef(enrichedThermal);
  thermalRef.current = enrichedThermal;
  const enrichedGenocide = useMemo(
    () =>
      (genocideSituations ?? []).map((g) => ({
        id: g.id,
        coords: [g.lng, g.lat] as [number, number],
        label: g.name.toUpperCase(),
      })),
    [genocideSituations],
  );
  const genocideRef = useRef(enrichedGenocide);
  genocideRef.current = enrichedGenocide;
  const clipOutRef = useRef(clipOut);
  clipOutRef.current = clipOut;
  const storyClipOutRef = useRef(storyClipOut);
  storyClipOutRef.current = storyClipOut;
  const layoutRef = useRef({ globeRadius, cx, cy, width, height, canvasReach });
  layoutRef.current = { globeRadius, cx, cy, width, height, canvasReach };
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
      // Something other than the list is moving the camera — a finger or a
      // flight. Forces the in-motion detail tier; see `nearSettled`.
      cameraMoving = false,
    ) => {
      lastReprojRef.current = { lng: geoLng, lat: geoLat, idx: settledIndex };
      const {
        globeRadius: r,
        cx: centerX,
        cy: centerY,
        width: canvasW,
        height: canvasH,
        canvasReach: grownReach,
      } = layoutRef.current;
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
        cachedCountryCullRef.current = cachedCountryRef.current
          ? createCapCuller(cachedCountryRef.current)
          : null;
        cachedCountrySimplifiedCullRef.current = cachedCountrySimplifiedRef.current
          ? createCapCuller(cachedCountrySimplifiedRef.current)
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

      // Adaptive zoom — each story's own framing at rest, and between two of
      // them the swipe rises in proportion to how far the camera travels and
      // comes down close over the next (`swipeClip`).
      const loCountry = geoData[loIndex]?.countryName ?? null;
      const hiCountry = geoData[hiIndex]?.countryName ?? null;
      const loClip = clipAngleForCountry(loCountry);
      const hiClip = clipAngleForCountry(hiCountry);
      const loGeo = geoData[loIndex];
      const hiGeo = geoData[hiIndex];
      const travelDeg =
        loGeo && hiGeo && loIndex !== hiIndex
          ? (geoDistance([loGeo.lng, loGeo.lat], [hiGeo.lng, hiGeo.lat]) * 180) / Math.PI
          : 0;
      const rawClip = swipeClip(loClip, hiClip, frac, travelDeg);
      // Blend the scroll-driven clip with the user override. Each withTiming
      // call supplying these values is already eased, so no extra shaping.
      const clipAngle = rawClip + (overrideAngleVal - rawClip) * overrideActiveVal;
      // What a gesture scales against and hands zoom back to.
      if (clipOutRef.current) clipOutRef.current.value = clipAngle;
      if (storyClipOutRef.current) storyClipOutRef.current.value = rawClip;
      const projScale = r / Math.sin((clipAngle * Math.PI) / 180);
      // **Zooming in grows the planet past the screen; it never magnifies a
      // patch inside a fixed disc.** `clipAngle` is the zoom — the ground's
      // scale is `r / sin(clipAngle)`, so a drag, a pinch and a story's framing
      // all keep their meaning — but what is drawn is everything that lands on
      // the canvas, out to the real limb. The projection used to clip at
      // `clipAngle` itself and stretch that cap across the resting disc: at a
      // small country's 25° framing the ground was 9% foreshortened at an edge
      // the atmosphere painted as the horizon — a flat map with a sphere's
      // lighting on it.
      //
      // `viewAngle` is how far from the camera the ground can be and still reach
      // the canvas's farthest corner: the whole hemisphere until the disc
      // outgrows the screen. d3-geo's `.clipAngle` only clips path generation,
      // not direct point projection, so every point marker below is culled
      // against it too (`clipRad`).
      const viewAngle = viewAngleFor(
        projScale,
        Math.max(grownReach, reachFor(centerX, centerY, canvasW, canvasH)),
      );
      const clipRad = (viewAngle * Math.PI) / 180;
      const clipCos = Math.cos(clipRad);

      const proj = projRef.current;
      // precision(0) globally — skip adaptive resampling. At globe scale
      // with 110m Natural Earth data, resampled midpoints are invisible.
      // This is the single biggest perf win (~30-40% of projection time).
      proj
        .clipAngle(viewAngle)
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
      // A camera the list does not own has no `frac` of its own: the reaction
      // hands over the list's last one, which is ~0 at rest. Without
      // `cameraMoving`, every frame of a globe drag was therefore projected at
      // full settled detail — on the emulator, 26 of 26 frames over four drags.
      const nearSettled =
        !zoomInFlight && !cameraMoving && (frac < ARC_WINDOW || frac > 1 - ARC_WINDOW);

      // Land — reset reuses the PathBuilder's underlying buffer.
      // Mid-scroll uses the ~2k-vertex simplified topology (vs 5k full); at
      // rest we switch back to the full coastline so static reading is crisp.
      const landBuilder = landPathRef.current;
      landBuilder.reset();
      skiaCtx.setPath(landBuilder);
      pg.context(skiaCtx)(
        (nearSettled ? landFullCull : landSimplifiedCull).visible(geoLng, geoLat, viewAngle),
      );
      const landPath = landBuilder.build();

      // Ice sheets — Antarctica + Greenland. Swapped to simplified during
      // scroll the same way land is. Projecting every frame (not gated) so
      // the ice layer tracks rotation without flicker.
      const iceBuilder = icePathRef.current;
      iceBuilder.reset();
      skiaCtx.setPath(iceBuilder);
      pg.context(skiaCtx)(
        (nearSettled ? iceSheetsCull : iceSheetsSimplifiedCull).visible(geoLng, geoLat, viewAngle),
      );
      const icePath = iceBuilder.build();

      // Dot — culled against the zoom cone like every other point marker.
      // While the list was the camera's only owner the settled story *was*
      // the camera target, so it could never leave the disk. A drag, a
      // selection or the opening view can now aim the camera elsewhere, and
      // direct projection ignores `.clipAngle` (see clipRad above): the dot
      // and its "London · 20:17" label floated in the sky beside the globe.
      let dot: { x: number; y: number } | null = null;
      if (geo && geoDistance([geo.lng, geo.lat], [geoLng, geoLat]) < clipRad) {
        const pt = proj([geo.lng, geo.lat]);
        if (pt) dot = { x: pt[0], y: pt[1] };
      }

      // Story marks — one per place with a story the reader has not found.
      // Everything but position was decided in `placeMarks`; this culls against
      // the zoom cone (direct point projection ignores `.clipAngle`, see
      // clipRad above) and projects.
      const storyMarks: GlobeState['storyMarks'] = [];
      const readMarks: GlobeState['readMarks'] = [];
      const storyCamera: [number, number] = [geoLng, geoLat];
      for (const m of placeMarksRef.current) {
        if (geoDistance(m.coords, storyCamera) >= clipRad) continue;
        const pt = proj(m.coords);
        if (!pt) continue;
        if (m.read) {
          readMarks.push({ x: pt[0], y: pt[1], slug: m.slug, color: m.color });
          continue;
        }
        storyMarks.push({
          x: pt[0],
          y: pt[1],
          scale: m.scale,
          alpha: m.alpha,
          slug: m.slug,
          color: m.color,
          rgb: m.rgb,
          count: m.count,
          contested: m.contested,
        });
      }
      // Web: a count beside every stack of 3+, and of 2+ once zoomed in.
      const storyCountMin = clipAngle < 60 ? 2 : 3;

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
        const cull =
          (nearSettled ? null : cachedCountrySimplifiedCullRef.current) ??
          cachedCountryCullRef.current;
        if (cull) pg.context(skiaCtx)(cull.visible(geoLng, geoLat, viewAngle));
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
      // with the globe instead of popping at settle. Settled uses the full mesh
      // (matches landFull arcs); mid-scroll uses the 0.5-weight simplified
      // mesh (matches landSimplified). ~30% cheaper at rest, ~56% cheaper
      // during scroll vs the original full-topology mesh.
      const bordersBuilder = bordersPathRef.current;
      bordersBuilder.reset();
      skiaCtx.setPath(bordersBuilder);
      pg.context(skiaCtx)(
        (nearSettled ? bordersFullCull : bordersSimplifiedCull).visible(geoLng, geoLat, viewAngle),
      );
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
      const {
        day: dayGeo,
        night: nightGeo,
        twilight: twilightGeo,
      } = getNightCircles(sunLng, sunLat);
      const dayBuilder = dayPathRef.current;
      dayBuilder.reset();
      skiaCtx.setPath(dayBuilder);
      pg.context(skiaCtx)(dayGeo);
      const dayPath = dayBuilder.build();
      const nightBuilder = nightPathRef.current;
      nightBuilder.reset();
      skiaCtx.setPath(nightBuilder);
      pg.context(skiaCtx)(nightGeo);
      const nightPath = nightBuilder.build();

      // Low-sun band
      const twilightBuilder = twilightPathRef.current;
      twilightBuilder.reset();
      skiaCtx.setPath(twilightBuilder);
      pg.context(skiaCtx)(twilightGeo);
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
      // subsolar point is just the antipode of the night hemisphere's centre, i.e. the
      // direct sunLng/sunLat. Culled against the clip cone — point
      // projection doesn't clip, so a sun between clipRad and 90° away
      // would center the specular blob outside the disk near the limb.
      let subsolar: { x: number; y: number } | null = null;
      if (geoDistance([sunLng, sunLat], [geoLng, geoLat]) < clipRad) {
        const pt = proj([sunLng, sunLat]);
        if (pt) subsolar = { x: pt[0], y: pt[1] };
      }

      // The graticule and the polar circles — projected every frame; ~1.4k
      // vertices before the cull, which drops most of them at any zoom.
      const graticuleBuilder = graticulePathRef.current;
      graticuleBuilder.reset();
      skiaCtx.setPath(graticuleBuilder);
      pg.context(skiaCtx)(graticuleCull.visible(geoLng, geoLat, viewAngle));
      pg.context(skiaCtx)(arcticCircleCull.visible(geoLng, geoLat, viewAngle));
      pg.context(skiaCtx)(antarcticCircleCull.visible(geoLng, geoLat, viewAngle));
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
          traceGreatCircle(
            qiblaBuilder,
            storyPt,
            MAKKAH.coords,
            16,
            [geoLng, geoLat],
            clipRad,
            proj,
          );
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
            traceGreatCircle(
              sourceArcsBuilder,
              srcPt,
              storyPt,
              10,
              [geoLng, geoLat],
              clipRad,
              proj,
            );
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
          disrupted: chokepointValence(cp.delta) === 'unfavorable',
          surge: cp.delta > STRAIT_SURGE_DELTA,
        });
      }

      // Exchanges whose index the server flagged. Same cull + project pattern
      // as chokepoints, and always projected for the same reason: the set is
      // tiny and the opening camera is usually pointed at one of them, so a
      // mark that blinks out mid-scroll is a mark that is not there when the
      // reader looks for what the strip just promised.
      const marketProjected: GlobeState['marketMarks'] = [];
      for (const m of marketMarksRef.current) {
        if (geoDistance(m.coords, cameraCoords) >= clipRad) continue;
        const pt = proj(m.coords);
        if (!pt) continue;
        marketProjected.push({
          x: pt[0],
          y: pt[1],
          id: m.id,
          label: m.label,
          direction: m.direction,
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

      // Hazard layers — same cull + project. About a hundred IPC areas, a
      // handful of thermal clusters and two genocide marks: trivial next to
      // the land path.
      // Famine columns collide in screen space, gravest first, the way the
      // web's symbol layer places them. Sudan alone is dozens of areas within
      // a few pixels of each other at the resting zoom, and drawn unculled they
      // piled into one violet smear in which no column could be read. The
      // area rows in `CountrySheet` still list every one.
      const famineMarks: GlobeState['famineMarks'] = [];
      const famineSrc = famineRef.current;
      for (let i = famineSrc.length - 1; i >= 0; i--) {
        const a = famineSrc[i];
        if (!a) continue;
        if (geoDistance(a.coords, cameraCoords) >= clipRad) continue;
        const pt = proj(a.coords);
        if (!pt) continue;
        let crowded = false;
        for (const kept of famineMarks) {
          if (
            Math.abs(kept.x - pt[0]) < FAMINE_COLLIDE_X &&
            Math.abs(kept.y - pt[1]) < FAMINE_COLLIDE_Y
          ) {
            crowded = true;
            break;
          }
        }
        if (crowded) continue;
        famineMarks.push({
          x: pt[0],
          y: pt[1],
          id: a.id,
          blocks: a.blocks,
          alpha: a.alpha,
          scale: a.scale,
        });
      }
      // Placed gravest first; drawn gravest last, so it stays on top.
      famineMarks.reverse();
      const thermalMarks: GlobeState['thermalMarks'] = [];
      for (const e of thermalRef.current) {
        if (geoDistance(e.coords, cameraCoords) >= clipRad) continue;
        const pt = proj(e.coords);
        if (!pt) continue;
        thermalMarks.push({ x: pt[0], y: pt[1], id: e.id, alpha: e.alpha, scale: e.scale });
      }
      const genocideMarks: GlobeState['genocideMarks'] = [];
      for (const g of genocideRef.current) {
        if (geoDistance(g.coords, cameraCoords) >= clipRad) continue;
        const pt = proj(g.coords);
        if (!pt) continue;
        genocideMarks.push({ x: pt[0], y: pt[1], id: g.id, label: g.label });
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
        const dWidth = lfont ? textWidth(lfont, dotLabel.text) : dotLabel.text.length * 7;
        const sWidth = dotLabel.sub
          ? sfont
            ? textWidth(sfont, dotLabel.sub)
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
          const dw = lfont ? textWidth(lfont, dotLabel.text) : dotLabel.text.length * 7;
          const sw = dotLabel.sub
            ? sfont
              ? textWidth(sfont, dotLabel.sub)
              : dotLabel.sub.length * 5
            : 0;
          occupied.push({
            x0: dotLabel.x + 6 - pad,
            x1: dotLabel.x + 6 + Math.max(dw, sw) + pad,
            y0: dotLabel.y + 4 - 12,
            y1: dotLabel.y + (dotLabel.sub ? 18 : 4) + 4,
          });
        }

        // Strait and exchange labels are always drawn, so they seed the sweep
        // the way the country and dot labels do, and a neighbour or water name
        // that crosses one yields. Unseeded, "Bosporus Strait" printed across
        // TÜRKIYE and "Bab-el-Mandeb" across ETHIOPIA. The boxes mirror the
        // render side: centred on the mark, baseline 20 below it.
        for (const c of chokepointMarks) {
          const tw = wfont ? textWidth(wfont, c.label) : c.label.length * 5;
          const yc = c.y + 20;
          occupied.push({
            x0: c.x - tw / 2 - pad,
            x1: c.x + tw / 2 + pad,
            y0: yc - 10 - pad,
            y1: yc + 3 + pad,
          });
        }
        for (const m of marketProjected) {
          const tw = wfont ? textWidth(wfont, m.label) : m.label.length * 5;
          const yc = m.y + 20;
          occupied.push({
            x0: m.x - tw / 2 - pad,
            x1: m.x + tw / 2 + pad,
            y0: yc - 10 - pad,
            y1: yc + 3 + pad,
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
          const tw = wfont ? textWidth(wfont, w.name) : w.name.length * 5;
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

      const frame: GlobeState = {
        landPath,
        icePath,
        bordersPath,
        countryPath,
        countryName: cachedCountryRef.current?.properties?.name ?? null,
        discRadius: projScale,
        dayPath,
        nightPath,
        twilightPath,
        graticulePath,
        qiblaPath: hasQibla ? qiblaBuilder.build() : null,
        sourceArcs: hasSourceArcs ? sourceArcsBuilder.build() : null,
        arcOpacity,
        northPole,
        southPole,
        dot,
        storyMarks,
        storyCountMin,
        readMarks,
        famineMarks,
        thermalMarks,
        genocideMarks,
        dotLabel,
        countryLabel,
        makkah,
        subsolar,
        hotspotGlows,
        chokepoints: chokepointMarks,
        marketMarks: marketProjected,
        gdacsMarks,
        conflictMarks,
        neighborLabels: keptNeighbours,
        waterLabels: keptWaters,
        riversPath,
        riversOpacity,
        cityLightsNightPath: cityRes.hasNight ? cityNightBuilder.build() : null,
        cityLightsTwilightPath: cityRes.hasTwilight ? cityTwilightBuilder.build() : null,
        cityTwilightOpacity: labelOpacity,
      };
      frameRef.current = frame;
      drawRef.current(frame);
    },
    [],
  );

  // Throttle reprojection to 32ms (~30fps), skip throttle on first call.
  // 16ms overwhelmed the JS thread when each frame also rendered React; re-measure
  // (projection + picture recording) before touching it.
  // A projection can itself exceed that budget on low-end devices, so also
  // keep only one scroll-driven projection in flight. While it runs, the
  // reaction continues tracking scrollY; clearing the busy flag retriggers
  // the reaction and publishes the newest position instead of replaying every
  // obsolete intermediate frame.
  const lastTimeRef = useSharedValue(0);
  const hasFired = useSharedValue(false);
  const reprojectBusy = useSharedValue(false);
  const runScrollReproject = useCallback(
    (
      geoLng: number,
      geoLat: number,
      settledIndex: number,
      loIndex: number,
      hiIndex: number,
      frac: number,
      overrideActiveVal: number,
      overrideAngleVal: number,
      cameraMoving: boolean,
    ) => {
      try {
        callReproject(
          geoLng,
          geoLat,
          settledIndex,
          loIndex,
          hiIndex,
          frac,
          overrideActiveVal,
          overrideAngleVal,
          cameraMoving,
        );
      } finally {
        reprojectBusy.value = false;
      }
    },
    [callReproject, reprojectBusy],
  );

  /** Replay the last frame with the current style — nothing moved. */
  const redrawLast = useCallback(() => {
    drawRef.current(frameRef.current);
  }, []);

  // First frame: project the opening story before the reaction's first tick,
  // so the earth is never drawn empty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only — callReproject is stable and reads refs
  useLayoutEffect(() => {
    if (lastReprojRef.current) return;
    const geos = articleGeoRef.current;
    const first = geos.findIndex((g) => g != null);
    const geo = geos[first];
    if (!geo) return;
    callReproject(
      geo.lng,
      geo.lat,
      first,
      first,
      first,
      0,
      overrideActive.value,
      overrideAngle.value,
    );
  }, []);

  // The theme is only colour: replay the frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: colors and light are read through drawRef
  useEffect(() => {
    redrawLast();
  }, [colors, light, redrawLast]);

  // A font changes label widths, so the label packer has to run again.
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
  }, [labelFont, subFont, countryFont, neighborFont, waterFont]);

  const receiveTextures = useCallback(
    (
      ghost: SkImage | null,
      storyHalo: SkImage | null,
      beacon: SkImage | null,
      overlay: SkImage | null,
      dot: SkImage | null,
      makkah: SkImage | null,
    ) => {
      texturesRef.current = { ghost, storyHalo, beacon, overlay, dot, makkah };
      redrawLast();
    },
    [redrawLast],
  );
  useAnimatedReaction(
    () => ({
      ghost: ghostTexture.value,
      storyHalo: storyHaloTexture.value,
      beacon: beaconTexture.value,
      overlay: overlayTexture.value,
      dot: dotTexture.value,
      makkah: makkahTexture.value,
    }),
    (t) => {
      scheduleOnRN(receiveTextures, t.ghost, t.storyHalo, t.beacon, t.overlay, t.dot, t.makkah);
    },
  );
  // No-op coalescing — last derived inputs handed to scheduleOnRN. The reaction
  // tick still fires every 32ms while withTiming animations ease, but if the
  // resulting (lng, lat, frac, oA, oG) round to the same values as last
  // frame, skip the JS hop + d3-geo reproject + recording entirely. Epsilons
  // chosen so any change that would move a pixel or shift a sub-degree of
  // rotation still passes through.
  const lastReactSy = useSharedValue(Number.NaN);
  const lastReactLng = useSharedValue(Number.NaN);
  const lastReactLat = useSharedValue(Number.NaN);
  const lastReactFrac = useSharedValue(Number.NaN);
  const lastReactOA = useSharedValue(Number.NaN);
  const lastReactOG = useSharedValue(Number.NaN);
  const lastReactSettled = useSharedValue(-1);
  // The list's last window, held so a finger-owned frame can reuse it rather
  // than recomputing a row index the finger never touched.
  const lastReactLo = useSharedValue(0);
  const lastReactHi = useSharedValue(0);
  // Whether the last frame a finger or a flight published was in motion, so the
  // frame after the camera stops is redrawn at full detail — once.
  const lastReactMoving = useSharedValue(false);

  useAnimatedReaction(
    () => ({
      sy: storyProgress.value,
      oA: overrideActive.value,
      oG: overrideAngle.value,
      len: coordsSV.value.length,
      busy: reprojectBusy.value,
      // Reading a possibly-absent shared value has to happen here, in the
      // prepare block, not in the body: the reaction only re-runs on values
      // it actually read.
      owner: cameraOwner ? cameraOwner.value : 0,
      dragLat: cameraLat ? cameraLat.value : 0,
      dragLng: cameraLng ? cameraLng.value : 0,
    }),
    ({ sy, oA, oG, len, busy, owner, dragLat, dragLng }, previous) => {
      if (len === 0) return;

      // Do not update the last-published inputs while busy: once the current
      // projection finishes, those values are what let the reaction detect
      // and publish the latest position. This is latest-only backpressure,
      // not a frame drop that can strand the globe between articles.
      if (busy) return;

      const now = performance.now();
      const justReleased = previous?.busy === true;
      if (!justReleased && hasFired.value && now - lastTimeRef.value < 32) return;
      hasFired.value = true;
      lastTimeRef.value = now;

      // Finger owns the camera: publish where it put us and leave the list's
      // window alone. The throttle above still applies, so a drag reprojects
      // at the same ~30fps everything else does — the budget is the budget.
      if (owner === 1) {
        const unchanged =
          Math.abs(dragLng - lastReactLng.value) < 0.01 &&
          Math.abs(dragLat - lastReactLat.value) < 0.01 &&
          Math.abs(oA - lastReactOA.value) < 1e-4 &&
          Math.abs(oG - lastReactOG.value) < 0.01;
        if (unchanged) {
          // The camera has stopped. The reaction re-runs when the in-flight
          // projection releases `busy`, so this is where a drag or a flight
          // comes to rest, and the frame it last published was the in-motion
          // tier. Redraw it at full detail, once.
          if (!lastReactMoving.value) return;
          lastReactMoving.value = false;
          reprojectBusy.value = true;
          scheduleOnRN(
            runScrollReproject,
            dragLng,
            dragLat,
            lastReactSettled.value,
            lastReactLo.value,
            lastReactHi.value,
            lastReactFrac.value,
            oA,
            oG,
            false,
          );
          return;
        }
        lastReactLng.value = dragLng;
        lastReactLat.value = dragLat;
        lastReactOA.value = oA;
        lastReactOG.value = oG;
        lastReactMoving.value = true;
        if (viewLat) viewLat.value = dragLat;
        if (viewLng) viewLng.value = dragLng;
        reprojectBusy.value = true;
        scheduleOnRN(
          runScrollReproject,
          dragLng,
          dragLat,
          lastReactSettled.value,
          lastReactLo.value,
          lastReactHi.value,
          lastReactFrac.value,
          oA,
          oG,
          true,
        );
        return;
      }

      const coords = coordsSV.value;
      const articleCount = len / 2;
      const rawIndex = Math.max(0, sy);
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
        // In stories, not pixels: 0.002 of a story is well under a point of
        // any surface's travel.
        Math.abs(sy - lastReactSy.value) < 0.002 &&
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
      lastReactLo.value = lo;
      lastReactHi.value = hi;

      lastReactMoving.value = false;
      // The deck's camera, published for a gesture that takes it over.
      if (viewLat) viewLat.value = lat;
      if (viewLng) viewLng.value = lng;
      reprojectBusy.value = true;
      scheduleOnRN(runScrollReproject, lng, lat, settled, lo, hi, frac, oA, oG, false);
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

  // Re-project when the disc moves or resizes. `layoutRef` is written every
  // render so the *next* projection picks the new geometry up, but nothing
  // schedules one: the reaction fires on scroll and on the zoom override, and
  // neither changed. Without this the globe keeps its old radius until the
  // reader's next scroll — visible on rotation, and on the first frame after
  // safe-area insets resolve and the map's band changes height.
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
  }, [globeRadius, cx, cy, width, height, canvasReach]);

  // Re-project when the flagged exchanges change. Same reason as the
  // chokepoint effect below: the marks arrive from their own fetch, after
  // the frame that would otherwise have drawn them.
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
  }, [enrichedMarketMarks]);

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

  // Re-project when a story is found or the places change: the reaction only
  // fires on camera movement, and a tap that finds a story moves nothing.
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
  }, [placeMarks]);

  // Re-project when a hazard layer arrives — each is its own fetch, and lands
  // after the frame that would otherwise have drawn it.
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
  }, [enrichedFamine, enrichedThermal, enrichedGenocide]);

  // Tap pulse — radial ring that expands and fades on globe tap
  const pulseX = useSharedValue(0);
  const pulseY = useSharedValue(0);
  const pulseR = useSharedValue(0);
  const pulseOpacity = useSharedValue(0);

  // Found burst — the story's own hue swelling and fading where its mark was.
  // Two shapes so it reads as a thing collected rather than a tap ring: a disc
  // that grows as it fades, and a hairline ring that outruns it.
  const collectX = useSharedValue(0);
  const collectY = useSharedValue(0);
  const collectDiscR = useSharedValue(0);
  const collectRingR = useSharedValue(0);
  const collectOpacity = useSharedValue(0);
  const [collectColor, setCollectColor] = useState<string>(WHITE);

  useImperativeHandle(ref, () => ({
    settle() {
      // Called from a JS timer after a pinch — never from an animation
      // completion worklet, where `scheduleOnRN` aborts the app (worklets 0.10).
      finalizeReproject();
    },
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
    collect(x: number, y: number, color: string) {
      setCollectColor(color);
      collectX.value = x;
      collectY.value = y;
      collectOpacity.value = 0.95;
      // Reduce Motion: no growth, only the fade — the same substitution the
      // tap pulse makes. The mark still disappears, which is the confirmation.
      if (reduceMotion) {
        collectDiscR.value = 7;
        collectRingR.value = 0;
        collectOpacity.value = withTiming(0, {
          duration: COLLECT_REDUCED_MS,
          easing: PULSE_EASING,
        });
        return;
      }
      collectDiscR.value = 5;
      collectRingR.value = 7;
      collectDiscR.value = withTiming(14, { duration: COLLECT_MS, easing: PULSE_EASING });
      collectRingR.value = withTiming(32, { duration: COLLECT_MS, easing: PULSE_EASING });
      collectOpacity.value = withTiming(0, { duration: COLLECT_MS, easing: PULSE_EASING });
    },
    hitTest(x: number, y: number): TapResult | null {
      const frame = frameRef.current;
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
      // Story marks first. The nearest story within its catch radius wins
      // outright — no chooser — unless a reference mark sits nearer the finger:
      // finding the news is what the globe is for, and a chooser between a
      // story and a Green flood alert is a speed bump on every other tap.
      // Hotspots, the settled dot and Makkah never outrank a story: each of
      // those stands for coverage, and the story is the coverage.
      let story: { slug: string; color: string; d2: number } | null = null;
      for (const m of frame.storyMarks) {
        const d2 = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
        if (d2 <= STORY_HIT_PX2 && (!story || d2 < story.d2)) {
          story = { slug: m.slug, color: m.color, d2 };
        }
      }
      // A read place reopens its newest story, but only with no unread light in
      // reach: the lights still to find are what a tap on the globe is for.
      if (!story) {
        for (const m of frame.readMarks) {
          const d2 = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
          if (d2 <= STORY_HIT_PX2 && (!story || d2 < story.d2)) {
            story = { slug: m.slug, color: m.color, d2 };
          }
        }
      }
      if (story) {
        let overlay = Number.POSITIVE_INFINITY;
        const marks = [
          frame.chokepoints,
          frame.marketMarks,
          frame.gdacsMarks,
          frame.conflictMarks,
          frame.famineMarks,
          frame.thermalMarks,
          frame.genocideMarks,
        ];
        for (const layer of marks) {
          for (const m of layer) {
            const d2 = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
            if (d2 <= MARK_HIT_PX2 && d2 < overlay) overlay = d2;
          }
        }
        if (story.d2 <= overlay) {
          return {
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            storySlug: story.slug,
            storyColor: story.color,
          };
        }
      }

      const candidates: TapResult[] = [];

      // Hotspot glows — tight hit area (r²=900) signals precise intent.
      for (const z of frame.hotspotGlows) {
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
      for (const c of frame.chokepoints) {
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

      // Exchange marks — same 36px tap zone as the other reference markers.
      // Tiered above GDACS and conflict on purpose: there are at most three
      // of them, they are the marks the opening camera and the strip point
      // at, and a reader who taps what the gauge above just named should get
      // that and not a Green flood alert that happens to share the pixel.
      for (const m of frame.marketMarks) {
        if (isNear(x, y, m.x, m.y, 1296)) {
          candidates.push({
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            marketSignalId: m.id,
          });
        }
      }

      // GDACS disaster markers — 36px tap zone across all three tiers,
      // matching the chokepoint pattern. The previous tighter 20px zone
      // for Green-tier compensated for an invisible-feeling 2px ambient
      // dot; with the unified 22px glyph the visual now matches the
      // tap target across severity levels.
      for (const m of frame.gdacsMarks) {
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
      for (const m of frame.conflictMarks) {
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

      // Hazard layers — the reference marks' 36 px zone. A famine column in
      // Sudan and a conflict event beside it resolve through the chooser.
      for (const g of frame.genocideMarks) {
        if (isNear(x, y, g.x, g.y, MARK_HIT_PX2)) {
          candidates.push({
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            genocideId: g.id,
          });
        }
      }
      for (const a of frame.famineMarks) {
        if (isNear(x, y, a.x, a.y, MARK_HIT_PX2)) {
          candidates.push({
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            famineAreaId: a.id,
          });
        }
      }
      for (const e of frame.thermalMarks) {
        if (isNear(x, y, e.x, e.y, MARK_HIT_PX2)) {
          candidates.push({
            countryName: '',
            location: null,
            localTime: null,
            data: null,
            thermalEventId: e.id,
          });
        }
      }

      // Article dot — wider catch zone.
      const dot = frame.dot;
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
      if (frame.makkah && isNear(x, y, frame.makkah.x, frame.makkah.y, 3600)) {
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
      const limbR = frameRef.current.discRadius > 0 ? frameRef.current.discRadius : hitR;
      if (gdx * gdx + gdy * gdy <= limbR * limbR) {
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
  const canvasOrigin = useMemo(() => vec(width / 2, height / 2), [width, height]);

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

  // What is still to find, as a ring just outside the globe. The track is the
  // day's stories with a place; the arc is what is left, starting at twelve
  // o'clock and shrinking back toward it with each find — after the burst, so
  // the colour at the mark plays first. A number already says it on the sheet's
  // masthead; this says it where the lights are, without a word.
  const foundTotal = foundProgress?.total ?? 0;
  const leftFraction = foundTotal > 0 ? (foundTotal - (foundProgress?.found ?? 0)) / foundTotal : 0;
  const ringLeft = useSharedValue(leftFraction);
  useEffect(() => {
    ringLeft.value = reduceMotion
      ? leftFraction
      : withDelay(
          COLLECT_MS,
          withTiming(leftFraction, { duration: ANIMATION.slow, easing: PULSE_EASING }),
        );
  }, [leftFraction, reduceMotion, ringLeft]);
  // The ring follows the limb as the globe zooms, off the screen's edge with
  // it when the planet outgrows the screen: a ring left at the resting size
  // would be a reticle drawn across the ground.
  const ringRadius = useDerivedValue(() => framePictures.value.disc + RING_GAP);
  const ringPath = usePathValue((builder) => {
    'worklet';
    const r = framePictures.value.disc + RING_GAP;
    builder.addArc(Skia.XYWHRect(cx - r, cy - r, 2 * r, 2 * r), -90, 360);
  });

  return (
    <Canvas style={[styles.canvas, { width, height }]} pointerEvents="none">
      <Group transform={canvasTransform} origin={canvasOrigin}>
        {/* Stars and the moon — behind the planet, so clipped to outside its
          limb, which moves with the zoom (`discClip`). */}
        <Group clip={discClip} invertClip>
          <Picture picture={starsPicture} />
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
        </Group>

        {/* Ground — the atmospheric rim, the ocean, the subsolar glint,
          daylight, the graticule, land, ice, borders, night, city lights and
          the inner-limb glaze. Recorded per projection; see
          `recordGlobeFrame`. */}
        <Picture picture={groundPicture} />

        {/* Marks — hotspots, straits, exchanges, hazards, the country
          highlight, rivers, arcs, stories and the settled dot. */}
        <Picture picture={marksPicture} />

        {/* Still to find — see `ringLeft`. */}
        {foundTotal > 0 ? (
          <Group>
            <Circle
              cx={cx}
              cy={cy}
              r={ringRadius}
              color={colors.rule}
              style="stroke"
              strokeWidth={RING_WIDTH}
            />
            <Path
              path={ringPath}
              start={0}
              end={ringLeft}
              color={colors.textSecondary}
              style="stroke"
              strokeWidth={RING_WIDTH}
              strokeCap="round"
            />
          </Group>
        ) : null}

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

        {/* Found burst — see `collect`. */}
        <Group opacity={collectOpacity}>
          <Circle cx={collectX} cy={collectY} r={collectDiscR} color={collectColor} opacity={0.5} />
          <Circle
            cx={collectX}
            cy={collectY}
            r={collectRingR}
            color={collectColor}
            style="stroke"
            strokeWidth={1.6}
          />
        </Group>

        {/* Labels — water, neighbours, the focused country, the dot label
          and the poles, above the tap pulse. */}
        <Picture picture={labelsPicture} />
      </Group>
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
