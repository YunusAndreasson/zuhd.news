// The homepage situational map.
//
// MapLibre GL renders a real, labelled basemap — filled countries, borders,
// country and place names — from GeoJSON and SDF glyphs we host ourselves. No
// tile provider, no API key, no third-party request; the CSP stays
// `default-src 'none'` apart from the blob: worker MapLibre spawns.
//
// Over that sit the pipeline's own layers: every geo-located story from the
// last 14 days, coloured by category and drawn as itself, a density wash raised
// from the places those stories share, plus the GDACS disaster and
// maritime-chokepoint feeds. A left rail lists the same stories in time order —
// the map says where, the rail says what.

// maplibre-gl v6 ships named ESM exports only — there is no default export.
// The bundler resolves it to the copied vendor file rather than inlining it, so
// the engine is fetched once and shared with the worker it spawns.
import {
  clearPrewarmedResources,
  Map as MapLibreMap,
  prewarm,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type PaddingOptions,
  type PointLike,
} from 'maplibre-gl'
// `GeoJSON.*` was being reached for as a UMD global, which @types/geojson only
// exposes to non-module files — so the namespace never resolved in here.
// Type-only, so esbuild drops it.
import type { FeatureCollection } from 'geojson'
import {
  basemapUrl,
  buildStyle,
  CATEGORY_COLOUR,
  CATEGORY_ORDER,
  densityCssRamp,
  densityRamp,
  globeFitZoom,
  GLOBE_ZOOM,
  LAND_NO_DATA,
  LAND_RAMP,
  MAP_COLOURS,
  NODATA_HATCH,
  nodataHatch,
  OVERLAY_COLOUR,
} from './_map/style'
import {
  buildPlaceIndex,
  countPlaces,
  DENSITY_INTENSITY,
  type PlaceIndex,
  type StoryPlace,
} from './_map/places'
import { createFeed, type Feed } from './_map/feed'
import { graticuleLines } from './_map/graticule'
import { createStarfield, type SkyHit } from './_map/starfield'
import { createReadState } from './_map/read-state'
import { glyphImages, glyphSvg, type GlyphId } from './_map/glyphs'
import {
  createMarketStrip,
  marketCollection,
  marketLayout,
  marketPaint,
  ribbonPct,
  seriesChangePct,
  sparkInput,
  type MarketStrip,
  type TrendIndicator,
} from './_map/markets'
import { bucketCounts, coverage, halfOverHalf } from './_map/series-window'
import { sparkline } from './_spark'
import { createPaneSeam, type PaneSeam } from './_map/panes'
import { createTimeline, type Timeline } from './_map/timeline'
import { createSheet, type Sheet } from './_map/sheet'
import { MAKKAH_LABEL, MAKKAH_TZ, solarClock, zoneOffset } from './_map/format'
import { createStoryPopup, type CountryStanding, type StoryPopup } from './_map/popup'
import { dayPolygon, nightPolygon, sunLightPosition, terminatorBand } from './_map/solar'
import { PRAYER_NOTE, PRAYERS, type PrayerId, prayerInstantAt, prayerLines } from './_map/prayer'
import { HIJRI_NOTE, hijriLabel } from './_map/hijri'
import {
  CONTESTED_D,
  DEFAULT_METRIC,
  THERMAL_NOTE,
  decayAt,
  type ConflictEvent,
  type GdacsAlert,
  type GdacsDetail,
  FAMINE_NOTE,
  type GenocideSituation,
  type IpcArea,
  type MapChokepoint,
  type MapExchange,
  type MapPoint,
  type MetricIndexEntry,
  type MetricPayload,
  NARROW_PX,
  type ThermalEvent,
} from './_map/types'
import { detailKey } from '@shared/gdacs'

/** Where the 1:10m coastline replaces 1:50m — see the zoomend handler. */
const ULTRA_ZOOM = 5.5

/**
 * The tone the lit side is lifted with, on the water and along the terminator.
 *
 * One constant because `day-shade` and `twilight` are two drawings of one fact
 * — where the sun is — and a second literal for the second layer is exactly the
 * arrangement the shared-modules table in `CLAUDE.md` exists to stop. It is not
 * in `MAP_COLOURS`: that block is what `colour-system.test.js` reads, and a
 * token there is a claim about a *mark* a reader can see and name. This is a
 * wash at 0.055 and 0.07 that never appears at full strength anywhere.
 */
const DAYLIGHT = '#7f9dc4'

/**
 * The oldest analysis the famine layer draws, in months.
 *
 * Must equal `AGE_LIMIT_MONTHS` in `scripts/lib/ipc.js`, which is what the
 * fetcher gates on. It is repeated rather than imported because that module is
 * Node-side and this bundle must not pull it in; the payload carries
 * `ageLimitMonths` so the two can be checked against each other, and
 * `map-island.test.js` does.
 */
const FAMINE_AGE_MONTHS = 12

/**
 * Where the density wash has finished fading out.
 *
 * Named because three things have to agree on it: the layer's `heatmap-opacity`,
 * the legend item that decodes it, and the test that pins the pair together.
 */
const DENSITY_FADE_OUT = 5

/**
 * The overlay marks: everything that opens a sheet on hover.
 *
 * A single list rather than one per call site, because the three handlers and
 * the two hit-tests below have to agree on it — a layer added to one and not
 * the others is a mark that lights the cursor and then does nothing, or one
 * that swallows a click meant for the country underneath.
 */
const OVERLAY_LAYERS = [
  'gdacs-marks',
  'thermal-marks',
  'chokepoint-marks',
  'market-marks',
  'conflict-marks',
  'famine-marks',
  'genocide-marks',
  'genocide-core',
]

/**
 * Everything the pointer can hit: overlays, the story beacons, and the numeral
 * naming how many stories a place holds.
 *
 * `story-place-count` is in here because it is the most legible affordance on a
 * dense place, and nothing on this map should look interactive and then do
 * nothing. It is safe to add for the reason `PRAYER_HOVER` is not: a 10px
 * numeral's box is a numeral's box, where a prayer line crosses every continent.
 *
 * Exported only so `map-island.test.js` can hold it against `HIT_ORDER`. The two
 * describe one contract from two directions and a layer in one but not the other
 * is a bug in either direction — a mark that lights the cursor and does nothing,
 * or one with no stated precedence when something else lands on top of it.
 */
export const MARKER_LAYERS = ['story-points', 'story-place-count', ...OVERLAY_LAYERS]

/**
 * Which mark wins when several sit under one pointer: draw order, reversed.
 *
 * This exists because of a bug that had been live and unreported. Handlers were
 * registered per layer — `map.on('click', 'story-clusters', …)` beside
 * `map.on('click', OVERLAY_LAYERS, …)` — and MapLibre gives each registration
 * its *own* hit test over its *own* layers. Both found a feature, so both fired:
 * clicking the story aggregate over London flew the camera **and** pinned the
 * London Stock Exchange card, because `market-marks` draws above the stories and
 * exchanges sit in exactly the cities that generate the most stories. Hovering
 * the pair did the same thing twice over. Nothing in MapLibre makes the topmost
 * layer win *across* separate registrations.
 *
 * So there is one `click` and one `mousemove` now, each asking `topHit` once.
 * Order is stated rather than read off `queryRenderedFeatures`, whose ordering
 * is not part of MapLibre's contract, and a test asserts this is the same set as
 * `MARKER_LAYERS` — a layer in one and not the other is a mark that lights the
 * cursor and does nothing.
 */
export const HIT_ORDER = [
  'genocide-core',
  'genocide-marks',
  // Under genocide, over everything else: a famine classification is a
  // determination too, so it must not be coverable by a burst of stories or a
  // market tick — but where the two coincide, which over Gaza they do, the
  // graver finding takes the pointer.
  'famine-marks',
  'thermal-marks',
  'market-marks',
  'story-place-count',
  'story-points',
  'gdacs-marks',
  'chokepoint-marks',
  'conflict-marks',
]

/**
 * Whether a prayer line is the one under the pointer.
 *
 * Deliberately absent from `MARKER_LAYERS`: a prayer line crosses every
 * continent, so putting it in the click path would carve a band out of every
 * country where clicking no longer opens that country's card. It lights on
 * hover and takes nothing.
 */
const PRAYER_HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]

/** How wide, in pixels, the pointer may miss a hairline by and still find it. */
const PRAYER_GRAB_PX = 7

/**
 * Time-range presets, in hours. One ladder, for everything in the rail below it.
 *
 * It used to be four steps ending in `null` — "the whole 14-day window" — and
 * it governed the beacons alone, while the money block underneath drew a fixed
 * thirty observations that no gesture on this page could move. Two windows in
 * one column, and only one of them had a control.
 *
 * The merge costs each side something and neither cost is silent. The stories
 * keep every step they had except `14d`, which `30d` and `90d` now contain; the
 * money gains four steps and loses nothing, since `3d` of daily closes is three
 * points and draws. What it buys is that "the time range" on this map means the
 * time range.
 *
 * `null` is gone with `14d`. It existed to say "no lower bound" when the corpus
 * *was* the bound; with real steps past the fortnight the bound has to be a
 * number the story archive can be fetched against.
 */
const RANGES: Array<[label: string, hours: number]> = [
  ['24h', 24],
  ['3d', 72],
  ['7d', 168],
  ['30d', 720],
  ['90d', 2160],
]

/**
 * The range the map opens on.
 *
 * Opening on the full fortnight showed everything at once, which is the one view
 * where nothing stands out: 764 beacons, most of them cold, burying the dozen
 * stories that broke today. A news map should open on the news. That argument
 * still holds and is why this is not `null`.
 *
 * What changed on 2026-07-30 is the measurement at the other end. 24 hours is
 * **29 stories** against this payload, and the freshest six-hour bucket is
 * routinely empty because the newest story is already hours old when the build
 * runs — so twelve hours after a cycle the opening view is about *seven*. The
 * rail said "29 STORIES" over a map that looked like nothing was happening, and
 * a density field cannot be raised from seven points.
 *
 * 72 hours is 135, which is enough for the field to show a real pattern on first
 * paint while still being the news. 24h is one press away.
 */
const DEFAULT_RANGE_HOURS = 72

/** How often the terminator is redrawn. The sun moves 0.25° a minute. */
const SUN_TICK_MS = 120_000

/**
 * Beacon size for a story with no coverage figure.
 *
 * Two thirds of the corpus has none — the selector records it only when the
 * feed reported one. Drawing those at the minimum radius said "nobody covered
 * this", which is a claim the data does not make. A fixed value below the
 * median says "unknown" instead, and keeps the size channel meaning what it
 * says for the third of stories that do carry a figure.
 */
const UNKNOWN_COVERAGE_W = 0.28

/**
 * Disaster mark size for an alert whose severity does not reduce to a number.
 *
 * Floods publish `severityValue: 0` with an empty unit at this endpoint — GDACS
 * has no single scalar for a flood the way it has a magnitude for a quake. Same
 * rule as `UNKNOWN_COVERAGE_W` above: unknown is drawn as unknown, not as
 * smallest, because "we have no scale for this" and "this is the mildest event
 * on the map" are different statements.
 */
const UNKNOWN_SEVERITY_MAG = 0.3

/**
 * `revalidate` is for the refresh control, and nothing else should set it.
 *
 * On load there is deliberately no `cache: 'no-cache'`: it forced a
 * revalidation every time, which both defeated the <link rel=preload> for this
 * exact URL and threw away the stale-while-revalidate the endpoint is served
 * with.
 *
 * A reader pressing "refresh" is the opposite case. `/api/map.json` is served
 * `max-age=300`, so a plain fetch inside five minutes is answered from the
 * browser's own cache without touching the network — the button would appear
 * to work and be incapable of ever finding anything. `no-cache` forces the
 * conditional request while still allowing a 304, which the endpoint does
 * serve: unchanged, the whole check costs a round trip and zero bytes of body.
 * `no-store` would be the wrong tool — it refetches the payload every time.
 */
