// Shapes of the four feeds the map draws, and the one curve they all age on.
//
// These used to live next to the canvas renderer that consumed them. MapLibre
// replaced that renderer, but the payloads are unchanged — they are the build's
// published output — so the types outlived the drawing code and belong on their
// own rather than inside whichever module happens to read them.
//
// The three overlay feeds are *not* declared here. `/api/gdacs.json`,
// `/api/chokepoints.json` and `/api/conflict.json` are the same blobs the app
// reads, and `shared/types.ts` already describes them in full — down to the
// `${eventtype}:${eventid}` keying of the GDACS detail map and the units on
// `maxWave24hM`. What used to sit here was a hand-narrowed copy: it declared
// ten of GdacsAlert's nineteen fields and omitted `severityValue`, which is the
// number that tells an M6.2 from an M4.5. Re-exporting the real types means the
// map can only fall behind the payload if the payload's own type does.
export type {
  Chokepoint,
  ChokepointCounts,
  ChokepointWeather,
  ConflictEvent,
  GdacsAlert,
  GdacsDetail,
  GdacsEventType,
  VesselField,
} from '@shared/types'

// Same reasoning one layer over: `/api/genocide.json` is the build's published
// output of `GENOCIDE_MARKED`, so the map reads the record's own type rather
// than a copy of it that can fall behind.
export type { GenocideFinding, GenocideSituation } from '@shared/genocide'

import type { Chokepoint } from '@shared/types'

/** A story from `/api/map.json`. */
export interface MapPoint {
  lat: number
  lng: number
  /** Event time in ms — when the thing happened, not when we published. */
  t: number
  /** Raw eventCoverage. Kept for display; `w` is what drives the radius. */
  c: number
  cat: string
  slug: string
  title: string
  loc: string
  /** Number of sources the article cites. */
  n: number
  /**
   * Coverage as a 0..1 percentile rank across the window, computed at build
   * time. Absent when the story carries no coverage figure at all — which is
   * different from carrying a low one, and the map renders it differently.
   */
  w?: number
  /** Sentiment spread across the outlets covering the story, 0..~1. */
  d?: number
}

/**
 * A chokepoint as *this* endpoint serves it.
 *
 * `scripts/build.js` enriches the shared snapshot with matching zuhd coverage
 * before writing `/api/chokepoints.json`, so the web payload is a superset of
 * the one the app reads. The extra field lives here rather than in `shared/`
 * because only the web build produces it.
 */
export interface MapChokepoint extends Chokepoint {
  relatedArticles?: Array<{
    slug: string
    title: string
    date?: string
    dateFormatted?: string
  }>
}

/**
 * A stock exchange as `/api/markets.json` serves it.
 *
 * Declared here rather than re-exported from `shared/`, unlike the four feeds
 * above, because there is nothing in `shared/` to re-export: this payload is
 * assembled by `scripts/fetch-markets.js` from `scripts/lib/market-metadata.js`,
 * both plain JS, and the app does not read the endpoint. The rule in the header
 * is about not keeping a hand-narrowed *copy* of a type that already exists —
 * with no other declaration to fall behind, this is the declaration.
 *
 * Exchanges the catalog knows about but cannot source are absent from the
 * payload entirely. See `market-metadata.js` for which, and why.
 */
