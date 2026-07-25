// The homepage situational map.
//
// MapLibre GL renders a real, labelled basemap — filled countries, borders,
// country and place names — from GeoJSON and SDF glyphs we host ourselves. No
// tile provider, no API key, no third-party request; the CSP stays
// `default-src 'none'` apart from the blob: worker MapLibre spawns.
//
// Over that sit the pipeline's own layers: every geo-located story from the
// last 14 days, coloured by category and clustered by MapLibre, plus the GDACS
// disaster and maritime-chokepoint feeds. A left rail lists the same stories in
// time order — the map says where, the rail says what.

// maplibre-gl v6 ships named ESM exports only — there is no default export.
// The bundler resolves it to the copied vendor file rather than inlining it, so
// the engine is fetched once and shared with the worker it spawns.
import {
  Map as MapLibreMap,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type PointLike,
} from 'maplibre-gl'
// `GeoJSON.*` was being reached for as a UMD global, which @types/geojson only
// exposes to non-module files — so the namespace never resolved in here.
// Type-only, so esbuild drops it.
import type { FeatureCollection, Point as GeoJSONPoint } from 'geojson'
import {
  basemapUrl,
  buildStyle,
  CATEGORY_COLOUR,
  CATEGORY_ORDER,
  LAND_NO_DATA,
  LAND_RAMP,
  MAP_COLOURS,
  OVERLAY_COLOUR,
} from './_map/style'
import { createFeed, type Feed } from './_map/feed'
import { createTimeline, type Timeline } from './_map/timeline'
import { createSheet, type Sheet } from './_map/sheet'
import { createStoryPopup, type StoryPopup } from './_map/popup'
import { nightPolygon } from './_map/solar'
import {
  CONTESTED_D,
  DEFAULT_METRIC,
  decayAt,
  type ConflictEvent,
  type GdacsAlert,
  type GdacsDetail,
  type MapChokepoint,
  type MapPoint,
  type MetricIndexEntry,
  type MetricPayload,
} from './_map/types'
import { detailKey } from '@shared/gdacs'

const DETAIL_ZOOM = 3.2
/** Where the 1:10m coastline replaces 1:50m — see the zoomend handler. */
const ULTRA_ZOOM = 5.5

/** A Web Mercator world is this wide at zoom 0, and doubles each level. */
const TILE_PX = 512

/** Time-range presets, in hours. `null` means the whole 14-day window. */
const RANGES: Array<[string, number | null]> = [
  ['24h', 24],
  ['3d', 72],
  ['7d', 168],
  ['14d', null],
]

/**
 * The range the map opens on.
 *
 * Opening on the full fortnight showed everything at once, which is the one
 * view where nothing stands out: 764 beacons, most of them cold, burying the
 * dozen stories that broke today. A news map should open on the news. The
 * other ranges are one click away and the scrubber still spans all 14 days.
 */
const DEFAULT_RANGE_HOURS: number | null = 24

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

const json = async <T>(url: string, signal?: AbortSignal): Promise<T | null> => {
  try {
    // No `cache: 'no-cache'`: that forced a revalidation on every load, which
    // both defeated the <link rel=preload> for this exact URL and threw away
    // the stale-while-revalidate the endpoint is served with.
    const res = await fetch(url, { signal })
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
 * Dominant category inside a cluster.
 *
 * `clusterProperties` sums a per-category counter as MapLibre builds the tree,
 * so a cluster knows its own composition without the island re-deriving it.
 * This rides on the disc's rim — the only colour a cluster carries now — and
 * says that a cluster over the Gulf is economy where one over Kyiv is politics.
 * Before it, every cluster was the same grey disc and the category channel
 * vanished entirely the moment two points merged.
 */
const clusterCategory = (): ExpressionSpecification =>
  [
    'case',
    ['all', ['>=', ['get', 'politics'], ['get', 'economy']], ['>=', ['get', 'politics'], ['get', 'science']], ['>=', ['get', 'politics'], ['get', 'tech']]],
    CATEGORY_COLOUR.politics,
    ['all', ['>=', ['get', 'economy'], ['get', 'science']], ['>=', ['get', 'economy'], ['get', 'tech']]],
    CATEGORY_COLOUR.economy,
    ['>=', ['get', 'science'], ['get', 'tech']],
    CATEGORY_COLOUR.science,
    CATEGORY_COLOUR.tech,
  ] as unknown as ExpressionSpecification

/**
 * How many steps the cluster domain is cut into.
 *
 * This used to be the length of a seven-colour cold-to-hot ramp that filled
 * each disc. The ramp is gone: a cluster already prints its own count, so
 * colouring it by that same count said the number twice — once in a numeral
 * anyone can read exactly, once in a hue nobody can decode to better than
 * "warm". Three blurred rings and a kernel-density field underneath said it a
 * third and fourth time. Four glow systems stacked on one coordinate is how
 * London, New York and Islamabad turned into gold blobs.
 *
 * What survives is the *domain*: the rescaling that keeps the size and label
 * curves spending their whole range on the visible set. That was always the
 * load-bearing idea; the colour was decoration on top of it.
 */
const CLUSTER_STEPS = 7

/**
 * Where the ramp's colours land, for a given busiest-cluster size.
 *
 * The stops cannot be constants. Calibrated against the full 14-day corpus they
 * top out near 220, and at that scale the default 24-hour view — a few dozen
 * stories, no cluster above single digits — renders every disc in the coldest
 * two colours: the heat channel switches itself off exactly where the map is
 * most worth reading. So the domain is rebuilt whenever the visible set
 * changes, and the ramp always spends its full range on what is actually there.
 *
 * The curve is a power law rather than linear because cluster sizes are
 * long-tailed: most are small, so the cold end needs the resolution. Stops are
 * forced strictly ascending — `interpolate` rejects a repeated input, which is
 * what a naive rescale produces the moment the domain gets small.
 */
const heatStops = (busiest: number): number[] => {
  const n = CLUSTER_STEPS
  const top = Math.max(n + 1, Math.round(busiest))
  const out: number[] = []
  let prev = 1
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) ** 2.2
    out.push((prev = Math.max(prev + 1, Math.round(2 + (top - 2) * f))))
  }
  return out
}