const json = async <T>(
  url: string,
  signal?: AbortSignal,
  revalidate = false,
): Promise<T | null> => {
  try {
    // Built up rather than spread, because `RequestInit.signal` is optional and
    // `{ signal: undefined }` is a different thing from `{}` — present-and-
    // undefined, which is what exactOptionalPropertyTypes exists to separate.
    // fetch happens to tolerate it, so this was never a live fault; it is the
    // shape of one, and the same construction elsewhere would not be so lucky.
    const init: RequestInit = {}
    if (signal) init.signal = signal
    if (revalidate) init.cache = 'no-cache'
    const res = await fetch(url, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

const empty = { type: 'FeatureCollection' as const, features: [] }

const catColour = (fallback: string) =>
  [
    'match',
    ['get', 'cat'],
    'politics', CATEGORY_COLOUR.politics,
    'economy', CATEGORY_COLOUR.economy,
    'science', CATEGORY_COLOUR.science,
    'tech', CATEGORY_COLOUR.tech,
    fallback,
  ] as unknown as ExpressionSpecification

/**
 * How a place's story count becomes a wash weight.
 *
 * The compression lives in `_map/places.ts` beside the measured distribution it
 * was fitted to; this is only the expression handing it to the shader. `sqrt`
 * because counts run 1 to 62 in a real window and a linear weight either
 * saturates Washington across half a continent or leaves a two-story place under
 * the ramp's toe.
 *
 * Deliberately not `w`. Coverage is absent on 62% of the corpus, where it
 * becomes `UNKNOWN_COVERAGE_W` — and a radius can draw "unknown" as its own
 * distinct size, which is the entire reason that constant exists, while a
 * continuous field cannot: a placeholder just makes a patch dimmer, silently,
 * and a reader reads that as less news. Coverage is also a fact about media
 * attention, and mixing it in here would render a media fact as a geographic
 * one — Washington brightening because American stories are better covered.
 */
const densityWeight = (): ExpressionSpecification =>
  ['*', ['get', 'amax'], ['sqrt', ['get', 'n']]] as unknown as ExpressionSpecification

/**
 * Whether this browser can draw the map at all.
 *
 * **MapLibre requires WebGL2 and does not throw when it is missing.** The
 * constructor fires a `GPUInitializationError` on the map's own event bus —
 * which, per the note on `map.on('error')` in `map.md`, deliberately has no
 * listener — and then *returns a half-built object*. So the failure surfaces
 * hundreds of lines later at the first line that touches a handler,
 * `map.touchZoomRotate.disableRotation()`, as a bare `TypeError: Cannot read
 * properties of undefined`. `island-loader.js` catches that and logs it, which
 * aborts `mount` with the DOM in the state this function now prevents: the
 * chrome up, `.map-loading` still saying "Drawing the world…", and **not one
 * story anywhere on the page** — permanently, with nothing on screen admitting
 * it. Measured with WebGL disabled: 120 story links before, 0 after.
 *
 * The fallback that was supposed to cover this is the `<noscript>` block in
 * `templates/index.html`, and it structurally cannot: a browser renders
 * `<noscript>` when *scripting* is off, and here scripting is on and working
 * perfectly — it is the GPU that is absent. Nothing else on the homepage is
 * server-rendered (`build.js`: "The only server-rendered content left is the
 * <noscript>"), so the one reader who most needs the plain list is the one
 * reader neither surface gives it to.
 *
 * Asked before `prewarm()`, so a browser that cannot use the engine does not
 * spawn its worker pool either.
 */
function canRenderMap(): boolean {
  let probe: WebGL2RenderingContext | null = null
  try {
    probe = document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
  if (!probe) return false
  // A GL context is a real driver resource and browsers cap how many may be
  // live at once, so the probe hands its own back immediately rather than
  // leaving it for a collection that would otherwise race the map's own.
  //
  // **Released in its own `try`, deliberately.** Folded into the one above,
  // this line decides the answer: `getExtension` is absent from the test
  // harness's context stub, so calling it threw, the catch returned `false`,
  // and every map assertion in `map-island.test.js` ran against the fallback
  // instead of the map — 12 suites failing to report a browser that has a GPU
  // as one that has none. Releasing early is an optimisation; whether the
  // browser can draw was already answered above.
  try {
    probe.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    /* The context is the collector's problem now. */
  }
  return true
}

/**
 * The news, on a browser that cannot draw the map.
 *
 * It **adopts the server's own `<noscript>` payload** rather than rendering a
 * second list. While scripting is enabled the contents of `<noscript>` are
 * parsed as *text*, so that markup — `build.js`'s, already escaped by it — is
 * simply sitting in `textContent` waiting to be used. That keeps one source of
 * truth for what a fallback story row is, which is the rule the shared modules
 * exist to enforce: a second copy here would be a list that could disagree
 * with the one a JS-less reader gets, and nothing would be checking that it
 * did not. The two can never both paint — if `<noscript>` renders, this island
 * never ran.
 *
 * The notice says what happened in the reader's terms, because the failure is
 * on their machine and is usually one they can act on. Silence here is what
 * made the original bug read as a dead site rather than an unavailable map.
 */
function renderFallback(container: HTMLElement): () => void {
  const wrap = document.createElement('div')
  wrap.className = 'map-fallback'

  const note = document.createElement('p')
  note.className = 'map-fallback-note'
  note.setAttribute('role', 'status')
  note.textContent =
    'The map needs WebGL2, which this browser has not made available — most often because hardware acceleration is switched off. The last 14 days of stories are below.'
  wrap.append(note)

  const markup = document.querySelector('noscript')?.textContent
  if (markup) {
    const list = document.createElement('div')
    list.innerHTML = markup
    wrap.append(list)
  }

  container.classList.add('is-fallback')
  container.append(wrap)

  return () => {
    container.replaceChildren()
    container.classList.remove('is-fallback')
  }
}

export function mount(
  container: HTMLElement,
  props: { basemap?: string; story?: string } = {},
) {
  /**
   * Start MapLibre's worker pool before anything needs it.
   *
   * `new MapLibreMap(…)` is several hundred lines below this: the whole HUD, the
   * rail, the scrubber and the style are built first, and only then does the
   * engine get asked for anything. `prewarm` spends that interval creating the
   * worker and its shared resources, so the 1.6 MB basemap parse starts against
   * a worker that already exists rather than one spun up on demand.
   *
   * It is explicitly *not* aimed at the boot cost this map actually has. Most of
   * that is `getShaderParameter`/`getProgramParameter` blocking the main thread
   * on the driver — ~820 ms of ~1.9 s, still without `KHR_parallel_shader_compile`
   * in 6.1.0 — which is upstream and untouchable from here. This is the part
   * that *is* ours: overlapping a startup we control with one we do not.
   */
  // Before anything is built or fetched: a browser with no WebGL2 gets the
  // stories rather than a permanent "Drawing the world…". See `canRenderMap`.
  if (!canRenderMap()) return renderFallback(container)

  prewarm()

  /** Cache key for the basemap files — see `basemapUrl`. */
  const basemapV = props.basemap
  /**
   * The story a shared link asked for, from `data-story` on the shell.
   *
   * Only ever set by `functions/s/[slug].js`, which is the route `shareUrl()`
   * hands out. The homepage never carries it, so the map's own first view is
   * untouched: this is a landing, not a mode.
   */
  const sharedStory = props.story || null
  /** Both halves of the landing's precondition, and a latch so it runs once. */
  let coreLoaded = false
  let sharedDone = false
  container.classList.add('map-root')
  container.removeAttribute('aria-hidden')

  // --- DOM ----------------------------------------------------------------
  const mapEl = document.createElement('div')
  mapEl.className = 'map-canvas-host'

  /**
   * The sky, and it must be the **first child of the canvas host**.
   *
   * MapLibre appends its own canvas container to this element when the map is
   * constructed, which is after this line runs — and both are `position:
   * absolute` with no `z-index`, so tree order alone decides which paints over
   * which. That ordering *is* the design: MapLibre's canvas is transparent
   * outside the limb and opaque on the planet, so a canvas underneath it is
   * occluded by the globe in hardware, exactly at the edge and exactly at the
   * moment. Move this after `new MapLibreMap` and the sky paints over the
   * earth, with nothing failing and nothing logged.
   *
   * `map-island.test.js` asserts the position rather than the existence.
   */
  const sky = createStarfield({
    project: (lngLat) => map.project(lngLat),
    centre: () => {
      const c = map.getCenter()
      return [c.lng, c.lat]
    },
    bearing: () => map.getBearing(),
    pitch: () => map.getPitch(),
    zoom: () => map.getZoom(),
  })
  mapEl.append(sky.element)

  // What a prayer line says when the pointer rests on it. Inside the canvas
  // host rather than the root because MapLibre reports pointer positions
  // relative to the canvas, and the host is the only ancestor those numbers
  // are already correct in — on desktop the rail is a separate grid column, so
  // measuring from the root would slide every reading sideways by its width.
  // `aria-hidden`: it is pointer-only and adds nothing a screen reader cannot
  // get from the labels on the map and the method on the chip.
  const prayerTip = document.createElement('div')
  prayerTip.className = 'map-prayer-tip'
  prayerTip.hidden = true
  prayerTip.setAttribute('aria-hidden', 'true')
  mapEl.append(prayerTip)

  const hud = document.createElement('div')
  hud.className = 'map-hud'

  /**
   * The rail's one time range, and the heading that says what it governs.
   *
   * The control had no heading while it was one of several groups in a column
   * — `stories`, `layers` and `ground` each named their own, and the ranges sat
   * between them naming nothing. That was survivable when it moved the beacons
   * only. It is at the head of the rail now, above the money and above every
   * layer control, and a bare row of five buttons at the top of a column is a
   * control with no stated subject; the word is what says the five positions
   * below it are all one answer.
   */
  const rangeHead = document.createElement('div')
  rangeHead.className = 'map-range-group'

  const rangeLabel = document.createElement('span')
  rangeLabel.className = 'map-group-label'
  rangeLabel.textContent = 'time range'
  rangeLabel.setAttribute('aria-hidden', 'true')

  const ranges = document.createElement('div')
  ranges.className = 'map-ranges'
  ranges.setAttribute('role', 'group')
  ranges.setAttribute('aria-label', 'Time range')
  rangeHead.append(rangeLabel, ranges)

  const filters = document.createElement('div')
  filters.className = 'map-filters'
  filters.setAttribute('role', 'group')
  filters.setAttribute('aria-label', 'Filter by category')

  /**
   * The key.
   *
   * The map spends three channels on every beacon — radius for how widely a
   * story was covered, alpha for how long ago, a ring for sources that disagree
   * — and until now said what none of them meant. The category chips were the
   * only legend, so the two channels carrying the most ink were undecodable and
   * a reader could only conclude that some dots are bigger than others.
   *
   * Glyphs rather than sentences, because the thing being explained is a shape;
   * the full sentence lives in `title` for anyone who wants it. Same type and
   * colour as the filter chips — a key that needed its own visual language
   * would be admitting the map has too many.
   */
  const KEY_ITEMS: Array<{ id: string; label: string; hint: string; svg: string }> = [
    {
      id: 'size',
      label: 'coverage',
      hint: 'Beacon size shows how widely a story was covered, ranked across the window',
      svg: '<circle cx="4" cy="8" r="1.7"/><circle cx="12" cy="8" r="4"/>',
    },
    {
      id: 'age',
      label: 'recency',
      hint: 'Beacons fade as the story ages — half-light every three days',
      svg: '<circle cx="4" cy="8" r="3" opacity="0.28"/><circle cx="12" cy="8" r="3"/>',
    },
    {
      id: 'contested',
      label: 'contested',
      hint: 'A ring marks a story the sources covering it disagree sharply about',
      svg: '<circle cx="8" cy="8" r="2.4"/><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1"/>',
    },
  ]

  const key = document.createElement('div')
  key.className = 'map-key'
  key.setAttribute('role', 'group')
  // "How the stories are drawn", not "What the beacons mean", since 2026-07-30.
  // The density wash belongs in this group — it is raised from the stories and is
  // part of the same layer's alphabet — but it is not a channel a *beacon* spends
  // ink on, and that exact distinction is the argument this file makes for
  // keeping the genocide chip out of here. Widening the label is the honest fix;
  // leaving it would have made the group's own name false.
  key.setAttribute('aria-label', 'How the stories are drawn')
  const keyItems = new Map<string, HTMLElement>()
  for (const item of KEY_ITEMS) {
    const span = document.createElement('span')
    span.className = 'map-key-item'
    span.title = item.hint
    span.innerHTML =
      `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">${item.svg}</svg>` +
      `<span>${item.label}</span>`
    keyItems.set(item.id, span)
    key.append(span)
  }

  /**
   * The density wash, which is the one channel here a reader cannot guess.
   *
   * A swatch rather than a `currentColor` glyph, because a gradient is not a
   * shape — built from `DENSITY_STOPS` through `densityCssRamp`, so the strip in
   * the panel cannot disagree with the wash on the canvas. The value stays in
   * `_map/style.ts` and arrives here as an inline custom property, the way
   * `--ramp` and `--cat` already do; no literal enters the stylesheet.
   *
   * There is deliberately **no key item for the numeral**. A count beside a place
   * name decodes itself, which is why the cluster count never had one either. And
   * unlike the ground ramp, this scale prints no values at its ends: the ground's
   * gradient needed them because a bare gradient is a scale with no units and the
   * *direction* varies by metric, whereas here more news is always more wash. The
   * hint carries the only thing left to say, which is what the wash is *about*:
   * how far, not how much.
   */
  const densityKey = document.createElement('span')
  densityKey.className = 'map-key-item'
  densityKey.title =
    'A wash where stories crowd together — how far the news reaches, not how much of it there is'
  densityKey.innerHTML =
    `<span class="map-key-field" style="--ramp:${densityCssRamp()}"></span>` +
    '<span>density</span>'
  keyItems.set('density', densityKey)
  key.append(densityKey)

  /**
   * `contested` starts hidden, like the genocide chip below.
   *
   * Its visibility is conditional — `applyRefresh` stands it up only when a
   * story on screen actually carries the ring — but it was *built* visible, so
   * the first paint printed three items and the first data refresh took one
   * away. On the default 24h view, where a contested story is the exception,
   * that meant the key flashed "coverage · recency · contested" and settled on
   * two, a second later, every single load. A legend item appearing and then
   * withdrawing itself reads as the map correcting a mistake.
   *
   * Hidden until something needs decoding is the same rule the genocide chip
   * states: a legend for a mark that is not drawn is a lie, and one that
   * retracts itself in front of the reader is a worse way of telling it.
   */
  const contestedKey = keyItems.get('contested')
  if (contestedKey) contestedKey.hidden = true

  /**
   * The genocide mark, named beside the layers rather than beside the beacons.
   *
   * It used to head `.map-key`, whose `aria-label` is "What the beacons mean"
   * and whose three other items decode a channel a story beacon spends ink on
   * — radius, alpha, the contested ring. Genocide is none of those. It is an
   * overlay with its own mark, the same kind of thing as disasters, straits and
   * conflict, and sitting at the head of that group it read as a fifth way of
   * encoding a beacon. The code had already noticed twice without acting on it:
   * the entry was given the layer's own colour while the rest inherit grey, and
   * the stylesheet still describes the key as decoding *three* channels.
   *
   * Moving it here also puts it next to `conflict`, which is the point of its
   * colour: `#f5372b` is conflict's hue at the saturation conflict deliberately
   * lacks — the same subject at the far end of it. A reader can only learn that
   * from the two chips being adjacent, and they were as far apart as this HUD
   * can place them, on separate rows at opposite ends.
   *
   * Past its own separator, and a `<span>` rather than a `<button>`: the four
   * chips before it are toggles and this one is deliberately not. Genocide has
   * no toggle and no time filter — a determination is a condition, not an event
   * — so it must not acquire the affordance of one. The separator is what says
   * "controls end here", which is the fact that needed conveying.
   */
  const genocideKeySep = document.createElement('span')
  // `is-genocide` names *which* separator this is, and the rail needs to know:
  // there it is the only one that has to go, because the mark it fences off
  // belongs among the layers it was fencing it from. A `:last-of-type` rule
  // cannot pick it out — the last `<span>` in `.map-filters` is the lock note,
  // not this — and a positional selector standing for an identity is how a
  // future chip inserted at the end would silently move a rule.
  genocideKeySep.className = 'map-filter-sep is-genocide'
  genocideKeySep.setAttribute('aria-hidden', 'true')
  const genocideKey = document.createElement('span')
  genocideKey.className = 'map-key-item is-layer-note'
  genocideKey.title =
    'A situation a named UN body has determined to be genocide — click the mark for the finding'
  genocideKey.style.color = OVERLAY_COLOUR.genocide
  // The same mark box the chips use (see `chipGlyph`), so this sits in the
  // layers column on the column's own left edge rather than 6px inside it.
  genocideKey.innerHTML =
    '<span class="map-filter-mark">' +
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">' +
    '<circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<circle cx="8" cy="8" r="1.9"/></svg></span><span>genocide</span>'
  // Hidden until the record is on the wire, separator and all. A legend for a
  // mark that is not drawn is the same lie in either direction — and a lone
  // divider hanging off the end of the row is its own small piece of nonsense.
  genocideKeySep.hidden = true
  genocideKey.hidden = true
  keyItems.set('genocide', genocideKey)

  /**
   * The ground's own legend.
   *
   * The land carries a number now, and a shaded world that doesn't say what
   * the shading means is worse than a flat one — it looks like information
   * while withholding it. Three parts, in the order a reader needs them: which
   * metric, which way the scale runs, and who says so.
   *
   * The direction is the part that can't be dropped. Nothing about a light
   * patch tells you whether light is good, and it differs by metric — the ramp
   * only ever means "more of the thing", so the sentence has to supply the
   * rest. `METRICS[key].description` was already written to do exactly this
   * job on the country pages ("0 = most free, 100 = no press freedom").
   */
  const ground = document.createElement('div')
  ground.className = 'map-ground'

  const groundSelect = document.createElement('select')
  groundSelect.className = 'map-ground-select'
  groundSelect.setAttribute('aria-label', 'Shade countries by')
  groundSelect.addEventListener('change', () => {
    void loadMetric(groundSelect.value)
  })

  const groundScale = document.createElement('div')
  groundScale.className = 'map-ground-scale'
  /**
   * A gradient built from the same constants the fill uses, so the key cannot
   * drift from the map: change the ramp and the legend changes with it — with
   * the value at each end written on it.
   *
   * The numbers are the part that was missing. A bare gradient is a scale with
   * no units: it says darker and lighter, never how much of a thing a shade is
   * worth, so the only reader who could interpret it was one who already knew
   * the distribution. And prose cannot carry the direction any more — the ramp
   * turns around on the three `ascending` metrics, so "light means more" stops
   * being true exactly where it matters most. Two numbers say both at once, in
   * the metric's own units, and can't disagree with the paint because the build
   * reads them off the same projection.
   */
  /**
   * The no-data key shows the hatch, not just the tone under it.
   *
   * It was a flat `LAND_NO_DATA` square whose own `title` began "Hatched: no
   * figure for this metric" — a legend naming a mark it did not draw. And of
   * every mark on this map that is the one where the gap matters most, because
   * the argument `nodataHatch` is built on is that the tone alone *cannot* do
   * this job: "no tone, however chosen, can say 'not measured' to a reader who
   * has just been taught that dark means little". `LAND_NO_DATA` is `#0d1015`,
   * two points off the ocean. On a ramp whose dark end is also near-black, a
   * reader checking the key against the land saw a dark chip beside a dark
   * gradient and had nothing to tell them apart — the difference of kind was on
   * the map and missing from the thing explaining it.
   *
   * Both values come from the constant the sprite is rasterised from, the way
   * `--c` and `--ramp` already come from `LAND_NO_DATA` and `LAND_RAMP`, so the
   * key cannot drift from the fill. The period is the tile's diagonal —
   * `(x + y) % 8` puts one line every `8 / √2` px measured across it.
   */
  const hatchRgb = [1, 3, 5].map((i) => parseInt(NODATA_HATCH.ink.slice(i, i + 2), 16)).join(' ')
  const hatchStyle =
    `--c:${LAND_NO_DATA};` +
    `--hatch:rgb(${hatchRgb} / ${NODATA_HATCH.alpha.toFixed(3)});` +
    `--hatch-gap:${(NODATA_HATCH.tile / Math.SQRT2).toFixed(2)}px`

  groundScale.innerHTML =
    `<span class="map-ground-swatch" data-none="1" style="${hatchStyle}"></span>` +
    `<span class="map-ground-end" data-end="dark"></span>` +
    `<span class="map-ground-ramp" style="--ramp:${LAND_RAMP.join(',')}"></span>` +
    `<span class="map-ground-end" data-end="light"></span>`

  const groundNote = document.createElement('p')
  groundNote.className = 'map-ground-note'

  /**
   * The note is not in `.map-ground`, and that is the point.
   *
   * It used to be the third child of the pill on the strip, which made the
   * ground legend a sentence lying over the map: 113 characters for press
   * freedom, plus the publisher, `white-space: nowrap` with an ellipsis to stop
   * it landing on the country labels. So below about 1300px it rendered
   * `…0 = most free, 100 = no press freedo…` — truncating the clause that
   * states the direction, which is the only clause it exists for.
   *
   * And the strip does not need it any more. The two ends of the ramp print the
   * metric's own extremes (`57K ▬▬ 1.4B`), which is the argument this file
   * already makes for putting them there: prose cannot carry the direction once
   * the ramp turns around on `ascending`, and two numbers say both at once. The
   * sentence restates in words what the numerals state exactly — the
   * cluster-glow mistake in another medium.
   *
   * So it goes into the legend panel, where it has room to be the whole
   * sentence rather than two thirds of one, and where the source line beside it
   * is not competing with the map for a row.
   */
  /**
   * The picker's visible name, in the rail only.
   *
   * On the strip it needed none: the `<select>` sits among chips that are
   * plainly the map's controls, and it names its own value. In a column, a bare
   * dropdown reading `population` above a gradient is a control with no subject
   * — the reader can see *what it is set to* and not *what it sets*. The
   * accessible name ("Shade countries by") has always said so; this is that
   * sentence made visible, in the register the other group names use.
   */
  const groundLabel = document.createElement('span')
  groundLabel.className = 'map-group-label'
  groundLabel.textContent = 'ground'
  groundLabel.setAttribute('aria-hidden', 'true')

  ground.append(groundLabel, groundSelect, groundScale)

  /** Fills the picker once the index has landed. */
  const buildMetricPicker = () => {
    if (!metricIndex.length) return
    groundSelect.replaceChildren()
    for (const m of metricIndex) {
      const opt = document.createElement('option')
      opt.value = m.key
      opt.textContent = m.label
      groundSelect.append(opt)
    }
    groundSelect.value = metricKey
  }

  /**
   * Countries on the basemap that carry an ISO code, and so *could* be shaded.
   * The denominator for "how much of the world does this metric cover" — the
   * seven features without a code (Antarctica, Somaliland, N. Cyprus and the
   * like) are not missing data, they are not countries with codes.
   */
  const TOTAL_COUNTRIES = 169

  /** Restates the scale for whichever metric is showing. */
  const renderMetricKey = () => {
    if (!metric) return
    // Before the index arrives the select has no options, so the current metric
    // would have nothing to display. Seed it with the one we actually have.
    if (!groundSelect.options.length) {
      const opt = document.createElement('option')
      opt.value = metric.key
      opt.textContent = metric.label
      groundSelect.append(opt)
    }
    groundSelect.value = metric.key

    const covered = Object.keys(metric.values).length
    groundNote.replaceChildren()

    // One line, and only the part that cannot be inferred: which way the scale
    // runs. The full three sentences — direction, publisher, coverage — wrapped
    // across two lines of the HUD and landed on top of the map's own country
    // labels, so the legend was competing with the thing it was explaining.
    // Coverage moves to the no-data swatch's tooltip, next to the tone it
    // describes, which is where a reader would look for it anyway.
    groundNote.append(document.createTextNode(metric.description))
    if (metric.source) {
      const src = document.createElement('span')
      src.className = 'map-ground-source'
      // These tables are regenerated by hand and rarely, so naming the
      // publisher is the honest version of a freshness claim we can't make.
      src.textContent = ` · ${metric.source}`
      groundNote.append(src)
    }

    // The two ends of the ramp, in the metric's own units. `domain` is emitted
    // from the same projection that produced every country's position, so the
    // legend and the land cannot disagree about which end is which.
    const dark = groundScale.querySelector<HTMLElement>('[data-end="dark"]')
    const light = groundScale.querySelector<HTMLElement>('[data-end="light"]')
    if (dark) dark.textContent = metric.domain?.dark ?? ''
    if (light) light.textContent = metric.domain?.light ?? ''

    const swatch = groundScale.querySelector('.map-ground-swatch')
    if (swatch) {
      // How much of the world this metric actually covers, stated rather than
      // implied. It ranges from 170 countries down to 85 for literacy, and a
      // reader has no way to tell a sparse metric from a dense one by looking —
      // the hatch says "not this country", only the count says "not half of
      // them".
      const missing = Math.max(0, TOTAL_COUNTRIES - covered)
      swatch.setAttribute(
        'title',
        missing > 0
          ? `Hatched: no figure for this metric — ${covered} countries shaded, ${missing} without data`
          : `${covered} countries shaded`,
      )
    }
  }

  /**
   * The strip carries controls; the panel carries explanations.
   *
   * That is the whole reorganisation of 2026-07-30, and it comes from measuring
   * what the strip actually cost. Four groups sat on it at equal weight — the
   * time range, the chips, the beacon key and the ground legend — and the HUD
   * spent 128px of the map at 1920, 158px at 1500, **193px at 1400 and 1280**,
   * 125px at 1200, 153px at 1100 and below. It did not degrade with width, it
   * *thrashed*: the 1250px breakpoint produced a better layout than the hundred
   * pixels above it, so a 1400px laptop — the commonest desktop there is — got
   * the worst version on the site, four rows deep, with the range chips alone on
   * row one and 600px of dead space beside them.
   *
   * Two things caused most of it, and neither was a control.
   *
   * `.map-key` — coverage, recency, contested — was `margin-left: auto`, a
   * right-aligned legend that forced its own row the moment the chips stopped
   * leaving it space, landing at x=965 at 1440, x=376 at 1100, x=467 at 920: a
   * different place at every width, which is the "it breaks on a smaller
   * screen" a reader actually sees. It is the one group on the strip with
   * nothing to press, decoding three channels a reader learns once, and it was
   * taking a full row of the map at 1440, 1500, 1600, 1100, 1024 and 920.
   *
   * The ground note was a 113-character sentence with an ellipsis. See
   * `groundNote` above for why the strip stopped needing it.
   *
   * So both fold into this panel, at *every* width — which is not a new
   * mechanism, it is the phone's own. The phone block already argued the key
   * belongs here ("in a panel the reader opened on purpose, a legend is the
   * whole point"), and that argument does not start being true at 900px either.
   * What stays on the strip is what answers a press: the range, the chips, and
   * the metric picker with its ramp.
   *
   * ── Two boxes, because the two layouts fold at different depths ────────────
   * `.map-hud-more` is the phone's panel and a pass-through on the desktop
   * (`display: contents`, so `.map-filters` and `.map-ground` stay direct flex
   * items of the strip). `.map-hud-legend` is the desktop's panel and a
   * pass-through on the phone (`display: contents`, so the key and the note
   * become rows of the phone panel instead of a box inside it). One DOM, two
   * layouts, and the same `is-open` on both — each stylesheet block decides
   * which of the two the word refers to.
   */
  const more = document.createElement('div')
  more.className = 'map-hud-more'
  more.id = 'map-hud-more'

  const legend = document.createElement('div')
  legend.className = 'map-hud-legend'
  legend.id = 'map-hud-legend'

  const moreBtn = document.createElement('button')
  moreBtn.type = 'button'
  moreBtn.className = 'map-more'
  moreBtn.setAttribute('aria-expanded', 'false')
  // An IDREF *list*: which of the two boxes this actually reveals is a layout
  // question, and the answer is in a media query the button cannot read.
  moreBtn.setAttribute('aria-controls', 'map-hud-more map-hud-legend')
  /**
   * Two words and two glyphs, one of each per layout — because the panel holds
   * different things on either side of 900px and a control has to say which.
   * On the desktop it reveals the legend and is called "key"; on the phone it
   * also swallows the chips and the picker, so "layers" stays the honest word
   * and the stacked-planes glyph stays the honest mark. The hidden one is
   * `display: none`, so it leaves the accessibility tree with the pixels and
   * the button announces one name rather than both.
   */
  moreBtn.innerHTML =
    '<svg viewBox="0 0 16 16" data-for="wide" aria-hidden="true" focusable="false" fill="currentColor">' +
    '<circle cx="3.4" cy="8" r="1.5"/><circle cx="8" cy="8" r="2.4" opacity="0.5"/>' +
    '<circle cx="13" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1"/></svg>' +
    '<svg viewBox="0 0 16 16" data-for="narrow" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.2">' +
    '<path d="M8 1.8 14.4 5 8 8.2 1.6 5Z"/><path d="m2.4 8 5.6 2.8L13.6 8"/><path d="m2.4 11 5.6 2.8L13.6 11"/>' +
    '</svg><span data-for="wide">key</span><span data-for="narrow">layers</span>'

  /**
   * The legend is in flow in both layouts, which is what removed a measurement.
   *
   * It used to be a floating panel hung under the top strip and aligned to the
   * button that opened it — the button is the last item in a wrap run and landed
   * anywhere from x=911 at 1400px to the middle of row three at 920px, so
   * `anchorLegend` measured it and published `--legend-x`, having found that
   * pinning the panel to the HUD's right edge opened it 150px clear of the
   * control that summoned it. That wrap run was the top strip's, and the strip is
   * the phone's layout now: on a phone the box is `display: contents` and
   * dissolves into the panel the reader opened, and in the rail a column grows
   * downward by definition, so the panel is simply the next block. Nothing left
   * to measure and nothing left to clamp.
   */
  const setMoreOpen = (open: boolean) => {
    more.classList.toggle('is-open', open)
    legend.classList.toggle('is-open', open)
    moreBtn.setAttribute('aria-expanded', String(open))
  }

  moreBtn.addEventListener('click', () => {
    setMoreOpen(!more.classList.contains('is-open'))
  })

  // Touching the map is the reader saying they are done with the panel. Not a
  // click — a pan or a pinch never becomes one, and a panel that survives the
  // gesture it was in the way of is a panel you have to dismiss twice.
  mapEl.addEventListener('pointerdown', () => setMoreOpen(false))

  /**
   * The head of the instrument rail: what time it is, in both calendars.
   *
   * The Hijri date is `display: none` outside `body.map-wide` — the strip has
   * one absolutely-positioned line and the scrubber's readout already carries
   * the date there, so it would be the same fact three times on one screen.
   *
   * ── What this is not ──────────────────────────────────────────────────────
   * It carried the day's five prayer times in Makkah for a while, on the
   * reasoning that the map draws `prayer-lines` and never says what they are.
   * Removed: a column of five times has to be *for* somewhere, and a reader
   * arriving at a news map has no reason to assume the rail means Makkah rather
   * than where they are — so the block's first effect was to raise a question it
   * answered nowhere on screen. The lines already carry the fact in the one form
   * that cannot be misread, because each one is drawn where it is true, and
   * hovering one names it and times it. This is a news map that keeps a Makkah
   * clock, not a prayer-times app, and the difference is exactly a set of times
   * for one place.
   */
  const status = document.createElement('div')
  status.className = 'map-status'

  const clockEl = document.createElement('span')
  clockEl.className = 'map-clock'

  const hijriEl = document.createElement('span')
  hijriEl.className = 'map-now-hijri'
  hijriEl.title = HIJRI_NOTE

  status.append(clockEl, hijriEl)

  legend.append(key, groundNote)
  more.append(filters, ground, legend)
  // The button is last, which is a desktop fact: `.map-hud-more` is a
  // pass-through there, so `more`'s children *are* strip items and a button
  // appended before them would sit between the time range and the chips. On the
  // phone the panel is out of flow and the button's `margin-left: auto` puts it
  // at the right end regardless of where it appears in the markup.
  //
  // The clock is first, and it is *in* the strip now rather than beside it. It
  // was a child of the root, absolutely positioned over the HUD's top-right —
  // which is the same pixel either way while the HUD is a strip pinned to the
  // same corner, so nothing about the narrow layout changes. What it buys is the
  // wide one: as a child it can simply become the rail's first line, where a
  // box positioned against the root would have gone on hanging in the canvas.
  hud.append(status, rangeHead, more, moreBtn)

  /**
   * Back to the whole world.
   *
   * Zooming in is one gesture; getting back out is five, and there was nothing
   * on screen that said otherwise — the wordmark did it, but nobody knows that.
   * The button only exists once the view has actually moved, so at rest it adds
   * nothing to a map whose whole point is restraint.
   */
  const resetBtn = document.createElement('button')
  resetBtn.type = 'button'
  resetBtn.className = 'map-reset'
  resetBtn.hidden = true
  resetBtn.title = 'Show the whole world (Esc)'
  resetBtn.setAttribute('aria-label', 'Zoom out to the whole world')
  resetBtn.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M2.4 8h11.2M8 2.4c1.6 1.7 2.4 3.6 2.4 5.6S9.6 12.3 8 13.6C6.4 12.3 5.6 10 5.6 8S6.4 4.1 8 2.4Z" fill="none" stroke="currentColor" stroke-width="1.1"/>' +
    '</svg><span>whole world</span>'

  /**
   * Says the canvas is empty on purpose.
   *
   * The basemap is one ~540 KB fetch now rather than a coarse placeholder
   * followed by the real thing, which is the right trade — but it means the
   * first paint of a cold visit is an empty ocean for as long as that takes.
   * Silence there reads as breakage, and the reader has no way to tell a slow
   * network from a map that has failed. A line of type is the whole fix; it is
   * removed the moment the coastline is on screen.
   *
   * **Inside the canvas host**, like `.map-prayer-tip` and for the same reason:
   * what it wants to be centred in is the canvas, and only the host is that box
   * in every layout. On the root it was `inset: 0` and so centred across the
   * rails as well — 24px off with one rail, and once there were two, either a
   * pair of `var()` terms that the phone layout would then have to unset, or a
   * line of type sitting under the instrument rail. The element it belongs to
   * knows its own width; nothing has to be told.
   */
  const loading = document.createElement('p')
  loading.className = 'map-loading'
  loading.setAttribute('role', 'status')
  loading.textContent = 'Drawing the world…'

  /**
   * The money block, at the head of the instrument rail.
   *
   * It was a row of the scrubber, then two rows of it, then a bar across the
   * top of the canvas, and the whole of that history is width management — a
   * `flex: 1 1 34rem` basis swept against real line counts, a ≤1300px cull of
   * two currencies, a phone that drops the named movers. All of it came from
   * being laid out along the axis it had least of.
   *
   * The bar's argument for the top was that a readout is not a control, so
   * neither rail is its home. That was a true statement about the rail as it
   * then was, and it is what this changes: the rail is the *instrument* rail,
   * an instrument shows a reading, and this block sits **above** every control
   * in it — so a reader still meets it before they start working the map, in
   * the one dimension that lets a readout carry a shape as well as a number.
   * A bar could hold breadth; a column holds a line, and a line is the thing
   * the reader cannot get anywhere else on this map.
   *
   * It is also what the fold now leaves behind. `body.map-aside-off` used to
   * take the whole rail to zero and leave a 15px triangle saying nothing at
   * all; it narrows to a spine of these sparklines instead, so collapsing the
   * controls no longer collapses the readings with them.
   *
   * Empty until `/api/markets.json` lands (`root.hidden`), so nothing reserves
   * space for a block that may not arrive.
   */
  const moneyBox = document.createElement('div')
  moneyBox.className = 'map-money'

  // Appended on its own rather than into the call above, because it is declared
  // down here with its reasoning. Nothing depends on the position: the rail's
  // reading order is `order` (see `body.map-wide` in the stylesheet), and in
  // every other layout this box is `display: none` and the strip is a line of
  // the scrubber instead.
  hud.append(moneyBox)

  mapEl.append(loading)
  container.append(mapEl, hud, resetBtn)

  // --- State --------------------------------------------------------------
  let points: MapPoint[] = []
  /** Slug → point, so hit-testing a marker is a lookup and not a 764-item scan. */
  let pointBySlug = new Map<string, MapPoint>()
  let leads: Record<string, string> = {}
  let gdacs: GdacsAlert[] = []
  /** Population exposure per alert, keyed `${eventtype}:${eventid}`. */
  let gdacsDetails: Record<string, GdacsDetail> = {}
  let chokepoints: MapChokepoint[] = []
  let markets: MapExchange[] = []
  let conflicts: ConflictEvent[] = []
  /** Newest event in the conflict feed — see `conflictWindowLabel`. */
  let conflictNewest = 0
  let genocide: GenocideSituation[] = []
  let thermal: ThermalEvent[] = []
  let famine: IpcArea[] = []

  /** The metric currently tinting the land, and its payload once fetched. */
  let metricKey = DEFAULT_METRIC
  let metric: MetricPayload | null = null
  let metricIndex: MetricIndexEntry[] = []

  const enabled = new Set(CATEGORY_ORDER)
  // Genocide is not in here on purpose. Every other overlay is a feed the
  // reader may reasonably want out of the way — a few hundred conflict records,
  // ninety-eight weather alerts, eleven straits. This is two marks, drawn from
  // a finding by a named UN body, and a toggle that switches it off is a toggle
  // whose only function is to make the map more comfortable. The layer stays.
  // The prayer lines *do* get a toggle, unlike the terminator they are drawn
  // against. The terminator is an unlabelled wash; these are five named lines
  // crossing every continent, which is a larger footprint than any feed here
  // and a claim besides. A reader who does not want them should be able to say
  // so, and the row of layer toggles is where this map already takes that.
  const layersOn = {
    prayers: true,
    gdacs: true,
    thermal: true,
    straits: true,
    markets: true,
    conflict: true,
    famine: true,
  }
  let rangeHours: number = DEFAULT_RANGE_HOURS
  let scrubNow = Date.now()
  let mounted = true
  let ultraLoaded = false
  let layersReady = false
  const abort = new AbortController()

  /**
   * The places the visible stories share, rebuilt on the same frame the beacons
   * are, and the index that joins a slug to one.
   *
   * The index is resolved once per payload because a story's place is a fact
   * about the story; only the counting is per frame. What used to happen here
   * instead was a supercluster KD-tree rebuild every scrub frame.
   */
  let placeIndex: PlaceIndex = { of: new Map(), at: new Map() }
  let places: StoryPlace[] = []
  let placeByKey = new Map<string, StoryPlace>()

  let hoverSlug: string | null = null
  let openSlug: string | null = null
  /** Which overlay marker the hover sheet is currently previewing. */
  let peekId: string | null = null
  /** ISO2 of the country under the pointer, driving the land highlight. */
  /**
   * Which country's `hover` bit is written into the `countries` state map.
   *
   * This replaces a `hoverIso` that tracked where the pointer was, because with
   * the hover bit in feature state the two questions have the same answer
   * everywhere except one place, and that place is why the name changed:
   * `applyMetric` clears this source's whole state map, wiping the hover bit
   * along with every `p`. What the guard needs to know is what is *written*, not
   * what is under the pointer — the same distinction `hoverStateWritten` makes
   * for the stories, and for the same reason. `setFeatureState` and
   * `removeFeatureState` both end in `_update()` whether or not they changed
   * anything, so a write that changes nothing still dirties the source and
   * schedules a frame. That is the 56.8-renders-a-second bug, and it is only
   * ever avoided by comparing against what was last written.
   */
  let countryHoverWritten: string | null = null
  /** Which prayer line the pointer is on, if any. */
  let hoverPrayer: string | null = null
  /**
   * What is actually written into each source's feature-state map.
   *
   * `syncHoverState` and `syncPrayerHover` run on every `idle`, and
   * `Map.removeFeatureState` ends in `_update()` whether or not it removed
   * anything. So an unconditional clear per idle tick dirtied the source,
   * scheduled a render, and fired `idle` again — a 60fps loop on a map nobody
   * was touching, holding ~57% of a core for as long as the tab stayed open,
   * with no animation on screen to account for it. Comparing against what was
   * last written makes the overwhelmingly common case — the pointer has not
   * moved since the last frame — cost nothing at all.
   *
   * These track the *source's* state map, which survives `setData`; the one
   * place that is not true is the scrub path, which clears the map explicitly
   * and sets `hoverStateWritten` back to null with it.
   */
  let hoverStateWritten: string | null = null
  let prayerStateWritten: string | null = null
  let peekCloseTimer: number | null = null
  // The map moves under a stationary pointer during a flight, which would
  // otherwise drag the cursor across other markers and chain more flights.
  let flying = false

  const sheet: Sheet = createSheet()
  let popup: StoryPopup | null = null
  let timeline: Timeline | null = null
  // The span the current rail is drawn against, so a refresh can tell whether
  // the window actually moved and only rebuild the scrubber when it did.
  let windowStart = 0
  let windowEnd = 0
  let refreshing = false

  /**
   * The markets readout.
   *
   * Built eagerly so the scrubber can take it as its `lead` the moment the core
   * payload lands; filled in later, when the exchanges arrive.
   */
  const marketStrip: MarketStrip = createMarketStrip({
    rangeDays: DEFAULT_RANGE_HOURS / 24,
    onSelect: (id) => {
      const ex = markets.find((m) => m.id === id)
      if (!ex) return
      // Unlike a marker click, this one flies. The reader has picked a name out
      // of a ranked list with no map context at all, so landing them on the
      // card without showing them where it is would answer half the question —
      // the same bargain the story rail makes.
      feed.setExpanded(false, true)
      flying = true
      map.flyTo({ center: [ex.lng, ex.lat], zoom: Math.max(map.getZoom(), 3.2), duration: 900 })
      // Both of these carry the rail's window in, so the card opens on the
      // period the row the reader pressed was drawing. An exchange card opened
      // from a mark on the map takes no argument and still draws the whole
      // quarter — there the reader came from the globe, not from the money.
      sheet.showMarket(ex, true, marketStrip.rangeDays())
    },
    onQuote: (entry) => sheet.showIndicator(entry, true, marketStrip.rangeDays()),
  })

  const readState = createReadState()

  /**
   * A story counts as read once its card has been opened.
   *
   * Opening the card is the reader committing to it — it fetches the article
   * and puts the whole thing on screen — which is a far better signal than a
   * hover or a marker click, and the only one on this surface that means
   * anything. It marks on the way in rather than after some dwell time,
   * because a card opened and immediately closed was still seen, and a rail
   * that only greys stories you finished would grey almost nothing.
   *
   * The record never leaves the device; see `_map/read-state.ts`.
   */
  const markRead = (slug: string) => {
    if (readState.mark(slug)) feed.setRead(slug)
  }

  const feed: Feed = createFeed({
    isRead: (slug) => readState.has(slug),
    onRefresh: () => void refreshStories(),
    onSelect: (p) => {
      // On a phone the list is a drawer over the map, so committing to a story
      // has to give the map back — otherwise the camera flies somewhere the
      // reader cannot see and the card opens behind the list.
      //
      // Instantly, and that is not a style choice. `flyTo` reads the map's
      // padding once when the flight begins, and any `setPadding` after that
      // goes through `jumpTo`, which calls `stop()` — so the drawer finishing
      // its slide 200ms into a 1150ms flight *cancelled the flight*, leaving
      // the camera exactly where it started with the story's card open over a
      // world view. Sliding it shut and then flying is two animations racing
      // over one camera; snapping it shut and then flying is one.
      feed.setExpanded(false, true)
      flyToStory(p)
    },
    onHover: (p) => setHoverSlug(p ? p.slug : null),
    // The drawer's height is part of what the camera has to dodge.
    onToggle: () => applyPadding(),
  })
  container.append(feed.element)

  /**
   * Which of the two layouts this viewport gets.
   *
   * There are two, and there used to be three. The instrument rail was gated on
   * *measured surplus width* — `viewportW − railW − viewportH ≥ 18rem`, on the
   * argument that the globe is `min(canvasW, canvasH)` and so width taken from
   * the canvas costs the Earth nothing until the canvas is square. The
   * arithmetic was right and what it bought was a third layout: every desktop
   * that failed the test fell back to a strip of chips across the top of the map
   * with the money readout exiled to the scrubber, so which side the controls
   * stood on depended on the reader's window shape. Removed — the rail is the
   * desktop layout at every desktop width. The surplus argument survives it
   * intact and is now the argument for `--map-aside-w`'s cap rather than for a
   * gate: what the rail takes is what its contents want, and the remainder goes
   * back to the map as margin.
   *
   * So the only question left is the one the stylesheet was already asking — is
   * this a phone? — and 901px is `style.css`'s own phone breakpoint, quoted here
   * rather than re-derived. A rail 18rem wide beside a 336px story rail is not a
   * bargain a 390px screen can make, which is what the `max-width: 900px` block
   * exists to say.
   *
   * **It runs here, before the map is constructed**, and that ordering is the
   * whole reason this block sits between the rail and the camera rather than
   * beside `onResize` with the other measurements. `fitZoom` reads
   * `mapEl.clientWidth`, so the opening zoom — which is also `minZoom` — is
   * derived from whatever the canvas measured at that instant. Setting the class
   * afterwards would open every desktop at a zoom fitted to a canvas a rail too
   * wide, and since it is the floor, the reader could not pull back out of it.
   *
   * A class rather than the media query alone because the whole of this chrome
   * is built by this island — there is no server-rendered HUD for a stylesheet
   * to lay out on its own — and because `placeMarketStrip` has to answer the
   * same question about which parent the readout hangs from.
   */
  const wideQuery = matchMedia(`(min-width: ${NARROW_PX + 1}px)`)
  const syncWide = () => {
    document.body.classList.toggle('map-wide', wideQuery.matches)
  }
  syncWide()

  // --- Map ----------------------------------------------------------------
  /**
   * The zoom at which exactly one Earth spans the canvas.
   *
   * A Web Mercator world is 512px at zoom 0 and doubles each level, so the zoom
   * that fits a viewport is `log2(width / 512)`. The map used to open on a
   * fixed 1.35, which put the world at ~1300px — narrower than most desktop
   * viewports, so MapLibre drew a second copy alongside it and the map opened
   * showing western Europe twice. Deriving the zoom instead means the globe
   * fills the frame at whatever width it is given, and the duplicate has
   * nowhere to appear.
   *
   * Floored at 1.35 on a desktop window, so a small one zooms out no further
   * than the old default — there the fit zoom is above the floor anyway, so it
   * only ever bites on a half-width window.
   *
   * The floor is dropped on a phone, and that is not a nicety. This value is
   * also `minZoom`, and a 390px canvas fits the world at zoom −0.4 — so a
   * floor of 1.35 was not a floor at all but a *ceiling on how far out the
   * reader could go*, three whole zoom levels above the world. The map opened
   * mid-Sahara at a scale where Europe ran off both edges, the "whole world"
   * control returned you to the same place, and there was no gesture anywhere
   * that reached the rest of the planet. A world map you cannot see the world
   * on is not a framing problem.
   *
   * There used to be a 2.4 ceiling here, to stop an ultrawide monitor opening
   * "halfway into a continent" — but 2.4 puts the world at 2702px, so any
   * canvas wider than that got the second copy back, and Australia appeared
   * twice at the right-hand edge. Coverage has to win over framing: a fit zoom
   * is by definition the whole world, and the duplicate is a map that lies
   * about where things are. Anything that wants a gentler opening frame has to
   * come from padding or latitude, not from a zoom the world can't fill.
   */
  /**
   * The opening zoom, measured off the canvas.
   *
   * The arithmetic is `globeFitZoom` in `_map/style.ts`, beside the projection
   * it describes and where `map-geo.test.js` can reach it; this is only the DOM
   * measurement it needs. The shorter side, because a sphere is a disc that has
   * to fit in both axes — see the note there for why the flat version took the
   * longer one instead.
   */
  const fitZoom = (lat: number) => {
    const w = mapEl.clientWidth || window.innerWidth || 1280
    const h = mapEl.clientHeight || window.innerHeight || 800
    return globeFitZoom(Math.min(w, h), lat)
  }

  /**
   * The view the map opens on, and the one the wordmark returns you to.
   *
   * **Makkah** (2026-08-01). It was `[12, 22]` — a point in the Libyan desert,
   * chosen for framing: it put the Atlantic on one edge and India on the other,
   * which is a good hemisphere and stands for nothing. A globe has to be
   * *pointed* at somewhere, and unlike a flat map it cannot decline to choose —
   * the half it faces is the half that exists. So the choice is the site's to
   * make rather than the framing's, and this site already keeps one frame:
   * `MAKKAH_TZ` for the clock, the scrubber and the Hijri date, Umm al-Qura for
   * the prayer lines. The camera now agrees with the clock.
   *
   * It costs almost nothing in coverage — 27.8° east of the old centre, so the
   * hemisphere gains east and south Asia and loses the eastern Pacific, which is
   * where this map has the least to say. The latitude moves 0.6°.
   */
  const HOME_CENTER: [number, number] = [39.826, 21.423]
  const HOME_VIEW = { center: HOME_CENTER, zoom: fitZoom(HOME_CENTER[1]) }

  const map = new MapLibreMap({
    container: mapEl,
    style: buildStyle(basemapV),
    center: HOME_VIEW.center,
    zoom: HOME_VIEW.zoom,
    // The floor is the fit, not a constant, and it is kept in step with the
    // viewport by `onResize`.
    //
    // Note that the *effective* floor sits a hair below this. On the sphere
    // MapLibre clamps to `minZoom + getZoomAdjustment(0, lat)`, which is
    // `minZoom + log2(cos lat)` — it re-applies the latitude term itself, to
    // keep the planet the same size as the reader moves north or south. At the
    // home latitude (21.4°, Makkah) that is −0.105, so the reader can pull out ~10%
    // past a perfect fit and see a slightly smaller globe. That is harmless
    // here, because on this projection the space around the disc is the design
    // rather than a failure to fill the frame — but it is worth writing down,
    // since a floor that does not equal the number handed to it looks like a
    // bug to anyone who measures it.
    minZoom: HOME_VIEW.zoom,
    maxZoom: 9,
    attributionControl: false,
    // `preserveDrawingBuffer` was set here for a share-image export that was
    // never built. It is not free: the driver reports "GPU stall due to
    // ReadPixels" on every frame, because the buffer has to survive the swap
    // instead of being discarded. Anything that needs pixels later can ask for
    // a frame with `map.once('render', …)` and read the canvas then.
    // Rotation on a situational map is disorientation, not a feature.
    dragRotate: false,
    pitchWithRotate: false,
    // One Earth, and it still has to be said even though the opening view is a
    // sphere now. A sphere cannot repeat — but this map is only a sphere below
    // `GLOBE_ZOOM.plane`, and past that it is ordinary Mercator, where the
    // duplicate is exactly as available and exactly as much of a lie: a
    // situational map that shows the same conflict twice, in two places, is
    // lying about where things are. So this governs the flat half, and
    // `globeFitZoom`'s cap governs the round one.
    renderWorldCopies: false,
  })
  map.touchZoomRotate.disableRotation()

  // Chrome that covers the canvas moves the map's true centre away from the
  // viewport's, and telling MapLibre once means every flyTo, easeTo and cluster
  // expansion lands where the reader can see it.
  //
  // This used to inset by the rail's full width whenever the viewport was wide
  // enough to have one. But the rail is grid column 1 and the canvas is column
  // 2 — they sit side by side and have not overlapped since the layout became a
  // grid, so the map was being pushed half the rail's width to the right to
  // dodge something that was never on top of it. Harmless while the world was
  // narrower than the canvas; the moment it fits exactly, it shows up as a
  // gutter down one side and a continent clipped off the other. Measuring the
  // actual intersection is right in both layouts, and stays right if the rail
  // ever becomes an overlay again.
  //
  // On a phone it *is* an overlay again — a bar across the foot of the canvas
  // rather than a column beside it — so which edge it takes has to be read off
  // the geometry rather than assumed. A rail that spans the full width is
  // eating the bottom; one that spans less is eating the left. Getting this
  // wrong is not cosmetic: a full-width bar measured as a left inset would
  // push the camera most of a screen sideways on every flyTo.
  /**
   * Writes the padding, but only when it would actually change.
   *
   * `Map.setPadding` is `jumpTo` underneath, and `jumpTo` begins by calling
   * `stop()` — so every padding write is also a cancellation of whatever the
   * camera was doing. A redundant write of the value already in place is
   * therefore not free: it is an invisible interruption. And a *needed* write
   * that lands mid-flight is worse, so those are deferred rather than dropped
   * — the flight keeps its aim and the new padding is applied the moment it
   * lands.
   */
  let paddingPending = false
  const writePadding = (next: PaddingOptions) => {
    if (flying) {
      paddingPending = true
      return
    }
    const cur = map.getPadding()
    const same = (['top', 'bottom', 'left', 'right'] as const).every(
      (k) => Math.abs((cur[k] ?? 0) - (next[k] ?? 0)) < 1,
    )
    if (same) return
    map.setPadding(next)
  }

  const applyPadding = () => {
    // The style can finish loading after teardown.
    if (!mounted) return
    paddingPending = false
    const canvas = mapEl.getBoundingClientRect()
    if (canvas.width <= 0 || canvas.height <= 0) return

    const inset = (el: Element | null | undefined) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const w = Math.max(0, Math.min(r.right, canvas.right) - Math.max(r.left, canvas.left))
      const h = Math.max(0, Math.min(r.bottom, canvas.bottom) - Math.max(r.top, canvas.top))
      return w > 0 && h > 0 ? { w, h, top: Math.max(r.top, canvas.top) } : null
    }

    const rail = inset(feed.element)
    if (!rail) {
      writePadding({ top: 0, bottom: 0, right: 0, left: 0 })
      return
    }

    if (rail.w < canvas.width - 1) {
      writePadding({ top: 0, bottom: 0, right: 0, left: rail.w })
      return
    }

    // The scrubber sits between the bar and the map on a phone, so the two are
    // one obscured strip — measured as a union from whichever starts higher,
    // because once the rail is expanded it covers the scrubber and adding the
    // two heights would count the same pixels twice. Only reached on the
    // full-width branch: on the desktop side the rail is a column and the
    // timeline has never contributed padding, and that stays true.
    const scrubber = inset(timeline?.element)
    const top = scrubber && scrubber.w >= canvas.width - 1
      ? Math.min(rail.top, scrubber.top)
      : rail.top
    // A padding that swallows the canvas leaves MapLibre no viewport to centre
    // in; two thirds is the most the chrome may claim of the camera.
    const bottom = Math.min(canvas.bottom - top, canvas.height * 0.66)
    // The phone's header is fixed *over* the canvas, and it was never in here:
    // top padding was a flat 0, so `flyTo` centred a story in a box whose top
    // edge sits under the wordmark, and a story card — which MapLibre draws
    // upward from a bottom-anchored marker — landed across it. Invisible until
    // a shared link made that card the first thing a phone reader sees. It is
    // measured rather than read off `--map-head-h`, for the reason the rail is:
    // what matters is the header's actual intersection with the canvas.
    const header = inset(document.querySelector('body.map-page > header'))
    const headTop = header && header.w >= canvas.width - 1 ? header.h : 0
    writePadding({ top: Math.min(headTop, canvas.height * 0.2), bottom, right: 0, left: 0 })
  }

  // --- Data shaping -------------------------------------------------------
  const visiblePoints = (): MapPoint[] => {
    const from = scrubNow - rangeHours * 3_600_000
    // Tell the rail which slice of itself is on the map.
    timeline?.setWindow(from)
    return points.filter((p) => p.t <= scrubNow && p.t >= from && enabled.has(p.cat))
  }

  const storyCollection = (visible: MapPoint[]) => ({
    type: 'FeatureCollection' as const,
    features: visible.map((p) => ({
      type: 'Feature' as const,
      // Decay is baked into the feature so MapLibre can drive opacity from a
      // plain property — style expressions have no exponential.
      // Only what a style expression reads or a hit-test needs. `title`, `loc`,
      // `c` and `n` used to ride along here too, but nothing ever read them
      // back — a marker resolves through `pointBySlug` — and this is the one
      // layer re-serialised every time the scrubber moves, across a window
      // that runs to ~720 points.
      properties: {
        slug: p.slug,
        cat: p.cat,
        t: p.t,
        // Floor raised from 0.35 on 2026-07-30. Recency has to be *ordered and
        // perceptible*, not asymptotic — and the blurred halo that used to
        // rescue the faint end is gone. A week-old beacon now measures 1.89:1
        // against the ocean where it measured 1.57:1; today's is 5.20:1, so a
        // 2.2x range is still an unmistakable step.
        a: Math.round((0.45 + 0.55 * decayAt(p.t, scrubNow)) * 100) / 100,
        // Percentile rank from the build, or the neutral "unknown" size.
        w: p.w ?? UNKNOWN_COVERAGE_W,
        contested: (p.d ?? 0) >= CONTESTED_D ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  })

  /**
   * The places, as the field's source and the numeral's.
   *
   * One collection feeds both, so the wash and the count cannot disagree about
   * where the news is or how much of it there is. Raising the field from the
   * stories instead would also have let our own jitter speak: Washington carries
   * 17 coordinates inside 2.2 km, which is 17 kernels smearing one peak.
   */
  const placeCollection = (visible: StoryPlace[]) => ({
    type: 'FeatureCollection' as const,
    features: visible.map((pl) => ({
      type: 'Feature' as const,
      properties: {
        key: pl.key,
        loc: pl.loc,
        n: pl.count,
        amax: pl.amax,
      },
      geometry: { type: 'Point' as const, coordinates: [pl.lng, pl.lat] },
    })),
  })

  // GDACS alerts, chokepoints and conflict events are dated, so the scrubber
  // has to move them too — leaving them pinned to the present while the stories
  // rewound made the map quietly lie, showing a disaster over a week that
  // predates it.
  //
  // Unlike stories, though, none of their geometry or styling depends on where
  // the scrub head is: only *which* of them are showing. So each collection is
  // built once, with the event time carried as a property, and the scrubber
  // moves them with `setFilter`. That is a style-side predicate — no GeoJSON
  // rebuild, no re-parse on the worker, no re-index — where `setData` per frame
  // meant re-serialising several hundred features for every pixel of drag.
  /**
   * How big a disaster is, on a scale the map can draw.
   *
   * The alert level was doing this job alone, and it cannot: 98 of the 100
   * alerts in a typical feed are Green, so every mark came out the same size
   * and the layer said only "something happened here". Meanwhile `severityValue`
   * is populated on every single alert and was never read — an M6.2 and an M4.5
   * drew identically, as did a 51,317-hectare fire and a 5,147-hectare one.
   *
   * The values are not comparable across event types (magnitude, km/h, hectares
   * — and floods carry no scalar at all), so each type is ranked against its own
   * kind. That is the same percentile trick `build.js` already applies to story
   * coverage, and for the same reason: it spends the whole 0..1 range on real
   * distinctions instead of letting one unit's arithmetic swamp another's.
   *
   * Alert level keeps the colour. Severity and human-impact tier are different
   * facts and each deserves its own channel.
   */
  const severityRanker = (alerts: GdacsAlert[]) => {
    const byType = new Map<string, number[]>()
    for (const a of alerts) {
      const v = a.severityValue
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
      const bucket = byType.get(a.eventtype) ?? []
      bucket.push(v)
      byType.set(a.eventtype, bucket)
    }
    for (const bucket of byType.values()) bucket.sort((x, y) => x - y)

    return (a: GdacsAlert): number => {
      const v = a.severityValue
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return UNKNOWN_SEVERITY_MAG
      const known = byType.get(a.eventtype)
      // One event of a type is its own whole distribution; a percentile over a
      // single sample is meaningless, so it reads as unknown rather than as
      // "the largest earthquake" on the strength of being the only one.
      if (!known || known.length < 3) return UNKNOWN_SEVERITY_MAG
      let lo = 0
      let hi = known.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (known[mid] < v) lo = mid + 1
        else hi = mid
      }
      return Math.round((lo / (known.length - 1)) * 100) / 100
    }
  }

  const gdacsCollection = () => {
    const rank = severityRanker(gdacs)
    return {
      type: 'FeatureCollection' as const,
      features: gdacs.map((a) => {
        const t = Date.parse(a.fromDate)
        return {
          type: 'Feature' as const,
          properties: {
            id: a.eventid,
            level: a.alertlevel || 'Green',
            name: a.name,
            kind: a.eventtype || '',
            mag: rank(a),
            // Undated alerts sort to the beginning of time so they never vanish.
            t: Number.isFinite(t) ? t : 0,
          },
          geometry: { type: 'Point' as const, coordinates: [a.lng, a.lat] },
        }
      }),
    }
  }

  /**
   * Thermal anomalies.
   *
   * `mag` is the size channel, and it is a log of total radiative power rather
   * than the figure itself: FRP across a real snapshot runs from 5 MW to 17,000,
   * so a linear radius would draw one Siberian fire the size of a continent and
   * everything else at the floor. The ceiling is 5,000 MW — past that a mark is
   * already the largest thing on the map and further growth says nothing.
   *
   * Confidence rides on opacity, which is the honest channel for it: VIIRS marks
   * a low-confidence detection where sun glint or a weak temperature anomaly
   * could account for the reading, and a mark the instrument is unsure about
   * should not arrive at the same weight as a saturated night pass.
   */
  const thermalCollection = () => ({
    type: 'FeatureCollection' as const,
    features: thermal.map((e) => ({
      type: 'Feature' as const,
      properties: {
        id: e.id,
        mag: Math.min(1, Math.log1p(e.frp) / Math.log(5000)),
        conf: e.confidence,
        t: e.t,
      },
      geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] },
    })),
  })

  /**
   * IPC-classified areas.
   *
   * No `t`, because there is nothing here for the scrubber to filter: a
   * classification is a condition. What the mark carries instead is `age` — how
   * old the analysis behind it is, normalised against the twelve-month bound the
   * fetcher gates on — which rides on opacity. That is the same channel the
   * thermal layer gives the instrument's confidence and for the same reason: a
   * statement the publisher made eleven months ago must not arrive at the weight
   * of one made last month.
   *
   * The phase-to-glyph mapping is stated in the layer rather than baked into a
   * property here, so `map-island.test.js` can walk `icon-image` and see which
   * glyphs the layer actually draws. A `['get', 'glyph']` string is invisible to
   * that walk — which is the check that caught `glyphs.ts` registering four
   * silhouettes that no layer referenced — so a data-driven image would have
   * bought one template literal at the price of the test that guards the whole
   * alphabet.
   */
  const famineCollection = () => ({
    type: 'FeatureCollection' as const,
    features: famine.map((a) => ({
      type: 'Feature' as const,
      properties: {
        id: a.id,
        phase: Math.max(3, Math.min(5, Math.round(a.phase))),
        age: Math.max(0, Math.min(1, a.ageMonths / FAMINE_AGE_MONTHS)),
      },
      geometry: { type: 'Point' as const, coordinates: [a.lng, a.lat] },
    })),
  })

  /**
   * Conflict events, sized by fatalities.
   *
   * Recency is measured against the newest event in the *dataset*, not the wall
   * clock: UCDP publishes months in arrears, so decaying against now would draw
   * the entire layer at the opacity floor and make a live feed look empty.
   */
  const conflictCollection = () => ({
    type: 'FeatureCollection' as const,
    features: conflicts.map((e) => {
      const t = Date.parse(e.eventDate)
      const ageDays = Math.max(0, (conflictNewest - t) / 86_400_000)
      return {
        type: 'Feature' as const,
        properties: {
          id: e.id,
          fatalities: e.fatalities || 0,
          // Fatality counts are long-tailed; a log keeps a 400-death event
          // from swallowing the map without hiding a 4-death one.
          mag: Math.min(1, Math.log1p(e.fatalities || 0) / Math.log(200)),
          a: Math.round(Math.max(0.25, Math.exp(-ageDays / 45)) * 100) / 100,
          t: Number.isFinite(t) ? t : 0,
        },
        geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] },
      }
    }),
  })

  // Chokepoints have no event time — they are a statement about right now — so
  // the scrubber leaves them alone. What they do carry is a signed traffic
  // delta against a 90-day baseline, which the map had been throwing away by
  // flattening to a single "disrupted" bit at 15%. Keeping the magnitude lets
  // a strait that is 60% down read as more disrupted than one that is 20% down,
  // and the sign distinguishes a blockage from a surge.
  const chokeCollection = () => ({
    type: 'FeatureCollection' as const,
    features: chokepoints.map((c) => {
      const delta = c.delta7vs90?.[c.primaryField] ?? 0
      return {
        type: 'Feature' as const,
        properties: {
          id: c.id,
          name: c.name,
          delta,
          mag: Math.min(1, Math.abs(delta) / 0.6),
          disrupted: Math.abs(delta) > 0.15 ? 1 : 0,
          direction: delta < 0 ? -1 : 1,
        },
        geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
      }
    }),
  })

  // Exchanges carry no event time either — a close is a statement about the
  // last session, not something the scrubber can wind back — so like the
  // straits they sit out the time filter.
  //
  // The collection itself lives in `_map/markets.ts`, next to the predicates the
  // paint and the strip read, because keeping it here is what let "has it moved"
  // and "which way" be answered twice and differently. Trading state is computed
  // when the collection is built rather than baked into the payload: a page
  // cached for fifteen minutes would otherwise keep insisting Tokyo was open
  // long after it shut.

  const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined

  /** Layer toggles are visibility, not data — no rebuild to turn one off. */
  const applyLayerVisibility = () => {
    if (!layersReady) return
    const set = (id: string, on: boolean) =>
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    set('gdacs-marks', layersOn.gdacs)
    set('thermal-marks', layersOn.thermal)
    set('chokepoint-marks', layersOn.straits)
    set('market-marks', layersOn.markets)
    set('conflict-marks', layersOn.conflict)
    set('famine-marks', layersOn.famine)
    // Both halves, or the labels float over a map with no lines under them.
    // Hiding the line layer also takes it out of `queryRenderedFeatures`, which
    // is what stops the hover probe finding a line the reader turned off.
    set('prayer-lines', layersOn.prayers)
    set('prayer-labels', layersOn.prayers)
    // The money block is deliberately NOT switched here, and it used to be.
    //
    // While the strip was chrome over the canvas, "the strip is the layer's
    // readout, so it goes with the layer" was right: a ranked list of exchanges
    // floating over a map that no longer draws any is a caption for a picture
    // that is not there. In the rail it is not a caption. It is a block of
    // readings — currencies, metals, crypto and three world series, none of
    // which the `markets` layer has ever drawn — and taking all of it away
    // because the reader turned off thirty marks on the globe answers a
    // question they did not ask. `setVisible` still exists and is still called;
    // what it now reports is whether the *data* arrived (`loadLayers`), which
    // is the one thing that should be able to empty this box.
  }

  /** Moves the dated overlays with the scrub head, style-side. */
  const applyTimeFilters = () => {
    if (!layersReady) return
    map.setFilter('gdacs-marks', ['<=', ['get', 't'], scrubNow])
    map.setFilter('conflict-marks', ['<=', ['get', 't'], scrubNow])
    // A satellite pass happened at a moment, so the scrubber moves these too.
    // Rewinding to Tuesday and being shown Thursday's fire would be the same
    // quiet lie the dated overlays were filtered to stop telling.
    map.setFilter('thermal-marks', ['<=', ['get', 't'], scrubNow])
  }

  const applyRefresh = () => {
    // A late style-load or data fetch can land after teardown; rebuilding the
    // rail then throws against a document that is already gone.
    if (!mounted) return
    const visible = visiblePoints()
    feed.setItems(visible, scrubNow)
    // The contested ring is rare — a few percent of the corpus — so its key
    // entry only stands when there is one on screen to decode. A legend for a
    // mark that is not showing is the clutter the rest of this file avoids.
    const contested = keyItems.get('contested')
    if (contested) contested.hidden = !visible.some((p) => (p.d ?? 0) >= CONTESTED_D)
    if (!layersReady) return
    // Counted here rather than derived in a paint expression, because the field
    // and the numeral both read it and the click path has to resolve a beacon to
    // the place holding it. One O(n) walk; the joins were done at load.
    places = countPlaces(placeIndex, visible, scrubNow)
    placeByKey = new Map(places.map((pl) => [pl.key, pl]))
    // Scrubbed past the story the pointer is resting on: its rail row has just
    // gone with it, so the highlight has nothing left to point at.
    if (hoverSlug && !visible.some((p) => p.slug === hoverSlug)) {
      hoverSlug = null
      feed.highlight(null)
    }
    // Nothing may be left in the source's feature-state map across a `setData`
    // — see `syncHoverState`. Restored by the `idle` handler once the new
    // tiles are in.
    map.removeFeatureState({ source: 'stories' })
    hoverStateWritten = null
    // Stories and their places are the layers whose *features* change with the
    // scrub head: decay alpha is baked per feature, and a place's count has to
    // reflect the filtered set. Everything else moves by filter above.
    src('stories')?.setData(storyCollection(visible))
    src('story-places')?.setData(placeCollection(places))
    applyTimeFilters()
  }

  /**
   * Genocide situations.
   *
   * The only overlay with no time on it. The scrubber moves the others because
   * a disaster, a strait's traffic and a conflict record all happened on a day
   * — rewinding to the 18th should not show you the 24th's earthquake. A
   * determination that a genocide is being committed is not an event on a day;
   * it is a condition that holds across every frame the scrubber can reach, and
   * hiding it while the reader looks at last week would be the map claiming it
   * had stopped.
   */
  const genocideCollection = () => ({
    type: 'FeatureCollection' as const,
    features: genocide.map((g) => ({
      type: 'Feature' as const,
      properties: { id: g.id, name: g.name },
      geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] },
    })),
  })

  /** Rebuilds the overlay sources. Called when their data arrives, not per frame. */
  const setOverlayData = () => {
    if (!layersReady) return
    src('gdacs')?.setData(gdacsCollection())
    src('thermal')?.setData(thermalCollection())
    src('chokepoints')?.setData(chokeCollection())
    src('markets')?.setData(marketCollection(markets))
    src('conflict')?.setData(conflictCollection())
    src('famine')?.setData(famineCollection())
    src('genocide')?.setData(genocideCollection())
    // Separator and label together — revealing the mark's name while leaving
    // its divider hidden would put the label inside the toggle group, which is
    // the grouping this was moved out of `.map-key` to fix.
    const showGenocide = genocide.length > 0
    genocideKey.hidden = !showGenocide
    genocideKeySep.hidden = !showGenocide
    applyTimeFilters()
    applyLayerVisibility()
  }

  /**
   * Coalesces refreshes onto the next frame.
   *
   * Dragging the scrubber fires `input` far faster than the work it triggers
   * can finish, and that work is not small: rebuilding four feature
   * collections, handing MapLibre a new story set to re-cluster, and re-laying
   * the rail. Running it per event meant a drag spent most of its time on
   * superseded intermediate states — measured at 14 ms of synchronous work per
   * event on a 16 ms budget, with long tasks past 400 ms. Only the last value
   * before a frame can be seen, so only the last one is drawn.
   */
  let refreshFrame = 0
  const refresh = () => {
    if (!mounted || refreshFrame) return
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0
      applyRefresh()
    })
  }

  // --- Layers -------------------------------------------------------------
  const addDataLayers = () => {
    map.addSource('stories', {
      type: 'geojson',
      data: empty,
      // `promoteId` lifts the slug into the feature id, which is what
      // `setFeatureState` addresses. Without it, hover has to be expressed by
      // rewriting a paint property — a full style re-evaluation per pointer
      // move — instead of flipping one bit on one feature.
      promoteId: 'slug',
    })
    // Named `story-places`, not `places` — the base style already owns that name
    // for the basemap's cities, and overwriting it would replace the world's
    // place labels with our own datelines.
    map.addSource('story-places', { type: 'geojson', data: empty })
    map.addSource('gdacs', { type: 'geojson', data: empty })
    map.addSource('thermal', { type: 'geojson', data: empty })
    map.addSource('chokepoints', { type: 'geojson', data: empty })
    map.addSource('markets', { type: 'geojson', data: empty })
    map.addSource('conflict', { type: 'geojson', data: empty })
    map.addSource('famine', { type: 'geojson', data: empty })
    map.addSource('genocide', { type: 'geojson', data: empty })
    map.addSource('night', { type: 'geojson', data: empty })
    map.addSource('day', { type: 'geojson', data: empty })
    // The same curve the two hemispheres are cut from, kept open — see
    // `terminatorBand`. A separate source rather than a filter on `night`,
    // because one is a polygon and the other is the line around it.
    map.addSource('terminator', { type: 'geojson', data: empty })
    // Built here rather than fetched: 761 points of arithmetic, so a file would
    // be a request and an entry in `BASEMAP_V` bought for something the client
    // can produce before the first frame. It never changes, so unlike `night`
    // and `day` it is filled at declaration and no tick ever rewrites it.
    map.addSource('graticule', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: graticuleLines() },
    })
    // `promoteId` so hover can address a whole prayer by name. The geometry is
    // a MultiLineString cut at the antimeridian and at the poles, so a segment
    // is not a thing a reader would ever mean to point at.
    map.addSource('prayer', { type: 'geojson', data: empty, promoteId: 'id' })

    // Countries the current metric has no figure for, hatched.
    //
    // The tone underneath already puts them below the ramp's floor, and on a
    // scale where lighter means more that reads as "least" — which for the ~30
    // countries missing from `country-augmented` (Saudi Arabia, the US, the UK,
    // South Africa, South Korea…) is a confident false statement rather than a
    // gap. `literacyPct` covers half the world, so there it was making that
    // statement about 84 countries at once.
    //
    // Driven by `fill-opacity` on feature-state rather than by a layer filter,
    // because a filter cannot read feature state — and feature state is the
    // only place the metric lives. Absent state means no figure.
    // Guarded, and only this. The hatch is a decoration on top of a tone that
    // already carries the value; every layer added *after* it is the actual
    // data. Letting a failed `addImage` throw here would take the stories, the
    // disasters and the conflict marks down with it — a whole map lost to a
    // texture. If the image cannot be registered, the layer is skipped and the
    // no-data tone stands on its own, which is where this started.
    // The mark alphabet. Unguarded, deliberately, and note the contrast with
    // the hatch below: the hatch is a decoration on top of a tone that already
    // carries its value, so it can fail quietly. These *are* the marks. A
    // swallowed failure here would leave a layer drawing nothing at all, with
    // no exception and no failed request — the exact silent-failure class this
    // file's tests exist to catch.
    for (const [id, image] of glyphImages()) {
      if (!map.hasImage(id)) map.addImage(id, image, { sdf: true, pixelRatio: 2 })
    }

    try {
      map.addImage('nodata-hatch', nodataHatch())
      map.addLayer(
        {
          id: 'land-nodata',
          type: 'fill',
          source: 'countries',
          paint: {
            'fill-pattern': 'nodata-hatch',
            'fill-opacity': [
              'case',
              ['==', ['coalesce', ['feature-state', 'p'], -1], -1],
              1,
              0,
            ],
          },
        },
        'borders',
      )
    } catch (err) {
      console.warn('[map] no-data hatch unavailable', err)
    }

    // The country under the pointer, lit just enough to say "this is a thing
    // you can click". Still driven by a filter rather than feature-state: the
    // `countries` source now promotes `iso2` into the feature id, but that
    // state channel is spoken for by the metric tint, and one `setFilter` per
    // hover change costs the same as one state flip.
    //
    // A *lift* rather than a fill. This used to paint the hovered country a
    // fixed `landHi`, which was fine when every country was the same tone and
    // destroys the encoding now that the tone carries the metric — hovering
    // Norway and hovering Eritrea would have produced the same colour, i.e.
    // pointing at a country erased what the map was telling you about it. A
    // translucent white reads as "raised" over whatever value is underneath.
    map.addLayer(
      {
        id: 'country-hover',
        type: 'fill',
        source: 'countries',
        // Feature state, not a filter, and this layer was the last thing on the
        // map still doing it the expensive way.
        //
        // It used to carry `filter: ['==', ['get','iso2'], '']` and have that
        // filter *rewritten on every pointer move*. A filter change ends in
        // `Style._updateLayer`, which marks the whole source `'reload'` — so
        // pointing at Chad re-bucketed `countries`, which is 1.6 MB and 99k
        // points, and then did it again for Sudan. This file already forbids
        // exactly that one layer up, in the note on `stories`: hover is
        // `promoteId` + `setFeatureState`, "not a `setPaintProperty` rewrite per
        // pointer move". The rule was written for the beacons and never applied
        // here.
        //
        // The source already carries `promoteId: 'iso2'` for the ground metric,
        // so the id this addresses is the one already in use and nothing new had
        // to be plumbed. `setFeatureState` ends in `TileManager.setFeatureState`
        // → `updatePaintArrays`, which rewrites the paint buffers in place with
        // no reload at all.
        //
        // Note this is deliberately *not* a `global-state` expression, which was
        // the obvious modern answer and is the wrong one: `global-state` inside a
        // paint property that also reads `['get', …]` is **data-driven**, and
        // `StyleLayer.setPaintProperty` returns `isDataDriven` as its
        // `requiresRelayout` flag — so it would have reloaded the source exactly
        // like the filter did. Feature state is the only mechanism here that
        // updates a per-feature paint value without one.
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.06, 0],
        },
      },
      'borders',
    )

    // Daylight on the water.
    //
    // Inserted before `land`, so the land layer paints over it and this only
    // ever reaches the ocean — which is the entire point. `night-shade` below
    // cannot do this job: it is black at 0.28 over a `#080a0d` sea, a change of
    // about two values in 255, so the terminator used to stop dead at the
    // coastline and day/night read as a property of continents. There is no
    // room to darken below near-black, so the lit side is lifted instead.
    //
    // Faint on purpose. It has to be enough to see the boundary sweep across an
    // empty ocean and not enough to compete with a beacon sitting on it.
    map.addLayer(
      {
        id: 'day-shade',
        type: 'fill',
        source: 'day',
        paint: { 'fill-color': DAYLIGHT, 'fill-opacity': 0.055 },
      },
      'land',
    )

    // Night sits on the ground and under everything else: it darkens the land,
    // never the data. Over water it is `day-shade` above that carries the
    // terminator.
    //
    // It stays a flat 0.28 and that is deliberate: `twilight` below cuts the
    // ramp *upward* out of this, so deep night is the same value it has always
    // been and every contrast measured against it still holds.
    map.addLayer(
      {
        id: 'night-shade',
        type: 'fill',
        source: 'night',
        paint: { 'fill-color': '#000', 'fill-opacity': 0.28 },
      },
      'borders',
    )

    /**
     * Twilight — the ramp the terminator never had.
     *
     * `night-shade` above is one fill at one opacity with a hard boundary, so
     * until this layer the map's whole lighting model was a **step function**:
     * every point on the night side darkened by exactly the same amount, and
     * the change from day to night happening across zero degrees. That is the
     * flattest lighting a sphere can be given, and it is a large part of why
     * the globe read as a disc with a shape on it. The reason it is a blurred
     * band along the curve rather than the three real twilight caps is in
     * `terminatorBand`, and it comes down to those caps only existing for part
     * of the year.
     *
     * Everything about the sizing is one expression evaluated three times, so
     * the band cannot come apart from its own offset. It **doubles per zoom
     * level** (`['exponential', 2]`) because the twilight zone is a fixed
     * angular width on the planet and screen pixels are not: anything else
     * would draw a band that means ~20° at the opening view and something else
     * at every other. At the zoom the map opens on this is about 60px of width
     * against 5.78 px/degree, so the visible ramp — width plus blur — spans
     * roughly the twenty degrees of real twilight.
     *
     * Offset by half its own width so the band sits *inside* the night rather
     * than straddling the boundary; `side` comes from the feature and flips
     * with the season, which is the one number here that fails silently.
     */
    /**
     * The two stops both expressions are built from, so the band and the offset
     * that pushes it off the terminator cannot come apart.
     *
     * They are written twice rather than once and divided, and that is not a
     * style choice: **`['zoom']` is only legal as the direct input of a
     * top-level `step` or `interpolate`**. The obvious form —
     * `['*', ['get', 'side'], ['/', width, 2]]` — buries the interpolate two
     * levels down, and MapLibre rejects the *whole layer* for it. It is the
     * same trap `story-place-count` records for its own `step`, and it cost
     * more here: `addLayer` throws from inside `addDataLayers`, so every layer
     * after this one — the stories, the disasters, the conflict marks — was
     * never added and the map sat on "Drawing the world…" forever.
     */
    const TWILIGHT_PX = { near: 12, far: 96 } as const
    const twilightWidth: ExpressionSpecification = [
      'interpolate',
      ['exponential', 2],
      ['zoom'],
      0, TWILIGHT_PX.near,
      3, TWILIGHT_PX.far,
    ]
    map.addLayer(
      {
        id: 'twilight',
        type: 'line',
        source: 'terminator',
        paint: {
          'line-color': DAYLIGHT,
          'line-width': twilightWidth,
          'line-blur': twilightWidth,
          // Legal because the interpolate is top-level and `['get', 'side']`
          // rides in its *outputs*, which is the zoom-and-property form.
          'line-offset': [
            'interpolate',
            ['exponential', 2],
            ['zoom'],
            0, ['*', ['get', 'side'], TWILIGHT_PX.near / 2],
            3, ['*', ['get', 'side'], TWILIGHT_PX.far / 2],
          ],
          // Lighter than `day-shade`'s 0.055, because this one is spread over a
          // blur rather than laid flat: the peak is what is quoted and most of
          // the band is well under it.
          'line-opacity': 0.07,
        },
      },
      'borders',
    )

    /**
     * The graticule — what makes the sphere read as one.
     *
     * The argument for having it at all is in `_map/graticule.ts`; this is where
     * it sits and how loud it is, and both are decided by what it must not
     * disturb.
     *
     * **Inserted before `land`, so it only ever reaches the ocean** — the trick
     * `day-shade` above uses, for a related reason and a different one.
     *
     * The related one: there is no tone that works flat for a grid line, which
     * is the argument `MAP_COLOURS.water` already makes about rivers. A line
     * quiet enough on `#080a0d` sea is *darker than every stop of the land ramp*
     * and vanishes over the continents; anything that survives the ramp's
     * bright end is loud over water, where the beacons are. Drawn first, the
     * question does not arise: it has exactly one ground and is tuned against
     * it.
     *
     * The different one is better. Sending the grid under the land means it
     * **crosses not one country**, so the map gains a curvature cue and loses no
     * legibility anywhere the data actually is — and the ocean is where the cue
     * was needed, because it is the empty half of the picture and the half the
     * limb runs through. A graticule over the continents would have been a net
     * across every mark this file spends its length rationing.
     *
     * `night-shade` sits above it, and the note that used to be here said the
     * grid was "effectively undimmed at night" because 0.28 black over
     * near-black water moves it about two values in 255. **That is an argument
     * about the ground, and the grid is not the ground.** A multiply takes 28%
     * of whatever it lands on, so it costs the ocean three values and the line
     * eleven — the absolute step is negligible and the *ratio* is not.
     * Measured: 1.43:1 by day and **1.24:1 at night**, on the hemisphere this
     * layer exists for.
     *
     * It stays under `land` anyway, because the alternative is worse. Above
     * `night-shade` means above `land`, and there is no tone that works there —
     * the argument two paragraphs up, unchanged. Hiding it again would mean a
     * second `land` fill drawn over it, which is a duplicate of the ramp
     * expression with nothing checking that the two agree: the failure this
     * repo has recorded eleven times. 1.24:1 is the price of one ground, and it
     * is written down rather than absorbed.
     *
     * **Solid, not dashed.** The dash is `prayer-lines`' silhouette and the one
     * mark nothing else here uses (`MAP_COLOURS.prayer`); a second dashed line
     * family at a similar weight would make five meaningful curves
     * indistinguishable from a coordinate grid at a glance. Solid and far
     * quieter is the pairing that keeps both readable — and those lines are
     * drawn above the land where this one is below it, so they never share a
     * ground either.
     *
     * **`line-width` is constant** for the reason every other line here is: a
     * varying width would imply a varying quantity, and one meridian is not more
     * of anything than another.
     *
     * **It fades out with the projection**, and the numbers are the projection's
     * own: `GLOBE_ZOOM.sphere` (3) to `GLOBE_ZOOM.plane` (5) is where MapLibre
     * interpolates the sphere into Mercator, so the grid is gone at exactly the
     * zoom the thing it explains stops existing. On a flat map at street scale a
     * graticule is a grid over a city, which is noise. Read from the constants
     * rather than typed, so this cannot drift from the interpolation in
     * `_map/style.ts` the way `DENSITY_FADE_OUT` was made to match `.plane`.
     */
    map.addLayer(
      {
        id: 'graticule',
        type: 'line',
        source: 'graticule',
        paint: {
          'line-color': MAP_COLOURS.graticule,
          /**
           * 1.2, and 0.6 was never the width this line was measured at.
           *
           * `MAP_COLOURS.graticule` states its value as "1.44:1 against the
           * ocean", and that is true of the **tone**. It was not true of
           * anything on screen, because MapLibre's line shader extrudes to
           *
           *     ANTIALIASING = 1.0 / u_device_pixel_ratio / 2.0
           *     outset = halfwidth + ANTIALIASING
           *
           * so at `line-width: 0.6` the solid core is 0.3px against 0.5px of
           * falloff on a 1× display: **the line never reaches full alpha
           * anywhere along its length**. Composited that is 1.20:1 by day and
           * 1.11:1 under `night-shade` — two or three values at 8-bit, and
           * measured off the rendered canvas over open water it came back at
           * **1.00–1.06:1**. The one mark added to say the world is a sphere
           * was, on the hemisphere it was added for, not on the screen at all.
           * A 16× exposure boost shows it perfectly; nothing else does.
           *
           * `ANTIALIASING` is 0.25 at DPR 2, and the arithmetic says a 0.3
           * half-width should therefore clear it — so the first version of this
           * note said the bug was a 1× display's alone. **Measured off a
           * `shoot.mjs` capture at DPR 2, it is not**: the line came out
           * `rgb(28,32,40)` at 1.2 and `rgb(18,21,26)` at 0.6, which is 47% of
           * the tone, not 100%. A half-width under one *device* pixel loses
           * coverage to the rasteriser whatever the falloff term says. Both
           * densities were short; the retina one was merely less short.
           *
           * 1.2 leaves margin on both without becoming a second line family
           * beside the frontiers. Measured after: **1.24:1 on the night ocean
           * against 1.10:1 before**, which is the register this was always
           * meant to sit in.
           *
           * The tone is deliberately left alone. It was measured correctly and
           * the defect was never in it — raising it now would spend a second
           * change on the same symptom and leave nothing to attribute.
           */
          'line-width': 1.2,
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            GLOBE_ZOOM.sphere,
            1,
            GLOBE_ZOOM.plane,
            0,
          ],
        },
      },
      'land',
    )

    /**
     * How far the news reaches.
     *
     * `CLAUDE.md` says *"Don't reintroduce a density field without a reason the
     * count doesn't already cover"*, and that prohibition stands. It was written
     * about four encodings of one number stacked on one coordinate — a gold fill
     * ramp, three blurred falloff rings, a kernel-density layer, and a numeral
     * that already stated the count exactly. The field was the fourth telling.
     *
     * The reason it now covers something no count can: a count is only honest
     * standing at a place that exists, and once the aggregating discs are gone
     * **nothing on this map says how far the news reaches.** Extent is a shape.
     * No numeral states a shape. And every one of the four things it used to be
     * stacked beside is gone and stays gone — this is the only density encoding
     * on the map.
     *
     * Where it sits is the other half of the argument. **Above `night-shade`**,
     * because night darkens the land and never the data, and comparing extents
     * across a globe half of which is always dark is the whole job. **Below
     * `borders` and every label**, so a coastline draws straight through a patch:
     * that is what makes the field the only thing here with no edge, which is how
     * a reader tells a wash from a shaded country — a difference of kind, the
     * argument `nodataHatch` already makes. See `MAP_COLOURS.density` for the
     * numbers backing it up.
     *
     * No `filter` and no toggle. This is the story layer's own alphabet, like a
     * beacon's radius; a chip for it would be a chip that turns off part of a
     * mark. The category chips and the scrubber already filter it, because it
     * reads the places counted from the visible slice.
     */
    map.addLayer(
      {
        id: 'story-density',
        type: 'heatmap',
        source: 'story-places',
        paint: {
          'heatmap-weight': densityWeight(),
          // Fixed, never rescaled to the visible set the way the cluster domain
          // was — see `DENSITY_INTENSITY`. It rises with zoom only, because
          // kernels separate as the camera descends and the same news spreads
          // over more pixels.
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, DENSITY_INTENSITY,
            3, DENSITY_INTENSITY * 1.55,
            5, DENSITY_INTENSITY * 2.2,
          ],
          // Screen pixels, so the ramp has to start below zero. `worldFitZoom`
          // is `log2(max(w, h) / 512)` and a portrait phone opens at about
          // −0.39 — off the low end of every zoom ramp on this map, all of which
          // were written looking at a desktop.
          //
          // Read as "where a place fades out", not "how big the patch looks":
          // the kernel is `exp(-4.5 · (d/r)²)`, so at the full radius a place
          // contributes 1.1% of its peak and the visible core is nearer half of
          // it. Generous at world zoom on purpose — it is the overlap between
          // neighbouring capitals that makes a *region* read, and Europe's are
          // 10–20px apart there.
          //
          // Wide, and that was a correction. At 24px on a 512px world the kernel
          // was narrower than the gap between neighbouring capitals, so every
          // busy place got its own tidy disc — which reads as a *glow on the
          // mark*, and a glow on the mark is what was deleted from this map in
          // July for saying the count a second time. The field only earns its
          // place by describing a region, so the bandwidth has to be regional:
          // Washington and New York sit 11px apart at the opening zoom, London
          // and Paris the same, and at these radii they pool rather than each
          // wearing a halo.
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            -1, 26,
            0, 34,
            1.5, 46,
            3, 58,
            5, 72,
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            ...densityRamp(),
          ],
          // Gone by the zoom at which places have separated and every mark is a
          // story again: a field answers "how far", and past z5 the question the
          // reader is asking has become "which one".
          'heatmap-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3.2, 1,
            DENSITY_FADE_OUT, 0,
          ],
        },
      },
      'borders',
    )

    // The five prayers, where each is entering right now.
    //
    // Inserted at `borders` *after* `night-shade`, so the lines sit on the
    // ground above the night wash and below the frontiers — furniture, not
    // data. A border crossing a hairline is invisible; a hairline crossing a
    // beacon is not, and these cross every continent.
    //
    // Dashed because a solid hairline on a map is a coastline. It is the one
    // silhouette nothing else here uses, which is what lets the colour stay
    // neutral (see `MAP_COLOURS.prayer`).
    //
    // `line-width` is constant rather than zoom-interpolated: `line-dasharray`
    // is measured in line widths, so a varying width does not thicken the line,
    // it stretches the dash pattern — and the dash atlas keys on a *floored*
    // width, so it does it in steps. Same reason hover moves opacity and
    // nothing else.
    map.addLayer(
      {
        id: 'prayer-lines',
        type: 'line',
        source: 'prayer',
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': MAP_COLOURS.prayer,
          'line-width': 0.9,
          'line-dasharray': [3, 4],
          // Stays `line-opacity`, unlike `rivers`, and the reason is that this
          // one is data-driven. `line-layer-opacity` is `data-constant` in the
          // spec, so it cannot read `feature-state` and cannot carry the hover
          // step — splitting the two across both properties would express one
          // decision as a product of two numbers, which is how a hover ends up
          // at some tone nobody chose.
          //
          // The accumulation it would fix is also much smaller here than at a
          // river confluence: these are five curves of constant solar hour angle,
          // so they run parallel almost everywhere and only approach each other
          // near the poles, at 0.2 alpha, in a layer a reader has to switch on.
          // Not worth a full-canvas compositing pass per frame.
          'line-opacity': ['case', PRAYER_HOVER, 0.55, 0.2],
        },
      },
      'borders',
    )

    // Above the coastline so the halo has something to protect the glyphs
    // from, and below `country-labels` so country names win the collision:
    // MapLibre places symbol layers top-down, so the *later* layer claims its
    // boxes first and everything under it has to dodge.
    //
    // `text-rotation-alignment: viewport` because Dhuhr is a meridian, and line
    // placement with map-aligned rotation would set it bottom-to-top. The
    // labels follow the line's path and stay horizontal.
    map.addLayer(
      {
        id: 'prayer-labels',
        type: 'symbol',
        source: 'prayer',
        layout: {
          'symbol-placement': 'line',
          // There is a ceiling on this, and going over it does not thin the
          // labels out — it removes them entirely. MapLibre multiplies
          // `symbol-spacing` by `EXTENT / tileSize` (8192 / 512 = 16) to get
          // tile units, then walks each tile-clipped fragment placing an anchor
          // every `spacing`. At 1400 that is 22400 units across a tile 8192
          // wide, so no anchor is ever placed, on any line, at any zoom: five
          // dashed curves and not one word saying what they are. Nothing warns.
          // The real ceiling is 512. Well under it, because these labels lose
          // every collision to country names by design and a single candidate
          // anchor per tile means one lost collision is the whole label: zoomed
          // into Europe, every line was unnamed. More candidates cost nothing
          // when they are refused — collision drops the surplus — and buy the
          // label a place to land where the basemap is quiet.
          'symbol-spacing': 250,
          'text-field': ['get', 'name'],
          'text-transform': 'uppercase',
          'text-font': ['Noto Sans Regular'],
          'text-size': 9,
          'text-letter-spacing': 0.16,
          // Dhuhr is a meridian, and line placement with the default map-aligned
          // rotation would set it bottom-to-top. The anchors still follow the
          // line; the words stay level.
          'text-rotation-alignment': 'viewport',
          // The label yields to every country name on the map, so its own
          // collision box is the one thing it can afford to keep small — at 6
          // it was asking for room it does not need and losing gaps it would
          // have fitted in. Over the Americas that cost the Dhuhr line its
          // name entirely.
          'text-padding': 2,
        },
        paint: {
          // Full strength, deliberately, while the line stays at 0.2: the label
          // is the whole difference between a prayer time and a stray hairline.
          'text-color': MAP_COLOURS.prayer,
          'text-halo-color': MAP_COLOURS.labelHalo,
          'text-halo-width': 1.2,
        },
      },
      'country-labels',
    )

    /**
     * The three feed layers that never adopted the mark alphabet.
     *
     * `glyphs.ts` was written so that shape says *what a mark is* and colour is
     * freed to say which way or how much — because `economy` and `straits` are
     * three points of hue apart and `politics`, `conflict` and `gdacs` are one
     * red family, so hue could not carry identity and had nothing left over for
     * value. The glyphs were authored, rasterised, registered by `addImage` and
     * drawn on the HUD chips. Then only `market-marks` actually used one: these
     * three stayed `circle` layers, so every chip promised a silhouette its own
     * layer did not draw, which is the exact failure the alphabet was built to
     * fix, running the other way. `map-geo.test.js` now fails if a registered
     * glyph has no layer.
     *
     * Radius domains translate as `wantedCssPx / GLYPH_BOX` — a circle of radius
     * r is a mark 2r wide — so every number below is the old one, doubled and
     * divided by 16.
     *
     * All three take both collision flags, and both are load-bearing.
     * `allow-overlap` because a suppressed mark reads as an absence *and*
     * because `queryRenderedFeatures` only ever returns placed symbols — a
     * collided conflict mark would be silently unhoverable and its card could
     * never open. `ignore-placement` because circles never entered the collision
     * index at all and symbols do: without it, several thousand conflict marks
     * would begin deleting the country and city names underneath them.
     */
    map.addLayer({
      id: 'conflict-marks',
      type: 'symbol',
      source: 'conflict',
      layout: {
        'icon-image': 'conflict-mark',
        // 5 → 14px, which is the range `glyphs.ts` says this mark was drawn for
        // and the one `GLYPH_PAD` was sized against ("at 0.31, the conflict
        // floor…"). Not a translation of the circle's 1.6px radius: a 3.2px
        // square has no corners left, and corners are the whole mark.
        'icon-size': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.31, 1, 0.875],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        // The fill and the hairline stroke become the glyph's colour and its
        // halo: a solid square in the darker red, outlined in the lighter one,
        // is the same two-tone mark the circle drew.
        'icon-color': OVERLAY_COLOUR.conflictFill,
        'icon-opacity': ['*', ['get', 'a'], 0.55],
        'icon-halo-color': OVERLAY_COLOUR.conflict,
        'icon-halo-width': 0.8,
      },
    })

    map.addLayer({
      id: 'chokepoint-marks',
      type: 'symbol',
      source: 'chokepoints',
      layout: {
        // The bulge of the two coastlines *is* the data: at rest the channel sits
        // open, a pinch narrows it, a surge widens it. So direction survives
        // greyscale, which gold-against-teal never did.
        'icon-image': [
          'case',
          ['==', ['get', 'disrupted'], 0], 'strait-rest',
          ['<', ['get', 'direction'], 0], 'strait-pinch',
          'strait-surge',
        ],
        // Was radius 3.5 → 8, so 7 → 16px wide.
        'icon-size': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.44, 1, 1.0],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        // Gold for traffic falling away — the blockage case — and a cool tone
        // for a surge, which is a different story told by the same number.
        'icon-color': [
          'case',
          ['==', ['get', 'disrupted'], 0], MAP_COLOURS.neutral,
          ['<', ['get', 'direction'], 0], OVERLAY_COLOUR.straits,
          OVERLAY_COLOUR.straitsSurge,
        ],
        'icon-opacity': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.55, 1, 0.95],
        'icon-halo-color': MAP_COLOURS.labelHalo,
        'icon-halo-width': 1,
      },
    })

    map.addLayer({
      id: 'gdacs-marks',
      type: 'symbol',
      source: 'gdacs',
      layout: {
        'icon-image': 'hazard',
        // Two facts, two channels. Size carries severity — the magnitude, wind
        // speed or burn area ranked against its own event type — and the alert
        // level adds a fixed bump on top, so an Orange event still reads louder
        // than a Green one of the same physical size. Sizing on level alone
        // drew 98 identical dots.
        //
        // Was radius 3.4 → 8.5 plus a 3 / 1.5 level bump; doubled and over 16.
        'icon-size': [
          '+',
          ['interpolate', ['linear'], ['get', 'mag'], 0, 0.425, 1, 1.0625],
          ['match', ['get', 'level'], 'Red', 0.375, 'Orange', 0.1875, 0],
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-color': OVERLAY_COLOUR.gdacs,
        // Green is 98% of the feed, so a flat 0.4 there made the whole layer
        // one weight. Within Green, severity drives presence instead.
        'icon-opacity': [
          'case',
          ['==', ['get', 'level'], 'Red'],
          0.95,
          ['==', ['get', 'level'], 'Orange'],
          0.85,
          ['interpolate', ['linear'], ['get', 'mag'], 0, 0.32, 1, 0.8],
        ],
        'icon-halo-color': MAP_COLOURS.labelHalo,
        'icon-halo-width': 1,
      },
    })

    /**
     * A ring around stories whose sources disagree sharply about them.
     *
     * Drawn under the dot rather than on it so it reads as an aura, and only for
     * the top quartile of divergence — otherwise every story has one and it says
     * nothing. Radii track the beacon's, which grew on 2026-07-30.
     *
     * `story-glow` used to sit under this: a per-story blurred halo, 7–20px at
     * `a * 0.45` in the category hue. It is **deleted**, not crossfaded against
     * the new field. It was already a kernel-density blob — uncalibrated, in four
     * colours, stacking at exactly the 92 coincident places `story-density` is
     * built to describe — and two density fields on one map is the "four glow
     * systems stacked on one coordinate" charge verbatim. Its own comment
     * admitted it was the hand-baked glow sprite carried forward, which is
     * decoration, and decoration does not get to stay.
     */
    map.addLayer({
      id: 'story-contested',
      type: 'circle',
      source: 'stories',
      filter: ['==', ['get', 'contested'], 1],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'w'], 0, 6.8, 1, 12],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 1,
        'circle-stroke-color': MAP_COLOURS.contested,
        'circle-stroke-opacity': ['*', ['get', 'a'], 0.5],
      },
    })

    /**
     * The beacons — one per story, at every zoom.
     *
     * These were 2.6–6px with an alpha floor of 0.35, sized for a map where a
     * beacon was the exception: measured at the world-fit zoom, **14 of 705
     * stories drew as one and the other 691 were inside a disc**. So the mark
     * carrying the subject of this map was tuned as an afterthought, and
     * `glyphs.ts` had already worked out that 3.2px is below the floor at which a
     * mark survives at all.
     *
     * Now 3.4–7.5px. The ceiling is 15px across, just under the 16px `GLYPH_BOX`
     * the overlays share, so a heavily-covered story never out-sizes a Red GDACS
     * alert or a genocide ring — the beacon gains presence without becoming the
     * loudest thing here. A story with no coverage figure lands at 4.55px: 1.34x
     * the floor and still below the known median of 5.41px, so a fixed value
     * below the median goes on saying "unknown" rather than "smallest", with more
     * room to say it in.
     *
     * **The rim is what makes a beacon read on the density wash**, and it is the
     * channel that had to be paid for. A `politics` fill measures 1.07:1 against
     * the field's peak at the alpha floor and 1.37:1 at full strength — nearly
     * the same luminance. Its ocean-coloured rim measures 3.74:1. That is exactly
     * the argument this file already makes for the overlay glyphs' dark halo:
     * contrast against the halo is the real invariant, and it is what stops the
     * ground being a variable. So the rim goes from 0.6px at 0.6 alpha to 1px at
     * 0.85. Fill carries the mark on dark ground; rim carries it on bright.
     */
    map.addLayer({
      id: 'story-points',
      type: 'circle',
      source: 'stories',
      layout: {
        // 445 of 705 stories share a coordinate with another, so at those places
        // 2 to 62 beacons composite. Which one ended up on top was an accident of
        // parse order; it is now the latest story there, which is a rule — and it
        // is what makes hovering a pile preview the same story the numeral beside
        // it stands for. The stack going opaque is honest: coincident stories
        // genuinely are coincident, and the exact fact it cannot state is what
        // the numeral and the place card are for.
        'circle-sort-key': ['get', 't'],
      },
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'w'],
          0, 3.4,
          1, 7.5,
        ],
        'circle-color': catColour('#8a8a8a'),
        'circle-opacity': ['get', 'a'],
        // Hover is a per-feature state flip rather than a style rewrite: the
        // expression is compiled once and only the one feature's state changes.
        // This is also why the beacon has to stay a `circle` — `icon-size`
        // cannot read feature state, which `glyphs.ts` records under `DOT`.
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 1.8,
          1,
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], '#ffffff',
          MAP_COLOURS.ocean,
        ],
        'circle-stroke-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 1,
          0.85,
        ],
      },
    })


    /**
     * How many stories share this place.
     *
     * The count that used to live inside an aggregating disc, moved to a place
     * that exists and set beside the stack rather than on it.
     *
     * The threshold is inside `text-field` and must never become a layer
     * `filter`: a filter would delete the feature, and the feature is what raises
     * the density wash. Same mistake `marketLayout` documents for the exchange
     * tick's own numeral. `step` has to be the outer expression too — MapLibre
     * accepts `['zoom']` only as the direct input of a top-level
     * step/interpolate, and inside out it fails validation and drops the layer
     * silently.
     *
     * Two is deliberately not numbered at world zoom: 42 of the 92 multi-story
     * places hold exactly two, and a "2" beside two visible dots states what the
     * mark already stated. Three at world zoom, two once the camera has earned
     * it. Because `worldFitZoom` is a function of canvas width, a phone opens at
     * about 0.56 and lands on the stricter step by itself.
     *
     * **It may be dropped under collision, and that is the change.** A disc with
     * no numeral was an empty container saying nothing, so the cluster count
     * could never be dropped and was kept out of the collision index entirely —
     * which is what let a market tick's "1.6%" land flush against a "3" and
     * render "31.6%". A stack of dots with no numeral is still a complete mark:
     * the beacon, the wash and the rail all carry the story, and the figure is
     * one click away in the place card. So this one takes its place in the
     * collision index like any other label.
     */
    map.addLayer({
      id: 'story-place-count',
      type: 'symbol',
      source: 'story-places',
      layout: {
        'text-field': [
          'step',
          ['zoom'],
          ['case', ['>=', ['get', 'n'], 4], ['to-string', ['get', 'n']], ''],
          1, ['case', ['>=', ['get', 'n'], 3], ['to-string', ['get', 'n']], ''],
          3, ['case', ['>=', ['get', 'n'], 2], ['to-string', ['get', 'n']], ''],
        ],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 5, 12],
        // Beside the stack, never on it, and free to hop when crowded — eight
        // European capitals sit within a few degrees of each other.
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.9,
        'text-justify': 'auto',
        'text-padding': 5,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        // Busiest place wins the space when two numerals compete.
        'symbol-sort-key': ['-', 0, ['get', 'n']],
      },
      paint: {
        // The tone this map sets place names in, because that is what this is: a
        // fact about a place. Its legibility is the halo's job — 3.80:1 against
        // the density field's own peak — which is the standard every mark here is
        // held to rather than a contrast bar against a ground that moves.
        'text-color': MAP_COLOURS.label,
        'text-halo-color': MAP_COLOURS.labelHalo,
        'text-halo-width': 1.4,
      },
    })

    map.addLayer({
      id: 'market-marks',
      type: 'symbol',
      source: 'markets',
      layout: marketLayout(),
      paint: marketPaint(),
    })

    /**
     * Thermal anomalies.
     *
     * Above the stories, for the reason the exchange marks are: these sit within
     * 75 km of a story by construction, so overlap with a beacon or a cluster is
     * not an occasional accident, it is where every one of them is. A cluster is
     * a count and survives a 10px burst crossing it; a single anomaly, covered,
     * is simply absent.
     *
     * Both collision flags, as `marketLayout` explains at length: `allow-overlap`
     * because `queryRenderedFeatures` only returns *placed* symbols, so a
     * collided mark would be silently unhoverable and its card could never open;
     * `ignore-placement` because circles never entered the collision index and
     * symbols do — without it a fire would start deleting the country and city
     * names around it.
     */
    map.addLayer({
      id: 'thermal-marks',
      type: 'symbol',
      source: 'thermal',
      layout: {
        'icon-image': 'thermal',
        // `wantedCssPx / GLYPH_BOX`: ~7px at the 5 MW floor, ~18px at 5,000.
        'icon-size': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.42, 1, 1.1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // Biggest first, so if anything ever does have to yield it is the
        // smallest fire rather than whichever sorted last.
        'symbol-sort-key': ['-', 0, ['get', 'mag']],
      },
      paint: {
        'icon-color': OVERLAY_COLOUR.thermal,
        // The instrument's own certainty. VIIRS marks a detection low-confidence
        // where sun glint or a weak (<15 K) anomaly could account for the
        // reading, and a mark the satellite is unsure of must not arrive at the
        // same weight as a saturated night pass.
        'icon-opacity': [
          'match',
          ['get', 'conf'],
          'high', 0.95,
          'nominal', 0.8,
          0.5,
        ],
        'icon-halo-color': MAP_COLOURS.labelHalo,
        'icon-halo-width': 1.2,
      },
    })

    /**
     * Acute food insecurity.
     *
     * **No filter, by design.** A classification is a condition, not an event, so
     * this joins `genocide` in being absent from `applyTimeFilters` — scrubbing
     * back to Tuesday must not hide the fact that a district is in Emergency,
     * because that was as true on Tuesday as it is now. `map-island.test.js`
     * fails if a time filter appears on it.
     *
     * Drawn above the stories and the markets for the reason both of those are:
     * these areas are in exactly the places that generate the most coverage, and
     * the damage from an overlap is asymmetric — a story pile survives a 12px
     * glyph crossing it, and a single famine mark, covered, is simply absent.
     * Below `genocide`, which is the one thing on this map that covers everything.
     *
     * Larger than the other overlay glyphs, at 10–14px against their 7. The
     * silhouette is a three-block level and each block has to survive on its own
     * — see `glyphs.ts` — and the layer can afford the room, being 105 marks
     * where `conflict-marks` is thousands.
     */
    map.addLayer({
      id: 'famine-marks',
      type: 'symbol',
      source: 'famine',
      layout: {
        // The alphabet, stated. Phase 4 is the fallback rather than a lower one:
        // an area that reached this layer at all cleared the publication bar, so
        // an unreadable phase must not draw as the mildest mark on it.
        'icon-image': [
          'match',
          ['get', 'phase'],
          3, 'famine-3',
          4, 'famine-4',
          5, 'famine-5',
          'famine-4',
        ],
        // `wantedCssPx / GLYPH_BOX`, on two inputs.
        //
        // Phase is the one that matters and zoom is the one that was missing.
        // Sudan alone is 56 areas and Somalia 24, so at the opening zoom the full
        // 10–14px columns pile into a single violet mass over the Horn — the mark
        // still reads as *this layer*, which is the conflict layer's bargain and
        // fine, but the level meter inside each glyph is unreadable in the pile,
        // and the level is the whole reason the silhouette is a column. Smaller at
        // world zoom, so the pile is a texture rather than a merge; full size by
        // z5, where the camera has earned the individual marks. Zoom must be the
        // outer `interpolate` — MapLibre only accepts it at the top level.
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, ['interpolate', ['linear'], ['get', 'phase'], 3, 0.40, 5, 0.52],
          5, ['interpolate', ['linear'], ['get', 'phase'], 3, 0.63, 5, 0.88],
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // Gravest on top. Where two areas' marks overlap at world zoom — which in
        // Darfur they do — the one that yields must be the less severe.
        'symbol-sort-key': ['-', 0, ['get', 'phase']],
      },
      paint: {
        'icon-color': OVERLAY_COLOUR.famine,
        // How old the analysis is. A determination the IPC made eleven months ago
        // is still the current classification of that place — which is why it is
        // drawn at all — and it is not the same claim as one made last month. The
        // floor is high on purpose: this layer's quietest mark still has to be a
        // mark, unlike a fortnight-old story beacon which may fade to a hint.
        'icon-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 1, 1, 0.55],
        'icon-halo-color': MAP_COLOURS.labelHalo,
        'icon-halo-width': 1.4,
      },
    })

    /**
     * Genocide.
     *
     * Added last, so it draws over every other layer — a mark that a cluster
     * of the day's stories can cover is a mark that disappears exactly where
     * the news is thickest, which is where these are.
     *
     * Three parts, because one circle among a map of circles would not carry
     * it. A dark disc large enough to be found at the opening zoom; a heavy
     * bone-white ring around it, the only unmuted tone on the map; and the
     * name in the same white beneath, always drawn. The name is the part that
     * does the work — every other overlay expects the reader to hover to learn
     * what a shape means, and this one has to say what it is before anyone
     * touches it, on a phone where hovering does not exist at all.
     *
     * `-allow-overlap` throughout for the same reason the cluster counts have
     * it: a mark suppressed for collision reads as an absence, and the absence
     * this would read as is unacceptable.
     */
    map.addLayer({
      id: 'genocide-marks',
      type: 'circle',
      source: 'genocide',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 8.5, 3, 13, 6, 19],
        'circle-color': OVERLAY_COLOUR.genocideCore,
        'circle-opacity': 0.82,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 0, 2.4, 3, 3, 6, 3.8],
        'circle-stroke-color': OVERLAY_COLOUR.genocide,
        'circle-stroke-opacity': 1,
      },
    })

    // The core. A ring alone is the disasters layer's grammar at a heavier
    // weight; a ring with a filled centre is a different mark, and reads as
    // one at the zoom where the ring is only nine pixels across.
    map.addLayer({
      id: 'genocide-core',
      type: 'circle',
      source: 'genocide',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2.6, 3, 3.8, 6, 5.2],
        'circle-color': OVERLAY_COLOUR.genocide,
        'circle-opacity': 1,
      },
    })

    map.addLayer({
      id: 'genocide-labels',
      type: 'symbol',
      source: 'genocide',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 0, 11.5, 4, 14],
        'text-letter-spacing': 0.1,
        'text-transform': 'uppercase',
        'text-anchor': 'top',
        'text-offset': [0, 1.05],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': OVERLAY_COLOUR.genocide,
        'text-halo-color': 'rgba(6,8,12,0.9)',
        'text-halo-width': 1.4,
      },
    })

    layersReady = true
  }

  // --- Terminator and prayer lines -----------------------------------------
  /**
   * Everything on this map that is a function of where the sun is.
   *
   * All of it reads the wall clock rather than `scrubNow`, as the terminator
   * always has: the lines are drawn against the shade, and a Tuesday Maghrib
   * over today's night would be two clocks in one picture. What the scrubber
   * moves is the news.
   */
  const drawSolar = () => {
    if (!mounted || !layersReady) return
    const now = new Date()
    const night = nightPolygon(now)
    src('night')?.setData(
      night ? { type: 'FeatureCollection', features: [night] } : empty,
    )
    // The same boundary from the other side, for the water. See `dayPolygon`.
    const day = dayPolygon(now)
    src('day')?.setData(day ? { type: 'FeatureCollection', features: [day] } : empty)
    // And the boundary itself, for the twilight ramp drawn along it. All three
    // come back null together at the equinox, so the shade, the lift and the
    // band appear and disappear as one picture rather than in pieces.
    const band = terminatorBand(now)
    src('terminator')?.setData(band ? { type: 'FeatureCollection', features: [band] } : empty)
    // Note these keep drawing at the equinox, when `terminatorLat` degenerates
    // and the two polygons above come back null: the closed form behind them
    // has no such singularity. Across that instant — a window about twelve
    // seconds wide, twice a year — the Maghrib line is the only terminator on
    // the map, which is the more correct of the two.
    src('prayer')?.setData({ type: 'FeatureCollection', features: prayerLines(now) })
    // Forced, unlike the idle path: the line set changes shape across the year
    // — a prayer with no time at that latitude contributes no feature at all —
    // so the state map has to be rewritten rather than replayed onto a feature
    // order that may no longer match it.
    syncPrayerHover(true)
    // MapLibre's own atmosphere, aimed at the same sun as everything above it.
    //
    // Until this line the globe's crescent came from an undeclared `light`,
    // which meant `anchor: 'viewport'` and a `u_sun_pos` that never moved — a
    // lit limb pinned to the upper-left of the screen at every hour of every
    // day, over a terminator drawn from the real sun and beside `starfield`'s
    // own crescent, which was right the whole time. The derivation, and the
    // reason the antisolar point is the thing handed over, are in
    // `sunLightPosition`.
    //
    // It belongs on this tick and not on `move`: `anchor: 'map'` means the
    // position is in the world frame and MapLibre re-rotates it into view space
    // itself, every frame, so panning cannot stale it. What staleness there is
    // is the sun's own 0.5° per tick, the same figure the sky and the shade
    // above are already drawn at.
    map.setLight({ anchor: 'map', position: sunLightPosition(now) })
    // The sky is on this tick for exactly the reason the terminator is: it is a
    // function of where the sun is, and 120 seconds is 0.5° of sky rotation,
    // which is under a pixel where the sky is drawn most precisely. It is *not*
    // on `scrubNow` either — a Tuesday moon over tonight's earth would be the
    // same two clocks in one picture.
    sky.draw(now)
  }

  // --- Interaction --------------------------------------------------------
  const pointFor = (f: MapGeoJSONFeature): MapPoint | null =>
    pointBySlug.get(String(f.properties?.slug)) ?? null

  /**
   * Which prayer line is within grabbing distance of a screen point.
   *
   * A box rather than a point: the line is 0.9px wide and dashed, so a point
   * query finds it roughly never — and `queryRenderedFeatures` reads the hit
   * geometry from `line-width`, not from what you can see, so widening the
   * paint would be the only alternative. A hidden layer is not queried at all,
   * which is what makes the toggle switch this off too.
   */
  const prayerAt = (point: { x: number; y: number }): string | null => {
    if (!layersReady) return null
    const g = PRAYER_GRAB_PX
    const hit = map.queryRenderedFeatures(
      [
        [point.x - g, point.y - g],
        [point.x + g, point.y + g],
      ],
      { layers: ['prayer-lines'] },
    )
    const id = hit[0]?.properties?.id
    return id == null ? null : String(id)
  }

  /** ISO2 of the country under a screen point, or null over ocean/unmapped. */
  const countryAt = (point: PointLike): string | null => {
    if (!layersReady) return null
    for (const f of map.queryRenderedFeatures(point, { layers: ['land'] })) {
      const iso = f.properties?.iso2
      if (iso) return String(iso)
    }
    return null
  }

  /**
   * What of the sky is under the pointer.
   *
   * Asks the canvas what it last *drew*, not the catalogue what exists — which
   * is the same discipline `queryRenderedFeatures` enforces one layer up, and
   * for the same reason: a star behind the earth, past the sky's outer edge or
   * faded out by the zoom is not on screen, and a hit test that could find one
   * would open a card pointing at nothing.
   *
   * `e.point` is relative to MapLibre's canvas and the sky canvas is `inset: 0`
   * inside the same host, so the two coordinate systems are the same one. If
   * that ever stops being true this is where it goes wrong silently.
   */
  const skyAt = (point: { x: number; y: number }): SkyHit | null =>
    sky.hit(point.x, point.y)

  /**
   * A short hop toward the story rather than a jump to a fixed zoom: from the
   * world view it settles at a regional scale, and if you are already zoomed in
   * it only steps a little closer. The vertical offset leaves room for the
   * popup, which opens above its anchor.
   */
  /**
   * Flies to a story, then opens the full article once the camera settles.
   *
   * Opening mid-flight means reading a card that is still sliding across the
   * screen, so the card waits for `moveend`. The timeout is a safety net: if
   * the movement is interrupted (a drag, another click) `moveend` may never
   * arrive for this flight, and the reader is left staring at nothing.
   */
  const flyToStory = (p: MapPoint) => {
    if (openSlug === p.slug) return
    openSlug = p.slug
    feed.highlight(p.slug)
    markRead(p.slug)

    // Immediate feedback while the camera is still travelling; the full
    // article replaces it once the map settles.
    popup?.preview(p, leads, scrubNow)

    // Close enough to place the story in its region, not so close that the
    // region is all that is left. Jumping the world view straight to 3.6 threw
    // away the context the map exists to give — at that zoom a European story
    // fills the frame with one country and the reader has lost the continent.
    // 2.5 keeps neighbours and coastline in view; a reader who wants the street
    // can scroll.
    const z = map.getZoom()
    const target = z < 2.5 ? 2.5 : Math.min(z + 0.4, 6)

    flying = true
    let opened = false
    const reveal = () => {
      if (opened || !mounted) return
      opened = true
      flying = false
      map.off('moveend', reveal)
      // Anything that moved while the camera was busy deferred its padding
      // rather than cancelling the flight; now is when it gets applied.
      if (paddingPending) applyPadding()
      if (openSlug === p.slug) void popup?.open(p, scrubNow)
    }
    map.on('moveend', reveal)
    // Safety net: an interrupted flight may never emit `moveend`, and the
    // reader would be left looking at a preview that never becomes the story.
    window.setTimeout(reveal, 1600)

    map.flyTo({
      center: [p.lng, p.lat],
      zoom: target,
      // Leaves room above the marker for the card, which opens upward. The
      // horizontal correction for the rail comes from the map's padding.
      offset: [0, 110],
      duration: 1150,
      curve: 1.35,
      // No `essential: true`. In MapLibre that flag means "animate anyway,
      // whatever the reader's motion preference" — and a 1.15s flight across
      // the globe is the exact motion `prefers-reduced-motion` exists to
      // suppress. Without the flag MapLibre still makes the move, it just
      // arrives instantly, which is what someone who asked for less motion
      // wants: the destination, not the journey.
    })
  }

  /**
   * The country hover bit, written per id rather than per source.
   *
   * **Never clear this source wholesale.** `removeFeatureState({source})` with
   * no id is what `applyMetric` uses, and on `countries` that map holds every
   * country's `p` — the entire ground metric. Clearing it to unset one hover bit
   * would blank the choropleth and leave the world fully hatched, which is the
   * "no data anywhere" failure `scheduleMetric` exists to prevent, reached from
   * the other direction. So the previous id is unset by key and nothing else is
   * touched.
   *
   * Safe per-id, unlike `stories`, because `countries` is not rebuilt on a
   * scrub — the only thing that reloads it is the one-shot coastline upgrade at
   * `ULTRA_ZOOM`, so there is no tile-rebuild race to write across here.
   */
  const writeCountryHover = (iso: string | null) => {
    if (countryHoverWritten === iso) return
    if (countryHoverWritten) {
      map.removeFeatureState({ source: 'countries', id: countryHoverWritten }, 'hover')
    }
    if (iso) map.setFeatureState({ source: 'countries', id: iso }, { hover: true })
    countryHoverWritten = iso
  }

  /**
   * Put the hover bit where the paint expression can see it — but only while
   * the source is standing still.
   *
   * One bit per feature: the expressions already read `feature-state`, so
   * nothing recompiles and nothing else on the layer is touched. The catch is
   * that the state lives on the *source*, not the tile, and MapLibre replays
   * the whole of it onto every tile it rebuilds (`_reloadTile` →
   * `initializeTileState` → `updatePaintArrays`), where features are addressed
   * by the position they held in the previous parse. `stories` is rebuilt on
   * every scrub tick, so writing state while those tiles are in flight sends
   * that replay past the end of the feature list and the vector-tile reader
   * throws "feature index out of bounds" — from a stack this island does not
   * appear in, with nothing visibly wrong on the map.
   *
   * So: never write across a reload, and never leave anything behind for one
   * to replay. The whole source is cleared rather than the previous id unset,
   * because `{hover: false}` is still an entry to be replayed; hover is the
   * only state this source carries, so clearing it is exact. `idle` restores
   * whatever the pointer is on once the new tiles have landed.
   */
  const syncHoverState = () => {
    if (!layersReady || !map.isSourceLoaded('stories')) return
    if (hoverStateWritten === hoverSlug) return
    map.removeFeatureState({ source: 'stories' })
    if (hoverSlug) map.setFeatureState({ source: 'stories', id: hoverSlug }, { hover: true })
    hoverStateWritten = hoverSlug
  }

  const setHoverSlug = (slug: string | null) => {
    if (slug === hoverSlug) return
    hoverSlug = slug
    feed.highlight(slug)
    syncHoverState()
  }

  /**
   * The same trick for the prayer lines, and a separate function on purpose.
   *
   * `syncHoverState` gives up unless `stories` has settled, and `stories` is
   * rebuilt on every scrub tick — folding this into it would mean the prayer
   * bit was never restored during a scrub, which is precisely when the source
   * has just been rewritten.
   */
  const syncPrayerHover = (rewrite = false) => {
    if (!layersReady || !map.isSourceLoaded('prayer')) return
    if (!rewrite && prayerStateWritten === hoverPrayer) return
    map.removeFeatureState({ source: 'prayer' })
    if (hoverPrayer) map.setFeatureState({ source: 'prayer', id: hoverPrayer }, { hover: true })
    prayerStateWritten = hoverPrayer
  }

  const setHoverPrayer = (id: string | null) => {
    if (id === hoverPrayer) return
    hoverPrayer = id
    syncPrayerHover()
  }

  /**
   * Name the line under the pointer, and say when it reaches *there*.
   *
   * The name is the part that has to be there — a label only lands where symbol
   * placement allows, so most of any given line is unnamed. The time is what
   * makes it worth reading twice: it is the same prayer all the way along, but
   * not the same o'clock, and watching it run from 04:52 at the equator to
   * 02:20 in northern summer is the curve explaining itself.
   *
   * Solar time, marked as such — see `solarClock`. It is exact, it needs no
   * timezone dataset, and it is the frame the thing being timed is defined in.
   */
  const showPrayerTip = (id: string, point: { x: number; y: number }, at: { lng: number; lat: number }) => {
    const prayer = PRAYERS.find((p) => p.id === id)
    if (!prayer) {
      prayerTip.hidden = true
      return
    }
    const when = prayerInstantAt(new Date(), prayer.id as PrayerId, at.lat, at.lng)
    prayerTip.replaceChildren()
    const name = document.createElement('b')
    name.textContent = prayer.name
    prayerTip.append(name)
    if (when !== null) {
      const clock = document.createElement('span')
      clock.textContent = solarClock(when, at.lng)
      const frame = document.createElement('i')
      frame.textContent = 'solar'
      prayerTip.append(clock, frame)
    }
    prayerTip.hidden = false

    // Measured after it is filled and shown, so the flip near an edge is
    // against the width this text actually has rather than the last one's.
    const gap = 14
    const { width, height } = mapEl.getBoundingClientRect()
    const w = prayerTip.offsetWidth
    const h = prayerTip.offsetHeight
    const x = point.x + gap + w > width - 8 ? point.x - gap - w : point.x + gap
    const y = point.y + gap + h > height - 8 ? point.y - gap - h : point.y + gap
    prayerTip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`
  }

  const hidePrayerTip = () => {
    prayerTip.hidden = true
  }

  const clearPeekClose = () => {
    if (peekCloseTimer !== null) {
      clearTimeout(peekCloseTimer)
      peekCloseTimer = null
    }
  }

  /**
   * Returns the map to the view it opened on.
   *
   * The wordmark is a link to `/`, and on every other page that is exactly
   * right. On the homepage the map *is* the page, so reloading it to get back
   * to the world view throws away a megabyte of already-parsed engine to
   * arrive somewhere a camera move reaches in a second. The href stays, so
   * cmd-click, middle-click and a JS-less browser all still navigate.
   */
  const resetView = () => {
    openSlug = null
    peekId = null
    clearPeekClose()
    popup?.close()
    sheet.close()
    feed.highlight(null)
    // As above: reduced motion turns this into an instant return, not a
    // suppressed one.
    map.easeTo({ ...HOME_VIEW, bearing: 0, pitch: 0, duration: 800 })
  }

  /**
   * Shows the reset control only when the camera is somewhere else.
   *
   * This used to compare against the centre the map could actually *reach*
   * rather than the one we asked for, through two functions of Mercator slack —
   * and both of them are gone, because the thing they modelled is gone.
   *
   * The problem they solved was real and specific to the flat projection. With
   * `renderWorldCopies` off, the world exactly fills the canvas at the home
   * zoom, so MapLibre constrained the centre back towards 0 and
   * `HOME_VIEW.center` was never honoured: on a desktop the longitude of 12°
   * was clamped away, on a phone (where the height sets the zoom) the latitude
   * of 22° was too. Comparing against the requested centre therefore made the
   * delta a permanent 12° and 22°, past both thresholds, so "whole world" was
   * lit the instant the map opened and stayed lit after a reset had finished —
   * the exact opposite of an affordance meaning "you have moved".
   *
   * **A sphere has no edges to be pushed away from.** The globe's constrain
   * (`vertical_perspective_transform.ts`) clamps latitude to ±85° and clamps
   * zoom, and does nothing whatever to the centre — there is no "world fails to
   * cover the canvas" case on a disc, which is the same fact that let
   * `globeFitZoom` take `min()` where the flat fit needed `max()`. So the
   * requested centre is honoured exactly, and the honest comparison is against
   * the number we asked for.
   *
   * This is only sound because the home view is *always* on the sphere:
   * `globeFitZoom` caps at `GLOBE_ZOOM.sphere`, so `HOME_VIEW.zoom` can never
   * reach the flattening. Past it the zoom test below has already fired and the
   * centre tests cannot be what decides the answer.
   */
  const syncResetButton = () => {
    if (!mounted) return
    const c = map.getCenter()
    const moved =
      map.getZoom() > HOME_VIEW.zoom + 0.15 ||
      Math.abs(c.lat - HOME_CENTER[1]) > 4 ||
      Math.abs(((c.lng - HOME_CENTER[0] + 540) % 360) - 180) > 8
    resetBtn.hidden = !moved
  }

  const onWordmarkClick = (e: MouseEvent) => {
    const target = e.target
    if (!(target instanceof Element) || !target.closest('.wordmark')) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    resetView()
  }

  const wireInteraction = () => {
    /**
     * Disasters, straits and conflict open on hover, like a story does.
     *
     * The sheet was built for this — it has a non-modal "peek" mode that keeps
     * the map live underneath so the pointer can travel straight to the next
     * marker — but every call site passed `pinned: true`, so the only way to
     * find out what a marker was had been to commit to a modal. Hovering now
     * shows it and clicking pins it, which is the same two-stage gesture the
     * story beacons use.
     */
    const showFor = (id: unknown, pin: boolean) => {
      const key = String(id)
      const alert = gdacs.find((a) => a.eventid === key)
      // `details` is keyed by `${eventtype}:${eventid}`, which is why the bare
      // event id never found anything — see `detailKey` in shared/gdacs.
      if (alert) return sheet.showGdacs(alert, gdacsDetails[detailKey(alert)] ?? null, pin)
      const cp = chokepoints.find((c) => c.id === key)
      if (cp) return sheet.showChokepoint(cp, pin)
      const ex = markets.find((m) => m.id === key)
      if (ex) return sheet.showMarket(ex, pin)
      const ev = conflicts.find((c) => c.id === key)
      if (ev) return sheet.showConflict(ev, conflictWindowLabel(), pin)
      const gen = genocide.find((x) => x.id === key)
      if (gen) return sheet.showGenocide(gen, pin)
      const heat = thermal.find((x) => x.id === key)
      if (heat) return sheet.showThermal(heat, pin)
      const area = famine.find((x) => x.id === key)
      if (area) return sheet.showFamine(area, pin)
    }

    /** The sun, the moon or a star, in the same two densities as every mark. */
    const showSky = (h: SkyHit, pin: boolean) => {
      if (h.kind === 'star') return sheet.showStar(h, pin)
      return sheet.showBody(h, hijriLabel(new Date()), pin)
    }

    /**
     * The one hit test, and the one precedence.
     *
     * Every marker used to register its own layer-scoped handler, and MapLibre
     * gives each registration its own `queryRenderedFeatures` over its own
     * layers — so two handlers could both find a feature under one pointer and
     * both fire. That is not hypothetical: clicking the story aggregate over
     * London flew the camera *and* pinned the London Stock Exchange, because
     * exchanges sit in exactly the cities that generate the most stories.
     * Hovering the pair did it twice over, and nothing had ever reported it.
     *
     * One query, one winner, order stated in `HIT_ORDER` rather than read off the
     * result array, whose ordering MapLibre does not promise. Pointer cost drops
     * from up to five `queryRenderedFeatures` per move to two.
     */
    const topHit = (point: PointLike): MapGeoJSONFeature | null => {
      const hits = map.queryRenderedFeatures(point, { layers: MARKER_LAYERS })
      if (!hits.length) return null
      for (const id of HIT_ORDER) {
        const f = hits.find((h) => h.layer.id === id)
        if (f) return f
      }
      return hits[0]
    }

    /** The place a story belongs to, or null if the index has not caught up. */
    const placeOf = (slug: string): StoryPlace | null => {
      const key = placeIndex.of.get(slug)
      return key ? placeByKey.get(key) ?? null : null
    }

    const placeForFeature = (f: MapGeoJSONFeature): StoryPlace | null => {
      const key = f.properties?.key
      return key == null ? null : placeByKey.get(String(key)) ?? null
    }

    const isStoryLayer = (id: string) => id === 'story-points' || id === 'story-place-count'

    /** Dismiss a peek that is no longer under the pointer. */
    const releasePeek = () => {
      if (peekId === null) return
      peekId = null
      clearPeekClose()
      // A short grace period: leaving the marker usually means the pointer is
      // on its way to the sheet to read it, not that you are done with it.
      peekCloseTimer = window.setTimeout(() => {
        peekCloseTimer = null
        if (!sheet.isPinned()) sheet.close()
      }, 260)
    }

    /**
     * Clicking the map.
     *
     * One handler, four outcomes in `HIT_ORDER`'s precedence. A story beacon at a
     * place holding one story flies to it; a beacon at a place holding several —
     * and 445 of 705 stories share a coordinate — opens the place instead, which
     * is the gesture `expandCluster` was pretending to offer. It could not
     * deliver: coincident stories never separate at any zoom, so descending into
     * a pile moved the camera and produced nothing to read. An overlay mark pins
     * its sheet. Nothing under the pointer dismisses whatever is open, and only
     * from a clean slate does a click on land open that country — escape-first is
     * what a click on empty space is expected to do.
     */
    map.on('click', (e) => {
      const f = topHit(e.point)

      if (f) {
        const layer = f.layer.id
        if (layer === 'story-place-count') {
          const place = placeForFeature(f)
          if (place) {
            openSlug = null
            void popup?.openPlace(place, scrubNow)
          }
          return
        }
        if (layer === 'story-points') {
          const p = pointFor(f)
          if (!p) return
          const place = placeOf(p.slug)
          if (place && place.count > 1) {
            openSlug = null
            void popup?.openPlace(place, scrubNow)
          } else {
            flyToStory(p)
          }
          return
        }
        const id = f.properties?.id
        if (id == null) return
        clearPeekClose()
        peekId = String(id)
        showFor(id, true)
        return
      }

      // The sky is not a MapLibre layer and must not join `MARKER_LAYERS` —
      // `map-island.test.js` asserts that set equals `HIT_ORDER`, and the sky
      // has no layer to rank. It is queried here instead, inside the one
      // pointer path, and only outside the globe's limb, where `topHit` and
      // `countryAt` are both guaranteed to find nothing. So the precedence is
      // geometric rather than declared: there is nothing for it to contend with.
      const star = skyAt(e.point)
      if (star) {
        openSlug = null
        clearPeekClose()
        peekId = `sky:${star.kind === 'star' ? star.designation : star.kind}`
        showSky(star, true)
        return
      }

      if (popup?.isOpen() || sheet.isOpen()) {
        openSlug = null
        popup?.close()
        sheet.close()
        feed.highlight(null)
        return
      }

      const iso = countryAt(e.point)
      if (!iso) return
      openSlug = null
      void popup?.openCountry(iso, [e.lngLat.lng, e.lngLat.lat], standingFor(iso))
    })

    /**
     * Moving over the map.
     *
     * Same single hit test. A story lights its rail row and nothing else — hover
     * previews and stops there, because the dwell timer this replaced flew the
     * camera after 320ms and dragged readers across dense areas they were only
     * passing over. An overlay peeks its sheet. Only where no mark has claimed
     * the pointer do the prayer probe and the land highlight run: a beacon under
     * the pointer is always what was meant. Nothing is suppressed the other way
     * round — the country under a prayer line still highlights and still takes
     * the click, because that line crosses every country there is.
     */
    map.on('mousemove', (e) => {
      if (flying) return
      const f = topHit(e.point)
      const overMarker = f !== null

      if (f && isStoryLayer(f.layer.id)) {
        map.getCanvas().style.cursor = 'pointer'
        releasePeek()
        if (f.layer.id === 'story-place-count') {
          // The numeral stands for the place, so it lights the place's newest
          // story — the same one the top of the stack under it is drawing.
          const place = placeForFeature(f)
          setHoverSlug(place?.slugs[0] ?? null)
        } else {
          setHoverSlug(pointFor(f)?.slug ?? null)
        }
      } else if (f) {
        map.getCanvas().style.cursor = 'pointer'
        setHoverSlug(null)
        const id = f.properties?.id
        if (id != null && String(id) !== peekId) {
          peekId = String(id)
          clearPeekClose()
          showFor(id, false)
        }
      } else {
        setHoverSlug(null)
        const star = skyAt(e.point)
        if (star) {
          map.getCanvas().style.cursor = 'pointer'
          const id = `sky:${star.kind === 'star' ? star.designation : star.kind}`
          if (id !== peekId) {
            peekId = id
            clearPeekClose()
            showSky(star, false)
          }
          return
        }
        releasePeek()
      }

      // A hairline is not a pointing target, so the prayer probe is a small box
      // rather than the point every other hit test uses.
      const onPrayer = overMarker ? null : prayerAt(e.point)
      setHoverPrayer(onPrayer)
      if (onPrayer) showPrayerTip(onPrayer, e.point, e.lngLat)
      else hidePrayerTip()
      const iso = overMarker ? null : countryAt(e.point)
      writeCountryHover(iso)
      if (!overMarker) map.getCanvas().style.cursor = iso ? 'pointer' : ''
    })

    map.on('mouseout', () => {
      setHoverSlug(null)
      setHoverPrayer(null)
      hidePrayerTip()
      releasePeek()
      map.getCanvas().style.cursor = ''
      writeCountryHover(null)
    })

    // Moving back onto the sheet itself cancels the pending dismissal.
    sheet.element.addEventListener('mouseenter', clearPeekClose)
    sheet.element.addEventListener('mouseleave', () => {
      if (!sheet.isPinned()) sheet.close()
    })

    // The other half of `syncHoverState`: hover writes are skipped while the
    // story tiles are reloading, so the bit is put back the moment they stop.
    // Cheap — it compares one slug and, at most, writes one feature's state.
    map.on('idle', syncHoverState)
    // Its own listener, not a line inside that one — see `syncPrayerHover`.
    // Wrapped rather than passed directly: MapLibre hands the listener an event
    // object, which as `rewrite` is truthy, and would force the unconditional
    // clear this pair exists to avoid.
    map.on('idle', () => syncPrayerHover())

    /**
     * Coastline detail, swapped in as the camera earns it.
     *
     * Three tiers, each an order of magnitude heavier than the last: 110m for
     * first paint (70 KB), 50m once the coarse outline starts to show, 10m past
     * regional scale. The last one is 1.4 MB and carries 255 countries against
     * 110m's 176 — mostly islands and real inlets — so it is worth having and
     * emphatically not worth loading for a reader who never zooms in.
     */
    /**
     * Swaps the coastline source up a tier.
     *
     * MapLibre 6 dropped the URL form of `GeoJSONSource.setData` — it now
     * takes a parsed object only, and hands a string straight to the worker
     * as data, where it silently becomes nothing. No throw, no `error` event,
     * no request: the tier swap had been dead since the v6 upgrade and every
     * reader was getting the 110m coastline at maximum zoom while the 50m and
     * 10m files shipped in the build and were never once fetched. Fetching it
     * here and passing the object is also what lets the abort signal and the
     * mounted check apply.
     */
    const upgradeCoastline = async (file: string) => {
      const data = await json<FeatureCollection>(
        basemapUrl(file, basemapV),
        abort.signal,
      )
      if (!data || !mounted) return
      metricApplied = false
      ;(map.getSource('countries') as GeoJSONSource | undefined)?.setData(data)
      // `scheduleMetric` finds the source unloaded — `setData` marks it so
      // synchronously — and waits for `idle`, which is what re-applies the tint
      // once this data settles. It has to happen at all because the finer tier
      // carries countries the coarse one never had (176 features become 255),
      // and none of them arrive with feature state: without it the tint would
      // thin out as the reader zoomed, worst on the small states the detail
      // exists for.
      scheduleMetric()
    }

    map.on('zoomend', () => {
      // The wash fades to nothing by `DENSITY_FADE_OUT`, where places have
      // separated and every mark is a story again. A legend for something not
      // drawn is the same lie the `contested` and genocide items are hidden to
      // avoid — and `hidden`, never `opacity`, which is how a chip once ended up
      // at 2.33:1 with nothing able to see it.
      const density = keyItems.get('density')
      if (density) density.hidden = map.getZoom() >= DENSITY_FADE_OUT
      if (ultraLoaded || map.getZoom() < ULTRA_ZOOM) return
      // Set before awaiting, or a second zoomend starts the same fetch again.
      ultraLoaded = true
      void upgradeCoastline('countries-ultra.geojson')
    })

    // The reset control only exists once the view has left home, so at rest it
    // adds nothing to a map whose whole point is restraint.
    map.on('move', syncResetButton)
    syncResetButton()

    // The sky follows the camera, and `move` is the only event it needs: it
    // fires on a frame MapLibre is already drawing, so this adds a repaint to
    // work in flight rather than scheduling work of its own. Nothing here
    // touches a source, a layer or a feature state, so the map's idle stays
    // exactly as quiet as it was — which is the invariant that was once worth
    // 57% of a core.
    map.on('move', () => sky.draw())
  }

  // --- Chrome -------------------------------------------------------------
  const buildRanges = () => {
    for (const [label, hours] of RANGES) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = hours === rangeHours ? 'map-range is-on' : 'map-range'
      btn.dataset.kind = 'range'
      // Read back by `syncRangeChips`, which has no closure over the loop.
      btn.dataset.hours = String(hours)
      btn.textContent = label
      btn.setAttribute('aria-pressed', String(hours === rangeHours))
      btn.addEventListener('click', () => setRange(hours))
      ranges.append(btn)
    }
  }

  /**
   * The one place the range is set, whoever asked.
   *
   * It has three consequences now rather than one, and they were being written
   * out at each of the three call sites — a press, a shared link, and the
   * initial paint — which is how the money block came to be missed by two of
   * them while the beacons were updated by all three.
   */
  /**
   * A chip's trend, drawn beside the control that switches it.
   *
   * The money block had the only lines on the rail, and the two groups under it
   * — the categories and the layers — are the same kind of question asked about
   * a different quantity: *is there more of this than there was*. A reader
   * deciding whether to turn a layer on has no way to know it is spiking, and
   * the chip is the one place that answer belongs, because it is the place the
   * decision is made.
   *
   * **The tone is the layer's own hue, never the money's green and orange**, and
   * that is a correctness rule rather than a preference. `--map-pos`/`--map-neg`
   * mean "a signed change" and read as good and bad, which on a market is a
   * convention old enough to be invisible and on a hazard count is a claim: a
   * green **DISASTERS +40%** says more disasters is good news. The same trap
   * this file records for the genocide caption, where colour on a label made the
   * gravest mark on the map read as an alert about the interface. So identity
   * rides on hue — the chip's own `--cat`, which its glyph already carries — and
   * direction rides on the shape, which is the one thing a sparkline is for. The
   * signed figure states the magnitude in words beside it, and claims nothing.
   *
   * A switched-off chip keeps its line, in the ink its label already stepped
   * down to. That is the whole value of putting it here: the reason to turn a
   * layer on is that something is happening in it, and a rail that hid the
   * evidence behind the switch would be asking the reader to guess.
   */
  const chipTrend = (
    key: string,
    values: number[] | null,
    span: [number, number],
    /**
     * The figure to print: a number, `'window'` to take the drawn line's own
     * last-against-first, or `null` to print none.
     *
     * Three cases and not two, because the two kinds of series here answer
     * "which way" differently. A published series — the straits' vessel counts —
     * is a level, and last-against-first is exactly its change, which
     * `seriesModel` has already computed over what it drew. A bucketed count is
     * a rate, where that comparison is one bucket against one other bucket, so
     * it gets `halfOverHalf` instead. And `null` is for a first half with
     * nothing in it: a rise from nothing has no percentage, and printing one
     * would be a division dressed up as a finding.
     */
    pct: number | 'window' | null,
  ) => {
    const host = filters.querySelector(`[data-key="${key}"] .map-filter-spark`)
    if (!(host instanceof HTMLElement)) return
    const spark = values ? sparkline({ values, window: values.length, span }) : null
    if (!spark) {
      host.replaceChildren()
      return
    }
    const fig = document.createElement('span')
    fig.className = 'map-filter-pct'
    const shown = pct === 'window' ? spark.windowPct : pct
    fig.textContent = shown == null ? '' : ribbonPct(shown)
    host.replaceChildren(spark.element, fig)
  }

  /**
   * A pile of event times as a line placed inside the asked-for window.
   *
   * The buckets are laid across what the payload **covers**, not across what the
   * reader asked for, and that distinction was a bug before it was a rule.
   * GDACS publishes a rolling window of about sixteen days; bucketed across a
   * 30-day range, the fourteen days it does not hold came out as empty buckets,
   * they landed almost entirely in the earlier half, and the chip read
   * **+911.1%** — a real division over an absence, which is the most convincing
   * kind of wrong number. Bucketing over the covered period instead makes the
   * comparison one between two halves of the same evidence, and `coverage`
   * still places the shorter line in the right part of the box, so the reader
   * can see it does not reach.
   */
  const countTrend = (key: string, times: number[], from: number, to: number) => {
    const usable = times.filter((t) => Number.isFinite(t) && t <= to)
    if (!usable.length) return chipTrend(key, null, [0, 1], null)
    const drawnFrom = Math.max(from, Math.min(...usable))
    const counts = bucketCounts(usable, drawnFrom, to)
    chipTrend(key, counts, coverage(drawnFrom, to, from), halfOverHalf(counts))
  }

  /**
   * Every chip trend, from whatever the island is currently holding.
   *
   * Anchored on `windowEnd` rather than on `scrubNow`, so a chip says "the last
   * N days" whatever the scrubber is doing — the same anchor the money rows use,
   * and the alternative would be seven rows following the clock and eleven
   * following the reader's thumb.
   *
   * Three of the eleven chips can support a line and the other eight are left
   * deliberately blank, each for a reason worth stating rather than discovering:
   * **conflict** is UCDP, which publishes months in arrears — the newest event
   * in a real payload is 125 days old, so every range this control offers is
   * empty, and the layer already decays against its own dataset's newest event
   * for exactly this reason; **thermal** is eleven detections from a single
   * satellite pass; **famine** and **genocide** are determinations rather than
   * events, which is why `map-island.test.js` fails if a time filter ever
   * appears on them, and a trend line is a time filter with a picture; and
   * **prayers** is a geometry, not a quantity. `markets` has its line in the
   * money block above, where it is one of seven rather than the only one.
   */
  function paintTrends() {
    const to = windowEnd || Date.now()
    const from = to - rangeHours * 3_600_000

    // Stories, per category. Before the archive lands the corpus is a fortnight,
    // so a 30d chip draws fourteen days of shape in the right half of its box
    // rather than fourteen days stretched across it.
    for (const cat of CATEGORY_ORDER) {
      countTrend(cat, points.flatMap((p) => (p.cat === cat ? [p.t] : [])), from, to)
    }

    // Disasters. GDACS publishes a rolling window — about sixteen days against
    // a real payload — so beyond that the line is short-drawn from its own
    // oldest alert. Zero-filling to the window's edge instead would draw "we do
    // not hold this" as "nothing happened", which on a disaster layer is the
    // worse of the two errors by a distance.
    countTrend('gdacs', gdacs.map((a) => Date.parse(a.fromDate)), from, to)

    // Straits, which unlike the two above have a *published* series — eleven
    // chokepoints, eighty daily vessel-transit counts each — so this goes
    // through the money block's own arithmetic rather than a second copy of it:
    // date-windowed, composited by `meanIndex`, short members set aside. The
    // day step needs each member's own last-against-previous, which is what
    // `seriesChangePct` is; `delta7vs90` is on the payload and is a different
    // quantity, a week against a quarter, and passing it here would print a
    // figure the line does not draw.
    const straitInput = sparkInput(
      chokepoints.flatMap((c) => {
        const vals = c.series?.total
        if (!Array.isArray(vals) || vals.length < 2) return []
        return [{
          values: vals,
          periods: c.series?.periods,
          asOf: c.asOf,
          pct: seriesChangePct(vals) ?? 0,
        }]
      }),
      rangeHours / 24,
    )
    chipTrend(
      'straits',
      straitInput?.values ?? null,
      straitInput?.span ?? [0, 1],
      // A published level, so the change is the drawn line's own — except at
      // the day step, where `sparkInput` hands back the move it drew the slope
      // from and `windowPct` would be a percentage of zero.
      straitInput ? (straitInput.pct ?? 'window') : null,
    )
  }

  function setRange(hours: number) {
    rangeHours = hours
    syncRangeChips()
    // The strip holds its own payloads and redraws from them; it does not
    // refetch, so this is arithmetic on data already in hand.
    marketStrip.setRangeDays(hours / 24)
    // A range past the build window has stories the payload does not carry.
    // Fired and not awaited: the beacons the map *does* have should move on the
    // press rather than after a 250 KB round trip, and `loadArchive` refreshes
    // again when it lands.
    if (hours > BUILD_WINDOW_HOURS) void loadArchive()
    // The axis follows the range once the range leaves the fortnight. Cheap
    // when it has not: `railStart()` returns the same instant and this returns
    // without touching the DOM.
    const start = railStart()
    if (timeline && start !== windowStart) {
      windowStart = start
      rebuildTimeline(start, windowEnd)
    }
    paintTrends()
    refresh()
  }

  /**
   * Put the range row in step with `rangeHours`.
   *
   * Lifted out of the click handler because a shared link can widen the range
   * without anything being pressed — and a chip row that still says `3d` over a
   * map showing a fortnight is the legend-disagreeing-with-the-mark failure in
   * its plainest form.
   */
  const syncRangeChips = () => {
    for (const b of ranges.querySelectorAll('.map-range')) {
      const on = Number((b as HTMLElement).dataset.hours) === rangeHours
      b.classList.toggle('is-on', on)
      b.setAttribute('aria-pressed', String(on))
    }
  }

  const buildFilters = () => {
    const catButtons = new Map<string, HTMLButtonElement>()

    /**
     * Marks the last lit category as the one that cannot be turned off.
     *
     * The map refuses to go blank, which is right — but it used to refuse in
     * silence: you clicked the only category still on and absolutely nothing
     * happened, with no hint that the click had been understood and declined.
     * `aria-disabled` (not `disabled`, which would drop it out of the tab
     * order) plus a reason on hover says so, and `.is-locked` lets the CSS
     * stop pretending it is still a live toggle.
     */
    // The reason lives on the group, not on whichever chip happens to be the
    // last one lit. It was a `title` on a moving target — hover-only, so on a
    // phone the constraint simply did not exist, which is precisely where the
    // legend has been folded behind a disclosure and a reader is most likely to
    // be poking at the chips to find out what they do.
    const lockNote = document.createElement('span')
    lockNote.className = 'map-filters-note'
    lockNote.setAttribute('aria-live', 'polite')
    lockNote.hidden = true

    const syncLock = () => {
      const sole = enabled.size === 1
      for (const [cat, b] of catButtons) {
        const locked = sole && enabled.has(cat)
        b.classList.toggle('is-locked', locked)
        if (locked) b.setAttribute('aria-disabled', 'true')
        else b.removeAttribute('aria-disabled')
      }
      lockNote.textContent = sole ? 'one category stays on' : ''
      lockNote.hidden = !sole
    }

    /**
     * A chip's mark, drawn from the table the map rasterises.
     *
     * The glyphs go in a box of their own rather than straight into the button,
     * and the box is what makes a column of chips line up. Two of the eight
     * layers are drawn with *two* silhouettes — `markets`, because the layer is
     * a two-valued scale and no single tone stands for it, and `famine`, because
     * the phase rides on shape — so on a row they are simply wider, and in a
     * column they pushed their labels 12px right of the other six. Six labels on
     * one edge and two off it reads as two rows that do not belong to the list,
     * which is the exact failure the genocide item's missing outdent produced
     * one entry above.
     *
     * A named box also lets the *marks* share a left edge as well as the labels,
     * which is the stronger alignment: the eye follows the column of
     * silhouettes, and a pair that starts where every other mark starts reads as
     * one mark made of two parts rather than as a mark and a half.
     */
    /**
     * The chip's mark, its name, and room for a trend beside it.
     *
     * The name used to be a bare text node. It is a `<span>` now because the
     * rail's chip is a flex row and a trend line has to be able to take the
     * slack between the label and the right edge — an anonymous flex item made
     * of loose text can be laid out but not sized, so the lines would have
     * started at a different x on every chip and the interval the eye learns
     * once would have had to be re-found per row.
     *
     * The spark host is always appended, never conditionally: a chip that can
     * draw a trend and a chip that cannot must occupy the same box, or the
     * column develops two row heights for a reason no reader can see.
     */
    const chipGlyph = (btn: HTMLButtonElement, ids: GlyphId[], label: string) => {
      btn.innerHTML = `<span class="map-filter-mark">${ids.map(glyphSvg).join('')}</span>`
      const name = document.createElement('span')
      name.className = 'map-filter-label'
      name.textContent = label
      const spark = document.createElement('span')
      spark.className = 'map-filter-spark'
      btn.append(name, spark)
    }

    /**
     * A group's name, in the rail only.
     *
     * On the strip there was no room and no need: four chips, a 1px tick, seven
     * chips, read left to right as one run of controls, and the tick was enough
     * to say a boundary had been crossed. In a column the two groups are two
     * *lists*, and a rule between two lists says they are different without
     * saying how — a reader who has not learned this map cannot tell that the
     * first four decide which stories are on it and the next seven decide what
     * else is drawn over them. That is a conceptual-model gap, and one word
     * each closes it.
     *
     * It is set one rung below an unlit chip and, crucially, **without the
     * glyph column** — so a heading begins at the rail's own left edge while
     * every chip's label begins 22px in. The indent is what separates the two,
     * which matters because a dim heading and an unlit chip are otherwise the
     * same ink at nearly the same size.
     *
     * `aria-hidden`, because `.map-filters` already carries a group label and
     * every chip states its own name and pressed state. A screen reader has the
     * structure; this is the sighted reader's copy of it.
     */
    const groupLabel = (text: string) => {
      const span = document.createElement('span')
      span.className = 'map-group-label'
      span.textContent = text
      span.setAttribute('aria-hidden', 'true')
      return span
    }

    filters.append(groupLabel('stories'))

    for (const cat of CATEGORY_ORDER) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-filter is-on'
      btn.dataset.kind = 'category'
      // What `paintTrends` finds this chip by. A data key rather than a
      // registry because the painter lives outside `buildFilters` and a
      // closure-scoped Map would have to be hoisted out of it to be reached.
      btn.dataset.key = cat
      btn.style.setProperty('--cat', CATEGORY_COLOUR[cat])
      chipGlyph(btn, ['dot'], cat)
      btn.setAttribute('aria-pressed', 'true')
      btn.addEventListener('click', () => {
        // Never let the map go blank — the last category stays lit.
        if (enabled.has(cat) && enabled.size === 1) return
        if (enabled.has(cat)) enabled.delete(cat)
        else enabled.add(cat)
        const on = enabled.has(cat)
        btn.classList.toggle('is-on', on)
        btn.setAttribute('aria-pressed', String(on))
        syncLock()
        refresh()
      })
      catButtons.set(cat, btn)
      filters.append(btn)
    }

    const sep = document.createElement('span')
    sep.className = 'map-filter-sep'
    sep.setAttribute('aria-hidden', 'true')
    filters.append(sep, groupLabel('layers'))

    // Each overlay chip now draws its layer's own silhouette, from the same
    // vertex table `map.addImage` rasterises. Before this they were all a 6px
    // disc with a hollow variant, which meant `disasters` and `straits` were
    // the same ring and there was nothing connecting the word to the mark.
    //
    // `markets` was worse than uninformative: it was a *grey* ring, chosen on
    // the reasoning that the layer is olive and terracotta in equal measure so
    // neither tone stands for it. True, and the conclusion does not follow —
    // the answer is to show both, because a two-valued scale is exactly what
    // this layer means and the one chip that refused to say so was the one
    // whose colours the reader had no other way to learn.
    //
    // `prayers` leads because it is drawn first — these lines sit on the ground
    // under every mark, and the order of this row is the order of the map.
    for (const [key, label, colour, glyphs, note] of [
      ['prayers', 'prayers', MAP_COLOURS.prayer, ['prayer-line'], PRAYER_NOTE],
      ['gdacs', 'disasters', OVERLAY_COLOUR.gdacs, ['hazard'], ''],
      // Beside `disasters`, because that adjacency is the whole point of its
      // colour: same hue, one step lighter, same subject seen by a different
      // kind of witness. Read apart, two warm marks; read together, a pair.
      // Same argument as the genocide chip sitting next to conflict.
      ['thermal', 'thermal', OVERLAY_COLOUR.thermal, ['thermal'], THERMAL_NOTE],
      ['straits', 'straits', OVERLAY_COLOUR.straits, ['strait-rest'], ''],
      ['markets', 'markets', '', ['tick-up', 'tick-down'], ''],
      ['conflict', 'conflict', OVERLAY_COLOUR.conflict, ['conflict-mark'], ''],
      // Last of the feed toggles and directly before the genocide separator, so
      // the row ends on the two determination layers. It shows two glyphs for the
      // reason `markets` does: the silhouette *is* the phase here, so a single
      // swatch would name the layer and withhold the one thing the chip can teach.
      ['famine', 'famine', OVERLAY_COLOUR.famine, ['famine-3', 'famine-5'], FAMINE_NOTE],
    ] as Array<[keyof typeof layersOn, string, string, GlyphId[], string]>) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-filter is-on'
      btn.dataset.kind = 'layer'
      btn.dataset.key = key
      // Which school's angles the lines are drawn to is provenance, not a
      // constraint the reader has to act on, so it goes where `HIJRI_NOTE`
      // goes — and it is on the chip rather than on a mark, because the marks
      // are lines with nothing to open.
      if (note) {
        btn.title = note
        btn.setAttribute('aria-label', `${label} — ${note}`)
      }
      if (colour) btn.style.setProperty('--cat', colour)
      else {
        btn.dataset.mark = 'market'
        btn.style.setProperty('--cat-up', OVERLAY_COLOUR.marketUp)
        btn.style.setProperty('--cat-down', OVERLAY_COLOUR.marketDown)
      }
      chipGlyph(btn, glyphs, label)
      btn.setAttribute('aria-pressed', 'true')
      btn.addEventListener('click', () => {
        layersOn[key] = !layersOn[key]
        btn.classList.toggle('is-on', layersOn[key])
        btn.setAttribute('aria-pressed', String(layersOn[key]))
        applyLayerVisibility()
      })
      filters.append(btn)
    }

    // Last in the row, past its own separator: a mark the map draws, named
    // where the other marks are named, but not a control. See its construction
    // above for why it is not in `.map-key`.
    filters.append(genocideKeySep, genocideKey)

    filters.append(lockNote)
    syncLock()
  }

  /** An instant as Makkah wall-clock `HH:MM`, which is the only frame here. */
  const makkahHm = (t: number) =>
    new Date(t + zoneOffset(t, MAKKAH_TZ)).toISOString().slice(11, 16)

  const updateClock = () => {
    // Makkah, like the scrubber readout and the Hijri date beside it. The three
    // are the map's only statements about what time it is and they have to
    // agree; see `MAKKAH_TZ` in `_map/format.ts` for why this frame.
    const now = Date.now()
    clockEl.textContent = `${makkahHm(now)} ${MAKKAH_LABEL}`
    hijriEl.textContent = hijriLabel(now, MAKKAH_TZ)
  }

  // --- Data ---------------------------------------------------------------
  /**
   * Where the rail's live edge is: now, not the last time something happened.
   *
   * `window.end` in the payload is the newest story's timestamp, which is an
   * honest description of the data and the wrong end for the scrubber. The
   * pipeline publishes every few hours, so between runs that timestamp falls
   * behind the wall clock — and three things on this map read it as "now":
   *
   *   - the scrubber printed `live · <newest story's time>` directly under a
   *     header clock printing the real time. `updateClock` says the two "have
   *     to agree"; they were hours apart, and on a quiet feed most of a day.
   *   - the rail dates every story against it, so the newest one always read
   *     "just now" no matter how old it was.
   *   - the range chips measure back from it, so "24h" meant the 24 hours
   *     before the last story rather than the last 24 hours — a window that
   *     quietly stretches to 30 or 40 as the feed goes quiet.
   *
   * Nothing is hidden by moving the edge forward: no point can be newer than
   * `window.end`, so the added span is empty by construction. The rail simply
   * ends where the reader is standing, and an empty last few hours is a true
   * statement about the news rather than a wrong one about the clock.
   */
  const liveEdge = (dataEnd: number) => Math.max(dataEnd, Date.now())

  /**
   * How much of the corpus the build ships in `map.json`.
   *
   * `BUILD_WINDOW_DAYS` in `build.js`, quoted here because the island has to
   * know which range steps it can answer from the payload it already has and
   * which need the archive fetched. If the build's window ever moves, this is
   * the other end of that decision.
   */
  const BUILD_WINDOW_HOURS = 14 * 24

  /** `idle` until a range past the fortnight asks for it; `done` even when it
   *  arrives empty, so a quiet archive is not refetched on every press. */
  let archiveState: 'idle' | 'loading' | 'done' = 'idle'

  /** The archive's own points, held apart so a refresh of `map.json` — which
   *  carries only the fortnight — cannot drop them. */
  let archivePoints: MapPoint[] = []

  /**
   * The oldest story loaded, which is not the same as the oldest published.
   *
   * The rail is drawn against it rather than against `map.json`'s window, so
   * the axis can grow when the archive lands without anything else having to
   * know where the points came from.
   */
  let corpusStart = 0

  /**
   * How far back the scrub rail reaches, given the range.
   *
   * Deliberately **not** just the range. The rail has spanned the whole
   * fortnight at every range since it existed, and the shaded band is what says
   * which slice of it is on the map — "the reader has no way to see that most
   * of this histogram is not on the map" is the bug that band was added for. So
   * the three ranges that fit inside the build window keep exactly the rail they
   * have always had, and only the two that do not get a wider one.
   *
   * The alternative — a rail that is always the range — was rejected on the
   * geometry: at 24h against a 90-day axis the band is 12px of 1100, which is
   * not a slice a reader can see, and shrinking the rail to the range instead
   * would delete the band's whole subject. Clamped to what is actually loaded,
   * so an axis never runs out past the oldest story on it.
   */
  const railStart = () => {
    const hours = Math.max(rangeHours, BUILD_WINDOW_HOURS)
    return Math.max(corpusStart, windowEnd - hours * 3_600_000)
  }

  /**
   * A new rail over the same reader.
   *
   * Every tick, day label and histogram bucket derives from a fixed span, so a
   * span that has moved needs a new component rather than a mutated one. What
   * must survive it is where the reader was standing: at the live edge they
   * follow the new end, and scrubbed back to Tuesday they stay on Tuesday.
   * `isLive()` is asked rather than cached, for the reason `map-feed.test.js`
   * pins — a flag written from `onChange` is an assumption until the reader has
   * touched the scrubber.
   */
  const rebuildTimeline = (start: number, end: number) => {
    if (!timeline) return
    const wasLive = timeline.isLive()
    const held = scrubNow
    const old = timeline
    timeline = createTimeline({
      start,
      end,
      value: wasLive ? undefined : Math.min(held, end),
      onChange: onScrub,
      lead: marketStrip.element,
    })
    timeline.setPoints(points)
    old.element.replaceWith(timeline.element)
    old.destroy()
    placeMarketStrip()
    watchChrome()
    timeline.setWindow(scrubNow - rangeHours * 3_600_000)
  }

  /**
   * The stories between the build window and ninety days back.
   *
   * Fetched the first time a range asks for something older than `map.json`
   * carries, and never before: it is 3,997 points and 251 KB gzipped against
   * that payload's 47, and it is the answer to a question most readers never
   * put. The homepage's preload is untouched.
   *
   * Failure is left recoverable — `idle` again, so the next press retries —
   * because unlike the initial load there is already a map on screen, and the
   * honest degradation is "this range shows what the fortnight had" rather than
   * an empty world.
   */
  const loadArchive = async () => {
    if (archiveState !== 'idle') return
    archiveState = 'loading'
    const data = await json<{ window: { start: number }; points: MapPoint[] }>(
      '/api/map-archive.json',
      abort.signal,
    )
    if (!data || !mounted) {
      archiveState = 'idle'
      return
    }
    archiveState = 'done'
    // By slug, because the archive is built from a strictly older slice of the
    // corpus than `map.json` and the two should not intersect at all — but a
    // build that straddles midnight can put one story in both, and a duplicate
    // here is two beacons on one coordinate and two rows in the rail.
    const have = new Set(points.map((p) => p.slug))
    const older = data.points.filter((p) => !have.has(p.slug))
    if (!older.length) return
    archivePoints = older
    points = [...older, ...points].sort((a, b) => a.t - b.t)
    pointBySlug = new Map(points.map((p) => [p.slug, p]))
    placeIndex = buildPlaceIndex(points)
    corpusStart = Math.min(corpusStart, data.window.start)
    rebuildTimeline(railStart(), windowEnd)
    paintTrends()
    refresh()
  }

  const loadCore = async () => {
    const data = await json<{ window: { start: number; end: number }; points: MapPoint[] }>(
      '/api/map.json',
      abort.signal,
    )
    if (!data || !mounted) return
    points = data.points
    pointBySlug = new Map(points.map((p) => [p.slug, p]))
    // Resolved once per payload, not per frame: which place a story belongs to
    // is a fact about the story.
    placeIndex = buildPlaceIndex(points)
    const end = liveEdge(data.window.end)
    scrubNow = end
    windowStart = data.window.start
    windowEnd = end
    corpusStart = data.window.start

    timeline = createTimeline({
      start: data.window.start,
      end,
      onChange: onScrub,
      lead: marketStrip.element,
    })
    timeline.setPoints(points)
    container.append(timeline.element)
    placeMarketStrip()
    watchChrome()
    paintTrends()
    refresh()
    coreLoaded = true
    openSharedStory()
  }

  /**
   * A shared link's landing: fly to the story and open its card.
   *
   * Runs once, here, because this is the first moment `pointBySlug` means
   * anything — before `/api/map.json` lands, "is this story on the map" has no
   * answer, and asking early would answer *no* for every link.
   *
   * **A slug that is not here leaves for the article.** The map holds fourteen
   * days; a link passed around for a fortnight and a day is a link to a story
   * that is genuinely not on this surface any more. Landing on the map with
   * nothing open would show a stranger something other than what was shared,
   * which is the one thing a share route must never do. `replace`, not `assign`,
   * so the back button returns to wherever the link was opened from rather than
   * to a map that is about to redirect again.
   *
   * **The range widens if it has to.** The map opens on 3d, so a story from last
   * Tuesday would fly the camera to a card whose beacon is outside the visible
   * slice — the mark missing under its own card. `flyToStory` deliberately does
   * not check the scrubber, because a reader asking for a story by name has
   * overruled the filters; a *shared* link is the same request made by someone
   * who has not seen the filters at all. So the slice moves to admit it, and the
   * chip row is told, because a row still reading `3d` over a fortnight of
   * beacons is a legend contradicting its own map.
   */
  const openSharedStory = () => {
    if (!sharedStory || sharedDone) return
    // Two independent arrivals have to have happened: `/api/map.json`, which is
    // what makes `pointBySlug` mean anything, and MapLibre's `load`, which is
    // what creates the popup. Neither waits on the other, so whichever lands
    // second calls this — and the first call returns here. Without the second
    // condition the camera flew to the story and no card ever opened, because
    // `popup?.preview` and `popup?.open` were both optional-chaining past a
    // `null` that would exist a few hundred milliseconds later.
    if (!coreLoaded || !popup) return
    sharedDone = true
    const p = pointBySlug.get(sharedStory)
    if (!p) {
      location.replace(`/a/${sharedStory}`)
      return
    }
    const age = scrubNow - p.t
    if (age > rangeHours * 3_600_000) {
      // The narrowest range that still admits it, rather than always the widest:
      // a story from yesterday should not open the map on 90d.
      const fit = RANGES.find(([, hours]) => age <= hours * 3_600_000)
      setRange(fit ? fit[1] : RANGES[RANGES.length - 1][1])
    }
    flyToStory(p)
  }

  /**
   * Shared by the scrubber built on load and the one a refresh replaces it
   * with, so the two cannot drift.
   *
   * `live` is deliberately not cached here. It used to be, and the cache was
   * wrong until the reader first touched the scrubber: this fires only on a
   * gesture, so on load the flag was an assumption. A refresh read it, decided
   * the reader had scrubbed away, and left them pinned to the old window with
   * the new stories invisible — the button reporting "+1 new" over a rail that
   * did not have it. `timeline.isLive()` is asked at the moment it matters.
   */
  function onScrub(now: number, _live: boolean) {
    scrubNow = now
    refresh()
  }

  /**
   * How far behind the present the conflict feed is.
   *
   * UCDP publishes months in arrears. Saying so turns a layer that would
   * otherwise read as a live war map into what it is — a dated record.
   */
  const conflictWindowLabel = () => {
    if (!conflictNewest) return null
    const days = Math.round((Date.now() - conflictNewest) / 86_400_000)
    if (days < 14) return null
    const months = Math.round(days / 30)
    return months >= 2 ? `feed trails by ~${months} months` : `feed trails by ~${days} days`
  }

  /** Runs work once the main thread is free, with a deadline so it still runs. */
  const whenIdle = (fn: () => void, timeout = 4000) => {
    if (!mounted) return
    const guarded = () => {
      if (mounted) fn()
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(guarded, { timeout })
    else setTimeout(guarded, 1200)
  }

  const loadLayers = async () => {
    const [g, c, gen, mk, th, ipc] = await Promise.all([
      json<{ alerts: GdacsAlert[]; details?: Record<string, GdacsDetail> }>(
        '/api/gdacs.json',
        abort.signal,
      ),
      json<{ chokepoints: MapChokepoint[] }>('/api/chokepoints.json', abort.signal),
      json<{ situations: GenocideSituation[] }>('/api/genocide.json', abort.signal),
      json<{ exchanges: MapExchange[] }>('/api/markets.json', abort.signal),
      // Tens of events, a few KB. In the main batch rather than idle-deferred
      // like the conflict feed: this is a visible layer whose marks sit on top
      // of the beacons, and arriving a second late reads as a glitch rather
      // than as loading.
      json<{ events: ThermalEvent[] }>('/api/firms.json', abort.signal),
      // 34 KB, in the main batch alongside `genocide` rather than idle-deferred
      // like the conflict feed. Not a size judgement — it is smaller than the
      // markets payload that also rides here — but a kind one: this and genocide
      // are the map's two determination layers, and a reader who sees one mark
      // over Gaza appear a second before the other is watching the map disagree
      // with itself about what it knows.
      json<{ areas: IpcArea[] }>('/api/ipc.json', abort.signal),
    ])
    if (!mounted) return
    if (g?.alerts) gdacs = g.alerts
    // Shipped in the same blob the alerts arrive in — no extra request, and it
    // was already on the wire before anything read it.
    if (g?.details) gdacsDetails = g.details
    if (c?.chokepoints) chokepoints = c.chokepoints
    // Two features and no dependants — it rides along with the other two
    // rather than earning a request of its own.
    if (gen?.situations) genocide = gen.situations
    // Thirty exchanges with a quarter of closes each — ~90 KB, small enough to
    // ride along with the other three rather than earn its own request or an
    // idle deferral like the conflict feed.
    if (mk?.exchanges) {
      markets = mk.exchanges
      marketStrip.update(markets)
      marketStrip.setVisible(layersOn.markets)
    }
    if (th?.events) thermal = th.events
    if (ipc?.areas) famine = ipc.areas.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng))
    setOverlayData()
    // The disasters and straits chips have nothing to draw until this lands;
    // the story chips were painted from `map.json` several hundred milliseconds
    // ago and are repainted here for free rather than tracked separately.
    paintTrends()
  }

  // The conflict feed is the largest payload the map pulls — a quarter of a
  // megabyte of UCDP records, most of it prose the map never draws — and it
  // describes events months old. Racing it against the geometry of the current
  // view costs a visibly longer first paint for a layer nobody is waiting on.
  const loadConflict = () => {
    whenIdle(() => {
      void (async () => {
        const k = await json<{ events: ConflictEvent[] }>('/api/conflict.json', abort.signal)
        if (!mounted || !k?.events) return
        conflicts = k.events.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
        for (const e of conflicts) {
          const t = Date.parse(e.eventDate)
          if (Number.isFinite(t) && t > conflictNewest) conflictNewest = t
        }
        setOverlayData()
      })()
    }, 6000)
  }

  // 85 KB of prose that nothing displays until a marker is hovered. Fetching it
  // alongside the map's own data put it in competition with the geometry the
  // first paint actually needs, so it waits for the main thread to go quiet.
  const loadLeads = () => {
    whenIdle(() => {
      void (async () => {
        const data = await json<{ leads: Record<string, string> }>(
          '/api/map-leads.json',
          abort.signal,
        )
        if (data?.leads && mounted) leads = data.leads
      })()
    })
  }

  /**
   * Inland water, after the coastline it belongs to.
   *
   * GeoJSON expands TopoJSON's shared arcs, so 52 KB and 54 KB of source
   * become 104 KB and 101 KB on the wire — 205 KB against the coastline's
   * 546 KB, which would make the first paint 37% heavier for detail that is
   * not why anyone opens this map. Simplification does not recover it: at a
   * tolerance loose enough to matter the lakes start to show it, and the
   * rivers barely respond at all because their vertices are already sparse.
   * So the answer is when rather than how much, the same one the conflict
   * feed and the lead sentences got.
   *
   * One request for both — they are drawn together, neither is useful without
   * the other, and two idle callbacks racing each other is two chances to land
   * mid-gesture. `setData` takes a parsed object: MapLibre 6 dropped the URL
   * form, and a string handed to it makes no request and throws nothing, which
   * is how the coastline tier swap stayed dead for a while.
   */
  const loadWater = () => {
    whenIdle(() => {
      void (async () => {
        const [lakes, rivers] = await Promise.all([
          json<FeatureCollection>(basemapUrl('lakes.geojson', basemapV), abort.signal),
          json<FeatureCollection>(basemapUrl('rivers.geojson', basemapV), abort.signal),
        ])
        if (!mounted) return
        if (lakes) (map.getSource('lakes') as GeoJSONSource | undefined)?.setData(lakes)
        if (rivers) (map.getSource('rivers') as GeoJSONSource | undefined)?.setData(rivers)
      })()
    }, 6000)
  }

  /**
   * The star catalogue, after everything the map is for.
   *
   * ~45 KB gzipped of positions, magnitudes, colours and names — the same
   * treatment the water, the conflict feed and the lead sentences get, and for
   * the stronger version of the same reason: the sun, the moon and the
   * atmosphere are arithmetic and are drawn from the first frame, so what waits
   * here is the one part of the sky nobody is looking for yet.
   *
   * A failed or absent fetch is a globe with a sun, a moon and no stars. That
   * is a complete picture, so there is nothing to report and nothing to retry.
   */
  const loadStars = () => {
    whenIdle(() => {
      void (async () => {
        const data = await json<unknown>(basemapUrl('stars.json', basemapV), abort.signal)
        if (!data || !mounted) return
        sky.setCatalogue(data)
        sky.draw()
      })()
    }, 8000)
  }

  /**
   * Check for new stories in place.
   *
   * The reader has built a view — a camera, a time slice, a set of categories,
   * maybe an open card — and a reload discards all of it to answer one
   * question. This asks that question and keeps the view.
   *
   * What it will not do is move the reader. If they are parked at the live edge
   * the scrub head follows the new end of the window, because that is what live
   * means; if they have scrubbed back to Tuesday they stay on Tuesday, and the
   * new stories are simply there when they come forward. Silently snapping a
   * scrubbed reader to now would be the same class of mistake as the old
   * dwell-to-fly: the map moving somewhere nobody asked it to go.
   */
  const refreshStories = async () => {
    if (refreshing || !mounted) return
    refreshing = true
    feed.setRefreshState('busy')
    try {
      const data = await json<{ window: { start: number; end: number }; points: MapPoint[] }>(
        '/api/map.json',
        abort.signal,
        true,
      )
      if (!data || !mounted) {
        feed.setRefreshState('error')
        return
      }

      const before = new Set(points.map((p) => p.slug))
      const fresh = data.points.filter((p) => !before.has(p.slug))
      // The archive is *kept*, not refetched and not dropped. This used to be a
      // bare `points = data.points`, which was right while `map.json` was the
      // whole corpus and is a regression the moment anything older has been
      // merged into it: a reader on 90d who pressed refresh would have watched
      // three months of beacons collapse back to a fortnight, and the button
      // exists precisely so that pressing it costs the reader nothing.
      points = archivePoints.length
        ? [...archivePoints.filter((p) => !data.points.some((q) => q.slug === p.slug)),
           ...data.points].sort((a, b) => a.t - b.t)
        : data.points
      pointBySlug = new Map(points.map((p) => [p.slug, p]))
      // Resolved once per payload, not per frame: which place a story belongs
      // to is a fact about the story.
      placeIndex = buildPlaceIndex(points)

      // The scrub head is the reader's, except at the live edge. Asked, never
      // assumed — see `onScrub`.
      const wasLive = timeline ? timeline.isLive() : true
      // Now, for the same reason as on load — and it advances between presses,
      // so a refresh rebuilds the rail even when the story set is unchanged.
      // That is the point: the head of the rail is where the reader is
      // standing, and a scrubber that stopped tracking the clock after the
      // first paint would drift out of step with the header over a long visit.
      const end = liveEdge(data.window.end)
      corpusStart = Math.min(corpusStart || data.window.start, data.window.start)
      windowEnd = end
      const start = railStart()

      if (timeline && (start !== windowStart || end !== windowEnd)) {
        rebuildTimeline(start, end)
      } else {
        timeline?.setPoints(points)
      }

      windowStart = start
      if (wasLive) scrubNow = end
      paintTrends()

      // Only when something arrived: the lead prose is 85 KB and re-fetching it
      // to learn nothing changed is exactly the cost this button exists to
      // avoid. Revalidated for the same reason the point set is.
      if (fresh.length) {
        void (async () => {
          const l = await json<{ leads: Record<string, string> }>(
            '/api/map-leads.json',
            abort.signal,
            true,
          )
          if (l?.leads && mounted) leads = l.leads
        })()
      }

      refresh()
      feed.setRefreshState(fresh.length)
    } finally {
      refreshing = false
    }
  }

  /**
   * Pushes the current metric onto the country features as feature state.
   *
   * Must be re-run after every `setData` on the `countries` source, and there
   * are two reasons rather than one. The obvious one is that feature state does
   * not reliably survive a source's data being replaced. The load-bearing one
   * is that the three coastline tiers are not the same feature set — 110m
   * carries 176 countries, 10m carries 255 — so the finer tiers bring in
   * features that never had state set on them at all. A tint applied once at
   * load would thin out as the reader zoomed, which is exactly the class of
   * silent failure the tier swap itself shipped with.
   */
  /**
   * Whether the current metric has been painted onto the current source data.
   *
   * Without this the `sourcedata` listener is a loop: `setFeatureState` is
   * itself a source-data change, so applying the metric re-fires the event that
   * applied it, ~170 times per pass, and the map never finishes a frame — the
   * canvas came up blank. Cleared when the data underneath changes (a coastline
   * tier swap) or when the metric does, which are the only two moments the
   * paint can actually go stale.
   */
  let metricApplied = false

  /**
   * Takes "Drawing the world…" down the moment the world is actually drawn.
   *
   * The label used to be removed by `applyMetric`, on the reasoning that the
   * coastline is up as soon as its source has loaded. It is not.
   * `isSourceLoaded('countries')` does not mean "the land has painted", it
   * means "every tile this source owes the current viewport has arrived" — and
   * against 1.6 MB and 99k points on a worker also parsing the conflict feed,
   * the lakes, the rivers and the metric, that lands far later than the first
   * paint. Measured against the built map: **land rendered at 10 s, story
   * beacons at 14 s, `isSourceLoaded` first true at 21 s.** So for eleven
   * seconds the reader saw a finished globe, its coastlines, its countries and
   * its stories, with a line of type over the middle of it saying the world
   * was still being drawn — the one state this label exists to deny. It is
   * worse on a cold connection, where it is the whole first impression, and it
   * is indistinguishable from a map that has failed.
   *
   * There is no event for "a layer has painted", so the condition is asked
   * rather than awaited, on two signals that are already cheap: `idle`, which
   * this island listens to anyway, and `sourcedata` for `countries`. Both
   * detach on the first success, so the query runs a handful of times and never
   * again.
   *
   * **`getLayer` is checked first, and that is not defensive noise.**
   * `queryRenderedFeatures` against a layer id the style does not have fires a
   * MapLibre `ErrorEvent`, and this map deliberately registers no `error`
   * listener — so `Evented.fire` prints it to `console.error`, which is exactly
   * what `scripts/perf/probe.mjs` treats as a failed run. A plain lookup asks
   * the same question and fires nothing.
   */
  const clearLoading = () => {
    if (!loading.isConnected) return
    if (!map.getLayer('land')) return
    if (map.queryRenderedFeatures({ layers: ['land'] }).length === 0) return
    loading.remove()
    map.off('idle', clearLoading)
    map.off('sourcedata', onLoadingProbe)
  }
  /** Narrows the `sourcedata` firehose to the source the label is waiting on. */
  const onLoadingProbe = (e: { sourceId?: string }) => {
    if (e.sourceId !== 'countries') return
    clearLoading()
  }
  map.on('idle', clearLoading)
  map.on('sourcedata', onLoadingProbe)

  const applyMetric = () => {
    // `load` means the *style* is ready, not that a GeoJSON source has fetched
    // and parsed its data — countries.geojson is 210 KB over the network. Feature
    // state addressed at an unloaded source throws, and because the caller is a
    // `void`-ed async function the rejection went nowhere: the land stayed flat
    // and the legend below it never rendered, with nothing in the console. The
    // `sourcedata` listener re-runs this the moment the source is ready.
    if (metricApplied) return true
    if (!map.getSource('countries') || !map.isSourceLoaded('countries')) return false
    // The label is not this function's business — see `clearLoading`. It was
    // removed here, and the sentence justifying it ("the coastline is on screen
    // the moment its source is loaded") is the part that turned out to be
    // false: `isSourceLoaded` is not "the coastline has painted", it is "every
    // tile this source owes the viewport has arrived", which on 1.6 MB and 99k
    // points parsed against a contended worker lands **long** after the world
    // is on screen. Measured against the built map: land features rendered at
    // 10 s, story beacons at 14 s, `isSourceLoaded` first true at 21 s — so a
    // finished map wore "Drawing the world…" for eleven seconds. Kept as a
    // backstop only: `clearLoading` will normally have run already, and
    // `remove()` on a detached node is a no-op.
    clearLoading()
    metricApplied = true
    // Clearing first is what makes switching metrics correct: a country with a
    // figure for press freedom but none for Gini would otherwise keep its old
    // shade and quietly assert a value the new metric doesn't have for it.
    //
    // It takes the hover bit with it, since that lives in the same state map —
    // so the tracker has to be told, or `writeCountryHover` would compare
    // against an id it believes is still written, skip the write, and leave the
    // country under the pointer unlit until the reader moved to a different one.
    map.removeFeatureState({ source: 'countries' })
    countryHoverWritten = null
    if (!metric) return true
    for (const [iso2, entry] of Object.entries(metric.values)) {
      map.setFeatureState({ source: 'countries', id: iso2 }, { p: entry.p })
    }
    return true
  }

  /**
   * Paints the metric as soon as the countries source can take it.
   *
   * `load` only promises the style, and countries.geojson is 210 KB fetched
   * over the network, so the first attempt usually finds the source empty.
   * The wait is `once('idle')` and not `on('sourcedata')`: `setFeatureState` is
   * itself a source-data change, so a sourcedata listener re-enters itself
   * ~170 times per pass and the map never completes a frame — that mistake
   * shipped a blank canvas. `idle` fires after the frame settles, `once`
   * unsubscribes immediately, and `metricApplied` makes a second call free.
   */
  const scheduleMetric = () => {
    if (applyMetric()) return
    // Wait for the source, not for a number of frames.
    //
    // This counted `idle` events — thirty of them — because a single
    // `once('idle')` was enough against a 210 KB, 176-feature coastline and is
    // not enough against 1:50m: 1.6 MB and 99k points, parsed on a worker. But
    // a count of idles is a wall-clock race wearing a counter's clothes. On a
    // slow machine, or once the overlays became symbol layers and each frame
    // began running a placement pass, thirty idles can elapse inside the first
    // second — while the worker is still parsing. The retries then stop, and
    // the world stays unshaded and *fully hatched*, which reads as "no data for
    // anywhere" rather than as "still loading". That is exactly the failure the
    // bound was added to prevent.
    //
    // `sourcedata` is the actual signal, and it is safe here now in a way the
    // old comment feared: `setFeatureState` is itself a source-data change, so
    // a naive listener re-enters ~170 times per pass and the map never
    // completes a frame. `applyMetric` sets `metricApplied` *before* it writes
    // any state, so the re-entrant call returns on its first line and the
    // listener detaches. At most one extra pass, and no ceiling to run out of.
    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (!mounted) {
        map.off('sourcedata', onSourceData)
        return
      }
      if (e.sourceId !== 'countries' || !e.isSourceLoaded) return
      if (applyMetric()) map.off('sourcedata', onSourceData)
    }
    map.on('sourcedata', onSourceData)
  }

  /**
   * A country's standing on the metric currently shading the land.
   *
   * Read from the payload the island is already holding, so the card cannot
   * name a metric other than the one on screen — and returns a row even where
   * there is no figure, because a hatched country is exactly the case a reader
   * needs told in words. Null only before the first metric has landed.
   */
  const standingFor = (iso: string): CountryStanding | null => {
    if (!metric) return null
    const entry = metric.values[iso]
    return {
      label: metric.label,
      value: entry?.v ?? null,
      rank: entry?.r ?? null,
      total: metric.total,
      p: entry?.p ?? null,
      description: metric.description,
    }
  }

  /** Fetches a metric and paints it. Leaves the land alone if it can't. */
  const loadMetric = async (key: string) => {
    const data = await json<MetricPayload>(`/api/metric/${key}.json`, abort.signal)
    if (!mounted) return
    if (!data) {
      // The select has already moved to the metric the reader picked. Putting
      // it back is the honest answer to a fetch that failed: a picker naming
      // one metric over land still shaded by another is the map lying about
      // what it is showing.
      groundSelect.value = metricKey
      return
    }
    metricKey = key
    metric = data
    // Legend first. It describes the metric, not the paint, so it should not be
    // hostage to whether the source happens to have finished loading.
    renderMetricKey()
    metricApplied = false
    scheduleMetric()
  }

  // --- Lifecycle ----------------------------------------------------------
  map.once('load', () => {
    // The style can finish after the island has been torn down — a fast
    // navigation away is enough. Everything below assumes a live document.
    if (!mounted) return
    popup = createStoryPopup(map, {
      // The card's own × button is inside MapLibre's DOM, so without this the
      // island never learned the story had been dismissed: `openSlug` stayed
      // set and `flyToStory`'s "already open" guard swallowed the next click
      // on that same beacon.
      onClose: () => {
        if (!openSlug) return
        openSlug = null
        feed.highlight(hoverSlug)
      },
      // A country tag in the story's prose opens in the card now, and it leads
      // with whatever the land is shaded by — the same rule the map's own
      // country card follows.
      standingFor,
      /**
       * A row naming another story flies to it instead of leaving for it.
       *
       * The card holds two such lists — a country's recent coverage, and the
       * stories citing an indicator — and only the island knows whether a
       * given slug is on the map at all. `pointBySlug` is the loaded fortnight;
       * anything older is genuinely not here, and the row stays the link it
       * already was rather than becoming a click that does nothing.
       *
       * No filter or scrubber check: the reader asked for *this* story by name,
       * and refusing it because its category chip is unlit or its day is behind
       * the scrub head would be the map overruling an explicit request. The
       * flight lands, the card opens, and the beacon appears the moment the
       * slice admits it again.
       */
      openStory: (slug) => {
        const p = pointBySlug.get(slug)
        if (!p) return false
        flyToStory(p)
        return true
      },
      /**
       * The stories at a place, resolved against the loaded window.
       *
       * `StoryPlace` carries slugs and a count, deliberately — it is the shape
       * the field and the numeral read, and the card is the only thing that
       * needs headlines. `pointBySlug` is right here, so nothing is fetched.
       */
      storiesAt: (place) =>
        place.slugs.map((slug) => pointBySlug.get(slug)).filter((p): p is MapPoint => !!p),
    })
    addDataLayers()
    wireInteraction()
    applyPadding()
    drawSolar()
    applyRefresh()
    openSharedStory()
    // The land tint needs the countries source to have finished loading, which
    // `load` does not promise for a GeoJSON source fetched over the network —
    // and the tier swap replaces that data twice more as the reader zooms in,
    // bringing 176 features up to 255. Every one of those moments needs the
    // state re-applied, so listen for the source settling rather than trying to
    // guess when it has.
    void loadLayers()
    void loadMetric(metricKey)
    loadConflict()
    loadLeads()
    loadWater()
    loadStars()
    // The sky's canvas has a box only once MapLibre has laid the host out, so
    // it is measured here rather than at construction. The first paint is a
    // sun, a moon and an atmosphere; the stars arrive with `loadStars`.
    sky.resize()
    sky.draw()
    // Currencies, metals and crypto for the ribbon.
    //
    // `/api/trends.json` already carries all of it — the ummah currency basket,
    // gold and the crypto tier — so this is a read of something the build
    // publishes rather than a new source. 12 KB gzipped, and nothing on screen
    // waits for it, so it goes behind the idle callback with the metric index.
    //
    // Silver is the one thing asked for that is not in there: nothing in the
    // registry fetches it. It is listed in the ribbon's table anyway and simply
    // does not render, so the day a silver series exists it appears without a
    // second edit — the same treatment `market-metadata.js` gives the thirteen
    // exchanges the free data commons does not reach.
    whenIdle(() => {
      void (async () => {
        const t = await json<{ indicators: TrendIndicator[] }>(
          '/api/trends.json',
          abort.signal,
        )
        if (!mounted || !t?.indicators) return
        marketStrip.setTrends(t.indicators)
      })()
    })
    // The picker only needs a list of names, and nothing depends on it until
    // the reader reaches for it — so it waits for the main thread to go quiet.
    whenIdle(() => {
      void (async () => {
        const idx = await json<{ metrics: MetricIndexEntry[] }>(
          '/api/metric/index.json',
          abort.signal,
        )
        if (!idx?.metrics || !mounted) return
        metricIndex = idx.metrics
        buildMetricPicker()
      })()
    })
  })

  buildRanges()
  buildFilters()
  updateClock()
  const clockTimer = window.setInterval(updateClock, 30_000)
  const sunTimer = window.setInterval(drawSolar, SUN_TICK_MS)

  /**
   * Publish the two chrome sizes that CSS cannot measure for itself.
   *
   * It was a magic number, and it had already drifted: "whole world" sat at a
   * hardcoded `bottom: 5.5rem`, which cleared the scrubber as it stood the day
   * it was written. The scrubber has since grown a markets strip and a money
   * ribbon that *wraps*, so its height runs from **97px at 1920 to 228px at
   * 360**, and 88px cleared none of them: the button landed on the time readout
   * and covered the Hijri date outright at every desktop size.
   *
   * Measured rather than guessed because it depends on the rendered text — the
   * ribbon's wrap point moves with the viewport. A number typed into the
   * stylesheet is right only for the layout it was typed against.
   *
   * There were two. `--map-status-w` published the clock's width, because on the
   * top strip the clock was painted *over* the HUD rather than laid out in it
   * and every row had to reserve that much `padding-right` or the chips ran
   * underneath — which is how "genocide" and the time printed through each other
   * between about 1220px and 1330px. The strip is the phone's layout now and the
   * phone has no clock, so there is nothing left to clear.
   *
   * **On `body`, not on the container** (2026-07-30). `.map-sheet` is appended
   * to `document.body` by `createSheet`, so a property published on `.map-root`
   * never reached it — which is how the peek card kept its own hardcoded
   * `bottom: 5.5rem` long after `.map-reset` was fixed: pointing it at
   * `--map-scrub-h` would have silently resolved to the fallback and changed
   * nothing. `body.map-page` is where the phone layout's three coupled heights
   * already live, and everything inside the map inherits from it.
   */
  const measureChrome = () => {
    const scrub = timeline?.element
    if (scrub) {
      document.body.style.setProperty('--map-scrub-h', `${Math.round(scrub.offsetHeight)}px`)
    }
  }

  /**
   * Which end of the map the money readout sits at.
   *
   * Two parents, and the choice has to be re-made rather than made once: the
   * scrubber is rebuilt from scratch whenever a refresh moves the window, and a
   * rebuild hands `lead` to the *new* head — so a strip that had been moved to
   * the rail would silently return to the scrubber the first time a story
   * arrived, taking the whole width negotiation back with it. Re-placing after
   * every rebuild and every resize is the only version of this that stays true.
   *
   * `append` and `prepend` move the node rather than copying it, so there is
   * never a second strip to keep in step — which matters, because
   * `marketStrip.update` writes into whichever one it is holding.
   *
   * The dock goes with it, because the detail panel's placement is a fact about
   * where the strip is standing: a drawer under the bar at the top, a popover
   * over the scrubber at the foot.
   */
  const placeMarketStrip = () => {
    const wide = wideQuery.matches
    if (wide) moneyBox.append(marketStrip.element)
    else timeline?.head.prepend(marketStrip.element)
    // The dock is the *rail*, not the box the strip sits in. `placePanel`
    // anchors the panel's outer edge to the dock's inner one, and the money box
    // is inside the rail's padding — docking to it put the panel's right edge
    // 9px inside the rail, measured, which reads as a panel that failed to
    // clear the thing it came out of rather than as one attached to it.
    marketStrip.setDock(wide ? hud : null)
  }

  // The scrubber is replaced wholesale when a refresh moves the window, so the
  // observer follows the current element rather than holding the first one.
  const chromeObserver = new ResizeObserver(measureChrome)
  const watchChrome = () => {
    chromeObserver.disconnect()
    if (timeline?.element) chromeObserver.observe(timeline.element)
    measureChrome()
  }
  watchChrome()

  const onResize = () => {
    // Before `map.resize()`, never after: the class decides whether there is a
    // third grid column, so the canvas the resize measures is only the right one
    // once the layout has settled. Reversed, every resize across the phone
    // breakpoint sizes the drawing buffer to the previous layout and the map
    // draws into a frame that is a rail too wide until the next resize event
    // happens to come.
    syncWide()
    placeMarketStrip()
    // MapLibre sizes its drawing buffer from the container, and nothing else
    // here tells it the container moved — `applyPadding` and `globeFitZoom`
    // both *read* dimensions, they don't apply them. Without this the canvas
    // kept whatever size it was built at: widen the window and the map went on
    // drawing into a 900px corner of a 1544px frame, with dead space beside it.
    map.resize()
    // After `map.resize()`, because the sky's own canvas is sized off its
    // rendered box and that box is the one MapLibre just settled. It re-reads
    // `devicePixelRatio` too — a window dragged to a second monitor changes it
    // without changing a single CSS pixel.
    sky.resize()
    sky.draw()
    measureChrome()
    applyPadding()
    // "Whole world" has to keep meaning the whole world after a resize, or the
    // reset lands on a view sized for a window that no longer exists.
    HOME_VIEW.zoom = fitZoom(HOME_CENTER[1])
    // Widening the window leaves the camera at a zoom the new canvas no longer
    // suits — on the flat half a world narrower than its canvas comes back
    // doubled, and on the round half the globe simply stops filling the frame.
    // Moving the floor re-clamps the live camera as well, so the fix applies to
    // the view the reader is already looking at and not just to the next reset.
    map.setMinZoom(HOME_VIEW.zoom)
    syncResetButton()
  }
  window.addEventListener('resize', onResize, { passive: true })

  /**
   * The same path, driven by the box rather than by the window.
   *
   * `window.resize` is the event for "the viewport changed", and it is not the
   * same statement as "this element changed size" — a page zoom, a virtual
   * keyboard, a browser UI that resizes the tab without a resize event, all
   * move this box without necessarily firing it. That gap is expensive here in
   * a way it was not before: the layout *branches* on the box (`syncWide`,
   * `placeMarketStrip`), so a missed event does not merely leave a stale
   * measurement, it leaves the wrong layout — a rail standing in a window with
   * no room for it, or a phone with the money readout in two places.
   *
   * Safe against the obvious loop: this observes `.map-root`, which is `inset:
   * 0` on a fixed parent and therefore sized by the viewport alone. Nothing
   * `onResize` does — `map.resize()`, the class, the padding — can change it,
   * so the callback cannot re-arm itself.
   */
  const rootObserver = new ResizeObserver(onResize)
  rootObserver.observe(container)

  /**
   * The two seams.
   *
   * Built here rather than beside the rails they bound, because what a seam
   * needs is not either rail — it is `onResize`, the one function that knows
   * everything a width change invalidates: the drawing buffer, the camera's
   * floor and the chrome measurements. Dragging the story rail wide enough eats
   * into what the instrument rail leaves the canvas, so a drag on the left is a
   * layout change on the right; running the same path a window resize runs is
   * what makes that come out right instead of leaving one rail sized for a
   * layout the other has left.
   *
   * `edge()` reads the seam's live position rather than the rail's width,
   * because the two are only equal when the reader has not dragged yet — and a
   * drag that starts by snapping the pane to the pointer is a drag that throws
   * away wherever they grabbed it.
   */
  const seams: PaneSeam[] = [
    createPaneSeam({
      side: 'left',
      prop: '--map-rail-user',
      id: 'rail',
      name: 'story list',
      edge: () => feed.element.getBoundingClientRect().width,
      onChange: onResize,
    }),
    createPaneSeam({
      side: 'right',
      prop: '--map-aside-user',
      id: 'aside',
      name: 'instruments',
      // This one narrows rather than disappears — the money block stays as a
      // spine of sparklines. See the stylesheet's `body.map-aside-off`, and the
      // note on `verbs` for why the button must not go on saying "show".
      verbs: { off: 'Expand', on: 'Collapse' },
      edge: () => hud.getBoundingClientRect().width,
      onChange: onResize,
    }),
  ]
  container.append(...seams.map((s) => s.element))

  void loadCore()

  const onKeyDown = (e: KeyboardEvent) => {
    // `e.target` is only an Element when something focusable has focus — a key
    // event delivered straight to `document` is not one, and calling `matches`
    // on it threw a TypeError out of the global handler, taking Escape down
    // with it. Testing what the target *is* says that, where an optional call
    // only papered over it.
    const target = e.target
    if (target instanceof HTMLElement && target.matches('input, textarea, select')) return
    /**
     * `[` and `]` fold the rail on that side.
     *
     * The bracket keys because they point at the edge they act on, which is the
     * only mnemonic available for a control with no letter of its own — and
     * because they are unmodified keys this page has no other use for. Guarded
     * on the modifiers regardless: `Ctrl+]` and `Cmd+]` are browser navigation
     * and a page-level handler swallowing them is a page that has broken the
     * back button.
     */
    if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      seams[e.key === '[' ? 0 : 1]?.toggle()
      e.preventDefault()
      return
    }
    if (e.key !== 'Escape') return
    // Escape closes what is open; with nothing open it means "get me out of
    // here", which on a map is the whole world. Innermost first — the layers
    // panel and the story list are over the map, so they go before the view.
    if (more.classList.contains('is-open')) {
      setMoreOpen(false)
      moreBtn.focus()
      return
    }
    if (feed.isExpanded()) {
      feed.setExpanded(false)
      return
    }
    if (popup?.isOpen() || sheet.isOpen()) {
      openSlug = null
      popup?.close()
      feed.highlight(null)
      sheet.close()
      return
    }
    if (!resetBtn.hidden) resetView()
  }
  resetBtn.addEventListener('click', resetView)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', onWordmarkClick)

  return () => {
    mounted = false
    abort.abort()
    clearInterval(clockTimer)
    clearInterval(sunTimer)
    if (refreshFrame) cancelAnimationFrame(refreshFrame)
    clearPeekClose()
    chromeObserver.disconnect()
    rootObserver.disconnect()
    sky.destroy()
    window.removeEventListener('resize', onResize)
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('click', onWordmarkClick)
    document.body.classList.remove('map-wide')
    for (const seam of seams) seam.destroy()
    timeline?.destroy()
    feed.destroy()
    popup?.destroy()
    sheet.destroy()
    // Missing for as long as the strip has existed. Its panel is a `<dialog>`
    // on `document.body`, so `container.replaceChildren()` below never took it,
    // and it registers three listeners — `keydown`, a capture-phase
    // `pointerdown` and `resize` — that outlived every teardown. Nothing caught
    // it because `map-island.test.js` asserts `dialog.map-sheet` is gone from
    // the body and never asked about this one; it does now.
    marketStrip.destroy()
    map.remove()
    // The other half of `prewarm`. The pool it created is process-wide and
    // outlives the map, so without this a torn-down island leaves a worker
    // running for a page that no longer has a map on it. Strictly after
    // `map.remove()`, since it frees resources a live map is still using.
    clearPrewarmedResources()
    container.replaceChildren()
    container.classList.remove('map-root')
    // `measureChrome` writes this onto `body` so the sheet — which lives
    // outside the container — can read it. Teardown used to be free because
    // clearing the container took it with it; now it has to say so.
    document.body.style.removeProperty('--map-scrub-h')
  }
}