export interface MapExchange {
  id: string
  /** The institution — "Saudi Exchange". */
  name: string
  /** The index quoted — "TASI". These differ and the card shows both. */
  indexName: string
  /**
   * The city, already through `displayLocation` at build time — so this reads
   * `Yafa`, not `Tel Aviv`. The catalog keeps the untranslated string; only the
   * published payload is renamed, the same way map points are.
   */
  city: string
  iso2: string
  lat: number
  lng: number
  /** Most recent close, in `currency`. */
  level: number
  /** Signed percent change against the prior close. 1.25 means +1.25%. */
  changePct: number
  currency: string
  /** IANA zone, and the basis for whether the exchange is trading right now. */
  tz: string
  /** Local wall-clock "HH:MM" bounds of the regular session. */
  sessionStart: string
  sessionEnd: string
  /** Trading weekdays, `Date.getDay()` convention — 0 is Sunday. */
  days: number[]
  /**
   * `'islamic'` where the exchange shuts for the two Eids. Absent everywhere
   * else, because no other holiday is modelled — see `_map/hijri.ts`.
   */
  holidays?: string
  series: { periods: string[]; values: number[] }
  /** Date of the most recent close, `YYYY-MM-DD`. */
  asOf: string
  sourceLabel: string
  blurb: string
  /** Set when the figure came from the fetcher's last-good cache. */
  stale?: boolean
  relatedArticles?: Array<{
    slug: string
    title: string
    date?: string
    dateFormatted?: string
  }>
}

/**
 * A thermal anomaly as `/api/firms.json` serves it.
 *
 * Declared here rather than re-exported from `shared/`, for the reason
 * `MapExchange` gives: there is nothing in `shared/` to fall behind. The payload
 * is assembled by `scripts/fetch-firms.js` from `scripts/lib/firms.js` and
 * joined to coverage by `build.js`, and the app does not read the endpoint.
 *
 * Every event in the published payload has at least one `relatedArticles` entry —
 * that is the layer's whole claim, and an anomaly with nothing to corroborate is
 * dropped at build time rather than drawn.
 */
export interface ThermalEvent {
  id: string
  lat: number
  lng: number
  /** Earliest acquisition in the cluster, ms. What the scrubber filters on. */
  t: number
  /** Latest acquisition, ms. Equal to `t` for a single-pass detection. */
  tEnd: number
  /** Total fire radiative power across the cluster, MW. Drives the mark's size. */
  frp: number
  /** The hottest single pixel, MW. */
  frpPeak: number
  /** Detections in the cluster. A 375 m pixel each. */
  pixels: number
  /** The best confidence in the cluster. Drives the mark's opacity. */
  confidence: 'low' | 'nominal' | 'high'
  /** Whether the peak pixel was a day or night pass. Night is the cleaner read. */
  daynight: 'D' | 'N'
  /**
   * Distinct days this location has been alight across the fetcher's window.
   *
   * 1 means it appeared on this pass. Anything at or above
   * `PERSIST_DROP_DAYS` only survives because it is burning far harder than its
   * own baseline — see `escalating`, and `lib/firms.js` for why a plain day count
   * would delete every large wildfire.
   */
  persistDays: number
  /** Set when a long-burning location was kept for burning above its baseline. */
  escalating?: boolean
  /** Which satellites' passes contributed. */
  satellites: string[]
  /** The nearest cited story's place name and distance, for the card's one line. */
  near: { loc: string; km: number }
  relatedArticles: Array<{
    slug: string
    title: string
    date?: string
    dateFormatted?: string
    /** Distance from the anomaly to that story's location, km. */
    km: number
  }>
}

/**
 * On the chip's `title`, the way `PRAYER_NOTE` and `HIJRI_NOTE` sit on theirs.
 *
 * This is the short form; the card carries the fuller caveat, because a reader
 * who has clicked a mark has asked a more specific question than a reader
 * reading a legend. Both have to say the same thing about cause, which is the
 * one claim this layer must never make.
 */
export const THERMAL_NOTE =
  'Infrared heat measured by NASA VIIRS in 375 m pixels, within 75 km of a ' +
  'story we published. The instrument sees heat, not its cause. Sources ' +
  'burning steadily for days — flares, furnaces, volcanoes — are filtered out.'