/** Disc radius across the same domain. */
const clusterRadius = (stops: number[], scale = 1): ExpressionSpecification =>
  [
    'interpolate',
    ['linear'],
    ['get', 'point_count'],
    stops[0], 8 * scale,
    stops[2], 13 * scale,
    stops[4], 20 * scale,
    stops[6], 27 * scale,
  ] as unknown as ExpressionSpecification

/**
 * Rim weight across the domain.
 *
 * With the fill gone, the outline is what carries magnitude alongside the
 * numeral — a hairline on a pair of stories, a firm ring on a capital. It stays
 * a stroke rather than becoming a fill again so the disc reads as a container
 * for its number, not as a blob with a number on it.
 */
const clusterStroke = (stops: number[]): ExpressionSpecification =>
  [
    'interpolate',
    ['linear'],
    ['get', 'point_count'],
    stops[0], 1,
    stops[2], 1.3,
    stops[4], 1.7,
    stops[6], 2.2,
  ] as unknown as ExpressionSpecification

/** Label size across the same domain. */
const countSize = (stops: number[]): ExpressionSpecification =>
  [
    'interpolate',
    ['linear'],
    ['get', 'point_count'],
    stops[0], 10,
    stops[2], 12,
    stops[4], 14.5,
    stops[6], 17,
  ] as unknown as ExpressionSpecification

