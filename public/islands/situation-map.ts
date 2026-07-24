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
} from 'maplibre-gl'
import { buildStyle, CATEGORY_COLOUR, CATEGORY_ORDER, MAP_COLOURS } from './_map/style'
import { createFeed, type Feed } from './_map/feed'
import { createTimeline, type Timeline } from './_map/timeline'
import { createSheet, type Sheet } from './_map/sheet'
import { createStoryPopup, type StoryPopup } from './_map/popup'
import { nightPolygon } from './_map/solar'
import {
  decayAt,
  type Chokepoint,
  type ConflictEvent,
  type GdacsAlert,
  type MapPoint,
} from './_map/types'

// Long enough that sweeping the pointer across a dense field does not fire a
// flight per marker, short enough that a deliberate hover feels immediate.
const HOVER_DWELL_MS = 320
const DETAIL_ZOOM = 3.2
/** Where the 1:10m coastline replaces 1:50m — see the zoomend handler. */
const ULTRA_ZOOM = 5.5

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

/** Above this sentiment spread across outlets, a story is drawn as contested. */
const CONTESTED_D = 0.35

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
 * This rides on the disc's rim: the fill is spent on heat (below), and the ring
 * says a cluster over the Gulf is economy where one over Kyiv is politics —
 * before this every cluster was the same grey disc and the category channel
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
 * Cluster heat.
 *
 * A count is a quantity, and quantity is the one thing a flat disc cannot say —
 * the reader has to stop and parse the digits on every marker before knowing
 * which ones matter. Running the fill up a cold-to-hot ramp means the eye sorts
 * the map before it reads a single number: a quiet corner sits back in slate,
 * and the busiest capital burns pale gold and pulls the eye first.
 */
const CLUSTER_HEAT = [
  '#3c4560',
  '#5d5560',
  '#8a6250',
  '#b47540',
  '#d78f36',
  '#f0b94e',
  '#fadf94',
]

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
  const n = CLUSTER_HEAT.length
  const top = Math.max(n + 1, Math.round(busiest))
  const out: number[] = []
  let prev = 1
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) ** 2.2
    out.push((prev = Math.max(prev + 1, Math.round(2 + (top - 2) * f))))
  }
  return out
}

const clusterHeat = (stops: number[]): ExpressionSpecification =>
  [
    'interpolate',
    ['linear'],
    ['get', 'point_count'],
    ...stops.flatMap((s, i) => [s, CLUSTER_HEAT[i]]),
  ] as unknown as ExpressionSpecification

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
 * The blurred rings that give a cluster its falloff, widest first.
 *
 * Two rings read as two discs. `circle-blur` fades a circle across a band
 * proportional to its radius, so anything below ~1.6 keeps a legible edge, and
 * stacking a tight bright one under a wide faint one draws exactly the hard
 * ring it was meant to avoid — most obvious over New York and London, where the
 * counts are highest. Three rings, each blurred past its own radius and none
 * of them opaque, sum to a gradient with no edge of its own. The real
 * kernel-density field underneath (`story-heat`) does the rest.
 */
const CLUSTER_RINGS = [
  { id: 'story-cluster-bloom', spread: 5.2, alpha: 0.09, blur: 1 },
  { id: 'story-cluster-mid', spread: 3.1, alpha: 0.11, blur: 1 },
  { id: 'story-cluster-glow', spread: 1.85, alpha: 0.14, blur: 1 },
]

/** Faint clusters barely bloom; the ramp is spent on the hot end. */
const ringOpacity = (stops: number[], alpha: number): ExpressionSpecification =>
  [
    'interpolate',
    ['linear'],
    ['get', 'point_count'],
    stops[0], alpha * 0.3,
    stops[2], alpha * 0.7,
    stops[4], alpha,
    stops[6], alpha * 1.25,
  ] as unknown as ExpressionSpecification

/** Label size, and the count at which it flips from light to dark type. */
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

const countFlip = (stops: number[]) => stops[3]