/** One country's standing on a metric, from `/api/metric/{key}.json`. */
export interface MetricEntry {
  /**
   * Position on the land ramp, 0 (darkest) to 1 (lightest).
   *
   * The *value*, projected onto `scale` — not a percentile of the ordering,
   * which is what this was until it turned out that a uniform-by-construction
   * position meant every metric painted the same distribution of tones. See
   * `scripts/build/country-metrics.js` for the whole account.
   *
   * On the three `ascending` metrics the ramp is turned around, so the lightest
   * countries are the best ones: the picker says "press freedom" and used to
   * paint Eritrea as the brightest example of it. On the other twenty-four,
   * light still means more of whatever the label names — `population` has no
   * better end and must not be given one. `domain` states both ends in the
   * metric's own units so the direction is read rather than assumed.
   */
  p: number
  /** The formatted value, as the country pages print it — "52.9", "$797". */
  v: string
  /** Rank, 1-based, in the metric's editorial order (see `getRanking`). */
  r: number
}

/** `/api/metric/{key}.json` — one metric across every country we can route. */
export interface MetricPayload {
  key: string
  label: string
  /** The scale and its direction, in a sentence. What the key prints. */
  description: string
  source: string
  sourceUrl: string
  /** Lower is better, so the ramp runs the other way. Three of twenty-seven. */
  ascending: boolean
  /** How values are spaced across the ramp — `METRICS[key].scale`. */
  scale: 'linear' | 'log'
  /**
   * The values at each end of the ramp, formatted as the country pages print
   * them, printed either side of the legend's gradient.
   *
   * A gradient with nothing written on it is a scale with no units — the only
   * way to learn what a tone was worth was to already know the distribution.
   * These also carry the direction, which prose could when the ramp always
   * meant "more" and cannot now that three metrics turn it around.
   */
  domain: { dark: string; light: string }
  /** Countries with a figure for this metric, including unroutable ones. */
  total: number
  values: Record<string, MetricEntry>
}

/** `/api/metric/index.json` — enough to build the picker without 27 fetches. */
export interface MetricIndexEntry {
  key: string
  label: string
  count: number
}

/**
 * The metric the map opens on.
 *
 * Press freedom, because it is the one country statistic that changes how you
 * read everything else on the map. Every beacon is a claim assembled from
 * outlets filing from somewhere, and how free those outlets are is context for
 * the claim rather than a separate subject.
 */
export const DEFAULT_METRIC = 'pressFreedomScore'

/**
 * Story decay, as a half-life in hours.
 *
 * The canvas map used 18 hours, borrowed from the mobile globe, where the
 * window is 72 hours. Over this map's 14-day window that curve is far too
 * steep: it puts 85% of the corpus below 2% weight, so almost every beacon
 * bottoms out at the alpha floor and the recency channel collapses to
 * "today" versus "not today". A 72-hour half-life spends the visible range on
 * the window it actually has — a day-old story still reads as clearly hotter
 * than a week-old one — while two weeks still fades to an ember.
 */
export const DECAY_HALF_LIFE_HOURS = 72
export const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_HOURS

export const decayAt = (t: number, now: number) => {
  const ageHours = Math.max(0, (now - t) / 3_600_000)
  return Math.exp(-DECAY_LAMBDA * ageHours)
}

/**
 * Where a beacon's ring turns on: the sentiment spread across the outlets
 * covering a story.
 *
 * Lives here rather than in the island because both the canvas (which draws
 * the ring) and the story card (which has to explain it) need the same
 * threshold, and a ring that appears without the card accounting for it is
 * the map asking a question it then refuses to answer.
 */
export const CONTESTED_D = 0.35

/**
 * The viewport width below which the map is laid out for a phone.
 *
 * Kept in step with the `max-width: 900px` block in style.css by hand. Almost
 * every consequence of that line is CSS and needs nothing here — which edge the
 * rail takes and how tall the drawer is are both read back off the geometry —
 * but two things cannot be measured after the fact: the zoom floor, which is a
 * number the island has to choose, and whether the rail's header is a
 * disclosure at all, which decides what it may claim to assistive technology.
 */
export const NARROW_PX = 900
