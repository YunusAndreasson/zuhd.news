import type { CardDelta } from '../../lib/cards/types';
import { straitMapChange, straitWeekChange } from '../../lib/strait-map';

('use no memo');

// React Compiler is enabled app-wide (app.json experiments.reactCompiler) with
// no other opt-out for this file. This component's reprojection hot path
// depends on several `useCallback(..., [])` closures that are DELIBERATELY
// stale (see the `biome-ignore lint/correctness/useExhaustiveDependencies`
// comments below, e.g. `callReproject`) — they read the latest state through
// refs on purpose, for perf, not by oversight. The compiler's job is to
// rewrite exactly that pattern, so it must not run on this file.

import { COUNTRY_DATA, type CountryData } from '@shared/countries/country-data';
import { CITY_TZ, COUNTRY_TZ, SOURCE_COORDS, zoneAt } from '@shared/globe/coordinates';
import type { Article, Chokepoint, ConflictEvent, GdacsAlert, HeatmapPoint } from '@shared/types';
import {
  BlendMode,
  BlurMask,
  BlurStyle,
  Canvas,
  Circle,
  createPicture,
  FontEdging,
  FontHinting,
  Group,
  PaintStyle,
  Path,
  Picture,
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
  type SkShader,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type Transforms3d,
  useFont,
  useTexture,
  vec,
} from '@shopify/react-native-skia';
import { geoCentroid, geoDistance, geoOrthographic } from 'd3-geo';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
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
  KEEP_MOTION,
  WHITE,
} from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { articleTime } from '../../lib/article-utils';
import { collapseConflictVisuals, eventAgeDays } from '../../lib/conflict';
import { alertAgeDays } from '../../lib/gdacs';
import {
  arcDegrees,
  type FlyCurve,
  flyCurve,
  flyPosition,
  flySpanClip,
  reachFor,
  slerpLatLng,
  viewAngleFor,
} from '../../lib/globe-camera';
import { isStorySettled } from '../../lib/globe-settle';
import {
  layoutMarketClusters,
  type MarketCluster,
  type MarketPoint,
  marketHitDistanceSquared,
} from '../../lib/market-map-layout';
import { coverageRanks } from '../../lib/now';
import {
  conflictScale,
  FAMINE_BOX_MAX,
  type FamineArea,
  famineAlpha,
  famineBlocks,
  famineBox,
  type GenocideSituation,
  type ThermalEvent,
  thermalAlpha,
  thermalBox,
} from '../../lib/overlays';
import { displayCountryName, displayLocation, wrapCountryLabel } from '../../lib/place-names';
import {
  type FoundProgress,
  type StoryPlace,
  topUnfound,
  unfoundSlugs,
} from '../../lib/story-places';
import { chokepointValence } from '../../lib/valence';
import {
  CITY_LIGHT_COUNT,
  CITY_LIGHT_DEEP_NIGHT_DOT,
  CITY_LIGHT_RADIUS,
  CITY_LIGHT_UNITS,
} from './city-lights';
import {
  getLakeFillFeatureCollection,
  getLakeLabels,
  getMajorRiverFeatureCollection,
  getRiverLabels,
  getSeas,
} from './detail-geo';
import { CHOKEPOINT_PATH, GLYPH_HALF, getGlyphPath } from './disaster-glyphs';
import { geographyTier, getGlobeGeography } from './geography';
import { createOrthoLayer, type OrthoLayer } from './ortho-stream';
import {
  FAMINE_FRAME_PATH,
  FAMINE_FRAME_STROKE,
  getFamineBlocksPath,
  THERMAL_CORE_PATH,
  THERMAL_RAY_STROKE,
  THERMAL_RAYS_PATH,
} from './overlay-glyphs';
import { CAPITALS } from './places';
import {
  ANCHOR_COUNTRY_AREA,
  ANCHOR_NAMES_EXTRA,
  clipAngleForCountry,
  DECAY_LAMBDA,
  FRAMING_WIDEST,
  findCountry,
  formatLocalTime,
  getSunPosition,
  invalidateSunCaches,
  isNear,
  MAKKAH,
  PLACES_APPEAR_CLIP,
  PLACES_FULL_CLIP,
  RIVERS_APPEAR_CLIP,
  RIVERS_REST_CLIP,
  RIVERS_REST_OPACITY,
} from './projection';
import {
  countryAreas,
  countryCentroidNames,
  countryCentroids,
  countryCentroidUnits,
  createSkiaPathContext,
  type SkiaGeoContext,
} from './shared';
import {
  capFill,
  graticuleLines,
  type OrthoView,
  orthoView,
  SCREEN_POINT,
  screenPoint,
  unit,
} from './sphere-circles';
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
  const sprites: ReturnType<typeof rect>[] = [];
  const transforms: ReturnType<typeof Skia.RSXform>[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    sprites.push(spec.srcRect);
    transforms.push(Skia.RSXform(1, 0, p.x - spec.center, p.y - spec.center));
  }
  return { sprites, transforms };
}

interface PlaceMark {
  /** Every story here is found: a quiet ring, not a beacon. */
  read: boolean;
  /** The place, as a unit vector for `screenPoint`. */
  unit: readonly [number, number, number];
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
  marks: { x: number; y: number; recencyAlpha: number; scale: number }[],
  rgb: readonly [number, number, number],
) {
  const visuals = collapseConflictVisuals(marks);
  if (visuals.length === 0) return null;
  const sprites: ReturnType<typeof rect>[] = [];
  const transforms: ReturnType<typeof Skia.RSXform>[] = [];
  const colors: Float32Array[] = [];
  for (let i = 0; i < visuals.length; i++) {
    const m = visuals[i];
    if (!m) continue;
    // Sized by the death toll (`conflictScale`), about the mark's centre.
    const k = m.scale;
    sprites.push(spec.srcRect);
    transforms.push(Skia.RSXform(k, 0, m.x - spec.center * k, m.y - spec.center * k));
    colors.push(Float32Array.of(rgb[0], rgb[1], rgb[2], m.recencyAlpha));
  }
  return { sprites, transforms, colors };
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
/** The current story's dot, in points: still, at the size it already drew at
 *  under Reduce Motion. */
const ACTIVE_DOT_R = 6;
/** The location beside the current story's dot — the most important text on
 *  the globe, and since the dot stopped breathing, what says which place is
 *  being read. It was 14pt. */
const DOT_LABEL_PT = 16;
/** How far right of the dot's centre the location starts: the dot's radius,
 *  its 2pt ring and 4pt of air. It was 6, inside the ring, so the dot sat on
 *  the first letter and the time tucked under the dot. */
const DOT_LABEL_DX = ACTIVE_DOT_R + 2 + 4;
/** Its ascent above the baseline, and its width per character before the font
 *  has loaded, for the collision boxes. */
const DOT_LABEL_ASCENT = 14;
const DOT_LABEL_CHAR_W = 8;
/** The local time's baseline below the dot: one line under the location's,
 *  which sits at +4. */
const DOT_SUB_DY = 4 + DOT_LABEL_PT;
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
/** Scaled 0.62–1.15 by coverage, which lands on the web's 3.4–6.3 px radius. */
const BEACON_R = 5.5;
/** A place whose stories are all found keeps a hollow ring this size: small
 *  enough that the beacons still to find stay the loud marks, visible enough to
 *  say where the reader has been. */
const READ_R = 3.5;
/** The ring around the selected gauge's place: clear of a strait's glyph and
 *  its glow, inside the hit radius a finger would use on it. */
const SELECTED_R = 15;
/** A capital's dot, and how far right of it its name starts. */
const CAPITAL_DOT_R = 1.6;
const CAPITAL_TEXT_DX = 4;

/** Built on the first frame that needs them, so the 50m river and lake
 *  topologies decode on the first settled frame rather than at launch. */
let riversLayer: OrthoLayer | null = null;
let lakesLayer: OrthoLayer | null = null;
/**
 * The 50m rivers and lakes are settled detail, and decoding them — two
 * topologies, then a layer each — was on the first settled frame's own path:
 * the globe stayed blank until the Niger was ready. They are decoded on the
 * tick after the first settled frame is on screen, which then redraws with
 * them; the frame before draws without, as a moving frame always has.
 */
let detailGeoWarming = false;
function warmDetailGeo(then: () => void) {
  if (detailGeoWarming) return;
  detailGeoWarming = true;
  setTimeout(() => {
    riversLayer = createOrthoLayer(getMajorRiverFeatureCollection());
    lakesLayer = createOrthoLayer(getLakeFillFeatureCollection());
    then();
  }, 0);
}
const READ_ALPHA = 0.7;
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
const OVERLAY_TEXTURE_SIZE = { width: OVERLAY_CELL * OVERLAY_CELLS, height: OVERLAY_CELL };
const THERMAL_CELL = 4;
const overlayCell = (i: number) => rect(i * OVERLAY_CELL, 0, OVERLAY_CELL, OVERLAY_CELL);
const FAMINE_SRC = [overlayCell(0), overlayCell(1), overlayCell(2), overlayCell(3)] as const;
const THERMAL_SRC = overlayCell(THERMAL_CELL);
/** A famine column's drawn frame is 10 × 14 of its 16-unit box, at most
 *  `FAMINE_BOX_MAX` — about 9 × 12 pt. Two columns closer than that, plus a
 *  point, on both axes overlap, and the lesser one is not drawn. */
const FAMINE_COLLIDE_X = Math.ceil((FAMINE_BOX_MAX * 10) / 16) + 1;
const FAMINE_COLLIDE_Y = Math.ceil((FAMINE_BOX_MAX * 14) / 16) + 1;
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

type LabelBox = { x0: number; y0: number; x1: number; y1: number };

/** From a genocide mark's centre to its name's near edge. */
const GENOCIDE_LABEL_DX = 13;

/** Where a genocide mark's name starts — see `genocideMarks.labelX`. */
function genocideLabelX(x: number, tw: number, width: number): number | null {
  if (x < -9 || x > width + 9) return null;
  const right = x + GENOCIDE_LABEL_DX;
  const start = right + tw <= width - 4 ? right : x - GENOCIDE_LABEL_DX - tw;
  return Math.max(4, Math.min(width - 4 - tw, start));
}

/** A genocide mark and its always-drawn name. */
function genocideLabelBox(
  g: { x: number; y: number; label: string; labelX: number | null },
  font: SkFont | null,
): LabelBox {
  const tw = font ? textWidth(font, g.label) : g.label.length * 6;
  const lx = g.labelX ?? g.x;
  return {
    x0: Math.min(g.x - 9, lx),
    x1: Math.max(g.x + 9, g.labelX === null ? g.x : lx + tw),
    y0: Math.min(g.y - 9, g.y + 4 - MARK_LABEL_ASCENT),
    y1: Math.max(g.y + 9, g.y + 4 + MARK_LABEL_DESCENT),
  };
}

/** The clear space between two counts: their halos are ~2.5pt wide, and at a
 *  1pt gap "5" and "8" still read as "58". */
const COUNT_GAP = 4;

/** From a conflict glow's centre to its count. */
const CONFLICT_COUNT_DX = 9;

/** A conflict stack's count, where the draw call sets it. */
function conflictCountBox(
  m: { x: number; y: number; count: number },
  font: SkFont | null,
): LabelBox {
  const text = String(m.count);
  const x0 = m.x + CONFLICT_COUNT_DX;
  return {
    x0,
    x1: x0 + (font ? textWidth(font, text) : text.length * 7),
    y0: m.y - 4 - MARK_LABEL_ASCENT,
    y1: m.y - 4 + MARK_LABEL_DESCENT,
  };
}

/** A story count, where the draw call sets it: past the beacon's edge, raised. */
function storyCountBox(
  m: { x: number; y: number; scale: number; count: number },
  font: SkFont | null,
): LabelBox {
  const text = String(m.count);
  const x0 = m.x + BEACON_R * m.scale + 3;
  return {
    x0,
    x1: x0 + (font ? textWidth(font, text) : text.length * 7),
    y0: m.y - 4 - MARK_LABEL_ASCENT,
    y1: m.y - 4 + MARK_LABEL_DESCENT,
  };
}

/** The location and local time beside the current story's dot, both rows:
 *  the name's baseline 4 below the dot and `DOT_LABEL_DX` right of it, the
 *  time's at `DOT_SUB_DY`. Widths fall back to a count of characters until the fonts
 *  load. The dot and its ring are part of the box: measured from the label
 *  alone, a country name centred on the story's place passed as clear and
 *  printed through the dot — `IT●Y` over Rome (2026-09-23). */
function dotLabelBox(
  dl: { text: string; sub?: string; x: number; y: number },
  label: SkFont | null,
  sub: SkFont | null,
): LabelBox {
  const dw = label ? textWidth(label, dl.text) : dl.text.length * DOT_LABEL_CHAR_W;
  const sw = dl.sub ? (sub ? textWidth(sub, dl.sub) : dl.sub.length * 5) : 0;
  const ring = ACTIVE_DOT_R + 4;
  return {
    x0: dl.x - ring,
    x1: dl.x + DOT_LABEL_DX + Math.max(dw, sw),
    y0: Math.min(dl.y + 4 - DOT_LABEL_ASCENT, dl.y - ring),
    y1: Math.max(dl.y + (dl.sub ? DOT_SUB_DY : 4) + 4, dl.y + ring),
  };
}

/** The focused country's name: centred on x, first baseline at y, each further
 *  line `LABEL_LINE_HEIGHT` below. Ascender ≈ 10 for its 12pt SemiBold. */
function countryLabelBox(
  cl: { lines: string[]; x: number; y: number },
  font: SkFont | null,
): LabelBox {
  const w = measureLines(cl.lines, font, 6);
  return {
    x0: cl.x - w / 2,
    x1: cl.x + w / 2,
    y0: cl.y - 10,
    y1: cl.y + (cl.lines.length - 1) * LABEL_LINE_HEIGHT + 3,
  };
}

function boxesMeet(a: LabelBox, b: LabelBox, gap: number): boolean {
  return a.x0 - gap < b.x1 && a.x1 + gap > b.x0 && a.y0 - gap < b.y1 && a.y1 + gap > b.y0;
}

/** Where a strait's or an exchange's name may go, as its baseline below the
 *  mark: under the 22pt glyph first, then over it. */
const MARK_LABEL_DY = [20, -14] as const;
/** The clear space a mark's name keeps from every label placed before it. */
const MARK_LABEL_GAP = 2;
/**
 * Past this zoom-out the globe names only the straits whose traffic has moved
 * and the single exchanges: a cluster's `8 markets` and every quiet strait's
 * name and `vs 90d` filled the whole-planet view with words that each fit and
 * together read as noise. The cluster's glyph still prints its count, a quiet
 * strait keeps its mark, and a tap names either. Story framings are 18°–24°.
 */
const MARK_NAMES_PLANET_CLIP = 45;
/**
 * A market's or a strait's label is two lines (2026-09-22, the user's
 * request): the name, then the move under it — `Strait of Hormuz` over
 * `↓57% vs 90d`. It was one line, `Strait of Hormuz ↓57% vs 90d`, 11pt and
 * tinted end to end, which ran a third of the way across a phone and put the
 * name in a traffic colour.
 *
 * The move is the larger line: it is what changed, and on a data map the
 * figure carries the weight while the name says what it is. The name is
 * 11pt in plain ink (a strait's in the water labels' italic, the atlas
 * convention for a passage); the move is `MARK_VALUE_PT` semibold in its
 * direction's colour, and a strait's `vs 90d` stays 11pt secondary beside
 * it, a qualifier rather than a second figure. The story's location, 16pt,
 * is still the largest text on the globe.
 */
const MARK_VALUE_PT = 13;
/** From the name's baseline to the move's. */
const MARK_VALUE_DY = 15;
/** A label's box above and below its first baseline, for collisions. */
const MARK_LABEL_ASCENT = 10;
const MARK_LABEL_DESCENT = 3;

/** The words of a mark's label, and the faces they are set in. */
interface MarkLabelText {
  name: string;
  nameFont: SkFont | null;
  move?: string;
  /** What the move is measured against (`vs 90d`), set small after it. */
  basis?: string;
  valueFont: SkFont | null;
  basisFont: SkFont | null;
}

function measureOr(font: SkFont | null, text: string, perChar: number): number {
  return font ? textWidth(font, text) : text.length * perChar;
}

/** The move line's width: the figure, then a space and the basis. */
function moveLineWidth(t: MarkLabelText): number {
  if (!t.move) return 0;
  const move = measureOr(t.valueFont, t.move, 6.5);
  return t.basis ? move + measureOr(t.basisFont, ` ${t.basis}`, 5) : move;
}

/** The label's width: its longer line. */
function markLabelWidth(t: MarkLabelText): number {
  return Math.max(measureOr(t.nameFont, t.name, 5), moveLineWidth(t));
}

/** How far the label's last line sits below its first baseline. */
function markLabelDepth(t: MarkLabelText): number {
  return t.move ? MARK_VALUE_DY : 0;
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

/** The low-sun band's reach from the antisolar point: the sun within 6° of
 *  the horizon. */
const TWILIGHT_RADIUS = 96;
/** The projection scale past which a moving frame still resamples its edges —
 *  see `callReproject`. A phone's disc is ~190 pt, so a pinch past ~28° is
 *  over it, and so is the end of a swipe landing on a story framing (18°–24°
 *  since 2026-09-19; they were 30°–40° and stayed under it), where the cap in
 *  view is smaller and so is the path. */
const MOTION_RESAMPLE_SCALE = 400;

export interface TapResult {
  countryName: string;
  location: string | null;
  localTime: string | null;
  data: CountryData | null;
  hotspotLabels?: string[];
  isHotspot?: boolean;
  /** Set when the tap landed on an ambient chokepoint ring. The parent
   *  resolves the ID to the full Chokepoint payload and opens the strait's card. */
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
  /** The clip a story rests at, in degrees — what the deck frames it with, so
   *  a flight to it can land exactly there. */
  framingFor: (index: number) => number;
}

interface MiniGlobeProps {
  articles: Article[];
  heatmapPoints?: HeatmapPoint[];
  chokepoints?: Chokepoint[];
  /** Each strait's seven-day move as the strip prints it, by chokepoint id.
   *  Where there is one, the label prints it, so one strait reads one number
   *  on the screen. Key it with `useMemo` (see the inline-props note). */
  straitMoves?: Readonly<Record<string, CardDelta>>;
  /** Where a story flight will land (`useCameraFlight`), so its last frame
   *  can be drawn a little early. */
  landingAt?: SharedValue<{ lat: number; lng: number; story: number } | null>;
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
  /** Published exchanges, resolved to their actual exchange coordinates. */
  marketViewport?: { top: number; bottom: number };
  marketMarks?: {
    id: string;
    /** The index's name, the label's first line. */
    label: string;
    /** Its move (`↓4.8%`), the second. */
    move?: string;
    lat: number;
    lng: number;
    direction?: 'up' | 'down' | 'flat';
  }[];
  /**
   * `[lat, lng]` of the gauge whose card is open, ringed on the globe so the
   * reader can tell which mark a gauge belongs to. A position rather than a
   * mark id, because a strait's card id and its mark's id are different
   * strings and a ring should not need a lookup table to find its place.
   */
  selectedAt?: readonly [number, number] | null;
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
  unit: readonly [number, number, number];
  intensity: number; // 0–1 log-normalized
  recency: number; // 0–1, 1 = just now, decays with age
  labels: string[];
  countryName: string | null;
}

interface GlobeState {
  /** Projected at rest, at the resting detail tier (`nearSettled`). */
  settled: boolean;
  landPath: SkPath | null;
  /** The large lakes (`LAKE_FILL_MIN_AREA`), cut out of the land. Settled
   *  frames only; null while the camera moves. */
  lakesPath: SkPath | null;
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
    /** Whether its count is printed: at least `storyCountMin`, and clear of
     *  a larger count beside it. Decided in the reprojection. */
    showCount?: boolean;
  }[];
  /** Stack counts show beside places with at least this many unfound stories. */
  storyCountMin: number;
  /** Places whose stories are all found. Tappable, below any beacon in reach. */
  readMarks: { x: number; y: number; slug: string; color: string }[];
  famineMarks: { x: number; y: number; id: string; blocks: number; alpha: number; scale: number }[];
  thermalMarks: { x: number; y: number; id: string; alpha: number; scale: number }[];
  genocideMarks: {
    x: number;
    y: number;
    id: string;
    label: string;
    /** Where the name starts, or null when the mark is off the screen. It
     *  sits right of the mark, left of it when the right would run off the
     *  screen, and is held on the screen either way: RAKHINE was cut at the
     *  right edge of the whole-planet view. */
    labelX: number | null;
  }[];
  dotLabel: { text: string; sub?: string; x: number; y: number; opacity: number } | null;
  /** Country name anchored near the highlighted country's centroid. Rendered
   *  at every zoom level (including fully zoomed-out) so the reader always
   *  has geographic context for the article. `lines` is normally length 1,
   *  but wraps to 2 for long names (e.g. "Bosnia and / Herzegovina") — see
   *  `wrapCountryLabel`. Null when the centroid falls on the globe's far
   *  side. The anchor `(x, y)` is the baseline of the FIRST line; subsequent
   *  lines stack below at LINE_HEIGHT spacing. */
  countryLabel: { lines: string[]; x: number; y: number } | null;
  makkah: { x: number; y: number } | null;
  /** The place of the gauge whose card is open, ringed. Null when nothing is
   *  selected or the place is on the far side. */
  selected: { x: number; y: number } | null;
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
    /** The strait's name, the label's first line. */
    label: string;
    /** Its traffic move (`↓57%`) and what that is against (`vs 90d`), the
     *  second line. */
    move?: string;
    basis?: string;
    intensity: number;
    direction?: 'up' | 'down' | 'flat';
    /** The printed move is a disruption: red, as the strip colours it. */
    moveAlarm?: boolean;
    labelX: number;
    disrupted: boolean;
    /** Traffic well above its normal — the web's teal strait. */
    surge: boolean;
    /** The name's baseline, or null when there was no room for it. */
    labelY: number | null;
  }[];
  /** Clustered market targets; their members remain individually reachable. */
  marketMarks: (MarketCluster & {
    labelX: number;
    labelY: number | null;
    labelBounds: LabelBox | null;
  })[];
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
    /** `conflictScale` of the event's fatalities. */
    scale: number;
  }[];
  /** The conflict counts printed beside their glows: stacks of three or more,
   *  clear of every story count (which wins). Decided in the reprojection. */
  conflictCounts: { x: number; y: number; count: number }[];
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
  /** Country capitals (`places.ts`) that survived the label packer: a dot and
   *  a name, at every zoom, below the neighbour countries in priority. */
  capitalLabels: { name: string; x: number; y: number }[];
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
  /** Projected major-river linestrings. Drawn as a soft halo + blue-grey stroke over
   *  land when the globe is zoomed past PLACES_APPEAR_CLIP. Null at default
   *  zoom — no path projection work runs. */
  riversPath: SkPath | null;
  /** Opacity for riversPath — folds the zoom-band fade factor so rivers
   *  emerge smoothly as the camera tightens. */
  riversOpacity: number;
  /** Night-side city pinpricks, deep-night tier (sun depressed past civil
   *  twilight). Painted brightest. Null when no cities qualify on the
   *  visible hemisphere — first paint and globe-noon framings are common
   *  cases. The ~190-entry input loop is dot products, no trig — see
   *  `collectCityLights`. */
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