export function mount(container: HTMLElement, props: { basemap?: string } = {}) {
  /** Cache key for the basemap files — see `basemapUrl`. */
  const basemapV = props.basemap
  container.classList.add('map-root')
  container.removeAttribute('aria-hidden')

  // --- DOM ----------------------------------------------------------------
  const mapEl = document.createElement('div')
  mapEl.className = 'map-canvas-host'

  const hud = document.createElement('div')
  hud.className = 'map-hud'

  const ranges = document.createElement('div')
  ranges.className = 'map-ranges'
  ranges.setAttribute('role', 'group')
  ranges.setAttribute('aria-label', 'Time range')

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
  key.setAttribute('aria-label', 'What the beacons mean')
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
  // A gradient built from the same constants the fill uses, so the key cannot
  // drift from the map: change the ramp and the legend changes with it.
  groundScale.innerHTML =
    `<span class="map-ground-swatch" data-none="1" style="--c:${LAND_NO_DATA}"></span>` +
    `<span class="map-ground-ramp" style="--ramp:${LAND_RAMP.join(',')}"></span>`

  const groundNote = document.createElement('p')
  groundNote.className = 'map-ground-note'

  ground.append(groundSelect, groundScale, groundNote)

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

    const swatch = groundScale.querySelector('.map-ground-swatch')
    if (swatch) {
      swatch.setAttribute(
        'title',
        `No figure for this metric — ${covered} countries shaded, the rest left dark`,
      )
    }
  }

  hud.append(ranges, filters, key, ground)

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

  const status = document.createElement('div')
  status.className = 'map-status'
  const clockEl = document.createElement('span')
  clockEl.className = 'map-clock'
  status.append(clockEl)

  container.append(mapEl, hud, status, resetBtn)

  // --- State --------------------------------------------------------------
  let points: MapPoint[] = []
  /** Slug → point, so hit-testing a marker is a lookup and not a 764-item scan. */
  let pointBySlug = new Map<string, MapPoint>()
  let leads: Record<string, string> = {}
  let gdacs: GdacsAlert[] = []
  /** Population exposure per alert, keyed `${eventtype}:${eventid}`. */
  let gdacsDetails: Record<string, GdacsDetail> = {}
  let chokepoints: MapChokepoint[] = []
  let conflicts: ConflictEvent[] = []
  /** Newest event in the conflict feed — see `conflictWindowLabel`. */
  let conflictNewest = 0

  /** The metric currently tinting the land, and its payload once fetched. */
  let metricKey = DEFAULT_METRIC
  let metric: MetricPayload | null = null
  let metricIndex: MetricIndexEntry[] = []

  const enabled = new Set(CATEGORY_ORDER)
  const layersOn = { gdacs: true, straits: true, conflict: true }
  let rangeHours: number | null = DEFAULT_RANGE_HOURS
  let scrubNow = Date.now()
  let mounted = true
  let detailLoaded = false
  let ultraLoaded = false
  let layersReady = false
  const abort = new AbortController()

  /**
   * The cluster domain — the counts at which disc size, rim weight and label
   * size take each of their steps.
   *
   * Derived from how many stories are showing, not from the corpus: switching
   * to 24h drops the busiest cluster from ~140 to single digits, and a fixed
   * domain would leave that whole view at the bottom of every curve. The
   * proportion is empirical — across ranges, the largest cluster at world zoom
   * runs a little under a fifth of the visible set.
   */
  let stops = heatStops(150)
  const busiestFor = (visible: number) => Math.max(CLUSTER_STEPS + 1, visible * 0.19)

  let hoverSlug: string | null = null
  let openSlug: string | null = null
  /** Which overlay marker the hover sheet is currently previewing. */
  let peekId: string | null = null
  /** ISO2 of the country under the pointer, driving the land highlight. */
  let hoverIso: string | null = null
  let peekCloseTimer: number | null = null
  // The map moves under a stationary pointer during a flight, which would
  // otherwise drag the cursor across other markers and chain more flights.
  let flying = false

  const sheet: Sheet = createSheet()
  let popup: StoryPopup | null = null
  let timeline: Timeline | null = null

  const feed: Feed = createFeed({
    onSelect: (p) => flyToStory(p),
    onHover: (p) => setHoverSlug(p ? p.slug : null),
  })
  container.append(feed.element)

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
   * Floored at 1.35 so a narrow window zooms out no further than the old
   * default.
   *
   * There used to be a 2.4 ceiling here, to stop an ultrawide monitor opening
   * "halfway into a continent" — but 2.4 puts the world at 2702px, so any
   * canvas wider than that got the second copy back, and Australia appeared
   * twice at the right-hand edge. Coverage has to win over framing: a fit zoom
   * is by definition the whole world, and the duplicate is a map that lies
   * about where things are. Anything that wants a gentler opening frame has to
   * come from padding or latitude, not from a zoom the world can't fill.
   */
  const worldFitZoom = () => {
    const w = mapEl.clientWidth || window.innerWidth || 1280
    return Math.max(1.35, Math.log2(w / TILE_PX))
  }

  /** The view the map opens on, and the one the wordmark returns you to. */
  const HOME_VIEW = { center: [12, 22] as [number, number], zoom: worldFitZoom() }

  const map = new MapLibreMap({
    container: mapEl,
    style: buildStyle(basemapV),
    center: HOME_VIEW.center,
    zoom: HOME_VIEW.zoom,
    // The floor is the zoom at which the world still covers the canvas, not a
    // constant. Below it MapLibre draws a second copy of the world rather than
    // letterboxing, so a fixed `1` was an invitation to see Australia twice.
    // Kept in step with the viewport by `onResize`.
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
    // One Earth. `worldFitZoom` sizes the opening view so a single world fills
    // the canvas, and without this MapLibre would still repeat it the moment a
    // reader zoomed out or panned past a pole — a situational map that shows
    // the same conflict twice, in two places, is lying about where things are.
    renderWorldCopies: false,
  })
  map.touchZoomRotate?.disableRotation()

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
  const applyPadding = () => {
    // The style can finish loading after teardown.
    if (!mounted) return
    const rail = feed.element.getBoundingClientRect()
    const canvas = mapEl.getBoundingClientRect()
    const overlap = Math.max(0, Math.min(rail.right, canvas.right) - Math.max(rail.left, canvas.left))
    const covers = rail.bottom > canvas.top && rail.top < canvas.bottom && overlap > 0
    map.setPadding({ top: 0, bottom: 0, right: 0, left: covers ? overlap : 0 })
  }

  // --- Data shaping -------------------------------------------------------
  const visiblePoints = (): MapPoint[] => {
    const from = rangeHours === null ? -Infinity : scrubNow - rangeHours * 3_600_000
    // Tell the rail which slice of itself is on the map.
    timeline?.setWindow(rangeHours === null ? null : from)
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
        a: Math.round((0.35 + 0.65 * decayAt(p.t, scrubNow)) * 100) / 100,
        // Percentile rank from the build, or the neutral "unknown" size.
        w: p.w ?? UNKNOWN_COVERAGE_W,
        contested: (p.d ?? 0) >= CONTESTED_D ? 1 : 0,
        // One-hot counters so `clusterProperties` can sum a cluster's mix.
        politics: p.cat === 'politics' ? 1 : 0,
        economy: p.cat === 'economy' ? 1 : 0,
        science: p.cat === 'science' ? 1 : 0,
        tech: p.cat === 'tech' ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
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

  const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined

  /** Layer toggles are visibility, not data — no rebuild to turn one off. */
  const applyLayerVisibility = () => {
    if (!layersReady) return
    const set = (id: string, on: boolean) =>
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    set('gdacs-marks', layersOn.gdacs)
    set('chokepoint-marks', layersOn.straits)
    set('conflict-marks', layersOn.conflict)
  }

  /** Moves the dated overlays with the scrub head, style-side. */
  const applyTimeFilters = () => {
    if (!layersReady) return
    map.setFilter('gdacs-marks', ['<=', ['get', 't'], scrubNow])
    map.setFilter('conflict-marks', ['<=', ['get', 't'], scrubNow])
  }

  /**
   * Rescales the cluster domain to the visible set.
   *
   * Only the paint properties are rewritten, and only when the domain actually
   * moves — the expressions are recompiled but no data is touched, which is
   * cheap next to the story `setData` happening in the same frame.
   */
  const applyClusterScale = (visible: number) => {
    if (!layersReady) return
    const next = heatStops(busiestFor(visible))
    if (next.every((v, i) => v === stops[i])) return
    stops = next
    map.setPaintProperty('story-clusters', 'circle-radius', clusterRadius(stops) as never)
    map.setPaintProperty('story-clusters', 'circle-stroke-width', [
      'case',
      ['==', ['get', 'contested'], 1],
      ['+', clusterStroke(stops), 0.8],
      clusterStroke(stops),
    ] as never)
    map.setLayoutProperty('story-cluster-count', 'text-size', countSize(stops) as never)
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
    applyClusterScale(visible.length)
    // Stories are the one layer whose *features* change with the scrub head:
    // their decay alpha is baked per feature, and the cluster counts have to
    // reflect the filtered set. Everything else moves by filter above.
    src('stories')?.setData(storyCollection(visible))
    applyTimeFilters()
  }

  /** Rebuilds the overlay sources. Called when their data arrives, not per frame. */
  const setOverlayData = () => {
    if (!layersReady) return
    src('gdacs')?.setData(gdacsCollection())
    src('chokepoints')?.setData(chokeCollection())
    src('conflict')?.setData(conflictCollection())
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
      cluster: true,
      clusterRadius: 30,
      clusterMaxZoom: 4,
      // Aggregated as the cluster tree is built, so a merged disc still knows
      // what it is made of: its category mix, its heaviest story, and whether
      // anything inside it is contested.
      clusterProperties: {
        politics: ['+', ['get', 'politics']],
        economy: ['+', ['get', 'economy']],
        science: ['+', ['get', 'science']],
        tech: ['+', ['get', 'tech']],
        wmax: ['max', ['get', 'w']],
        amax: ['max', ['get', 'a']],
        contested: ['max', ['get', 'contested']],
      },
    })
    map.addSource('gdacs', { type: 'geojson', data: empty })
    map.addSource('chokepoints', { type: 'geojson', data: empty })
    map.addSource('conflict', { type: 'geojson', data: empty })
    map.addSource('night', { type: 'geojson', data: empty })

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
        filter: ['==', ['get', 'iso2'], ''],
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.06 },
      },
      'borders',
    )

    // Night sits directly on the ocean and under everything else: it darkens
    // the ground, never the data.
    map.addLayer(
      {
        id: 'night-shade',
        type: 'fill',
        source: 'night',
        paint: { 'fill-color': '#000', 'fill-opacity': 0.28 },
      },
      'borders',
    )

    map.addLayer({
      id: 'conflict-marks',
      type: 'circle',
      source: 'conflict',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 1.6, 1, 7],
        'circle-color': OVERLAY_COLOUR.conflictFill,
        'circle-opacity': ['*', ['get', 'a'], 0.55],
        'circle-stroke-width': 0.5,
        'circle-stroke-color': OVERLAY_COLOUR.conflict,
        'circle-stroke-opacity': ['*', ['get', 'a'], 0.5],
      },
    })

    map.addLayer({
      id: 'chokepoint-marks',
      type: 'circle',
      source: 'chokepoints',
      paint: {
        // Radius grows with how far traffic has moved from its baseline, so a
        // strait that has half-emptied reads louder than one that has dipped.
        'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 3.5, 1, 8],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': ['interpolate', ['linear'], ['get', 'mag'], 0, 1, 1, 2.2],
        // Gold for traffic falling away — the blockage case — and a cool tone
        // for a surge, which is a different story told by the same number.
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'disrupted'], 0], MAP_COLOURS.coast,
          ['<', ['get', 'direction'], 0], OVERLAY_COLOUR.straits,
          OVERLAY_COLOUR.straitsSurge,
        ],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.55, 1, 0.95],
      },
    })

    map.addLayer({
      id: 'gdacs-marks',
      type: 'circle',
      source: 'gdacs',
      paint: {
        // Two facts, two channels. Size carries severity — the magnitude, wind
        // speed or burn area ranked against its own event type — and the alert
        // level adds a fixed bump on top, so an Orange event still reads louder
        // than a Green one of the same physical size. Sizing on level alone
        // drew 98 identical dots.
        'circle-radius': [
          '+',
          ['interpolate', ['linear'], ['get', 'mag'], 0, 3.4, 1, 8.5],
          ['match', ['get', 'level'], 'Red', 3, 'Orange', 1.5, 0],
        ],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': ['match', ['get', 'level'], 'Red', 1.8, 'Orange', 1.4, 1],
        'circle-stroke-color': OVERLAY_COLOUR.gdacs,
        // Green is 98% of the feed, so a flat 0.4 there made the whole layer
        // one weight. Within Green, severity drives presence instead.
        'circle-stroke-opacity': [
          'case',
          ['==', ['get', 'level'], 'Red'],
          0.95,
          ['==', ['get', 'level'], 'Orange'],
          0.85,
          ['interpolate', ['linear'], ['get', 'mag'], 0, 0.32, 1, 0.8],
        ],
      },
    })

    // Story halo — circle-blur is the cheap, GPU-side equivalent of the glow
    // sprite the canvas version baked by hand.
    map.addLayer({
      id: 'story-glow',
      type: 'circle',
      source: 'stories',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'w'], 0, 7, 1, 20],
        'circle-color': catColour('#8a8a8a'),
        'circle-blur': 1,
        'circle-opacity': ['*', ['get', 'a'], 0.45],
      },
    })

    // A ring around stories whose sources disagree sharply about them. Drawn
    // under the dot rather than on it so it reads as an aura, and only for the
    // top quartile of divergence — otherwise every story has one and it says
    // nothing.
    map.addLayer({
      id: 'story-contested',
      type: 'circle',
      source: 'stories',
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'contested'], 1]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'w'], 0, 6, 1, 10.5],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#e8e2d4',
        'circle-stroke-opacity': ['*', ['get', 'a'], 0.5],
      },
    })

    map.addLayer({
      id: 'story-points',
      type: 'circle',
      source: 'stories',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'w'],
          0, 2.6,
          1, 6,
        ],
        'circle-color': catColour('#8a8a8a'),
        'circle-opacity': ['get', 'a'],
        // Hover is a per-feature state flip rather than a style rewrite: the
        // expression is compiled once and only the one feature's state changes.
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 1.8,
          0.6,
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], '#ffffff',
          MAP_COLOURS.ocean,
        ],
        'circle-stroke-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 1,
          0.6,
        ],
      },
    })

    map.addLayer({
      id: 'story-clusters',
      type: 'circle',
      source: 'stories',
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': clusterRadius(stops),
        // A container, not a blob. The disc is the map's own ground colour at
        // most of its opacity — enough to hold the numeral clear of coastlines
        // and other markers underneath, and nothing more. Magnitude is the
        // numeral and the rim; the fill is not a third telling of it.
        'circle-color': MAP_COLOURS.ocean,
        'circle-opacity': 0.82,
        // Rim is category — of what — and its weight is how much.
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'contested'], 1],
          ['+', clusterStroke(stops), 0.8],
          clusterStroke(stops),
        ],
        'circle-stroke-color': clusterCategory(),
        // Recency still fades the rim, so a cluster of week-old stories sits
        // back from one that formed this morning.
        'circle-stroke-opacity': ['max', 0.55, ['*', ['get', 'amax'], 0.95]],
      },
    })

    map.addLayer({
      id: 'story-cluster-count',
      type: 'symbol',
      source: 'stories',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Bold'],
        // A bigger number on a hotter disc. The count is the payload, so it
        // grows with the thing it is counting instead of staying 11px whether
        // it reads 2 or 200.
        'text-size': countSize(stops),
        'text-letter-spacing': 0.01,
        // Counts must never be dropped for collision — a hidden number reads as
        // an empty disc, which is worse than a crowded one.
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      // One colour now. The label used to step from light type to dark halfway
      // up the ramp, because the fill it sat on ran from dark slate to pale
      // gold and no single colour read on both. The disc is one dark tone at
      // every count, so the number is simply light — no crossover, no midpoint
      // where it stopped reading.
      paint: {
        'text-color': '#eef2f8',
        'text-halo-color': 'rgba(6,8,12,0.65)',
        'text-halo-width': 0.8,
      },
    })

    layersReady = true
  }

  // --- Terminator ---------------------------------------------------------
  const drawNight = () => {
    if (!mounted || !layersReady) return
    const night = nightPolygon(new Date())
    src('night')?.setData(
      night ? { type: 'FeatureCollection', features: [night] } : empty,
    )
  }

  // --- Interaction --------------------------------------------------------
  const pointFor = (f: MapGeoJSONFeature): MapPoint | null =>
    pointBySlug.get(String(f.properties?.slug)) ?? null

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

  const setHoverSlug = (slug: string | null) => {
    if (slug === hoverSlug) return
    const previous = hoverSlug
    hoverSlug = slug
    feed.highlight(slug)
    if (!layersReady) return
    // One bit per feature. The paint expressions already read `feature-state`,
    // so nothing recompiles and nothing else on the layer is touched.
    if (previous) map.setFeatureState({ source: 'stories', id: previous }, { hover: false })
    if (slug) map.setFeatureState({ source: 'stories', id: slug }, { hover: true })
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
   * The comparison is against the centre the map can actually *reach*, not the
   * one we asked for. With `renderWorldCopies` off the world exactly fills the
   * canvas at the home zoom, so MapLibre constrains the centre back to 0 and
   * `HOME_VIEW.center[0]` of 12 is never honoured. Comparing against 12 made
   * the delta a permanent 12° — past the 8° threshold — so the button was on
   * screen at rest and stayed on after a reset had already finished, which is
   * the exact opposite of an affordance that means "you have moved".
   */
  const homeCenterLng = () => {
    const world = TILE_PX * 2 ** HOME_VIEW.zoom
    const slack = Math.max(0, ((world - (mapEl.clientWidth || world)) / 2 / world) * 360)
    return Math.max(-slack, Math.min(slack, HOME_VIEW.center[0]))
  }

  const syncResetButton = () => {
    if (!mounted) return
    const c = map.getCenter()
    const moved =
      map.getZoom() > HOME_VIEW.zoom + 0.15 ||
      Math.abs(c.lat - HOME_VIEW.center[1]) > 4 ||
      Math.abs(((c.lng - homeCenterLng() + 540) % 360) - 180) > 8
    resetBtn.hidden = !moved
  }

  const onWordmarkClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (!target?.closest?.('.wordmark')) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    resetView()
  }

  /**
   * Hovering a cluster drills into it.
   *
   * Without this, hover-only navigation dead-ends at the default view: nearly
   * every marker is a cluster there, so there is nothing individual to hover.
   * Expanding on hover turns the whole map into one continuous gesture —
   * hover a cluster to descend, hover a story to read it.
   */
  const expandCluster = (clusterId: number, coords: [number, number]) => {
    const source = src('stories')
    if (!source) return
    flying = true
    void source
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        map.easeTo({ center: coords, zoom: Math.min(zoom + 0.35, 9), duration: 750 })
        map.once('moveend', () => {
          flying = false
        })
        window.setTimeout(() => {
          flying = false
        }, 1100)
      })
      .catch(() => {
        flying = false
      })
  }

  const wireInteraction = () => {
    map.on('mousemove', 'story-points', (e) => {
      if (flying) return
      const f = e.features?.[0]
      if (!f) return
      map.getCanvas().style.cursor = 'pointer'
      const p = pointFor(f)
      if (!p) return
      // Hover previews, and stops there. It used to start a dwell timer that
      // flew the camera in after 320ms, which meant the map moved on its own
      // while the pointer was only passing over — a reader crossing a dense
      // area got dragged somewhere they had not asked to go, and the way back
      // was a separate gesture. Committing to a story is a click now, from the
      // beacon or from the rail.
      setHoverSlug(p.slug)
    })

    map.on('mouseleave', 'story-points', () => {
      map.getCanvas().style.cursor = ''
      setHoverSlug(null)
    })

    /**
     * Clicking the ground.
     *
     * Three outcomes, in order. A marker takes the click — those layers have
     * their own handlers and this one stays out of the way. Otherwise, if
     * something is already open, the click dismisses it: escape-first is what
     * people expect from a click on empty space, and opening a country profile
     * instead would feel like the map fighting back. Only from a clean slate
     * does a click on land open that country.
     */
    map.on('click', (e) => {
      const markers = map.queryRenderedFeatures(e.point, {
        layers: [
          'story-points',
          'story-clusters',
          'gdacs-marks',
          'chokepoint-marks',
          'conflict-marks',
        ],
      })
      if (markers.length > 0) return

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
      void popup?.openCountry(iso, [e.lngLat.lng, e.lngLat.lat])
    })

    // Land is only clickable where a profile exists, so the highlight and the
    // cursor follow the same test — nothing should look interactive and then
    // do nothing.
    map.on('mousemove', (e) => {
      if (flying) return
      const overMarker = map.queryRenderedFeatures(e.point, {
        layers: ['story-points', 'story-clusters', 'gdacs-marks', 'chokepoint-marks', 'conflict-marks'],
      }).length > 0
      const iso = overMarker ? null : countryAt(e.point)
      if (iso === hoverIso) return
      hoverIso = iso
      map.setFilter('country-hover', ['==', ['get', 'iso2'], iso ?? ''])
      if (!overMarker) map.getCanvas().style.cursor = iso ? 'pointer' : ''
    })

    map.on('mouseout', () => {
      hoverIso = null
      map.setFilter('country-hover', ['==', ['get', 'iso2'], ''])
    })

    map.on('click', 'story-points', (e) => {
      const f = e.features?.[0]
      const p = f ? pointFor(f) : null
      if (p) {
        flyToStory(p)
      }
    })

    // Clicking a cluster does the same as dwelling on it, without the wait.
    map.on('click', 'story-clusters', (e) => {
      const f = e.features?.[0]
      const id = f?.properties?.cluster_id
      if (!f || id == null) return
      expandCluster(Number(id), (f.geometry as GeoJSONPoint).coordinates as [number, number])
    })

    // Hovering a cluster only marks it as clickable. It used to expand on a
    // dwell, which meant the camera moved on its own whenever the pointer
    // crossed a dense area — the map pulled you somewhere you had not asked to
    // go, and there was no way to read the rail without setting it off.
    // Descending into a cluster is now an explicit click.
    map.on('mouseenter', 'story-clusters', () => {
      map.getCanvas().style.cursor = 'pointer'
    })

    map.on('mouseleave', 'story-clusters', () => {
      map.getCanvas().style.cursor = ''
    })

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
      const ev = conflicts.find((c) => c.id === key)
      if (ev) return sheet.showConflict(ev, conflictWindowLabel(), pin)
    }

    for (const layer of ['gdacs-marks', 'chokepoint-marks', 'conflict-marks']) {
      map.on('mousemove', layer, (e) => {
        map.getCanvas().style.cursor = 'pointer'
        const id = e.features?.[0]?.properties?.id
        if (id == null || String(id) === peekId) return
        peekId = String(id)
        clearPeekClose()
        showFor(id, false)
      })

      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = ''
        peekId = null
        // A short grace period: leaving the marker usually means the pointer is
        // on its way to the sheet to read it, not that you are done with it.
        clearPeekClose()
        peekCloseTimer = window.setTimeout(() => {
          peekCloseTimer = null
          if (!sheet.isPinned()) sheet.close()
        }, 260)
      })

      map.on('click', layer, (e) => {
        const id = e.features?.[0]?.properties?.id
        if (id == null) return
        clearPeekClose()
        peekId = String(id)
        showFor(id, true)
      })
    }

    // Moving back onto the sheet itself cancels the pending dismissal.
    sheet.element.addEventListener('mouseenter', clearPeekClose)
    sheet.element.addEventListener('mouseleave', () => {
      if (!sheet.isPinned()) sheet.close()
    })

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
      scheduleMetric()
      // The metric tint is re-applied by the `sourcedata` listener once this
      // data settles, not here — the source is not loaded the instant setData
      // returns. It has to happen at all because the finer tier carries
      // countries the coarse one never had (176 features become 255), and none
      // of them arrive with feature state: without it the tint would thin out
      // as the reader zoomed, worst on the small states the detail exists for.
    }

    map.on('zoomend', () => {
      const z = map.getZoom()
      if (!ultraLoaded && z >= ULTRA_ZOOM) {
        // Set before awaiting, or a second zoomend starts the same 5.8 MB
        // fetch again.
        ultraLoaded = true
        detailLoaded = true
        void upgradeCoastline('countries-ultra.geojson')
        return
      }
      if (!detailLoaded && z >= DETAIL_ZOOM) {
        detailLoaded = true
        void upgradeCoastline('countries-detail.geojson')
      }
    })

    // The reset control only exists once the view has left home, so at rest it
    // adds nothing to a map whose whole point is restraint.
    map.on('move', syncResetButton)
    syncResetButton()
  }

  // --- Chrome -------------------------------------------------------------
  const buildRanges = () => {
    for (const [label, hours] of RANGES) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = hours === rangeHours ? 'map-range is-on' : 'map-range'
      btn.dataset.kind = 'range'
      btn.textContent = label
      btn.setAttribute('aria-pressed', String(hours === rangeHours))
      btn.addEventListener('click', () => {
        rangeHours = hours
        for (const b of ranges.querySelectorAll('.map-range')) {
          const on = b === btn
          b.classList.toggle('is-on', on)
          b.setAttribute('aria-pressed', String(on))
        }
        refresh()
      })
      ranges.append(btn)
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
    const syncLock = () => {
      const sole = enabled.size === 1
      for (const [cat, b] of catButtons) {
        const locked = sole && enabled.has(cat)
        b.classList.toggle('is-locked', locked)
        if (locked) {
          b.setAttribute('aria-disabled', 'true')
          b.title = 'At least one category stays on'
        } else {
          b.removeAttribute('aria-disabled')
          b.removeAttribute('title')
        }
      }
    }

    for (const cat of CATEGORY_ORDER) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-filter is-on'
      btn.dataset.kind = 'category'
      btn.style.setProperty('--cat', CATEGORY_COLOUR[cat])
      btn.textContent = cat
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
    filters.append(sep)

    // The overlay chips carry their layer's own colour, the way the category
    // chips carry theirs. They were grey rings, so the strip said "four things
    // with colours, three things without" when in fact all seven mark the map
    // in a colour of their own — the reader had no way to connect the amber
    // rings over Anatolia to the word "disasters".
    //
    // Shape as well as colour: `filled` follows how the layer actually draws.
    // Conflict is a filled disc, disasters and straits are hollow rings, and a
    // chip that got that wrong would be a legend contradicting the map.
    for (const [key, label, colour, filled] of [
      ['gdacs', 'disasters', OVERLAY_COLOUR.gdacs, false],
      ['straits', 'straits', OVERLAY_COLOUR.straits, false],
      ['conflict', 'conflict', OVERLAY_COLOUR.conflict, true],
    ] as Array<[keyof typeof layersOn, string, string, boolean]>) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-filter is-on'
      btn.dataset.kind = 'layer'
      btn.dataset.mark = filled ? 'disc' : 'ring'
      btn.style.setProperty('--cat', colour)
      btn.textContent = label
      btn.setAttribute('aria-pressed', 'true')
      btn.addEventListener('click', () => {
        layersOn[key] = !layersOn[key]
        btn.classList.toggle('is-on', layersOn[key])
        btn.setAttribute('aria-pressed', String(layersOn[key]))
        applyLayerVisibility()
      })
      filters.append(btn)
    }
  }

  const updateClock = () => {
    clockEl.textContent = `${new Date().toISOString().slice(11, 16)} UTC`
  }

  // --- Data ---------------------------------------------------------------
  const loadCore = async () => {
    const data = await json<{ window: { start: number; end: number }; points: MapPoint[] }>(
      '/api/map.json',
      abort.signal,
    )
    if (!data || !mounted) return
    points = data.points
    pointBySlug = new Map(points.map((p) => [p.slug, p]))
    scrubNow = data.window.end

    timeline = createTimeline({
      start: data.window.start,
      end: data.window.end,
      onChange: (now) => {
        scrubNow = now
        refresh()
      },
    })
    timeline.setPoints(points)
    container.append(timeline.element)
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
    const [g, c] = await Promise.all([
      json<{ alerts: GdacsAlert[]; details?: Record<string, GdacsDetail> }>(
        '/api/gdacs.json',
        abort.signal,
      ),
      json<{ chokepoints: MapChokepoint[] }>('/api/chokepoints.json', abort.signal),
    ])
    if (!mounted) return
    if (g?.alerts) gdacs = g.alerts
    // Shipped in the same blob the alerts arrive in — no extra request, and it
    // was already on the wire before anything read it.
    if (g?.details) gdacsDetails = g.details
    if (c?.chokepoints) chokepoints = c.chokepoints
    setOverlayData()
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

  const applyMetric = () => {
    // `load` means the *style* is ready, not that a GeoJSON source has fetched
    // and parsed its data — countries.geojson is 210 KB over the network. Feature
    // state addressed at an unloaded source throws, and because the caller is a
    // `void`-ed async function the rejection went nowhere: the land stayed flat
    // and the legend below it never rendered, with nothing in the console. The
    // `sourcedata` listener re-runs this the moment the source is ready.
    if (metricApplied) return true
    if (!map.getSource('countries') || !map.isSourceLoaded('countries')) return false
    metricApplied = true
    // Clearing first is what makes switching metrics correct: a country with a
    // figure for press freedom but none for Gini would otherwise keep its old
    // shade and quietly assert a value the new metric doesn't have for it.
    map.removeFeatureState({ source: 'countries' })
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
    map.once('idle', () => {
      applyMetric()
    })
  }

  /** Fetches a metric and paints it. Leaves the land alone if it can't. */
  const loadMetric = async (key: string) => {
    const data = await json<MetricPayload>(`/api/metric/${key}.json`, abort.signal)
    if (!data || !mounted) return
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
    popup = createStoryPopup(map)
    addDataLayers()
    wireInteraction()
    applyPadding()
    drawNight()
    applyRefresh()
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
  const sunTimer = window.setInterval(drawNight, SUN_TICK_MS)

  const onResize = () => {
    // MapLibre sizes its drawing buffer from the container, and nothing else
    // here tells it the container moved — `applyPadding` and `worldFitZoom`
    // both *read* dimensions, they don't apply them. Without this the canvas
    // kept whatever size it was built at: widen the window and the map went on
    // drawing into a 900px corner of a 1544px frame, with dead space beside it.
    map.resize()
    applyPadding()
    // "Whole world" has to keep meaning the whole world after a resize, or the
    // reset lands on a view sized for a window that no longer exists.
    HOME_VIEW.zoom = worldFitZoom()
    // Widening the window leaves the camera at a zoom the new canvas is too
    // big for, and a world narrower than its canvas comes back doubled. Moving
    // the floor re-clamps the live camera as well, so the fix applies to the
    // view the reader is already looking at and not just to the next reset.
    map.setMinZoom(HOME_VIEW.zoom)
    syncResetButton()
  }
  window.addEventListener('resize', onResize, { passive: true })

  void loadCore()

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    // `e.target` is only an Element when something focusable has focus — a
    // key event delivered straight to `document` has no `matches`, and the
    // bare call threw a TypeError out of the global handler, taking Escape
    // down with it.
    if (target?.matches?.('input, textarea, select')) return
    if (e.key !== 'Escape') return
    // Escape closes what is open; with nothing open it means "get me out of
    // here", which on a map is the whole world.
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
    window.removeEventListener('resize', onResize)
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('click', onWordmarkClick)
    timeline?.destroy()
    feed.destroy()
    popup?.destroy()
    sheet.destroy()
    map.remove()
    container.replaceChildren()
    container.classList.remove('map-root')
  }
}