export function mount(container: HTMLElement) {
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

  hud.append(ranges, filters)

  const status = document.createElement('div')
  status.className = 'map-status'
  const clockEl = document.createElement('span')
  clockEl.className = 'map-clock'
  status.append(clockEl)

  container.append(mapEl, hud, status)

  // --- State --------------------------------------------------------------
  let points: MapPoint[] = []
  /** Slug → point, so hit-testing a marker is a lookup and not a 764-item scan. */
  let pointBySlug = new Map<string, MapPoint>()
  let leads: Record<string, string> = {}
  let gdacs: GdacsAlert[] = []
  let chokepoints: Chokepoint[] = []
  let conflicts: ConflictEvent[] = []
  /** Newest event in the conflict feed — see `conflictWindowLabel`. */
  let conflictNewest = 0

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
   * The heat ramp's current domain.
   *
   * Derived from how many stories are showing, not from the corpus: switching
   * to 24h drops the busiest cluster from ~140 to single digits, and a fixed
   * domain would render that whole view in the ramp's two coldest colours. The
   * proportion is empirical — across ranges, the largest cluster at world zoom
   * runs a little under a fifth of the visible set.
   */
  let stops = heatStops(150)
  const busiestFor = (visible: number) => Math.max(CLUSTER_HEAT.length + 1, visible * 0.19)

  let hoverSlug: string | null = null
  let openSlug: string | null = null
  let dwellTimer: number | null = null
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
  /** The view the map opens on, and the one the wordmark returns you to. */
  const HOME_VIEW = { center: [12, 22] as [number, number], zoom: 1.35 }

  const map = new MapLibreMap({
    container: mapEl,
    style: buildStyle(),
    center: HOME_VIEW.center,
    zoom: HOME_VIEW.zoom,
    minZoom: 1,
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
    renderWorldCopies: true,
  })
  map.touchZoomRotate?.disableRotation()

  // The rail covers the left edge, so the map's true centre is not the
  // viewport's. Telling MapLibre once means every flyTo, easeTo and cluster
  // expansion lands in the visible half — the old code paid for this with a
  // hand-tuned pixel offset on the one call that had been noticed.
  const applyPadding = () => {
    // The style can finish loading after teardown, and on a narrow viewport
    // there is no rail to compensate for at all.
    if (!mounted) return
    const railed = window.matchMedia?.('(min-width: 60rem)').matches ?? false
    map.setPadding({ top: 0, bottom: 0, right: 0, left: railed ? feed.element.offsetWidth : 0 })
  }

  // --- Data shaping -------------------------------------------------------
  const visiblePoints = (): MapPoint[] => {
    const from = rangeHours === null ? -Infinity : scrubNow - rangeHours * 3_600_000
    return points.filter((p) => p.t <= scrubNow && p.t >= from && enabled.has(p.cat))
  }

  const storyCollection = (visible: MapPoint[]) => ({
    type: 'FeatureCollection' as const,
    features: visible.map((p) => ({
      type: 'Feature' as const,
      // Decay is baked into the feature so MapLibre can drive opacity from a
      // plain property — style expressions have no exponential.
      properties: {
        slug: p.slug,
        title: p.title,
        cat: p.cat,
        loc: p.loc,
        t: p.t,
        c: p.c,
        n: p.n,
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
  const gdacsCollection = () => ({
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
          // Undated alerts sort to the beginning of time so they never vanish.
          t: Number.isFinite(t) ? t : 0,
        },
        geometry: { type: 'Point' as const, coordinates: [a.lng, a.lat] },
      }
    }),
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
   * Rescales the heat ramp to the visible set.
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
    map.setPaintProperty('story-clusters', 'circle-color', clusterHeat(stops) as never)
    for (const ring of CLUSTER_RINGS) {
      map.setPaintProperty(ring.id, 'circle-radius', clusterRadius(stops, ring.spread) as never)
      map.setPaintProperty(ring.id, 'circle-color', clusterHeat(stops) as never)
      map.setPaintProperty(ring.id, 'circle-opacity', ringOpacity(stops, ring.alpha) as never)
    }
    map.setLayoutProperty('story-cluster-count', 'text-size', countSize(stops) as never)
    map.setPaintProperty('story-cluster-count', 'text-color', [
      'step', ['get', 'point_count'], '#eef2f8', countFlip(stops), '#1a1206',
    ] as never)
    map.setPaintProperty('story-cluster-count', 'text-halo-color', [
      'step', ['get', 'point_count'], 'rgba(6,8,12,0.55)', countFlip(stops), 'rgba(255,241,214,0.4)',
    ] as never)
  }

  const applyRefresh = () => {
    // A late style-load or data fetch can land after teardown; rebuilding the
    // rail then throws against a document that is already gone.
    if (!mounted) return
    const visible = visiblePoints()
    feed.setItems(visible, scrubNow)
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
    // you can click". Driven by a filter rather than feature-state because the
    // basemap has no promoted id, and one `setFilter` per hover change is the
    // same cost as one state flip.
    map.addLayer(
      {
        id: 'country-hover',
        type: 'fill',
        source: 'countries',
        filter: ['==', ['get', 'iso2'], ''],
        paint: { 'fill-color': MAP_COLOURS.landHi, 'fill-opacity': 0.85 },
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
        'circle-color': '#8c2f2f',
        'circle-opacity': ['*', ['get', 'a'], 0.55],
        'circle-stroke-width': 0.5,
        'circle-stroke-color': '#c05252',
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
          ['<', ['get', 'direction'], 0], '#c9a84c',
          '#5f9ea0',
        ],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.55, 1, 0.95],
      },
    })

    map.addLayer({
      id: 'gdacs-marks',
      type: 'circle',
      source: 'gdacs',
      paint: {
        'circle-radius': ['match', ['get', 'level'], 'Red', 9, 'Orange', 7, 5],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': ['match', ['get', 'level'], 'Red', 1.8, 'Orange', 1.4, 1],
        'circle-stroke-color': '#b8763f',
        'circle-stroke-opacity': ['match', ['get', 'level'], 'Red', 0.95, 'Orange', 0.8, 0.4],
      },
    })

    /**
     * The density field the discs sit on.
     *
     * MapLibre's `heatmap` type is a real kernel-density estimate, not circles
     * with a blur on them: every story contributes a falloff and the overlaps
     * sum, so a region reads hot because of how much is happening across it
     * rather than because one marker happens to be large. That is the gradient
     * the flat discs were missing.
     *
     * It is capped at zoom 5 and fades out before it. A density field is a
     * claim about a *region*, and once you are close enough to see individual
     * towns the region is smaller than the kernel — past that point it stops
     * describing anything and just tints the ground.
     *
     * Weight comes from the cluster count where there is one. Supercluster
     * hands back either a cluster or its members at a given zoom, never both,
     * so counting `point_count` for the former and 1 for the latter sums the
     * corpus exactly once.
     */
    map.addLayer({
      id: 'story-heat',
      type: 'heatmap',
      source: 'stories',
      maxzoom: 5,
      paint: {
        'heatmap-weight': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'point_count'], 1],
          1, 0.12,
          10, 0.4,
          40, 0.75,
          140, 1,
        ],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 1.6],
        // Transparent at the bottom so empty ocean stays black — a ramp that
        // starts opaque paints the whole world its coldest colour.
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(10,12,18,0)',
          0.12, 'rgba(52,62,92,0.30)',
          0.3, 'rgba(104,84,92,0.42)',
          0.5, 'rgba(158,104,72,0.5)',
          0.7, 'rgba(206,138,56,0.55)',
          0.88, 'rgba(238,180,74,0.6)',
          1, 'rgba(252,226,158,0.68)',
        ],
        // Wider than feels right on paper: a kernel narrower than the marker
        // it sits under reads as a halo on the marker rather than as a field
        // over the region, which is the whole distinction the layer exists to
        // draw.
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 34, 3, 58, 5, 88],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 3.5, 0.75, 5, 0],
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
        // Fill is heat, rim is category: how much, and of what.
        'circle-color': clusterHeat(stops),
        'circle-opacity': ['max', 0.6, ['*', ['get', 'amax'], 0.95]],
        'circle-stroke-width': ['case', ['==', ['get', 'contested'], 1], 2, 1.4],
        'circle-stroke-color': clusterCategory(),
        'circle-stroke-opacity': 0.9,
      },
    })

    // Two blurred rings under every cluster, wide-and-faint over
    // tight-and-warmer. One ring gives a disc a soft edge; two give it a
    // falloff — the light drops off in stages the way it does on a heat map
    // instead of ending at a single radius. Both are cheap: a blurred circle
    // is one GPU-side fragment op, not a sprite.
    for (const ring of CLUSTER_RINGS) {
      map.addLayer(
        {
          id: ring.id,
          type: 'circle',
          source: 'stories',
          filter: ['has', 'point_count'],
          paint: {
            'circle-radius': clusterRadius(stops, ring.spread),
            'circle-color': clusterHeat(stops),
            'circle-blur': ring.blur,
            'circle-opacity': ringOpacity(stops, ring.alpha),
          },
        },
        'story-clusters',
      )
    }

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
      // The ramp runs dark slate to pale gold, so the label has to cross over
      // with it. It steps rather than blends: interpolating the type through
      // the same midpoint as the fill put mid-sized counts in mid-brown on
      // mid-brown, the one place on the ramp where the number stopped reading.
      // `step` gives every disc a label at full contrast on one side or the
      // other, and the switch lands at 18 — just below where the fill turns
      // properly warm.
      paint: {
        'text-color': ['step', ['get', 'point_count'], '#eef2f8', countFlip(stops), '#1a1206'],
        'text-halo-color': [
          'step',
          ['get', 'point_count'],
          'rgba(6,8,12,0.55)',
          countFlip(stops),
          'rgba(255,241,214,0.4)',
        ],
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
  const countryAt = (point: { x: number; y: number }): string | null => {
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

    const z = map.getZoom()
    const target = z < 3.6 ? 3.6 : Math.min(z + 0.5, 7)

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
      essential: true,
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

  const clearDwell = () => {
    if (dwellTimer !== null) {
      clearTimeout(dwellTimer)
      dwellTimer = null
    }
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
    clearDwell()
    clearPeekClose()
    popup?.close()
    sheet.close()
    feed.highlight(null)
    map.easeTo({ ...HOME_VIEW, bearing: 0, pitch: 0, duration: 800, essential: true })
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
      setHoverSlug(p.slug)
      clearDwell()
      dwellTimer = window.setTimeout(() => {
        dwellTimer = null
        if (hoverSlug === p.slug) flyToStory(p)
      }, HOVER_DWELL_MS)
    })

    map.on('mouseleave', 'story-points', () => {
      map.getCanvas().style.cursor = ''
      clearDwell()
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
        clearDwell()
        flyToStory(p)
      }
    })

    // Clicking a cluster does the same as dwelling on it, without the wait.
    map.on('click', 'story-clusters', (e) => {
      const f = e.features?.[0]
      const id = f?.properties?.cluster_id
      if (!f || id == null) return
      clearDwell()
      expandCluster(Number(id), (f.geometry as GeoJSON.Point).coordinates as [number, number])
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
      if (alert) return sheet.showGdacs(alert, pin)
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
    map.on('zoomend', () => {
      const z = map.getZoom()
      const src = () => map.getSource('countries') as GeoJSONSource | undefined
      if (!ultraLoaded && z >= ULTRA_ZOOM) {
        ultraLoaded = true
        detailLoaded = true
        src()?.setData('/basemap/countries-ultra.geojson')
        return
      }
      if (!detailLoaded && z >= DETAIL_ZOOM) {
        detailLoaded = true
        src()?.setData('/basemap/countries-detail.geojson')
      }
    })
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
    for (const cat of CATEGORY_ORDER) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-filter is-on'
      btn.dataset.kind = 'category'
      btn.style.setProperty('--cat', CATEGORY_COLOUR[cat])
      btn.textContent = cat
      btn.setAttribute('aria-pressed', 'true')
      btn.addEventListener('click', () => {
        if (enabled.has(cat)) enabled.delete(cat)
        else enabled.add(cat)
        // Never let the map go blank — the last category stays lit.
        if (enabled.size === 0) enabled.add(cat)
        const on = enabled.has(cat)
        btn.classList.toggle('is-on', on)
        btn.setAttribute('aria-pressed', String(on))
        refresh()
      })
      filters.append(btn)
    }

    const sep = document.createElement('span')
    sep.className = 'map-filter-sep'
    sep.setAttribute('aria-hidden', 'true')
    filters.append(sep)

    for (const [key, label] of [
      ['gdacs', 'disasters'],
      ['straits', 'straits'],
      ['conflict', 'conflict'],
    ] as Array<[keyof typeof layersOn, string]>) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-filter is-on'
      btn.dataset.kind = 'layer'
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
      json<{ alerts: GdacsAlert[] }>('/api/gdacs.json', abort.signal),
      json<{ chokepoints: Chokepoint[] }>('/api/chokepoints.json', abort.signal),
    ])
    if (!mounted) return
    if (g?.alerts) gdacs = g.alerts
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
    void loadLayers()
    loadConflict()
    loadLeads()
  })

  buildRanges()
  buildFilters()
  updateClock()
  const clockTimer = window.setInterval(updateClock, 30_000)
  const sunTimer = window.setInterval(drawNight, SUN_TICK_MS)

  const onResize = () => applyPadding()
  window.addEventListener('resize', onResize, { passive: true })

  void loadCore()

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target && target.matches('input, textarea, select')) return
    if (e.key === 'Escape') {
      openSlug = null
      popup?.close()
      feed.highlight(null)
      sheet.close()
    }
  }
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', onWordmarkClick)

  return () => {
    mounted = false
    abort.abort()
    clearInterval(clockTimer)
    clearInterval(sunTimer)
    if (refreshFrame) cancelAnimationFrame(refreshFrame)
    clearDwell()
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