/** Country highlight opacity — scaled by area so small nations still read at
 *  globe scale. The soft glow is the body; a crisp outline (drawn separately,
 *  brighter than the borders and coastline) is what makes the focused country
 *  lead the figure-ground hierarchy. */
function countryHighlightOpacity(countryName: string | null): number {
  const area = countryName ? (countryAreas[countryName] ?? 0) : 0;
  return area < 0.001 ? 0.25 : area < 0.005 ? 0.18 : 0.12;
}

const EMPTY_GLOBE: GlobeState = {
  settled: false,
  landPath: null,
  lakesPath: null,
  capitalLabels: [],
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
  selected: null,
  subsolar: null,
  hotspotGlows: [],
  chokepoints: [],
  marketMarks: [],
  gdacsMarks: [],
  conflictMarks: [],
  conflictCounts: [],
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
  view: OrthoView,
  clipCos: number,
  sunUnitX: number,
  sunUnitY: number,
  sunUnitZ: number,
  nightPath: SkPathBuilder,
  twilightPath: SkPathBuilder,
  collectTwilight: boolean,
): { hasNight: boolean; hasTwilight: boolean } {
  let hasNight = false;
  let hasTwilight = false;
  // Read once, not per light: see `createSkiaPathContext`. Each method is
  // bound to the builder it was read from.
  const addNight = nightPath.addCircle;
  const addTwilight = twilightPath.addCircle;
  for (let i = 0; i < CITY_LIGHT_COUNT; i++) {
    const i3 = i * 3;
    const ux = CITY_LIGHT_UNITS[i3] as number;
    const uy = CITY_LIGHT_UNITS[i3 + 1] as number;
    const uz = CITY_LIGHT_UNITS[i3 + 2] as number;
    // Sun-overhead dot: > 0 = day side, ≤ 0 = night side.
    const sunDot = ux * sunUnitX + uy * sunUnitY + uz * sunUnitZ;
    if (sunDot > 0) continue;
    // Tier is known from sunDot before projecting, so the zoom-gated
    // twilight tier skips its projection entirely at 1× ambient.
    const isDeepNight = sunDot < CITY_LIGHT_DEEP_NIGHT_DOT;
    if (!isDeepNight && !collectTwilight) continue;
    // Clip-cone cull and projection, no trig.
    if (!screenPoint(view, ux, uy, uz, clipCos)) continue;
    if (isDeepNight) {
      addNight.call(nightPath, SCREEN_POINT[0], SCREEN_POINT[1], CITY_LIGHT_RADIUS);
      hasNight = true;
    } else {
      addTwilight.call(twilightPath, SCREEN_POINT[0], SCREEN_POINT[1], CITY_LIGHT_RADIUS);
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
// Read once, called through `.call`: a property read on a Skia host object is
// a JSI call that costs more than the call it fetches (`shared.ts`), and a
// frame sets up some fifty paints of four to six calls each.
const paintAssign = framePaint.assign;
const paintSetColor = framePaint.setColor;
const paintSetAlphaf = framePaint.setAlphaf;
const paintSetStyle = framePaint.setStyle;
const paintSetStrokeWidth = framePaint.setStrokeWidth;
const paintSetStrokeJoin = framePaint.setStrokeJoin;
const paintSetStrokeCap = framePaint.setStrokeCap;
BASE_PAINT.setAntiAlias(true);
const SOURCE_ARC_DASH = Skia.PathEffect.MakeDash([6, 3], 0);
const QIBLA_DASH = Skia.PathEffect.MakeDash([4, 2], 0);
const HIGHLIGHT_BLUR = Skia.MaskFilter.MakeBlur(BlurStyle.Solid, 1, true);

function recordEmptyPicture(): SkPicture {
  frameRecorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return frameRecorder.finishRecordingAsPicture();
}
const EMPTY_PICTURE = recordEmptyPicture();

/**
 * The zone at a place: its dateline's city, then its longitude where the
 * country spans several (`zoneAt`), then the country's one zone. Every local
 * time on the globe comes through here — the place label, and the time a tap
 * on the place, a hotspot or a country reports — so a tap cannot print a
 * different hour from the label beside it. Three of the four read the
 * country's zone alone until 2026-09-24, so anywhere in the US read New
 * York's time.
 */
function zoneFor(
  country: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  city?: string | null,
): string | undefined {
  // Strip diacritics so an accented dateline ("Culiacán", "São Paulo")
  // matches the ASCII-keyed CITY_TZ table.
  const cityKey = (city ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    (cityKey ? CITY_TZ[cityKey] : undefined) ??
    zoneAt(country, lat, lng) ??
    (country ? COUNTRY_TZ[country] : undefined)
  );
}

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
  paintAssign.call(framePaint, BASE_PAINT);
  return framePaint;
}

/** A fill in `color` at `opacity`, as `<Path color opacity>` drew it. */
function fillPaint(color: string, opacity = 1): SkPaint {
  const c = skColor(color);
  const paint = plainPaint();
  paintSetColor.call(paint, c);
  paintSetAlphaf.call(paint, (c[3] ?? 1) * opacity);
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
  paintSetStyle.call(paint, PaintStyle.Stroke);
  paintSetStrokeWidth.call(paint, width);
  if (join !== undefined) paintSetStrokeJoin.call(paint, join);
  if (cap !== undefined) paintSetStrokeCap.call(paint, cap);
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
/**
 * Radial gradients by their stops, in unit space (centre 0,0, radius 1).
 *
 * A glow used to build a shader per call — every coverage glow, strait glow and
 * the rim, ocean and glaze on every recorded frame, each a JSI allocation. The
 * gradient only depends on its colours and positions; where it sits and how big
 * it is is the canvas transform's job. Keyed on 8-bit channels, which is what
 * the gradient resolves to on screen anyway, and cleared when it grows past a
 * frame's worth of variety, so a continuous intensity cannot grow it forever.
 */
const glowShaders = new Map<string, SkShader>();
const GLOW_SHADER_LIMIT = 256;
function glowShader(colors: SkColor[], positions: number[]): SkShader {
  let key = '';
  for (const c of colors) {
    key += `${Math.round((c[0] ?? 0) * 255)},${Math.round((c[1] ?? 0) * 255)},${Math.round((c[2] ?? 0) * 255)},${Math.round((c[3] ?? 0) * 255)};`;
  }
  for (const p of positions) key += `${p},`;
  let shader = glowShaders.get(key);
  if (!shader) {
    if (glowShaders.size >= GLOW_SHADER_LIMIT) glowShaders.clear();
    shader = Skia.Shader.MakeRadialGradient(vec(0, 0), 1, colors, positions, TileMode.Clamp);
    glowShaders.set(key, shader);
  }
  return shader;
}

function drawGlow(
  canvas: SkCanvas,
  x: number,
  y: number,
  r: number,
  colors: SkColor[],
  positions: number[],
) {
  if (!(r > 0)) return;
  const paint = plainPaint();
  paint.setDither(true);
  paint.setShader(glowShader(colors, positions));
  canvas.save();
  canvas.translate(x, y);
  canvas.scale(r, r);
  canvas.drawCircle(0, 0, 1, paint);
  canvas.restore();
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

/** The faces a mark's label is set in. */
type MarkFonts = { sub: SkFont | null; water: SkFont | null; value: SkFont | null };

/** A strait's label: its name in the water labels' italic. */
function straitLabelText(
  cp: { label: string; move?: string; basis?: string },
  f: MarkFonts,
): MarkLabelText {
  return {
    name: cp.label,
    nameFont: f.water,
    move: cp.move,
    basis: cp.basis,
    valueFont: f.value,
    basisFont: f.sub,
  };
}

/** An exchange's label, or a cluster's count of markets (which has no move). */
function marketLabelText(m: { label: string; move?: string }, f: MarkFonts): MarkLabelText {
  return { name: m.label, nameFont: f.sub, move: m.move, valueFont: f.value, basisFont: f.sub };
}

/**
 * A market's or a strait's label, centred on `x` with its first baseline at
 * `y` — the name, then the move a line under it with its basis after it.
 * Every line carries the same halo, so the block reads as one label.
 */
function drawMarkLabel(
  canvas: SkCanvas,
  t: MarkLabelText,
  x: number,
  y: number,
  ink: { name: string; move: string; basis: string; halo: string },
  haloOpacity: number,
) {
  if (t.nameFont) {
    drawHaloText(
      canvas,
      t.name,
      x - textWidth(t.nameFont, t.name) / 2,
      y,
      t.nameFont,
      ink.name,
      ink.halo,
      1,
      haloOpacity,
    );
  }
  if (!t.move || !t.valueFont) return;
  const lineY = y + MARK_VALUE_DY;
  const left = x - moveLineWidth(t) / 2;
  drawHaloText(canvas, t.move, left, lineY, t.valueFont, ink.move, ink.halo, 1, haloOpacity);
  if (t.basis && t.basisFont) {
    drawHaloText(
      canvas,
      ` ${t.basis}`,
      left + textWidth(t.valueFont, t.move),
      lineY,
      t.basisFont,
      ink.basis,
      ink.halo,
      1,
      haloOpacity,
    );
  }
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
  overlay: SkImage | null;
  dot: SkImage | null;
  makkah: SkImage | null;
}

const NO_TEXTURES: GlobeTextures = {
  ghost: null,
  storyHalo: null,
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
    /** A mark's move, the second line of a market's or strait's label. */
    value: SkFont | null;
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
  /** The ground a settling frame replaces, and the camera it was drawn from:
   *  drawn under the new ground while that fades in (`groundFade`). */
  prevGround: SkPicture;
  prevCam: RecordedCamera | null;
  activeDot: { x: number; y: number } | null;
  activeColor: string;
  disc: number;
  /** The camera the pictures were projected from — what the warp measures
   *  the live camera against. `k` is the projection's scale. */
  cam: RecordedCamera | null;
}

interface RecordedCamera {
  lat: number;
  lng: number;
  k: number;
}

/** The camera this frame, written on the UI thread every frame it moves. */
interface LiveCamera {
  lat: number;
  lng: number;
  clip: number;
}

/**
 * How far past the canvas a moving frame is projected, as a multiple of the
 * canvas's reach. The warp carries the last picture toward the live camera
 * between projections, and ground recorded only to the canvas's edge would
 * leave ocean where land should be along the trailing edge. Settled frames
 * stay at the canvas: their detail is the expensive part.
 */
const MOTION_REACH = 1.2;

/** The warp's strength by the limb's radius over the canvas's reach (see
 *  `warp`): full from `WARP_FULL_LIMB`, off at `WARP_NO_LIMB`. Every story
 *  framing, rise included (18°–30° of clip), sits at 0.64–1.04 on a phone,
 *  where the limb shows at most across the top corners under the header's
 *  shade; the whole planet on screen sits near 0.3. */
const WARP_FULL_LIMB = 0.6;
/** How long a landing's detailed ground takes to fade in over the moving
 *  one: long enough to read as the map sharpening, short enough to be done
 *  before the eye has moved to the card. */
const GROUND_FADE_MS = 220;
/** How close a flight's camera is, in degrees of latitude, longitude and
 *  clip, before its landing is drawn (`drawLanding`). */
const LANDING_NEAR_DEG = 0.5;
/** How close a swipe's spring is to a story, as a share of the crossing,
 *  before its landing is drawn. */
const LANDING_NEAR_FRAC = 0.03;
const WARP_NO_LIMB = 0.4;

const NO_WARP: Transforms3d = [];

/** How many settled cameras keep their geometry: the story in front, the
 *  two either side of it (`prefetchSettled`), and room for a revisit. */
const SETTLED_CACHE_SIZE = 5;

/**
 * A settled camera's key. Rounded far below a pixel (1e-4° is ~0.001 px at a
 * story's framing), because the deck reaches a story through `slerpLatLng`
 * and `flyCurve`, whose trig leaves floating-point noise on the story's own
 * coordinates: an exact key matched only a camera computed the same way
 * twice, so a prefetch from the story's coordinates could never be found.
 */
function settledKey(
  tier: string,
  lng: number,
  lat: number,
  scale: number,
  viewAngle: number,
  cx: number,
  cy: number,
): string {
  return `${tier}|${lng.toFixed(4)}|${lat.toFixed(4)}|${scale.toFixed(2)}|${viewAngle.toFixed(3)}|${cx}|${cy}`;
}

type SettledGeometry = {
  landPath: SkPath;
  icePath: SkPath;
  bordersPath: SkPath;
  lakesPath: GlobeState['lakesPath'];
  /** Filled by the first frame at this camera that draws rivers; `undefined`
   *  until then. They were the one settled layer left out, and at ~9k
   *  vertices the heaviest: 80–400 ms of every same-camera redraw on the
   *  emulator — a font arriving, a story found, a gauge opened. */
  riversPath?: SkPath;
};
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
  // Lakes, cut back out of the land: the ground, then the ocean's own tint,
  // then a quiet blue-grey shoreline subordinate to the coast.
  if (f.lakesPath) {
    c.drawPath(f.lakesPath, fillPaint(colors.bg));
    c.drawPath(f.lakesPath, fillPaint(colors.atmosphere, light ? 0.12 : 0.08));
    c.drawPath(
      f.lakesPath,
      strokePaint(colors.atmosphere, light ? 0.5 : 0.65, 0.5, StrokeJoin.Round),
    );
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
  // Labelled wherever there is room (`MARK_LABEL_DY`); the label's ink and
  // halo are WCAG-audited (2026-07-04).
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
    // Compact traffic sign beside the coastline glyph; its touch area stays
    // generous. Coloured by what the move means, as on the strait's card
    // (`chokepointValence`): red only for a disruption, slate otherwise. It
    // coloured the direction, so Gibraltar's ↓2% was the same alarm red as
    // Hormuz's ↓62%, and a surge was green where its card said neutral.
    const moveColor =
      (cp.moveAlarm ?? cp.disrupted) ? colors.markMarketDown : colors.toneNeutralText;
    if (cp.direction) {
      const x = cp.x + 12;
      const color = cp.direction === 'flat' ? colors.textSecondary : moveColor;
      c.drawCircle(x, cp.y, 6, fillPaint(colors.bg, 0.98));
      if (cp.direction === 'flat') c.drawLine(x - 3, cp.y, x + 3, cp.y, strokePaint(color, 1, 1.5));
      else {
        const sign = cp.direction === 'down' ? 1 : -1;
        c.drawLine(x, cp.y - 4, x, cp.y + 4, strokePaint(color, 1, 1.5));
        c.drawLine(x, cp.y + sign * 4, x - 3, cp.y + sign, strokePaint(color, 1, 1.5));
        c.drawLine(x, cp.y + sign * 4, x + 3, cp.y + sign, strokePaint(color, 1, 1.5));
      }
    }
    if (cp.labelY !== null) {
      drawMarkLabel(
        c,
        straitLabelText(cp, fonts),
        cp.labelX,
        cp.labelY,
        {
          name: colors.text,
          move: cp.direction === 'flat' ? colors.textSecondary : moveColor,
          basis: colors.textSecondary,
          halo: colors.bg,
        },
        cp.disrupted
          ? light
            ? LABEL_HALO_OPACITY_LIGHT_STRONG
            : LABEL_HALO_OPACITY_DARK_STRONG
          : haloOpacity,
      );
    }
  }

  // Separate 48dp targets with a solid backing: the direction reads on land
  // and sea alike. A cluster names its size instead of pretending to be one index.
  const marketFont = fonts.sub;
  for (const m of f.marketMarks) {
    const color =
      m.direction === 'up'
        ? colors.markMarketUp
        : m.direction === 'down'
          ? colors.markMarketDown
          : colors.text;
    // A leader only for a single market. A cluster's origin is the mean of
    // its members, which is no place: the line ended on the story's label or
    // in the sea between cities, and its count and chooser already say where.
    if (m.ids.length === 1 && Math.hypot(m.x - m.originX, m.y - m.originY) > 2) {
      c.drawLine(m.originX, m.originY, m.x, m.y, strokePaint(colors.textSecondary, 0.65, 1));
      c.drawCircle(m.originX, m.originY, 2, fillPaint(color));
    }
    c.drawCircle(m.x, m.y, 13, fillPaint(colors.bg, 0.98));
    c.drawCircle(m.x, m.y, 13, strokePaint(color, 0.95, 1.5));
    if (m.ids.length > 1 && marketFont) {
      const count = String(m.ids.length);
      drawHaloText(
        c,
        count,
        m.x - textWidth(marketFont, count) / 2,
        m.y + 4,
        marketFont,
        colors.textEmphasis,
        colors.bg,
        1,
        0,
      );
      // Both sides of a mixed cluster remain visible without averaging markets.
      c.drawCircle(
        m.x - 10,
        m.y - 10,
        3,
        fillPaint(m.rising ? colors.markMarketUp : colors.textSecondary),
      );
      c.drawCircle(
        m.x + 10,
        m.y - 10,
        3,
        fillPaint(m.falling ? colors.markMarketDown : colors.textSecondary),
      );
    } else {
      const sign = m.direction === 'down' ? 1 : -1;
      if (m.direction === 'flat') c.drawLine(m.x - 7, m.y, m.x + 7, m.y, strokePaint(color, 1, 2));
      else {
        c.drawLine(m.x, m.y - 6, m.x, m.y + 6, strokePaint(color, 1, 2));
        c.drawLine(m.x, m.y + sign * 6, m.x - 4, m.y + sign * 2, strokePaint(color, 1, 2));
        c.drawLine(m.x, m.y + sign * 6, m.x + 4, m.y + sign * 2, strokePaint(color, 1, 2));
      }
    }
    if (m.labelY !== null) {
      drawMarkLabel(
        c,
        marketLabelText(m, fonts),
        m.labelX,
        m.labelY,
        { name: colors.text, move: color, basis: colors.textSecondary, halo: colors.bg },
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

  // Conflict events — one glow per nearby cluster, recency in the colour
  // channel. Hit-testing still uses every original event point below.
  drawAtlasLayer(
    c,
    textures.ghost,
    conflictAtlas(GHOST_GLOW, f.conflictMarks, hexRgb(colors.markConflict)),
  );
  if (fonts.sub) {
    for (const m of f.conflictCounts) {
      drawHaloText(
        c,
        String(m.count),
        m.x + CONFLICT_COUNT_DX,
        m.y - 4,
        fonts.sub,
        colors.textEmphasis,
        colors.bg,
        0.9,
        1,
      );
    }
  }

  // Country highlight — soft glow, then the crisp focal outline, both on the
  // arc fade. The polygon it draws is the settled story's, and that flips at
  // frac=0.5: without the fade the highlight jumped from one country to
  // another mid-swipe, which is the exact problem the arcs were given the fade
  // for. It dissolves through zero, so a second country is never projected.
  if (f.countryPath && f.arcOpacity > 0) {
    const glow = fillPaint(colors.text, countryHighlightOpacity(f.countryName) * f.arcOpacity);
    glow.setMaskFilter(HIGHLIGHT_BLUR);
    c.drawPath(f.countryPath, glow);
    c.drawPath(f.countryPath, strokePaint(colors.text, 0.5 * f.arcOpacity, 1, StrokeJoin.Round));
  }

  // Major rivers — after the highlight so a river through the focused country
  // stays visible; a soft ground halo under a muted blue-grey stroke.
  if (f.riversPath) {
    c.drawPath(
      f.riversPath,
      strokePaint(
        colors.bg,
        (light ? 0.35 : 0.25) * f.riversOpacity,
        2,
        StrokeJoin.Round,
        StrokeCap.Round,
      ),
    );
    c.drawPath(
      f.riversPath,
      strokePaint(
        colors.atmosphere,
        (light ? 0.75 : 0.85) * f.riversOpacity,
        1,
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

  // The gauge whose card is open. Emphasis ink, not the mark's hue: the ring
  // says "this one", and the mark inside it already says what it is.
  if (f.selected) {
    c.drawCircle(
      f.selected.x,
      f.selected.y,
      SELECTED_R,
      strokePaint(colors.textEmphasis, 0.9, 1.5),
    );
  }

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
  // Story beacons — halo, then a category-coloured disc. Keeping the fill in
  // the frame rather than baking a white centre into an Atlas makes the mark
  // read as editorial category colour instead of a field of unexplained dots.
  drawAtlasLayer(
    c,
    textures.storyHalo,
    storyAtlas(STORY_HALO.size.width, STORY_HALO.srcRect, f.storyMarks),
  );
  for (const m of f.storyMarks) {
    const radius = BEACON_R * m.scale;
    c.drawCircle(m.x, m.y, radius, fillPaint(m.color, m.alpha));
    c.drawCircle(m.x, m.y, radius, strokePaint(colors.bg, 0.82, 1.25));
  }
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
  // How many stories are still to find at a place — except the place being
  // read, whose name is printed large beside the dot: its count fell in the
  // gap between the dot and the name, `●²Washington`, a footnote mark.
  const sub = fonts.sub;
  const dot = f.dot;
  if (sub) {
    for (const m of f.storyMarks) {
      if (!m.showCount) continue;
      if (dot && Math.hypot(m.x - dot.x, m.y - dot.y) < ACTIVE_DOT_R + 2) continue;
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
    if (sub && g.labelX !== null) {
      drawHaloText(
        c,
        g.label,
        g.labelX,
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

  // Capitals — a dot and a name in the small regular face, quieter than the
  // country they sit in. No halo, for the water labels' reason.
  const capitalFont = fonts.sub;
  if (capitalFont && f.capitalLabels.length > 0) {
    const inkAlpha = skColor(colors.text)[3] ?? 1;
    const paint = fillPaint(colors.text);
    paint.setAlphaf(inkAlpha * (light ? 0.8 : 0.7));
    for (const capital of f.capitalLabels) {
      c.drawCircle(capital.x, capital.y, CAPITAL_DOT_R, paint);
      c.drawText(capital.name, capital.x + CAPITAL_TEXT_DX, capital.y + 3, paint, capitalFont);
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
        (light ? 0.85 : 0.8) * f.arcOpacity,
        haloOpacitySoft * f.arcOpacity,
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
      dl.x + DOT_LABEL_DX,
      dl.y + 4,
      fonts.label,
      colors.textEmphasis,
      colors.bg,
      0.95 * dl.opacity,
      haloOpacity * dl.opacity,
    );
    if (dl.sub && sub) {
      drawHaloText(
        c,
        dl.sub,
        dl.x + DOT_LABEL_DX,
        dl.y + DOT_SUB_DY,
        sub,
        colors.textEmphasis,
        colors.bg,
        (light ? 0.7 : 0.75) * dl.opacity,
        haloOpacitySoft * dl.opacity,
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
 * Trace the great circle from `from` to `to` (unit vectors) into the path
 * `ctx` targets, in `steps` segments, lifting the pen wherever the arc leaves
 * the camera's cone.
 *
 * The cull is per point, not per endpoint: a source's headquarters is routinely
 * outside the zoom cone while the story-side stretch of its arc is visible. And
 * point projection ignores `.clipAngle`, so an unculled point would draw the arc
 * into the sky, or fold a far-side stretch back mirrored across the disk.
 *
 * The points are d3's `geoInterpolate` — a slerp — computed on the unit
 * vectors, and placed by `screenPoint`, without the trigonometry per step.
 */
function traceGreatCircle(
  ctx: SkiaGeoContext,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  steps: number,
  view: OrthoView,
  clipCos: number,
): void {
  const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  const omega = Math.acos(d > 1 ? 1 : d < -1 ? -1 : d);
  const sinO = Math.sin(omega);
  let started = false;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let a = 1 - t;
    let b = t;
    if (sinO > 1e-9) {
      a = Math.sin(a * omega) / sinO;
      b = Math.sin(b * omega) / sinO;
    }
    if (
      !screenPoint(
        view,
        a * from[0] + b * to[0],
        a * from[1] + b * to[1],
        a * from[2] + b * to[2],
        clipCos,
      )
    ) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(SCREEN_POINT[0], SCREEN_POINT[1]);
      started = true;
    } else ctx.lineTo(SCREEN_POINT[0], SCREEN_POINT[1]);
  }
}

/** A source this close to its story (0.05 rad) draws no arc. */
const SAME_PLACE_COS = Math.cos(0.05);
/** Units for the fixed points the frame loop projects. */
const NORTH_POLE_UNIT = unit(0, 90);
const SOUTH_POLE_UNIT = unit(0, -90);
const MAKKAH_UNIT = unit(MAKKAH.coords[0], MAKKAH.coords[1]);
/** A source's headquarters as a unit vector, by name; built on first use. */
const sourceUnits = new Map<string, readonly [number, number, number] | null>();
function sourceUnit(name: string): readonly [number, number, number] | null {
  let u = sourceUnits.get(name);
  if (u === undefined) {
    const c = SOURCE_COORDS[name];
    u = c ? unit(c[1], c[0]) : null; // SOURCE_COORDS is [lat, lng]
    sourceUnits.set(name, u);
  }
  return u;
}

export const MiniGlobe = memo(function MiniGlobe({
  articles,
  heatmapPoints,
  chokepoints,
  straitMoves,
  landingAt,
  gdacsAlerts,
  conflictEvents,
  marketMarks,
  marketViewport,
  selectedAt,
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
  const { colors, resolvedAppearance } = useTheme();
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
    OVERLAY_TEXTURE_SIZE,
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
  const labelFont = useFont(require('../../assets/fonts/SourceSans3-SemiBold.ttf'), DOT_LABEL_PT);
  const subFont = useFont(require('../../assets/fonts/SourceSans3-SemiBold.ttf'), 11);
  const countryFont = useFont(require('../../assets/fonts/SourceSans3SC-SemiBold.ttf'), 12);
  const neighborFont = useFont(require('../../assets/fonts/SourceSans3SC-SemiBold.ttf'), 11.5);
  const waterFont = useFont(require('../../assets/fonts/SourceSans3-Italic.ttf'), 11);
  //   - valueFont (SemiBold 13) is a market's or strait's move, the larger
  //     second line under its 11pt name (`MARK_VALUE_PT`).
  const valueFont = useFont(require('../../assets/fonts/SourceSans3-SemiBold.ttf'), MARK_VALUE_PT);
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
    const fonts = [labelFont, subFont, countryFont, neighborFont, waterFont, valueFont];
    for (const f of fonts) {
      if (!f) continue;
      f.setSubpixel(1 as unknown as boolean);
      f.setEdging(FontEdging.SubpixelAntiAlias);
      f.setHinting(FontHinting.None);
      textWidths.delete(f);
    }
  }, [labelFont, subFont, countryFont, neighborFont, waterFont, valueFont]);
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
  const valueFontRef = useRef(valueFont);
  valueFontRef.current = valueFont;
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
        unit: unit(coords[1], coords[0]),
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
          unit: unit(place.lng, place.lat),
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
        unit: unit(place.lng, place.lat),
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
    prevGround: EMPTY_PICTURE,
    prevCam: null,
    marks: EMPTY_PICTURE,
    labels: EMPTY_PICTURE,
    disc: globeRadius,
    activeDot: null,
    activeColor: colors.textEmphasis,
    cam: null,
  });
  // The camera the last projection was made from (`callReproject`), and the
  // one the reaction says the globe is at now.
  const recordedCamRef = useRef<RecordedCamera | null>(null);
  const liveCamera = useSharedValue<LiveCamera | null>(null);
  // **The warp: the earth moves with the finger, not with the JS thread.**
  // A frame is projected and recorded on JS, at most every 32 ms and later
  // whenever a swipe's landing commit holds the thread; the card beside it
  // moves on the UI thread every frame. Recorded on the emulator (2026-09-23)
  // the globe started 160–340 ms after the card, stepped at ~10 fps under the
  // finger, froze through the landing, and was still turning 300–700 ms after
  // the card had stopped. So between projections the last pictures are moved
  // to the live camera on the UI thread: translated by where the live centre
  // falls in the recorded projection and scaled by the zoom since. That is
  // exact at the centre and a close fit elsewhere while the planet is larger
  // than the screen, where a small turn of an orthographic globe is nearly a
  // slide; with the whole planet on screen a slide would move the planet
  // rather than turn it, so the warp fades out there and the globe steps as it
  // did.
  const warpFor = (cam: RecordedCamera | null, live: LiveCamera | null): Transforms3d => {
    'worklet';
    if (!cam || !live || !(cam.k > 0)) return NO_WARP;
    const reach = reachFor(cx, cy, width, height);
    const strength = Math.min(
      1,
      Math.max(0, (cam.k / reach - WARP_NO_LIMB) / (WARP_FULL_LIMB - WARP_NO_LIMB)),
    );
    if (strength === 0) return NO_WARP;
    const rad = Math.PI / 180;
    const phi0 = cam.lat * rad;
    const phi = live.lat * rad;
    const dl = (live.lng - cam.lng) * rad;
    const cosPhi = Math.cos(phi);
    // The live centre on the far side of the recorded one: no slide fits.
    if (Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(dl) <= 0.2) {
      return NO_WARP;
    }
    const dx = strength * cam.k * cosPhi * Math.sin(dl);
    const dy =
      -strength * cam.k * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(dl));
    const kNow = globeRadius / Math.sin(Math.max(1, live.clip) * rad);
    const s = 1 + (kNow / cam.k - 1) * strength;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(s - 1) < 1e-4) return NO_WARP;
    // A point P of the picture lands at s·P + t, with t = c − s·(c + d).
    return [{ translateX: cx - s * (cx + dx) }, { translateY: cy - s * (cy + dy) }, { scale: s }];
  };
  const warp = useDerivedValue<Transforms3d>(() =>
    warpFor(framePictures.value.cam, liveCamera.value),
  );
  // The ground a settling frame replaced, carried by its own camera so its
  // coastline sits under the new one while that fades in over it.
  const prevWarp = useDerivedValue<Transforms3d>(() =>
    warpFor(framePictures.value.prevCam, liveCamera.value),
  );

  // **A landing sharpens; it does not snap.** Moving frames are drawn from
  // the coarse motion tier and a settled one from the resting tier, 2–4× the
  // points; drawn in one frame, every coastline and border on screen changed
  // shape the instant a swipe landed — "the map lines change from low res to
  // high res", which the user called glitchy (2026-09-23). Drawing moving
  // frames at the resting tier would cost that 2–4× on every frame of motion,
  // so the settled ground crossfades with the last moving one instead
  // (`GROUND_FADE_MS`). Nothing extra is drawn at rest: the old picture is
  // only read while the fade runs.
  //
  // **The fade is recorded into the pictures, never a `Group opacity`.**
  // Skia's `drawPicture` takes no paint, so a group's opacity never reaches a
  // `Picture`, and every layer of the ground is translucent — ocean, land,
  // daylight, night. The first version faded the new ground in with a group
  // opacity over the old one at full strength: the opacity did nothing, both
  // grounds drew whole for 220 ms, every tint doubled, and each landing
  // flashed (2026-09-24). Each ground is its own layer at its own alpha, so
  // their inks never stack, and the layers exist only while the fade runs.
  // The new one is *added* (`BlendMode.Plus`) onto the old, which sits alone
  // on the canvas's transparent ground: `(1 − t)·old + t·new`, whole at every
  // step. Laid over it instead, the two summed to `t + (1 − t)²` wherever
  // they were solid — 75% at the midpoint, a dim where the flash had been.
  const groundFade = useSharedValue(1);
  const fadeLayer = (picture: SkPicture, alpha: number, add = false): SkPicture => {
    'worklet';
    return createPicture(
      (canvas) => {
        const paint = Skia.Paint();
        paint.setAlphaf(alpha);
        if (add) paint.setBlendMode(BlendMode.Plus);
        canvas.saveLayer(paint);
        canvas.drawPicture(picture);
        canvas.restore();
      },
      Skia.XYWHRect(-width, -height, 3 * width, 3 * height),
    );
  };
  const groundPicture = useDerivedValue(() => {
    const t = groundFade.value;
    const { ground, prevGround } = framePictures.value;
    return t < 1 && prevGround !== EMPTY_PICTURE ? fadeLayer(ground, t, true) : ground;
  });
  const prevGroundPicture = useDerivedValue(() => {
    const t = groundFade.value;
    const { prevGround } = framePictures.value;
    return t < 1 && prevGround !== EMPTY_PICTURE ? fadeLayer(prevGround, 1 - t) : EMPTY_PICTURE;
  });
  const marksPicture = useDerivedValue(() => framePictures.value.marks);
  const labelsPicture = useDerivedValue(() => framePictures.value.labels);
  // The current story's dot holds still. It breathed for three cycles each time
  // a story landed, and the user asked for it to go (2026-09-19): the location
  // label beside it is larger instead, and says which place is being read.
  // A tiny native overlay, placed and sized from the globe's translate and
  // scale. It kept its screen size while the globe shrank into the open
  // story's band, and the label beside it — drawn in the scaled picture —
  // slid under it: the band read `●yiv`. It shrinks with its label now.
  const beaconStyle = useAnimatedStyle(() => {
    const dot = framePictures.value.activeDot;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    for (const transform of canvasTransform?.value ?? []) {
      if ('scale' in transform) scale = transform.scale;
      if ('translateX' in transform) tx += transform.translateX;
      if ('translateY' in transform) ty += transform.translateY;
    }
    // Carried by the warp first, like the ground under it.
    let wx = dot ? dot.x : 0;
    let wy = dot ? dot.y : 0;
    let ws = 1;
    for (const transform of warp.value) {
      if ('scale' in transform) ws = transform.scale;
      if ('translateX' in transform) wx += transform.translateX;
      if ('translateY' in transform) wy += transform.translateY;
    }
    if (dot) {
      wx += (ws - 1) * dot.x;
      wy += (ws - 1) * dot.y;
    }
    const x = dot ? width / 2 + (wx - width / 2) * scale + tx : 0;
    const y = dot ? height / 2 + (wy - height / 2) * scale + ty : 0;
    return {
      opacity: dot ? 1 : 0,
      backgroundColor: framePictures.value.activeColor,
      borderColor: colors.bg,
      transform: [
        { translateX: x - 9 },
        { translateY: y - 9 },
        { scale: ((ACTIVE_DOT_R + 2) / 9) * scale },
      ],
    };
  });

  // Textures bake on the UI thread; they reach here once each, by reaction,
  // rather than being read synchronously on every frame.
  const texturesRef = useRef<GlobeTextures>(NO_TEXTURES);
  // Assigned every render so a draw always sees the current theme and fonts;
  // `callReproject` is a stable closure and calls through it.
  const drawRef = useRef<(frame: GlobeState) => void>(() => {});
  // What the canvas was last handed: a settling frame fades in over it.
  const lastPublishedRef = useRef<{
    settled: boolean;
    ground: SkPicture;
    cam: RecordedCamera | null;
  }>({ settled: false, ground: EMPTY_PICTURE, cam: null });
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
        value: valueFont,
      },
      textures: texturesRef.current,
    });
    const last = lastPublishedRef.current;
    // Moving → settled: the one frame whose ground changes tier.
    const sharpen = frame.settled && !last.settled && last.ground !== EMPTY_PICTURE;
    lastPublishedRef.current = {
      settled: frame.settled,
      ground: pictures.ground,
      cam: recordedCamRef.current,
    };
    framePictures.value = {
      ...pictures,
      prevGround: sharpen ? last.ground : EMPTY_PICTURE,
      prevCam: sharpen ? last.cam : null,
      activeDot: frame.dot,
      activeColor: categoryMarkColor(
        (articlesRef.current[lastSettled.current] as { category?: string } | undefined)?.category,
        colors,
      ),
      disc: frame.discRadius > 0 ? frame.discRadius : globeRadius,
      cam: recordedCamRef.current,
    };
    if (sharpen) {
      groundFade.value = 0;
      groundFade.value = withTiming(1, {
        duration: GROUND_FADE_MS,
        easing: Easing.out(Easing.quad),
      });
    } else if (!frame.settled) {
      // Moving again: a fade still running would show a ground that is gone.
      groundFade.value = 1;
    }
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
        unit: unit(z.lng, z.lat),
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
        unit: unit(z.lng, z.lat),
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
  // The same array for JS (`prefetchSettled`): reading the shared value there
  // would wait on the UI thread.
  const coordsRef = useRef<(number | null)[]>([]);
  useEffect(() => {
    const coords = cameraTrack ?? articleGeo.flatMap((g) => (g ? [g.lat, g.lng] : [null, null]));
    coordsRef.current = coords;
    coordsSV.value = coords;
  }, [articleGeo, cameraTrack, coordsSV]);

  // The clip each story rests at, published for the UI thread. Placing the
  // camera through `flyPosition` needs the crossing's own curve, and the
  // framings only exist on this side — `clipAngleForCountry` is a JS lookup.
  // `framingsVer` is what tells a cached curve that the river changed under it.
  const framingsSV = useSharedValue<number[]>([]);
  const framingsVer = useSharedValue(0);
  useEffect(() => {
    framingsSV.value = articleGeo.map((g) => clipAngleForCountry(g?.countryName ?? null));
    framingsVer.value += 1;
  }, [articleGeo, framingsSV, framingsVer]);

  // One crossing's curve, kept between frames on each thread. It depends only
  // on the two framings and the arc between them, so it is rebuilt when the
  // deck crosses a story boundary — not 30 times a second, which would fit ρ
  // by bisection and allocate two dozen objects for an answer that never
  // changed.
  const deckCurve = useSharedValue<FlyCurve | null>(null);
  const deckCurveLo = useSharedValue(-1);
  const deckCurveHi = useSharedValue(-1);
  const deckCurveVer = useSharedValue(-1);

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
  // The crossing whose curve `callReproject` is currently drawing, so the fit
  // runs once per story pair rather than once per frame.
  const flyCurveRef = useRef<{
    from: number;
    to: number;
    travel: number;
    curve: FlyCurve;
  } | null>(null);

  // Projection + path generator — created eagerly so the first scroll frame is warm
  // Kept for `hitTest`'s `invert`; every path is drawn by `ortho-stream.ts`
  // from the same camera, without d3's per-vertex trigonometry.
  const projRef = useRef(geoOrthographic().clipAngle(90));
  const lastSettled = useRef(-1);
  const lastSettledSlug = useRef<string | null>(null);

  const cachedCountryRef = useRef<GeoJSON.Feature | null>(null);
  // Spherical centroid of the currently settled country, cached alongside
  // the feature. geoCentroid is O(n vertices) — computing it once per
  // settled-country change (instead of per frame) is what keeps this new
  // label layer effectively free inside callReproject.
  const cachedCountryCentroidRef = useRef<readonly [number, number, number] | null>(null);

  // Reusable mutable builders retain their internal buffers between frames;
  // each frame publishes immutable SkPath snapshots for rendering.
  // Exact settled projections only, bounded to the current and adjacent stories.
  // SkPath snapshots are immutable; later builder resets cannot alter cached paths.
  const settledGeometryRef = useRef(new Map<string, SettledGeometry>());
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
  const lakesPathRef = useRef(Skia.PathBuilder.Make().setIsVolatile(true));
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
  // Precompute the per-frame derivations once per snapshot: the label, the
  // place as a unit vector (all `screenPoint` needs to cull and place a mark),
  // and the absolute delta of the primary vessel class (drives intensity and
  // the disrupted flag). Built once per snapshot rather than per frame, like
  // every mark source below.
  const enrichedMarketMarks = useMemo(
    () =>
      (marketMarks ?? []).map((m) => ({
        id: m.id,
        label: m.label,
        move: m.move,
        direction: m.direction,
        unit: unit(m.lng, m.lat),
      })),
    [marketMarks],
  );

  const enrichedChokepoints = useMemo(
    () =>
      (chokepoints ?? []).map((cp) => {
        // The strip's seven-day move where the strip has one: the label
        // printed the gap from the 90-day normal while the strip, a few
        // centimetres up, printed the week, and one strait read ↓62% on the
        // globe and ▼38% in the strip. The glyph's brightness and outranking
        // stay on the normal (`delta`, below): that is the strait's state.
        const week = straitMoves?.[cp.id];
        const change = week ? straitWeekChange(week) : straitMapChange(cp.delta7vs90.n_total);
        return {
          id: cp.id,
          // Mixed case (not UPPERCASE): chokepoints are passages — straits,
          // canals, channels — which sit in the hydrography tier alongside
          // rivers and seas. Atlas convention for hydrography is italic
          // mixed case; uppercase reads as alarm even at baseline, fighting
          // the "ambient reference geography" intent. The move is the
          // label's second line (`straitLabelText`).
          label: cp.name,
          move: change?.value,
          basis: change?.basis,
          direction: change?.direction,
          moveAlarm: week ? week.valence === 'unfavorable' : undefined,
          unit: unit(cp.lng, cp.lat),
          // Signed, because direction decides meaning here and magnitude only
          // decides brightness.
          delta: cp.delta7vs90.n_total ?? 0,
          absDelta: Math.abs(cp.delta7vs90.n_total ?? 0),
        };
      }),
    [chokepoints, straitMoves],
  );
  const chokepointsRef = useRef(enrichedChokepoints);
  chokepointsRef.current = enrichedChokepoints;
  const marketMarksRef = useRef(enrichedMarketMarks);
  marketMarksRef.current = enrichedMarketMarks;
  // A unit vector, built once per selection for `screenPoint`.
  const selectedCoords = useMemo<readonly [number, number, number] | null>(
    () => (selectedAt ? unit(selectedAt[1], selectedAt[0]) : null),
    [selectedAt],
  );
  const selectedRef = useRef(selectedCoords);
  selectedRef.current = selectedCoords;
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
      unit: unit(a.lng, a.lat),
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
      unit: unit(e.lng, e.lat),
      recencyAlpha: Math.max(0.4, 1 - eventAgeDays(e, latestMs) / 14),
      scale: conflictScale(e.fatalities),
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
            unit: unit(a.lng, a.lat),
            blocks,
            alpha: famineAlpha(a.ageMonths),
            // Web: the gravest phase draws larger, and on top. The sprite is
            // the glyph family's 22pt box; the column is drawn at the web's.
            scale: famineBox(blocks) / (GLYPH_HALF * 2),
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
        unit: unit(e.lng, e.lat),
        alpha: thermalAlpha(e.confidence),
        // The web's size; the sprite is the glyph family's 22pt box.
        scale: thermalBox(e.frp) / (GLYPH_HALF * 2),
      })),
    [thermalEvents],
  );
  const thermalRef = useRef(enrichedThermal);
  thermalRef.current = enrichedThermal;
  const enrichedGenocide = useMemo(
    () =>
      (genocideSituations ?? []).map((g) => ({
        id: g.id,
        unit: unit(g.lng, g.lat),
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
  const layoutRef = useRef({ globeRadius, cx, cy, width, height, canvasReach, marketViewport });
  layoutRef.current = { globeRadius, cx, cy, width, height, canvasReach, marketViewport };
  // Mirror of last reproject args — avoids reading SharedValues outside worklets
  const lastReprojRef = useRef<{ lng: number; lat: number; idx: number } | null>(null);
  // The settled redraw the rivers and lakes ask for once decoded
  // (`warmDetailGeo`): `finalizeReproject`, read at the time it fires.
  const detailRedrawRef = useRef<() => void>(() => {});

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
        // Centroid cached alongside the feature — projected per frame to
        // follow rotation. Reads from the precomputed map (which uses the
        // largest-polygon centroid for MultiPolygon features), keeping the
        // focused-country label on the primary landmass even when overseas
        // territories would otherwise drag the geometric centroid into a
        // neighbour (e.g. France → French Guiana drags into Spain).
        const centroid = settledName
          ? (countryCentroids[settledName] ?? (geo?.country ? geoCentroid(geo.country) : null))
          : null;
        cachedCountryCentroidRef.current = centroid ? unit(centroid[0], centroid[1]) : null;
      }

      // Adaptive zoom — each story's own framing at rest, and between two of
      // them van Wijk's path: out of its way by as much as the crossing is
      // long, and down close over the next (`flyCurve`).
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
      const held = flyCurveRef.current;
      const curve =
        held && held.from === loClip && held.to === hiClip && held.travel === travelDeg
          ? held.curve
          : flyCurve(loClip, hiClip, travelDeg);
      if (curve !== held?.curve) {
        flyCurveRef.current = { from: loClip, to: hiClip, travel: travelDeg, curve };
      }
      const rawClip = flySpanClip(curve, frac);
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

      // Arc opacity still fades over a quarter story; expensive detail waits
      // until landing, using the same boundary as reaction invalidation.
      const ARC_WINDOW = 0.25;
      const lastAngle = lastOverrideAngleRef.current;
      lastOverrideAngleRef.current = overrideAngleVal;
      const activeMid = overrideActiveVal > 0.001 && overrideActiveVal < 0.999;
      // An angle moving under an override that is off moves nothing: the clip
      // is the story's own. A flight lands by dropping the override on the
      // same frame its angle takes its last step, and counted as zoom in
      // flight that last frame was drawn at the motion tier — the coarse
      // coastline — with no frame after it to restore the detail, since
      // nothing moves once a flight has landed. Every far swipe, mark tap,
      // scrub jump and gauge left the map coarse until the next touch
      // (2026-09-23, logged on the emulator: oA 0, oG 19.37 → 19.23).
      const angleChanging =
        overrideActiveVal > 0.001 && Math.abs(overrideAngleVal - lastAngle) > 0.01;
      const zoomInFlight = activeMid || angleChanging;
      // A camera the list does not own has no `frac` of its own: the reaction
      // hands over the list's last one, which is ~0 at rest. Without
      // `cameraMoving`, every frame of a globe drag was therefore projected at
      // full settled detail — on the emulator, 26 of 26 frames over four drags.
      const nearSettled = !zoomInFlight && !cameraMoving && isStorySettled(frac);

      // A moving frame reaches past the canvas (`MOTION_REACH`), so the warp
      // has ground to carry into view until the next projection lands.
      const viewAngle = viewAngleFor(
        projScale,
        Math.max(
          grownReach,
          reachFor(centerX, centerY, canvasW, canvasH) * (nearSettled ? 1 : MOTION_REACH),
        ),
      );
      const clipRad = (viewAngle * Math.PI) / 180;
      const clipCos = Math.cos(clipRad);
      recordedCamRef.current = { lat: geoLat, lng: geoLng, k: projScale };

      projRef.current.rotate([-geoLng, -geoLat, 0]).scale(projScale).translate([centerX, centerY]);
      // At rest, long geographic edges are resampled into projected curves.
      // Moving at a story's framing they are not: resampling there added ~30
      // points to ~2,300 of land and borders and cost 27% of their time,
      // because d3 tests the midpoint of every edge to find those few. Left
      // straight, an edge strays by at most ~1 px at scale 230 and ~1.5 px at
      // 355, on under 1% of points; the resting frame puts the curves back.
      // The stray grows with scale (3 px at 720), so past
      // `MOTION_RESAMPLE_SCALE` a moving frame keeps resampling.
      const precision = nearSettled || projScale > MOTION_RESAMPLE_SCALE ? 0.25 : 0;
      // The camera, for every path (`ortho-stream.ts`), the circles drawn in
      // closed form and every point mark: `seen` culls a unit vector against
      // the view cone and, when it is in view, leaves its screen position in
      // `SCREEN_POINT`.
      const view = orthoView(geoLng, geoLat, projScale, centerX, centerY);
      const seen = (u: readonly [number, number, number]) =>
        screenPoint(view, u[0], u[1], u[2], clipCos);

      // Keep gesture frames light, then restore detail at the actual landing.
      // Every geographic layer uses the same shared-arc tier.
      const tier = geographyTier(projScale, !nearSettled);
      const geography = getGlobeGeography(tier);
      const geometryKey = nearSettled
        ? settledKey(tier, geoLng, geoLat, projScale, viewAngle, centerX, centerY)
        : null;
      const geometryCache = settledGeometryRef.current;
      const cachedGeometry = geometryKey ? geometryCache.get(geometryKey) : undefined;
      if (geometryKey) {
        if (cachedGeometry) {
          // Refresh recency without expanding the three-entry memory bound.
          geometryCache.delete(geometryKey);
          geometryCache.set(geometryKey, cachedGeometry);
        }
      }
      let landPath: SkPath;
      let icePath: SkPath;
      let lakesPath: GlobeState['lakesPath'] = null;
      if (cachedGeometry) {
        ({ landPath, icePath, lakesPath } = cachedGeometry);
      } else {
        const landBuilder = landPathRef.current;
        landBuilder.reset();
        skiaCtx.setPath(landBuilder);
        geography.land.draw(view, viewAngle, precision, skiaCtx);
        landPath = landBuilder.build();

        // Ice follows the same coastline at every level of detail.
        const iceBuilder = icePathRef.current;
        iceBuilder.reset();
        skiaCtx.setPath(iceBuilder);
        geography.ice.draw(view, viewAngle, precision, skiaCtx);
        icePath = iceBuilder.build();
      }
      // Inland water is settled detail; motion never enters this cache. Until
      // the lakes are decoded (`warmDetailGeo`) a settled frame draws without
      // them and the redraw fills the cached entry in.
      if (nearSettled && lakesPath === null) {
        if (lakesLayer) {
          const lakeBuilder = lakesPathRef.current;
          lakeBuilder.reset();
          skiaCtx.setPath(lakeBuilder);
          lakesLayer.draw(view, viewAngle, precision, skiaCtx);
          lakesPath = lakeBuilder.build();
          if (cachedGeometry) cachedGeometry.lakesPath = lakesPath;
        } else {
          warmDetailGeo(() => detailRedrawRef.current());
        }
      }

      // Dot — culled against the zoom cone like every other point marker.
      // While the list was the camera's only owner the settled story *was*
      // the camera target, so it could never leave the disk. A drag, a
      // selection or the opening view can now aim the camera elsewhere, and
      // direct projection ignores `.clipAngle` (see clipRad above): the dot
      // and its "London · 20:17" label floated in the sky beside the globe.
      let dot: { x: number; y: number } | null = null;
      if (geo && seen(geo.unit)) dot = { x: SCREEN_POINT[0], y: SCREEN_POINT[1] };

      // Story marks — one per place with a story the reader has not found.
      // Everything but position was decided in `placeMarks`; this culls against
      // the zoom cone (direct point projection ignores `.clipAngle`, see
      // clipRad above) and projects.
      const storyMarks: GlobeState['storyMarks'] = [];
      const readMarks: GlobeState['readMarks'] = [];
      for (const m of placeMarksRef.current) {
        if (!seen(m.unit)) continue;
        const pt = SCREEN_POINT;
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
      // Counts never print on each other: "5" and "8" at Washington and New
      // York overlapped into "58" on the whole-planet view. The larger count
      // is kept; the smaller place keeps its beacon and its tap.
      // Each count keeps a way to take it down again: a disrupted strait's
      // name outranks it (see the mark labels below).
      const countBoxes: LabelBox[] = [];
      const countHide: (() => void)[] = [];
      for (const m of [...storyMarks].sort((a, b) => b.count - a.count)) {
        if (m.count < storyCountMin) continue;
        const box = storyCountBox(m, subFontRef.current);
        if (countBoxes.some((b) => boxesMeet(b, box, COUNT_GAP))) continue;
        m.showCount = true;
        countBoxes.push(box);
        countHide.push(() => {
          m.showCount = false;
        });
      }

      // The highlight shares its exact edges with this frame's coast and borders.
      let countryPath: GlobeState['countryPath'] = null;
      if (cachedCountryRef.current) {
        const countryBuilder = countryPathRef.current;
        countryBuilder.reset();
        skiaCtx.setPath(countryBuilder);
        const layer = geography.country(cachedCountryRef.current.properties?.name as string);
        if (layer) layer.draw(view, viewAngle, precision, skiaCtx);
        countryPath = countryBuilder.build();
      }

      // Country name label — project the cached centroid onto the current
      // frame, culled against the clip cone first: direct point projection
      // ignores `.clipAngle` (it never returns null for a clipped point), so
      // without the cone test a centroid far from the camera — e.g. Russia's
      // centroid while the story sits in Vladivostok at zoom clip 18° — would
      // project past the disk and float in the sky. One `seen` per frame; the
      // centroid's unit vector is computed on settled-country change.
      // Default offset: 14px below the centroid so the label sits under
      // the highlight. Overridden further below if it would collide with
      // the dot label (location · time).
      let countryLabel: GlobeState['countryLabel'] = null;
      const COUNTRY_LABEL_OFFSET = 14;
      const centroid = cachedCountryCentroidRef.current;
      const countryName = cachedCountryRef.current?.properties?.name as string | undefined;
      if (centroid && countryName && seen(centroid)) {
        const display = displayCountryName(countryName) ?? countryName;
        countryLabel = {
          lines: wrapCountryLabel(display),
          x: SCREEN_POINT[0],
          y: SCREEN_POINT[1] + COUNTRY_LABEL_OFFSET,
        };
      }

      // Borders use the same tier as the land, even while the camera moves.
      let bordersPath: SkPath;
      if (cachedGeometry) {
        bordersPath = cachedGeometry.bordersPath;
      } else {
        const bordersBuilder = bordersPathRef.current;
        bordersBuilder.reset();
        skiaCtx.setPath(bordersBuilder);
        geography.borders.draw(view, viewAngle, precision, skiaCtx);
        bordersPath = bordersBuilder.build();
        if (geometryKey) {
          geometryCache.set(geometryKey, { landPath, icePath, bordersPath, lakesPath });
          if (geometryCache.size > SETTLED_CACHE_SIZE) {
            const oldest = geometryCache.keys().next().value;
            if (oldest !== undefined) geometryCache.delete(oldest);
          }
        }
      }

      // --- Always-on cheap layers: project every frame so they stay present
      // during scroll instead of popping in/out at the nearSettled boundary.
      // These are visually prominent (night terminator, makkah glow, pole
      // markers) but cost is small — single circle paths or 1-2 point
      // projections per frame. The original gating saved ~3-6 frames in the
      // central window of a fast swipe, but the perceived "things vanishing
      // as I swipe" cost more in UX than the few-ms savings bought back.

      // Day, night and the low-sun band: the sunlit hemisphere, the dark one,
      // and the 96° cap around the antisolar point. Caps on the sphere, drawn
      // in closed form (`sphere-circles.ts`).
      const [sunLng, sunLat] = getSunPosition();
      const antiLng = sunLng + 180;
      const dayBuilder = dayPathRef.current;
      dayBuilder.reset();
      skiaCtx.setPath(dayBuilder);
      capFill(skiaCtx, view, sunLng, sunLat, 90);
      const dayPath = dayBuilder.build();
      const nightBuilder = nightPathRef.current;
      nightBuilder.reset();
      skiaCtx.setPath(nightBuilder);
      capFill(skiaCtx, view, antiLng, -sunLat, 90);
      const nightPath = nightBuilder.build();
      const twilightBuilder = twilightPathRef.current;
      twilightBuilder.reset();
      skiaCtx.setPath(twilightBuilder);
      capFill(skiaCtx, view, antiLng, -sunLat, TWILIGHT_RADIUS);
      const twilightPath = twilightBuilder.build();

      // Poles — culled against the clip cone like every other point marker:
      // a projection never nulls a far-side point, it mirrors it back inside the
      // disk (a camera at 30°N would paint the south-pole cross at the screen
      // position of front-side 60°S).
      let northPole: GlobeState['northPole'] = null;
      let southPole: GlobeState['southPole'] = null;
      if (seen(NORTH_POLE_UNIT)) northPole = { x: SCREEN_POINT[0], y: SCREEN_POINT[1] };
      if (seen(SOUTH_POLE_UNIT)) southPole = { x: SCREEN_POINT[0], y: SCREEN_POINT[1] };

      // Makkah
      let makkah: { x: number; y: number } | null = null;
      if (seen(MAKKAH_UNIT)) makkah = { x: SCREEN_POINT[0], y: SCREEN_POINT[1] };

      let selected: { x: number; y: number } | null = null;
      const selectedUnit = selectedRef.current;
      if (selectedUnit && seen(selectedUnit)) {
        selected = { x: SCREEN_POINT[0], y: SCREEN_POINT[1] };
      }

      // Subsolar point — drives the day-side ocean specular highlight.
      // The night layer above already computes (sunLng, sunLat); the
      // subsolar point is just the antipode of the night hemisphere's centre, i.e. the
      // direct sunLng/sunLat. Culled against the clip cone — point
      // projection doesn't clip, so a sun between clipRad and 90° away
      // would center the specular blob outside the disk near the limb.
      let subsolar: { x: number; y: number } | null = null;
      const sunUnit = unit(sunLng, sunLat);
      if (seen(sunUnit)) subsolar = { x: SCREEN_POINT[0], y: SCREEN_POINT[1] };

      // The graticule and the polar circles, in closed form: ~90 path calls
      // where d3 streamed ~1,300 points through rotation, clipping and
      // resampling.
      const graticuleBuilder = graticulePathRef.current;
      graticuleBuilder.reset();
      skiaCtx.setPath(graticuleBuilder);
      graticuleLines(skiaCtx, view);
      const graticulePath = graticuleBuilder.build();

      // Everything anchored to `settledIndex` fades on the same smoothstep,
      // because they all have the same problem: `settledIndex` flips at
      // frac=0.5, so mid-swipe they would snap to a new story's origin. Fading
      // to nothing across the central band hides the jump — the arcs have
      // always been drawn this way, and the country highlight, the country's
      // name and the place label now are too. It is a dissolve through zero,
      // never an overlap, so no second country is ever projected. At rest
      // `frac` is exactly 0 or 1 and this is exactly 1: nothing changes where
      // the reader stops. Skia skips 0-alpha draws on the GPU side, so the
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

      // Dot label — the place being read, and the most prominent text on the
      // globe. It used to be gated on `nearSettled`, so it appeared and
      // vanished on a single frame; it rides the fade above instead. The
      // settled index flips at frac=0.5, outside both windows, so the label is
      // unambiguously the story left near 0 and the one landed on near 1 — it
      // never changes cities while it is legible. `formatLocalTime` caches per
      // zone for 30 s, so the Intl construction this gate used to hold back
      // happens once a swipe at most, not once a frame.
      let dotLabel: GlobeState['dotLabel'] = null;
      if (arcOpacity > 0) {
        const settledCountry = cachedCountryRef.current?.properties?.name ?? null;
        if (dot && settledCountry) {
          const article = articlesRef.current[settledIndex];
          const loc = displayLocation(article?.location ?? null);
          if (loc) {
            let sub: string | undefined;
            const tz = zoneFor(settledCountry, article?.lat, article?.lng, article?.location);
            if (tz) sub = formatLocalTime(tz) ?? undefined;
            dotLabel = { text: loc, sub, x: dot.x, y: dot.y, opacity: arcOpacity };
          }
        }
      }

      const qiblaBuilder = qiblaPathRef.current;
      qiblaBuilder.reset();
      let hasQibla = false;
      if (geo) {
        const storyPt: [number, number] = [geo.lng, geo.lat];
        if (geoDistance(storyPt, MAKKAH.coords) > 0.02) {
          skiaCtx.setPath(qiblaBuilder);
          traceGreatCircle(skiaCtx, geo.unit, MAKKAH_UNIT, 16, view, clipCos);
          hasQibla = true;
        }
      }

      // Source arcs — great circle lines from each source's HQ to the article location
      const sourceArcsBuilder = sourceArcsRef.current;
      sourceArcsBuilder.reset();
      let hasSourceArcs = false;
      if (geo) {
        const article = articlesRef.current[settledIndex];
        if (article?.sources) {
          skiaCtx.setPath(sourceArcsBuilder);
          for (const src of article.sources) {
            const srcUnit = sourceUnit(src.name);
            if (!srcUnit) continue;
            // Skip if source is at the same location as the story (0.05 rad).
            const along =
              srcUnit[0] * geo.unit[0] + srcUnit[1] * geo.unit[1] + srcUnit[2] * geo.unit[2];
            if (along > SAME_PLACE_COS) continue;
            traceGreatCircle(skiaCtx, srcUnit, geo.unit, 10, view, clipCos);
            hasSourceArcs = true;
          }
        }
      }

      // Coverage hotspot glows — projected every frame so the bright halos
      // rotate smoothly with the globe instead of popping at the settle
      // boundary. ≤12 point projections per frame, negligible cost.
      const hotspotGlows: GlobeState['hotspotGlows'] = [];
      for (const zone of hotspotsRef.current) {
        if (!seen(zone.unit)) continue;
        hotspotGlows.push({
          x: SCREEN_POINT[0],
          y: SCREEN_POINT[1],
          lat: zone.lat,
          lng: zone.lng,
          intensity: zone.intensity,
          recency: zone.recency,
          labels: zone.labels,
          countryName: zone.countryName,
        });
      }

      // The sun as a unit vector, so the city-light pass below scores how far
      // each city is past dusk with a dot product.
      const [sunUnitX, sunUnitY, sunUnitZ] = sunUnit;

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

      // City lights — refresh both tier paths. At most two dot products and a
      // projection per entry × ~190 entries, none of it trigonometry; the
      // day-side cull runs first, so only the night side is projected. The
      // dim civil-twilight tier is zoom-gated — held back at 1× ambient
      // (labelOpacity 0) so the terminator-edge speckle doesn't clutter the
      // resting view, and faded in via `cityTwilightOpacity` past 25°.
      // Deep-night dots always show.
      const cityNightBuilder = cityLightsNightPathRef.current;
      cityNightBuilder.reset();
      const cityTwilightBuilder = cityLightsTwilightPathRef.current;
      cityTwilightBuilder.reset();
      const cityRes = collectCityLights(
        view,
        clipCos,
        sunUnitX,
        sunUnitY,
        sunUnitZ,
        cityNightBuilder,
        cityTwilightBuilder,
        labelOpacity > 0,
      );

      // Chokepoints — always projected (unlike hotspots). The set is small
      // (≤11) and the markers are geographic reference, not cosmetic detail,
      // so they shouldn't blink out during a fast scroll.
      const chokepointMarks: GlobeState['chokepoints'] = [];
      for (const cp of chokepointsRef.current) {
        if (!seen(cp.unit)) continue;
        const pt = SCREEN_POINT;
        chokepointMarks.push({
          x: pt[0],
          y: pt[1],
          id: cp.id,
          label: cp.label,
          move: cp.move,
          basis: cp.basis,
          labelX: pt[0],
          direction: cp.direction,
          moveAlarm: cp.moveAlarm,
          intensity: Math.min(1, cp.absDelta / CHOKEPOINT_SATURATION_DELTA),
          disrupted: chokepointValence(cp.delta) === 'unfavorable',
          surge: cp.delta > STRAIT_SURGE_DELTA,
          labelY: null,
        });
      }

      // Exchanges whose index the server flagged. Same cull + project pattern
      // as chokepoints, and always projected for the same reason: the set is
      // tiny and the opening camera is usually pointed at one of them, so a
      // mark that blinks out mid-scroll is a mark that is not there when the
      // reader looks for what the strip just promised.
      const marketPoints: MarketPoint[] = [];
      for (const m of marketMarksRef.current) {
        if (!seen(m.unit)) continue;
        const pt = SCREEN_POINT;
        marketPoints.push({
          x: pt[0],
          y: pt[1],
          id: m.id,
          label: m.label,
          move: m.move,
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
        if (!seen(a.unit)) continue;
        const pt = SCREEN_POINT;
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
        if (!seen(e.unit)) continue;
        const pt = SCREEN_POINT;
        conflictMarks.push({
          x: pt[0],
          y: pt[1],
          id: e.id,
          recencyAlpha: e.recencyAlpha,
          scale: e.scale,
        });
      }
      // A conflict stack's count is set like a story's, in the same ink, so
      // the two collided — "5" and "8" at Washington read as "58". A story's
      // count is kept; the conflict glow still says something happened there.
      const conflictCounts: (GlobeState['conflictCounts'][number] & { hidden?: boolean })[] = [];
      for (const v of collapseConflictVisuals(conflictMarks).sort((a, b) => b.count - a.count)) {
        if (v.count < 3) continue;
        const box = conflictCountBox(v, subFontRef.current);
        if (countBoxes.some((b) => boxesMeet(b, box, COUNT_GAP))) continue;
        const entry = { x: v.x, y: v.y, count: v.count, hidden: false };
        countBoxes.push(box);
        countHide.push(() => {
          entry.hidden = true;
        });
        conflictCounts.push(entry);
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
        if (!seen(a.unit)) continue;
        const pt = SCREEN_POINT;
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
        if (!seen(e.unit)) continue;
        const pt = SCREEN_POINT;
        thermalMarks.push({ x: pt[0], y: pt[1], id: e.id, alpha: e.alpha, scale: e.scale });
      }
      const genocideMarks: GlobeState['genocideMarks'] = [];
      for (const g of genocideRef.current) {
        if (!seen(g.unit)) continue;
        const pt = SCREEN_POINT;
        const tw = subFontRef.current ? textWidth(subFontRef.current, g.label) : g.label.length * 6;
        genocideMarks.push({
          x: pt[0],
          y: pt[1],
          id: g.id,
          label: g.label,
          labelX: genocideLabelX(pt[0], tw, canvasW),
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

      // Country centroids — culled and placed from precomputed unit vectors
      // (`seen`), with no trigonometry per country. Two passes so anchors win
      // collisions in the greedy packer below: pass 1 collects anchors
      // (always), pass 2 collects non-anchors (only when zoomed past
      // PLACES_APPEAR_CLIP). Iteration is over the parallel arrays
      // (names/units) populated in shared.ts. Projects every
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
        const centroidUnit = countryCentroidUnits[i];
        if (!centroidUnit || !seen(centroidUnit)) continue;
        const pt = SCREEN_POINT;
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

      // Capitals, at every zoom: below the neighbours in the packer, so a
      // country's name wins over its capital's where they collide.
      const capitalLabels: GlobeState['capitalLabels'] = [];
      for (const capital of CAPITALS) {
        if (!seen(capital.unit)) continue;
        capitalLabels.push({ name: capital.name, x: SCREEN_POINT[0], y: SCREEN_POINT[1] });
      }

      if (placesActive) {
        // Lakes — filter to visually-significant size at globe scale
        // (~8000 km² floor = Lake Tanganyika scale). Keeps labels to the
        // ~20-30 giants worldwide; anything smaller is invisible through
        // the 110m coastline anyway.
        const LAKE_MIN_AREA = 2e-4; // steradians; ≈ 8000 km²
        for (const lake of getLakeLabels()) {
          if (lake.area < LAKE_MIN_AREA) continue;
          if (!seen(lake.unit)) continue;
          const pt = SCREEN_POINT;
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
          if (!seen(river.unit)) continue;
          const pt = SCREEN_POINT;
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
          if (!seen(sea.unit)) continue;
          const pt = SCREEN_POINT;
          waterLabels.push({
            name: sea.name,
            x: pt[0],
            y: pt[1],
            opacity: labelOpacity,
            kind: 'sea',
          });
        }
      }

      // Major river lines — the single heaviest projection (~9k vertices,
      // culled to the visible cap). Zoomed past RIVERS_APPEAR_CLIP they draw
      // on every frame and ease in as the reader zooms. At the resting story
      // framings (up to RIVERS_REST_CLIP) they draw on settled frames only, at
      // a quiet opacity: the Niger, the Darling and the Murray are all rank 3,
      // and a reader looking at Mali or Australia saw none of them.
      const riversZoomed = clipAngle < RIVERS_APPEAR_CLIP;
      if (riversZoomed || (nearSettled && clipAngle <= RIVERS_REST_CLIP)) {
        const settledEntry = geometryKey ? geometryCache.get(geometryKey) : undefined;
        if (settledEntry?.riversPath) {
          riversPath = settledEntry.riversPath;
        } else if (riversLayer) {
          const riverBuilder = riversPathRef.current;
          riverBuilder.reset();
          skiaCtx.setPath(riverBuilder);
          riversLayer.draw(view, viewAngle, precision, skiaCtx);
          riversPath = riverBuilder.build();
          if (settledEntry) settledEntry.riversPath = riversPath;
        } else {
          // Not decoded yet: this frame goes without, the redraw brings them.
          warmDetailGeo(() => detailRedrawRef.current());
        }
        if (riversPath) {
          const riverSpan = RIVERS_APPEAR_CLIP - PLACES_FULL_CLIP;
          const ramp = Math.min(1, Math.max(0, (RIVERS_APPEAR_CLIP - clipAngle) / riverSpan));
          riversOpacity = nearSettled ? Math.max(RIVERS_REST_OPACITY, ramp) : ramp;
        }
      }

      const marketProjected = layoutMarketClusters(
        marketPoints,
        [
          ...storyMarks,
          ...chokepointMarks,
          ...gdacsMarks,
          ...genocideMarks,
          ...conflictMarks,
          ...famineMarks,
          ...thermalMarks,
        ],
        canvasW,
        canvasH,
        layoutRef.current.marketViewport?.top,
        layoutRef.current.marketViewport?.bottom,
        // The story's place is the one label always drawn: a "6 markets"
        // leader used to end on "Paris".
        dotLabel ? [dotLabelBox(dotLabel, labelFontRef.current, subFontRef.current)] : [],
        { x: centerX, y: centerY, r: projScale },
      ).map((mark) => ({
        ...mark,
        labelX: mark.x,
        labelY: null as number | null,
        labelBounds: null as LabelBox | null,
      }));

      // Label collision — dot label (location · time) versus country name
      // label. Small countries where the story dot sits near the polygon
      // centroid (e.g. Islamabad in Pakistan) can stack the two. Compute
      // AABBs using the loaded font widths (approximated to character
      // count when fonts aren't loaded yet), push the country label below
      // the dot-label block if they overlap. Dot label stays fixed since
      // it anchors to the story location; country label is secondary.
      if (countryLabel && dotLabel) {
        const c = countryLabelBox(countryLabel, countryFontRef.current);
        const d = dotLabelBox(dotLabel, labelFontRef.current, subFontRef.current);
        if (boxesMeet(c, d, 0)) {
          // Push country label below the dot block with a small gap.
          countryLabel = { ...countryLabel, y: d.y1 + 14 };
        }
      }

      // Strait and exchange names. They were drawn whatever sat under them,
      // and at a story's framing they sat on each other and on the one label
      // that outranks them: "Bosporus Strait" and "BIST 100" read as
      // "BosBIST100rait" at Istanbul, and Ceuta's time printed over "Strait of
      // Gibraltar". The story's location and its country go down first; then
      // each name tries under its mark and then over it, and with neither free
      // it is dropped — the mark stays, tappable, and its sheet names it.
      // Exchange targets first,
      // then the straits whose traffic has moved, then the rest.
      const markLabelBoxes: LabelBox[] = [];
      {
        const markFonts: MarkFonts = {
          sub: subFontRef.current,
          water: waterFontRef.current,
          value: valueFontRef.current,
        };
        const taken: LabelBox[] = marketProjected.map((m) => ({
          x0: m.x - 19,
          x1: m.x + 19,
          y0: m.y - 19,
          y1: m.y + 19,
        }));
        if (dotLabel) taken.push(dotLabelBox(dotLabel, labelFontRef.current, subFontRef.current));
        if (countryLabel) taken.push(countryLabelBox(countryLabel, countryFontRef.current));
        // A genocide mark and its name are drawn whatever else is there, so a
        // strait or exchange name has to yield to them: unseeded, "GAZA"
        // printed across "Strait of Hormuz" on the whole-planet view. The box
        // follows the draw call — the ring's 9px, the name at x + 13, y + 4.
        for (const g of genocideMarks) taken.push(genocideLabelBox(g, subFontRef.current));
        // Marks, too — a label ran its `vs 90d` across two other straits'
        // coastlines and arrows around the Black Sea. Circles, one per glyph:
        // a strait and its traffic arrow, a story beacon, a hazard pictogram.
        // A label never counts its own mark, which sits where it points.
        const glyphs: { x: number; y: number; r: number }[] = [];
        for (const cp of chokepointMarks) {
          glyphs.push({ x: cp.x, y: cp.y, r: 10 });
          if (cp.direction) glyphs.push({ x: cp.x + 12, y: cp.y, r: 6 });
        }
        for (const m of storyMarks) glyphs.push({ x: m.x, y: m.y, r: BEACON_R * m.scale + 1 });
        for (const g of gdacsMarks) glyphs.push({ x: g.x, y: g.y, r: GLYPH_HALF });
        const meetsGlyph = (box: LabelBox, selfX: number, selfY: number) =>
          glyphs.some((g) => {
            if (Math.abs(g.x - selfX) < 13 && Math.abs(g.y - selfY) < 1) return false;
            const nx = Math.max(box.x0, Math.min(box.x1, g.x));
            const ny = Math.max(box.y0, Math.min(box.y1, g.y));
            return (g.x - nx) ** 2 + (g.y - ny) ** 2 < g.r * g.r;
          });
        // Story and conflict counts are avoided too — a "3" at the Gulf
        // printed over Hormuz's "vs 90d" — but held apart from `taken`, so a
        // disrupted strait's name can still claim their room (below).
        // Two lines where there is a move: over the mark, the block rises by
        // its second line, so the line nearest the mark sits where a one-line
        // label's did.
        const place = (
          x: number,
          y: number,
          t: MarkLabelText,
          overCounts = false,
          /** The mark the label names, whose own glyph it may sit beside. */
          self: { x: number; y: number } = { x, y },
          overGlyphs = false,
        ): { baseline: number; box: LabelBox } | null => {
          const tw = markLabelWidth(t);
          const depth = markLabelDepth(t);
          for (const dy of [32, -24, ...MARK_LABEL_DY]) {
            const yc = y + dy - (dy < 0 ? depth : 0);
            const box = {
              x0: x - tw / 2,
              x1: x + tw / 2,
              y0: yc - MARK_LABEL_ASCENT,
              y1: yc + depth + MARK_LABEL_DESCENT,
            };
            let free =
              box.y0 >= (layoutRef.current.marketViewport?.top ?? 0) &&
              box.y1 <= (layoutRef.current.marketViewport?.bottom ?? canvasH);
            for (const t of taken) {
              if (boxesMeet(box, t, MARK_LABEL_GAP)) {
                free = false;
                break;
              }
            }
            if (free && !overCounts)
              free = countBoxes.every((b) => !boxesMeet(box, b, MARK_LABEL_GAP));
            if (free && !overGlyphs) free = !meetsGlyph(box, self.x, self.y);
            if (free) {
              if (overCounts) {
                countBoxes.forEach((b, i) => {
                  if (boxesMeet(box, b, MARK_LABEL_GAP)) countHide[i]?.();
                });
              }
              taken.push(box);
              markLabelBoxes.push(box);
              return { baseline: yc, box };
            }
          }
          return null;
        };
        const planetView = clipAngle > MARK_NAMES_PLANET_CLIP;
        for (const m of marketProjected) {
          if (planetView && m.ids.length > 1) {
            m.labelY = null;
            m.labelBounds = null;
            continue;
          }
          const t = marketLabelText(m, markFonts);
          const tw = markLabelWidth(t);
          m.labelX = Math.max(tw / 2 + 6, Math.min(canvasW - tw / 2 - 6, m.x));
          const placed = place(m.labelX, m.y, t, false, m);
          m.labelY = placed?.baseline ?? null;
          m.labelBounds = placed?.box ?? null;
        }
        for (const cp of chokepointMarks) {
          const t = straitLabelText(cp, markFonts);
          const tw = markLabelWidth(t);
          cp.labelX = Math.max(tw / 2 + 6, Math.min(canvasW - tw / 2 - 6, cp.x));
          // A strait whose traffic moved is the headline of its region: with
          // no free room its name takes a count's, and the count is dropped —
          // at the whole-planet zoom a "3" beside it left Hormuz unnamed.
          if (cp.x >= 0 && cp.x <= canvasW && (cp.disrupted || cp.surge))
            cp.labelY =
              (
                place(cp.labelX, cp.y, t, false, cp) ??
                place(cp.labelX, cp.y, t, true, cp) ??
                place(cp.labelX, cp.y, t, true, cp, true)
              )?.baseline ?? null;
        }
        for (const cp of chokepointMarks) {
          if (!planetView && cp.x >= 0 && cp.x <= canvasW && !cp.disrupted && !cp.surge)
            cp.labelY =
              place(cp.labelX, cp.y, straitLabelText(cp, markFonts), false, cp)?.baseline ?? null;
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
      let keptCapitals = capitalLabels;
      let keptWaters = waterLabels;
      if (neighborLabels.length > 0 || capitalLabels.length > 0 || waterLabels.length > 0) {
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
        // Linear 2px @ PLACES_FULL_CLIP (10°) → 13px @ PLACES_APPEAR_CLIP (25°),
        // clamped, so big-country 1× clips (up to 70°) also get the wide gap.
        const pad =
          2 +
          11 *
            Math.min(
              1,
              Math.max(0, (clipAngle - PLACES_FULL_CLIP) / (PLACES_APPEAR_CLIP - PLACES_FULL_CLIP)),
            );
        if (countryLabel) {
          const c = countryLabelBox(countryLabel, cfont);
          occupied.push({ ...c, x0: c.x0 - pad, x1: c.x1 + pad });
        }
        if (dotLabel) {
          const d = dotLabelBox(dotLabel, lfont, sfont);
          occupied.push({ ...d, x0: d.x0 - pad, x1: d.x1 + pad });
        }
        // The strait and exchange names placed above, so a neighbour or water
        // name that crosses one yields. Unseeded, "Bosporus Strait" printed
        // across TÜRKIYE and "Bab-el-Mandeb" across ETHIOPIA.
        // And the always-drawn genocide names and the story counts: unseeded,
        // SAUDI ARABIA printed across GAZA.
        // And the market targets: SPAIN printed across the IBEX circle and
        // SWITZERLAND across SMI's once zoomed past the story framings.
        for (const m of marketProjected) {
          occupied.push({ x0: m.x - 15, x1: m.x + 15, y0: m.y - 15, y1: m.y + 15 });
        }
        for (const b of [
          ...markLabelBoxes,
          ...countBoxes,
          ...genocideMarks.map((g) => genocideLabelBox(g, sfont)),
        ]) {
          occupied.push({ x0: b.x0 - pad, x1: b.x1 + pad, y0: b.y0 - pad, y1: b.y1 + pad });
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

        const ckept: GlobeState['capitalLabels'] = [];
        for (const capital of capitalLabels) {
          const tw = sfont ? textWidth(sfont, capital.name) : capital.name.length * 5;
          const x0 = capital.x - CAPITAL_DOT_R - pad;
          const x1 = capital.x + CAPITAL_TEXT_DX + tw + pad;
          const y0 = capital.y - 9 - pad;
          const y1 = capital.y + 4 + pad;
          let collides = false;
          for (const o of occupied) {
            if (x0 < o.x1 && x1 > o.x0 && y0 < o.y1 && y1 > o.y0) {
              collides = true;
              break;
            }
          }
          if (!collides) {
            ckept.push(capital);
            occupied.push({ x0, y0, x1, y1 });
          }
        }
        keptCapitals = ckept;

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
        settled: nearSettled,
        landPath,
        lakesPath,
        capitalLabels: keptCapitals,
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
        selected,
        subsolar,
        hotspotGlows,
        chokepoints: chokepointMarks,
        marketMarks: marketProjected,
        gdacsMarks,
        conflictMarks,
        conflictCounts: conflictCounts.filter((c) => !c.hidden),
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

  // **The next landing, computed while the reader reads.** A settled frame
  // costs ~300 ms on the emulator (dev) when its coastlines, borders, lakes
  // and rivers are projected and ~20 ms when they come from
  // `settledGeometryRef`; for those 300 ms the coarse moving frame stayed on
  // screen after every swipe. The deck says where a swipe can land — the
  // story either side — and a story's camera is its own coordinates at its
  // own framing, so once a frame has settled, JS idle time fills the cache for
  // both neighbours. Only while settled: a prefetch that ran during motion
  // would hold up the frames the warp is waiting for.
  const prefetchSettled = useCallback((index: number) => {
    const {
      globeRadius: r,
      cx: centerX,
      cy: centerY,
      width: canvasW,
      height: canvasH,
    } = layoutRef.current;
    const grownReach = layoutRef.current.canvasReach;
    const coords = coordsRef.current;
    const lat = coords[index * 2];
    const lng = coords[index * 2 + 1];
    if (lat == null || lng == null) return;
    const clip = clipAngleForCountry(articleGeoRef.current[index]?.countryName ?? null);
    const projScale = r / Math.sin((clip * Math.PI) / 180);
    const viewAngle = viewAngleFor(
      projScale,
      Math.max(grownReach, reachFor(centerX, centerY, canvasW, canvasH)),
    );
    const tier = geographyTier(projScale, false);
    const key = settledKey(tier, lng, lat, projScale, viewAngle, centerX, centerY);
    const cache = settledGeometryRef.current;
    if (cache.has(key)) return;
    const geography = getGlobeGeography(tier);
    const view = orthoView(lng, lat, projScale, centerX, centerY);
    const build = (
      builder: { current: ReturnType<typeof Skia.PathBuilder.Make> },
      layer: OrthoLayer,
    ) => {
      builder.current.reset();
      skiaCtx.setPath(builder.current);
      layer.draw(view, viewAngle, 0.25, skiaCtx);
      return builder.current.build();
    };
    const lakes = lakesLayer;
    const rivers = riversLayer;
    const entry: SettledGeometry = {
      landPath: build(landPathRef, geography.land),
      icePath: build(icePathRef, geography.ice),
      bordersPath: build(bordersPathRef, geography.borders),
      lakesPath: lakes ? build(lakesPathRef, lakes) : null,
    };
    if (rivers && clip <= RIVERS_REST_CLIP) entry.riversPath = build(riversPathRef, rivers);
    cache.set(key, entry);
    while (cache.size > SETTLED_CACHE_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }, []);
  const prefetchIdleRef = useRef<number | null>(null);
  const schedulePrefetch = useCallback(() => {
    if (prefetchIdleRef.current !== null) cancelIdleCallback(prefetchIdleRef.current);
    const around = lastSettled.current;
    // One neighbour per idle slot, the next story first: that is the swipe.
    const queue = [around + 1, around - 1].filter(
      (i) => i >= 0 && i < coordsRef.current.length / 2,
    );
    const step = () => {
      prefetchIdleRef.current = null;
      if (!frameRef.current.settled || lastSettled.current !== around) return;
      const next = queue.shift();
      if (next === undefined) return;
      prefetchSettled(next);
      if (queue.length > 0) prefetchIdleRef.current = requestIdleCallback(step);
    };
    prefetchIdleRef.current = requestIdleCallback(step);
  }, [prefetchSettled]);
  useEffect(
    () => () => {
      if (prefetchIdleRef.current !== null) cancelIdleCallback(prefetchIdleRef.current);
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
      if (frameRef.current.settled) schedulePrefetch();
    },
    [callReproject, reprojectBusy, schedulePrefetch],
  );

  /** Replay the last frame with the current style — nothing moved. */
  const redrawLast = useCallback(() => {
    drawRef.current(frameRef.current);
  }, []);

  // First frame: project the opening story before the reaction's first tick,
  // so the earth is never drawn empty. At the motion tier: the resting tier
  // is several times the geometry and, with the rivers and lakes, was all on
  // the path to the first pixel — the globe stayed blank for seconds at a
  // loaded emulator's pace. The passive effect below, and the reaction's first
  // tick, settle it once this frame is on screen.
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
      true,
    );
  }, []);

  // The theme is only colour: replay the frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: colors and light are read through drawRef
  useEffect(() => {
    redrawLast();
  }, [colors, light, redrawLast]);

  const receiveTextures = useCallback(
    (
      ghost: SkImage | null,
      storyHalo: SkImage | null,
      overlay: SkImage | null,
      dot: SkImage | null,
      makkah: SkImage | null,
    ) => {
      texturesRef.current = { ghost, storyHalo, overlay, dot, makkah };
      redrawLast();
    },
    [redrawLast],
  );
  useAnimatedReaction(
    () => ({
      ghost: ghostTexture.value,
      storyHalo: storyHaloTexture.value,
      overlay: overlayTexture.value,
      dot: dotTexture.value,
      makkah: makkahTexture.value,
    }),
    (t) => {
      scheduleOnRN(receiveTextures, t.ghost, t.storyHalo, t.overlay, t.dot, t.makkah);
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
  // The last published story window, used to detect metadata changes even
  // while a finger owns the camera position.
  const lastReactLo = useSharedValue(0);
  const lastReactHi = useSharedValue(0);
  // Whether the last frame a finger or a flight published was in motion, so the
  // frame after the camera stops is redrawn at full detail — once.
  const lastReactMoving = useSharedValue(false);
  // **Draw where the camera lands, a little before it lands.** A swipe's
  // spring and a flight's easing both spend their last few hundred ms moving
  // a few pixels, and a settled frame waited for the exact end
  // (`isStorySettled`), so the globe sat still at the coarse motion tier for
  // up to a second before the detail arrived (recorded 2026-09-23). The
  // destination is known — the story's own camera — so once the camera is
  // nearly there its settled frame is projected *at the destination*, and the
  // warp carries that picture over the last few pixels. The landing itself is
  // then that same frame: the reaction's no-op check finds nothing to do.
  const landingDrawn = useSharedValue(-1);
  const drawLanding = (story: number, lat: number, lng: number, oA = 0, oG = 0) => {
    'worklet';
    landingDrawn.value = story;
    lastReactLng.value = lng;
    lastReactLat.value = lat;
    lastReactFrac.value = 0;
    lastReactSy.value = story;
    lastReactOA.value = oA;
    lastReactOG.value = oG;
    lastReactSettled.value = story;
    lastReactLo.value = story;
    lastReactHi.value = story;
    lastReactMoving.value = false;
    if (viewLat) viewLat.value = lat;
    if (viewLng) viewLng.value = lng;
    reprojectBusy.value = true;
    scheduleOnRN(runScrollReproject, lng, lat, story, story, story, 0, oA, oG, false);
  };

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

      const rawStory = Math.max(0, sy);
      const articleCount = len / 2;
      const lo = Math.min(Math.floor(rawStory), articleCount - 1);
      const hi = Math.min(lo + 1, articleCount - 1);
      const frac = Math.min(1, rawStory - lo);
      const settled = Math.min(Math.round(rawStory), articleCount - 1);

      // Where the deck's camera is this frame: along the great circle between
      // the two stories either side of the finger, and out of the way by as
      // much as the crossing is long (`flyCurve`), the same arithmetic the
      // projection runs on JS.
      const coords = coordsSV.value;
      const loLat = coords[lo * 2];
      const loLng = coords[lo * 2 + 1];
      const hiLat = coords[hi * 2];
      const hiLng = coords[hi * 2 + 1];
      let deckLat: number | null = null;
      let deckLng: number | null = null;
      if (loLat != null && loLng != null && hiLat != null && hiLng != null) {
        // Great-circle interpolation — the globe rotates along the surface of
        // the sphere between story locations, like tracing a path on a
        // physical globe. The flights use the same path (`slerpLatLng`).
        //
        // How far along it at `frac` is the curve's answer, not `frac` itself:
        // the crossing covers most of its ground while it is furthest out, and
        // that is what keeps the ground moving across the screen at one speed
        // instead of rushing past at close range.
        if (
          deckCurveLo.value !== lo ||
          deckCurveHi.value !== hi ||
          deckCurveVer.value !== framingsVer.value
        ) {
          const framings = framingsSV.value;
          const fromClip = framings[lo] ?? FRAMING_WIDEST;
          const toClip = framings[hi] ?? fromClip;
          deckCurve.value = flyCurve(fromClip, toClip, arcDegrees(loLat, loLng, hiLat, hiLng));
          deckCurveLo.value = lo;
          deckCurveHi.value = hi;
          deckCurveVer.value = framingsVer.value;
        }
        const held = deckCurve.value;
        const point = slerpLatLng(
          loLat,
          loLng,
          hiLat,
          hiLng,
          held ? flyPosition(held, frac) : frac,
        );
        deckLat = point[0];
        deckLng = point[1];
      } else if (loLat != null && loLng != null) {
        deckLat = loLat;
        deckLng = loLng;
      } else if (hiLat != null && hiLng != null) {
        deckLat = hiLat;
        deckLng = hiLng;
      }

      // The camera as it is this frame, for the warp — published on every
      // frame, busy or throttled, because that is the point of it: the
      // projection below reaches JS at most every 32 ms and often later, and
      // the warp carries the last picture to here in between.
      const liveLat = owner === 1 ? dragLat : deckLat;
      const liveLng = owner === 1 ? dragLng : deckLng;
      if (liveLat != null && liveLng != null) {
        const curve = deckCurveLo.value === lo && deckCurveHi.value === hi ? deckCurve.value : null;
        const storyClip = curve
          ? flySpanClip(curve, frac)
          : (framingsSV.value[lo] ?? FRAMING_WIDEST);
        const clip = storyClip + (oG - storyClip) * oA;
        const last = liveCamera.value;
        if (
          last === null ||
          Math.abs(last.lat - liveLat) > 1e-4 ||
          Math.abs(last.lng - liveLng) > 1e-4 ||
          Math.abs(last.clip - clip) > 1e-4
        ) {
          liveCamera.value = { lat: liveLat, lng: liveLng, clip };
        }
      }

      // Do not update the last-published inputs while busy: once the current
      // projection finishes, those values are what let the reaction detect
      // and publish the latest position. This is latest-only backpressure,
      // not a frame drop that can strand the globe between articles.
      if (busy) return;
      const selectionChanged = settled !== lastReactSettled.value;
      // Compare to the last published frame, not the previous reaction tick:
      // updates while busy must not consume the final detail restoration.
      const detailChanged =
        (owner === 0 && lastReactMoving.value) ||
        isStorySettled(frac) !== isStorySettled(lastReactFrac.value);
      const now = performance.now();
      const justReleased = previous?.busy === true;
      if (
        !selectionChanged &&
        !detailChanged &&
        !justReleased &&
        hasFired.value &&
        now - lastTimeRef.value < 32
      )
        return;
      hasFired.value = true;
      lastTimeRef.value = now;

      // A finger or flight owns position, not story identity. Keep the current
      // story's pin/highlight even if a pinch cancelled its flight offscreen.
      if (owner === 1) {
        // A story flight in its last half degree: draw where it lands.
        const target = landingAt ? landingAt.value : null;
        const framing = target ? framingsSV.value[target.story] : undefined;
        if (
          target &&
          framing !== undefined &&
          Math.abs(dragLat - target.lat) < LANDING_NEAR_DEG &&
          Math.abs(dragLng - target.lng) < LANDING_NEAR_DEG &&
          Math.abs(oG - framing) < LANDING_NEAR_DEG
        ) {
          if (landingDrawn.value === target.story) return;
          // The override is dropped at the landing; the story's framing is
          // the clip it lands at.
          drawLanding(target.story, target.lat, target.lng, 0, oG);
          return;
        }
        const cameraMoved =
          Math.abs(dragLng - lastReactLng.value) >= 0.01 ||
          Math.abs(dragLat - lastReactLat.value) >= 0.01 ||
          Math.abs(oA - lastReactOA.value) >= 1e-4 ||
          Math.abs(oG - lastReactOG.value) >= 0.01;
        const unchanged =
          !cameraMoved &&
          !selectionChanged &&
          lo === lastReactLo.value &&
          hi === lastReactHi.value &&
          Math.abs(frac - lastReactFrac.value) < 1e-3 &&
          !detailChanged;
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
        lastReactSy.value = sy;
        lastReactSettled.value = settled;
        lastReactLo.value = lo;
        lastReactHi.value = hi;
        lastReactFrac.value = frac;
        lastReactMoving.value = cameraMoved || !isStorySettled(frac);
        landingDrawn.value = -1;
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
          lastReactMoving.value,
        );
        return;
      }

      if (deckLat === null || deckLng === null) return;
      const lat = deckLat;
      const lng = deckLng;

      // A swipe in the last few percent of its spring: draw where it lands.
      const landing =
        isStorySettled(frac) || (oA > 0.001 && oA < 0.999)
          ? -1
          : frac <= LANDING_NEAR_FRAC
            ? lo
            : frac >= 1 - LANDING_NEAR_FRAC
              ? hi
              : -1;
      if (landing >= 0) {
        if (landingDrawn.value === landing) return;
        const tLat = coords[landing * 2];
        const tLng = coords[landing * 2 + 1];
        if (tLat != null && tLng != null) {
          drawLanding(landing, tLat, tLng, oA, oG);
          return;
        }
      }
      landingDrawn.value = -1;

      // No-op short-circuit — bail when nothing meaningful changed since the
      // last frame. Skipping when sy is stable handles the steady-state
      // post-swipe case; checking lng/lat/frac/oA/oG handles the case where
      // a withTiming animation has settled at its target but the reaction
      // ticker is still firing. settledIndex change always passes through
      // (drives country highlight + label swap).
      if (
        !detailChanged &&
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
  detailRedrawRef.current = finalizeReproject;

  // All projection inputs are mirrored into refs during render. A commit can
  // update several at once (fonts, layout and cached layers on startup), so
  // reproject the complete snapshot once instead of once per changed input.
  // Keep this after the resume effect, which invalidates the sun caches.
  // biome-ignore lint/correctness/useExhaustiveDependencies: callReproject is stable and reads the latest input refs
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
  }, [
    selectedCoords,
    labelFont,
    subFont,
    countryFont,
    neighborFont,
    waterFont,
    valueFont,
    hotspots,
    globeRadius,
    cx,
    cy,
    width,
    height,
    canvasReach,
    enrichedMarketMarks,
    enrichedChokepoints,
    placeMarks,
    enrichedFamine,
    enrichedThermal,
    enrichedGenocide,
  ]);

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
  // A shared value, not state: a burst starting is a tap on the globe, and a
  // `setState` there re-rendered the whole globe component on the frame the
  // burst began.
  const collectColor = useSharedValue<string>(WHITE);

  useImperativeHandle(ref, () => ({
    framingFor(index: number) {
      return clipAngleForCountry(articleGeoRef.current[index]?.countryName ?? null);
    },
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
      // The fade is `KEEP_MOTION`: Reanimated would otherwise snap it to 0
      // under Reduce Motion too, and the ring would never be seen at all.
      pulseR.value = reduceMotion ? 34 : 5;
      if (!reduceMotion) {
        pulseR.value = withTiming(34, { duration: ANIMATION.slow, easing: PULSE_EASING });
      }
      pulseOpacity.value = withTiming(0, {
        duration: ANIMATION.slow,
        easing: PULSE_EASING,
        ...KEEP_MOTION,
      });
    },
    collect(x: number, y: number, color: string) {
      collectColor.value = color;
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
          ...KEEP_MOTION,
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
        for (const m of frame.marketMarks)
          overlay = Math.min(overlay, marketHitDistanceSquared(m, x, y));
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
          const tz = name ? zoneFor(name, z.lat, z.lng) : undefined;
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

      // Every member of a numbered market target opens in the chooser.
      for (const m of frame.marketMarks) {
        if (Number.isFinite(marketHitDistanceSquared(m, x, y))) {
          for (const id of m.ids)
            candidates.push({
              countryName: '',
              location: null,
              localTime: null,
              data: null,
              marketSignalId: id,
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
          const tz = zoneFor(geoData.countryName, geoData.lat, geoData.lng, geoData.location);
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
          const feature = getGlobeGeography(geographyTier(projRef.current.scale())).countryAt(
            lng,
            lat,
          );
          if (feature) {
            const name = feature.properties?.name ?? '';
            const tz = name ? zoneFor(name, lat, lng) : undefined;
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

  const canvasOrigin = useMemo(() => vec(width / 2, height / 2), [width, height]);

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
  // A plain derived value, never Skia's `usePathValue`: that hook writes its
  // path and then reads it back (`notifyChange`) inside the same derived
  // value, so the value subscribes to itself and re-runs every frame. Each run
  // handed the canvas a new path, and the whole globe replayed on the UI thread
  // ~60 times a second with nothing moving.
  const ringPath = useDerivedValue(() => {
    const r = framePictures.value.disc + RING_GAP;
    return Skia.PathBuilder.Make()
      .addArc(Skia.XYWHRect(cx - r, cy - r, 2 * r, 2 * r), -90, 360)
      .build();
  });

  return (
    <>
      <Canvas style={[styles.canvas, { width, height }]} pointerEvents="none">
        <Group transform={canvasTransform} origin={canvasOrigin}>
          {/* Ground — the atmospheric rim, the ocean, the subsolar glint,
          daylight, the graticule, land, ice, borders, night, city lights and
          the inner-limb glaze. Recorded per projection; see
          `recordGlobeFrame`. */}
          <Group transform={prevWarp}>
            <Picture picture={prevGroundPicture} />
          </Group>
          <Group transform={warp}>
            <Picture picture={groundPicture} />

            {/* Marks — hotspots, straits, exchanges, hazards, the country
            highlight, rivers, arcs, stories and the settled dot. */}
            <Picture picture={marksPicture} />
          </Group>

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
            <Circle
              cx={collectX}
              cy={collectY}
              r={collectDiscR}
              color={collectColor}
              opacity={0.5}
            />
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
          <Group transform={warp}>
            <Picture picture={labelsPicture} />
          </Group>
        </Group>
      </Canvas>
      <Animated.View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.beacon, beaconStyle]}
      />
    </>
  );
});

const styles = StyleSheet.create({
  beacon: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
