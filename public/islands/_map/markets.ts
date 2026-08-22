// The markets layer: its predicates, its marks, and the strip that reads them
// back as a set.
//
// ── Why this is a module and not thirty lines in the island ────────────────
//
// The layer used to decide "has this moved" and "which way" twice — once in the
// GeoJSON builder and once again in the paint expressions — and the two copies
// had drifted. `moved` gated the *stroke* while `trading` gated the *fill*, so
// an open exchange at +0.02% drew a directional green disc inside a neutral grey
// ring: a mark that disagreed with itself. And `direction` was
// `change < 0 ? -1 : 1`, which files a dead-flat session under "up".
//
// The fix is not to correct both copies. It is for there to be one. The strip
// below is a third reader of the same predicates, and inline that third drift
// was only a matter of time.

import { el } from '../_dom'
import { sparkPct, sparkline } from '../_spark'
import { FRESH_DAYS, isTrading, quoteLevel, shortDate, staleLabel } from './format'
import { coverage, DAY_MS, seriesDates, windowByDate } from './series-window'
import { glyphSvg } from './glyphs'
import type { GLYPHS } from './glyphs'
import { MAP_COLOURS, OVERLAY_COLOUR } from './style'
import type { MapChokepoint, MapExchange } from './types'
import type { ExpressionSpecification, SymbolLayerSpecification } from 'maplibre-gl'

/**
 * Below this, a move is noise and the mark claims no direction.
 *
 * On a quiet day most of the world is flat, and painting that as a weak rally
 * is a statement the data does not make.
 */
export const FLAT_PCT = 0.15

/**
 * Above this the mark prints its number.
 *
 * Stepped by zoom rather than fixed, the same way the country labels arrive as
 * the camera earns them: the world view is where space is scarce, and it is the
 * only view most readers ever see. 1% put thirteen numerals on the world map and
 * eight of them landed on Europe, where they fought the story clusters and each
 * other; 1.5% names the day's actual movers and lets the rest be ticks. Closer
 * in the bar halves, because the space is there.
 */
export const NAME_PCT = 1.5
export const NAME_PCT_CLOSE = 0.75
export const NAME_ZOOM = 3.5

/** How many movers the strip names from each end. */
export const MOVERS_PER_SIDE = 2

/**
 * −1, 0 or +1.
 *
 * `Math.sign` rather than a comparison, because the comparison had no zero case
 * and a market that closed exactly level was reported as a riser.
 */
export const marketSign = (change: number): -1 | 0 | 1 =>
  (Number.isFinite(change) ? Math.sign(change) : 0) as -1 | 0 | 1

/** Has this exchange moved enough to claim a direction? */
export const marketMoved = (change: number): boolean =>
  Number.isFinite(change) && Math.abs(change) > FLAT_PCT

/** Which way the mark points, once the flat band has had its say. */
export const marketDirection = (change: number): -1 | 0 | 1 =>
  marketMoved(change) ? marketSign(change) : 0

/**
 * The magnitude the map prints.
 *
 * Unsigned: the tick is the sign, and printing it twice was never right. The
 * `%` is not decoration — without it a `1.3` beside a beacon is the same object
 * as the `13` inside a story cluster two hundred pixels away, in the same
 * weight, at nearly the same size. One glyph, and a percentage can no longer be
 * read as a count.
 */
export const marketLabel = (change: number): string => `${Math.abs(change).toFixed(1)}%`

// --- The source ------------------------------------------------------------

export const marketCollection = (markets: MapExchange[], now = Date.now()) => ({
  type: 'FeatureCollection' as const,
  features: markets.map((m) => {
    const change = Number.isFinite(m.changePct) ? m.changePct : 0
    return {
      type: 'Feature' as const,
      properties: {
        id: m.id,
        name: m.name,
        change,
        abs: Math.abs(change),
        // A 3% day is a big day on an index; past that the mark stops growing
        // rather than letting one panic drown out the rest of the world.
        mag: Math.min(1, Math.abs(change) / 3),
        dir: marketDirection(change),
        label: marketLabel(change),
        trading: isTrading(m, now) ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
    }
  }),
})

// --- The mark --------------------------------------------------------------

/**
 * One tone expression, read by everything that needs a market's colour.
 *
 * `dir` already folds the flat band in, so there is no second threshold here to
 * fall out of step with the first.
 */
const TONE: ExpressionSpecification = [
  'case',
  ['==', ['get', 'dir'], 0],
  MAP_COLOURS.neutral,
  ['<', ['get', 'dir'], 0],
  OVERLAY_COLOUR.marketDown,
  OVERLAY_COLOUR.marketUp,
]

/**
 * The exchange marks' layout and paint.
 *
 * Both carry an explicit return type, and that is the whole reason the caller no
 * longer needs `as never`.
 *
 * A style expression is a tuple to MapLibre's types — `['get', 'dir']` has to
 * narrow to the `["get", string]` member of `ExpressionSpecification`. TypeScript
 * only narrows an array literal that way when it has an expected type to narrow
 * *against*: written inline in an `addLayer` call it does, so every layer defined
 * there checks. Returned from a bare `() => ({…})` it does not — the literals
 * widen to `(string | number | string[])[]`, which matches nothing in the spec,
 * and the two call sites were silenced with `as never` rather than typed.
 *
 * That cast is not narrow. `never` disables checking on the *whole* object, so
 * these two — the map's most conditional expressions, three nested `case`s over a
 * signed value — were the layers least watched by the checker. Naming the return
 * type restores contextual typing at the literal, which is where it belongs.
 */
export const marketLayout = (): NonNullable<SymbolLayerSpecification['layout']> => ({
  // Shape carries direction, so it survives a reader who cannot see hue —
  // which olive against terracotta, at 5px, does not.
  'icon-image': [
    'case',
    ['==', ['get', 'dir'], 0],
    'tick-flat',
    ['<', ['get', 'dir'], 0],
    'tick-down',
    'tick-up',
  ],
  // `wantedCssPx / GLYPH_BOX`: 7px at rest, 16px at a 3% day.
  'icon-size': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.44, 1, 1.0],
  // Both flags. `allow-overlap` because a suppressed mark reads as an absence —
  // and, less obviously, because `queryRenderedFeatures` only returns *placed*
  // symbols, so a collided mark would be silently unhoverable and its card
  // would never open. `ignore-placement` because circles never entered the
  // collision index and symbols do: without it these marks would start
  // suppressing the basemap's own country and place labels.
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  // The threshold is a `case` inside `text-field`, never a layer filter. A
  // filter would take the tick with it; an empty string suppresses only the
  // number and leaves the icon placed.
  //
  // `step` on the outside and the `case` within, not the other way round:
  // MapLibre allows `['zoom']` only as the direct input of a top-level `step`
  // or `interpolate`, so putting the zoom-varying threshold inside the `case`
  // fails validation and the whole layer is dropped — no marks, no numerals,
  // and every later call against the layer id erroring in turn.
  'text-field': [
    'step',
    ['zoom'],
    ['case', ['>=', ['get', 'abs'], NAME_PCT], ['get', 'label'], ''],
    NAME_ZOOM,
    ['case', ['>=', ['get', 'abs'], NAME_PCT_CLOSE], ['get', 'label'], ''],
  ],
  'text-font': ['Noto Sans Bold'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 5, 12.5],
  // Left and right first, so the number reads as one token beside its tick
  // rather than stacked under it. Eight European exchanges sit within a few
  // degrees; letting the label hop is what turns dropped labels into placed
  // ones.
  'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
  'text-radial-offset': 0.85,
  'text-justify': 'auto',
  // Generous, because the things this has to clear are dense: a cluster count,
  // a country name, another exchange three degrees away.
  'text-padding': 6,
  // The inverse of the cluster count's policy, and deliberately so: a cluster
  // with no numeral is an empty disc that says nothing, whereas a market tick
  // with no numeral is still a complete mark. So the tick never drops and the
  // number does, biggest mover first.
  'text-allow-overlap': false,
  'text-optional': true,
  'symbol-sort-key': ['-', 0, ['get', 'abs']],
})

export const marketPaint = (): NonNullable<SymbolLayerSpecification['paint']> => ({
  'icon-color': TONE,
  // What the fill used to say. A closed exchange sits back because its number
  // is last night's; an open one carries full weight. Direction moved to the
  // silhouette, which is what freed this channel to answer "is this live".
  'icon-opacity': ['case', ['==', ['get', 'trading'], 1], 0.95, 0.6],
  'icon-halo-color': MAP_COLOURS.labelHalo,
  'icon-halo-width': 1.2,
  'text-color': TONE,
  'text-halo-color': MAP_COLOURS.labelHalo,
  'text-halo-width': 1.1,
})

// --- The tally -------------------------------------------------------------

export interface MarketTally {
  up: number
  down: number
  flat: number
  closed: number
  risers: MapExchange[]
  fallers: MapExchange[]
}

/**
 * The shape of the day.
 *
 * Counted through `marketDirection`, the same predicate that colours the marks —
 * so the strip cannot say ▲11 while ten marks are green. `up + down + flat`
 * always equals the number of exchanges, which is what a test can hold on to.
 */
export const marketTally = (markets: MapExchange[], now = Date.now()): MarketTally => {
  let up = 0
  let down = 0
  let flat = 0
  let closed = 0
  for (const m of markets) {
    const d = marketDirection(m.changePct)
    if (d > 0) up++
    else if (d < 0) down++
    else flat++
    if (!isTrading(m, now)) closed++
  }
  const moved = markets.filter((m) => marketDirection(m.changePct) !== 0)
  // Two from each end rather than a top four by magnitude: on a rout day a top
  // four names four fallers and hides that anything rose at all. The strip's
  // job is the shape of the day, and a shape has two ends.
  const risers = moved
    .filter((m) => m.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, MOVERS_PER_SIDE)
  const fallers = moved
    .filter((m) => m.changePct < 0)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, MOVERS_PER_SIDE)
  return { up, down, flat, closed, risers, fallers }
}

// --- The ribbon: currencies, metals, crypto --------------------------------

/** One series out of `/api/trends.json`. */
export interface TrendIndicator {
  id: string
  label: string
  unit?: string
  cadence?: string
  source?: string
  values: number[]
  periods?: string[]
  asOf?: string
  /**
   * What this instrument *is*, written once a day by `narrate-indicators.js`.
   *
   * Optional because the build joins it conditionally, so a payload written
   * before that stage first ran carries none and every row falls back to the
   * catalog `note` below. It rides the list payload rather than
   * `/api/entity/{id}.json` because it is the row's `title` and has to be
   * present before anything is pressed; `recent` and `citations` do not, and
   * are fetched when a card opens.
   */
  standing?: string
}

/**
 * One entry of `/api/trends.json`'s `events` — a scheduled central-bank
 * decision, OPEC+ meeting, major non-US release or summit/election, merged
 * server-side (`fetch-trends.js`) from the hand-curated catalog and FRED's
 * own recognised releases. Superseded `TrendRelease`/`nextRelease` entirely
 * (2026-08-08): where that surfaced one US-only release as a caption line,
 * this is a real block of several rows, each explained.
 *
 * `standing`/`recent`/`relatedArticles` are written by `narrate-events.js` and
 * joined in full at build time — unlike an indicator, an event has no
 * `/api/entity/{id}.json` of its own to fetch `recent` from later, so it
 * rides the list payload alongside `standing`. Optional because a snapshot
 * built before that stage first ran, or an event the stage has not yet
 * reached, carries none.
 */
export interface TrendEvent {
  id: string
  title: string
  institution: string
  kind: 'central-bank' | 'opec' | 'econ-release' | 'summit-election'
  date: string
  standing?: string
  recent?: string
  relatedArticles?: Array<{ slug: string; title: string; date?: string; dateFormatted?: string }>
}

/** The block's own row cap — matches the density of `odds`/`attention` and
 *  keeps a calendar of several months' worth of meetings scannable. */
const EVENTS_BLOCK_ROWS = 5

/**
 * Whole days between now and an event's date, at day granularity — negative
 * once the date has passed. Exported so the card (`sheet.ts`'s `showEvent`)
 * computes the same figure the row that opened it did, rather than a second
 * copy that could disagree by a day around midnight.
 */
export const daysUntilEvent = (date: string, now = Date.now()): number => {
  const today = Math.floor(now / DAY_MS) * DAY_MS
  const t = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round((t - today) / DAY_MS) : Number.NaN
}

/**
 * The soonest scheduled events, nearest first.
 *
 * Unlike `odds`/`attention` there is no move to rank on — a calendar entry
 * either happens or it does not — so proximity is the only honest ordering.
 * Compared at day granularity, so an event scheduled for today still sorts
 * first rather than being read as overdue.
 */
export const eventEntries = (
  events: readonly TrendEvent[] | undefined,
  now = Date.now(),
): Array<TrendEvent & { daysUntil: number }> => {
  if (!events?.length) return []
  const withCountdown: Array<TrendEvent & { daysUntil: number }> = []
  for (const ev of events) {
    const daysUntil = daysUntilEvent(ev.date, now)
    if (!Number.isFinite(daysUntil) || daysUntil < 0) continue
    withCountdown.push({ ...ev, daysUntil })
  }
  return withCountdown.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, EVENTS_BLOCK_ROWS)
}

/** "today" / "tomorrow" / "in 6d" close in, the date itself once a reader
 *  cannot usefully picture a countdown that far out — the same handoff
 *  `staleLabel` makes between an age and a bare date. */
export const eventCountdown = (daysUntil: number, date: string): string => {
  if (daysUntil <= 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  if (daysUntil <= 13) return `in ${daysUntil}d`
  return shortDate(date)
}

interface TickerItem {
  id: string
  label: string
  /** A sentence saying what the instrument is — see `TickerEntry.note`. */
  note?: string
  /** For the flag. A three-letter code is not a thing most readers can place —
   *  PKR and IDR especially — and a flag costs no width at all. */
  iso2?: string
  /**
   * Set where the series is quoted the other way up.
   *
   * The FX basket is published as `X / USD` — 47.32 TRY to the dollar — so the
   * number *rises* as the currency *weakens*. Printing its raw sign would paint
   * a collapsing lira green, which is the exact opposite of what happened, and
   * it would do it most emphatically for the currencies this site covers most
   * closely. Inverting turns the series back into the thing a reader means when
   * they say "the lira is down".
   */
  invert?: boolean
}

/**
 * What the ribbon carries, and why this set.
 *
 * Currencies lead with the ummah basket rather than the reserve pair, for the
 * same reason the exchange catalog does: a money row that opens EUR/JPY and
 * stops is a Western money row. The euro and the yen are here because half the
 * basket is priced against them, not because they come first.
 *
 * Copper is deliberately absent despite being in the payload: it is a *monthly*
 * series, and a monthly change sitting in a row of daily ones would be read as
 * today's move. Silver has arrived: `xag` is published daily in `$/oz` as of
 * 2026-07, so the metals group below resolves and — since `NISAB_WEIGHTS` was
 * already keyed for it — the silver threshold on the metals card computes with
 * no code change, exactly as that note predicted. Its `silver` twin, an id
 * nothing has ever published, was carried here for months on the "it will
 * appear the day the series exists" bargain the exchange catalog makes; the
 * series appeared under the other name, and a lookup that can never resolve is
 * not a placeholder, it is a dead row that costs a `seen` guard to suppress.
 *
 * ── The basket is fifteen, and was six of fifteen ─────────────────────────
 *
 * `/api/trends.json` publishes fifteen daily FX series and this table read six
 * of them, so a row labelled `currencies` was the unweighted mean of a quarter
 * of the currencies the site had already fetched — and the nine it dropped
 * include the naira, the taka and the Lebanese pound, which is to say the
 * currencies whose moves are the story on a site covering Nigeria, Bangladesh
 * and Lebanon. The paragraph above says a money row that opens EUR/JPY and
 * stops is a Western money row; a basket that stops at four is a smaller
 * version of the same objection.
 *
 * The order is the editorial claim and survives the widening: the ummah basket
 * leads, the rest of the global south follows, and EUR/JPY stay last as the
 * comparison the others are read against. The pegged and managed ones (LBP,
 * CNY) will draw flat much of the time — which is a true statement about a peg
 * and worth seeing, not a reason to leave them out.
 */
const TICKER: Array<{ group: string; items: TickerItem[] }> = [
  {
    group: 'currencies',
    items: [
      { id: 'fx-try', label: 'TRY', iso2: 'TR', invert: true },
      { id: 'fx-egp', label: 'EGP', iso2: 'EG', invert: true },
      { id: 'fx-pkr', label: 'PKR', iso2: 'PK', invert: true },
      { id: 'fx-idr', label: 'IDR', iso2: 'ID', invert: true },
      { id: 'fx-bdt', label: 'BDT', iso2: 'BD', invert: true },
      { id: 'fx-ngn', label: 'NGN', iso2: 'NG', invert: true },
      { id: 'fx-lbp', label: 'LBP', iso2: 'LB', invert: true },
      { id: 'fx-inr', label: 'INR', iso2: 'IN', invert: true },
      { id: 'fx-zar', label: 'ZAR', iso2: 'ZA', invert: true },
      { id: 'fx-brl', label: 'BRL', iso2: 'BR', invert: true },
      { id: 'fx-mxn', label: 'MXN', iso2: 'MX', invert: true },
      { id: 'fx-rub', label: 'RUB', iso2: 'RU', invert: true },
      { id: 'fx-cny', label: 'CNY', iso2: 'CN', invert: true },
      // Comparison, not subject. The basket above is what this site is for;
      // USD, spliced in at the head, is the denominator all of them are quoted
      // against and so can never be the thing that goes. These two are here to
      // say what the basket moved *relative to*.
      //
      // They used to carry `comparison: true`, a flag marking them as the first
      // quotes the row would give up when the window stopped paying for them —
      // in the table rather than in CSS, so that reordering the basket could
      // not silently change which pair disappeared. The ≤1300px cull it drove
      // was deleted on 2026-08-01 when the row became four summaries, and the
      // flag has been written and read by nobody since. The editorial fact it
      // encoded is worth keeping and is this paragraph; the field was not.
      { id: 'fx-eur', label: 'EUR', iso2: 'EU', invert: true },
      { id: 'fx-jpy', label: 'JPY', iso2: 'JP', invert: true },
    ],
  },
  {
    group: 'metals',
    items: [
      { id: 'paxg', label: 'GOLD' },
      { id: 'xag', label: 'SILVER' },
    ],
  },
  {
    group: 'crypto',
    items: [
      { id: 'btc', label: 'BTC' },
      { id: 'eth', label: 'ETH' },
    ],
  },
]

/**
 * The world the money is moving in, as three series the map never surfaced.
 *
 * `/api/trends.json` carries 54 indicators and the ribbon read eleven of them.
 * These three are the ones a news map is actually read *against*: the price of
 * oil, the price of fear, and the price of money. Each is a single instrument
 * rather than a group, so a press opens its card directly — there is no set
 * behind it to summarise.
 *
 * Short labels, because these sit in a column that folds to a spine and a
 * truncated instrument name is worse than a code. Unlike the currency codes
 * above, all three of these are how the thing is actually referred to.
 */
const WORLD: TickerItem[] = [
  {
    id: 'brent',
    label: 'BRENT',
    note: 'The price of a barrel of North Sea crude, and the benchmark most of the world’s oil is sold against. It moves on supply — a strike, a sanction, a strait — and fuel, freight and fertiliser move after it.',
  },
  {
    id: 'vix',
    label: 'VIX',
    // "The price of fear" is the phrase this block's own docblock uses, and it
    // is a nickname rather than a definition — the card has room to say what
    // the number actually measures, which is where the nickname comes from.
    note: 'How much movement traders are paying to insure against in US stocks over the coming month. It rises when the market expects turbulence, not when prices fall, which is why a calm decline can leave it flat.',
  },
  {
    id: 'us-10y',
    label: 'US 10Y',
    note: 'What it costs the US government to borrow for ten years, as a yearly percentage. It is the rate most other borrowing on earth is priced against, so mortgages, corporate debt and the currencies above all take their cue from it.',
  },
]

/**
 * How far back the money lines reach, in days.
 *
 * This replaced a constant — `SPARK_WINDOW = 30` — whose docblock argued,
 * correctly, that a column of sparklines covering different periods is several
 * incomparable pictures set to one rhythm, and then failed to prevent it. It
 * counted *observations*, and thirty observations is thirty calendar days on
 * the FX basket and about six weeks on an exchange trading five days in seven.
 * The rule was right and the unit was wrong; every row on the rail has been
 * covering a different period the whole time, with the printed percentage
 * beside each measuring a different span.
 *
 * Windowing by date fixes that as a side effect of doing what a reader asked
 * for. All seven rows now cover exactly the period named on the control, and
 * where a series cannot fill it the line is drawn short rather than stretched —
 * see `coverage` in `series-window.ts`, which is what keeps the shortfall
 * visible instead of silent.
 *
 * The ladder is bounded by the data at both ends. Everything here is daily
 * closes, so the bottom rung is a single day's move (below) and there is
 * nothing finer to offer; the FX basket publishes 30 days and the exchanges a
 * quarter, so 90 is the widest step where anything at all fills the window.
 */
const RANGES: Array<[label: string, days: number]> = [
  ['24h', 1],
  ['7d', 7],
  ['30d', 30],
  ['90d', 90],
]

/**
 * The slope scale for the 24h step, in percent, symmetric about zero.
 *
 * At one day there are exactly two closes, which is a real line and a useless
 * one if it autoscales: two points scaled to their own domain are a full-height
 * diagonal whatever they are, so a −0.02% day and a −2.9% day draw the same
 * picture and only the figure beside them separates them. Against a fixed
 * domain the same pair draws a slope proportional to the move — a calm day
 * reads flat, a violent one reads steep — which is the one thing a sparkline of
 * a single day's change has to say.
 *
 * Fixed rather than fitted to the day's own range, for the reason the map's
 * density field is not rescaled to the visible set: rows then compare with each
 * other *and* across days, and a quiet day is allowed to look quiet. Moves past
 * it clamp, which costs the difference between "very large" and "enormous" on a
 * shape that is not carrying magnitude to more precision than that anyway.
 *
 * 3 is measured against the payload rather than chosen: across a real trends
 * file the daily moves run to ~0.5% on the FX basket, ~1% on the metals and the
 * exchanges, and 2–3% on crypto — so the cap is where the busiest group's
 * ordinary day lands, and the quieter groups keep their whole range inside it.
 */
const DAY_SLOPE_CAP = 3

/** The latest move in a series, as a signed percentage. */
export const seriesChangePct = (values: number[], invert = false): number | null => {
  if (!Array.isArray(values) || values.length < 2) return null
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return null
  const pct = ((last - prev) / prev) * 100
  return invert ? -pct : pct
}

export interface TickerEntry {
  group: string
  /**
   * A sentence saying what this instrument *is*, for the card.
   *
   * Only where the name does not carry it. `GOLD` and `BTC` need nothing;
   * `VIX` and `US 10Y` are opaque unless you already know them, and a rail
   * that prints a figure against a name a reader cannot decode is asking them
   * to take it on trust. The chokepoint and exchange cards already do this
   * with a `blurb` from their payloads — the trends feed carries no such
   * field, so these are ours, and they sit in the catalog beside the label for
   * the same reason the exchange gaps do: editorial text belongs with the
   * editorial decision.
   *
   * **Since 2026-08-08 this is normally the dispatch's `standing`** — the same
   * sentence, written per row for every instrument rather than by hand for
   * three of them — and the catalog strings survive as the fallback for a
   * payload built before that stage ever ran.
   */
  note?: string | undefined
  /**
   * A warning about the *provenance* of the number, not an explanation of it.
   *
   * Separate from `note` because the two survive different rewrites. `note` is
   * a description and the dispatch now writes it; this is a standing editorial
   * disclosure, and folding it into a generated field would mean a model could
   * drop it. `odds` carries the only one: a prediction market is a price set by
   * people with money on the outcome, and `map.md` records that saying so is a
   * correctness rule rather than a nicety — without it the block borrows the
   * standing of the institutional readings above it.
   */
  caveat?: string | undefined
  /**
   * The last day this row's *block* traded, when that is not today.
   *
   * Set by the block builder rather than by the row, because it is a fact about
   * the set: rows drawn side by side have to share a right edge or their
   * periods are not comparable. See `sparkInput`'s `blockEdge`.
   */
  edge?: number | undefined
  /** The registry id behind it. `usd-index` for the one derived entry. */
  id: string
  /** The short code the ribbon prints — `TRY`, `GOLD`, `BTC`. */
  label: string
  /** What it is actually called: "Turkish lira". The ribbon has no room; the
   *  card leads with it. */
  name: string
  flag: string
  pct: number
  unit?: string | undefined
  level: number
  /**
   * The series as the card should *draw* it, which for FX is not the series as
   * published. `X / USD` rises when the currency falls, so plotting it raw
   * would give a line climbing away under a red, falling percentage — the chart
   * contradicting the number above it. Reciprocating puts the currency itself
   * on the y-axis, so the line goes the way the figure says. The card still
   * prints the conventional quote as its level; a sparkline has no y-axis, so
   * only the shape is being changed, and the shape was the thing that was wrong.
   */
  values: number[]
  periods: string[]
  asOf?: string | undefined
  sourceLabel?: string | undefined
}

/**
 * A set of series as one index: each normalised to its own first value, the
 * lot averaged, and the result rebased to 100.
 *
 * Normalising first is what makes the average mean anything. A raw mean over
 * an exchange level near 3.3 million and one near 1,400 is the first exchange
 * with a rounding error attached — the arithmetic would run, the line would
 * have a shape, and the shape would be one member's.
 *
 * The inputs need not be the same length, so the last N points are taken,
 * where N is the shortest. Aligning on *dates* would be the better answer and
 * is not available here: thirty exchanges keep thirty holiday calendars, and
 * nothing drawn from this has an axis for a date to land on.
 *
 * Two things any index built this way is *not*, and both belong wherever it is
 * printed rather than being left to be assumed: it is unweighted, and its
 * membership is editorial. It is exactly as broad as the set it summarises and
 * no broader.
 */
const meanIndex = (series: number[][]): number[] | null => {
  const usable = series.filter((s) => s.length > 1 && Number.isFinite(s[0]) && s[0] !== 0)
  if (!usable.length) return null
  const n = Math.min(...usable.map((s) => s.length))
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    let sum = 0
    let count = 0
    for (const s of usable) {
      const slice = s.slice(s.length - n)
      const base = slice[0]
      const v = slice[i]
      if (!Number.isFinite(v) || !Number.isFinite(base) || base === 0) continue
      sum += v / base
      count++
    }
    out.push(count ? (sum / count) * 100 : Number.NaN)
  }
  return out
}

/**
 * One constituent of a sparkline row, as the row already holds it.
 *
 * A group is several of these and a world instrument is one, which is why the
 * arithmetic below takes a list in both cases — the alternative was two code
 * paths differing only in an array length.
 */
export interface SparkMember {
  values: number[]
  periods?: string[] | undefined
  asOf?: string | undefined
  /** The day's move, as the row prints it. Only the 24h step reads it. */
  pct: number
}

export interface SparkInput {
  values: number[]
  span: [number, number]
  domain?: [number, number] | undefined
  /**
   * The change to print, when it is not the one the drawn line states.
   *
   * `null` everywhere except the 24h step, where the line is a slope in percent
   * space and its own last-against-first is meaningless — the figure there is
   * the day's move, clamped for the drawing and printed unclamped.
   */
  pct: number | null
  /**
   * How many of the row's members the line was actually raised from.
   *
   * Equal to `total` on almost every row and almost every step; it differs when
   * a member's published series has holes wide enough that its window is not
   * the window — see the completeness filter below. Reported rather than
   * swallowed, because a set that has quietly shrunk still reads as the whole.
   */
  members?: { drawn: number; total: number } | undefined
  /**
   * The first and last drawn observation **in the series' own units**, for a
   * row that is one instrument rather than a composite.
   *
   * `values` cannot answer this: at the calendar steps it is `meanIndex`
   * output, which is rebased to 100 by construction, so a difference taken
   * across it is a percentage wearing the units of an index. A row that has to
   * print a change in points — a probability going 20 → 25 moved **five
   * points**, and `+25%` there would be a real error of kind — needs the raw
   * ends, and it needs *these* ends rather than the payload's last two, or the
   * figure would describe a period the line beside it does not draw.
   *
   * Absent for a composite, where "the units" is not a thing that exists.
   */
  ends?: [number, number] | undefined
}

/**
 * A row's members, resolved into one line over one calendar window.
 *
 * The whole of the range control's arithmetic, kept out of the DOM so it can be
 * tested against real payload shapes.
 */
export const sparkInput = (
  members: SparkMember[],
  days: number,
  /**
   * The window's right edge — the rail's, never the data's.
   *
   * This used to be `Math.max(...ends)`: each row ended at its own last
   * observation, so the world block drew last week while the money block drew
   * this week, in one column, under one control naming one period. Measured on
   * 2026-08-03, `brent` was seven days stale and `vix` four beside a currency
   * basket published that morning, and nothing on screen said so. It is the
   * incomparable-periods bug the calendar window was built to end, moved to the
   * other edge of the box — and it could not be seen, because every line ended
   * flush against the same column whatever period it covered.
   *
   * Floored to UTC midnight, because that is the unit the reconstructed dates
   * are in: comparing a wall-clock instant against a midnight would make "the
   * last day" mean 24 hours ending at whatever time the reader loaded the page,
   * and today's close would fall in or out of it depending on the hour.
   *
   * ── The edge is the market's, not the wall clock's (2026-08-03) ────────────
   *
   * "The rail's, never the data's" was right about *staleness* and wrong about
   * *weekends*, and the second failure is far more common than the first. These
   * are weekday series: `brent`, `vix` and `us-10y` print Monday to Friday. A
   * three-day window ending on a Monday is `[Fri, Mon]` — **one close and two
   * days on which nothing traded anywhere** — so `covered` finds fewer than two
   * observations and every row in the `world` block draws a dotted rule. Not
   * occasionally: **every Sunday and every Monday, at the default range.**
   *
   * The day step already knows this — its `FRESH_DAYS` tolerance exists because
   * "a Monday would drop every exchange" — and the calendar steps never got the
   * equivalent. That asymmetry is the whole bug, and a reader hit it twice.
   *
   * So `blockEdge` moves the window's right edge to the last day the block
   * *actually traded*, computed once from the rows being drawn together rather
   * than per row. Every property of the original fix survives: the rows in a
   * block still share one edge, so the periods are still comparable, and a row
   * that is genuinely behind still ends short of it and still prints its age
   * against the real clock. What changes is that the edge is now a fact about
   * the instruments instead of a fact about when the page was opened. Measured
   * on the Monday this was written, at the 3d step: `vix` 1 observation → 4,
   * `us-10y` 0 → 3, and `brent` 0 → 0, which is correct, because `brent` last
   * printed four trading days before the edge and being dotted is what that is.
   *
   * It is deliberately **per block, not per row**: a row-level edge would let a
   * stale series quietly redraw itself as fresh, which is the bug the paragraph
   * above exists to prevent.
   */
  now = Date.now(),
  /**
   * The last day this block traded, when that is not today. See above. Omitted,
   * the window ends at `now` — which is right for anything trading every day.
   */
  blockEdge?: number,
): SparkInput | null => {
  if (!members.length) return null

  const clock = Math.floor(now / DAY_MS) * DAY_MS
  const to = blockEdge != null && blockEdge < clock ? blockEdge : clock
  const from = to - days * DAY_MS

  const dated = members.map((m) => {
    const dates = seriesDates(m.periods, m.asOf)
    return dates && dates.length === m.values.length
      ? { values: m.values, dates, pct: m.pct }
      : null
  })

  // All or none. A composite mixing date-windowed members with count-windowed
  // ones is the incomparable-periods bug rebuilt inside a single row, and a
  // source that changes its date format should cost the range control's
  // precision rather than its correctness — so the whole row falls back to the
  // count window the rail used before there was one.
  const undated = dated.some((d) => d === null)

  /**
   * The two freshness gates, which are two questions and not one.
   *
   * Both exist because `to` is the rail's edge rather than the data's, and both
   * turn a wrong number into no number — but a row answering *"what did this do
   * today"* and a row answering *"where has this been over a month"* are
   * disqualified by different facts, and one gate serving both was wrong in
   * whichever direction it was tuned.
   *
   * **`current`** is the day step's: has this printed recently enough for its
   * last move to *be* today's move. It has to tolerate the weekend, or on a
   * Monday every exchange in the world is disqualified — the freshest close that
   * exists is Friday's, and a row that empties because the market was shut is a
   * row punishing the calendar. `FRESH_DAYS` is the same tolerance `staleLabel`
   * uses to decide whether to print an age, so a row that draws no line and a
   * row that prints `7d` are answering to one threshold rather than two that can
   * drift apart.
   *
   * **`covered`** is the calendar steps': does the window actually contain a
   * segment of this series — two observations, not one. `windowByDate` has a
   * two-point floor, so a window landing inside a holiday returns the last two
   * points regardless and the row says "here is what there is" rather than "no
   * data"; that was written when the window ended at the series' own last point,
   * where a gap could only mean a holiday. With the window ending at *now*, a
   * gap can also mean the series stopped, and those are not the same fact.
   * Measured: at the 7d step `brent`'s newest print (Jul 27) fell exactly on the
   * window's left edge, one point cleared a `>= from` test, the floor pulled in
   * Jul 24 to keep it company, and the row drew a **3px line in a 61px box**
   * captioned −8.5% — the Jul 24→27 move, labelled as the week.
   *
   * Undated members are exempt from both rather than dropped: with no dates
   * there is nothing to test, and taking the strict reading would empty a row
   * for a label-format change rather than for a fact about the data.
   */
  /**
   * How far behind the window's right edge a member may be and still answer
   * "what did this do today".
   *
   * Two rules, because there are two kinds of block. **Without a `blockEdge`**
   * the edge is the wall clock, and the tolerance has to absorb the weekend or
   * a Monday drops every exchange on earth — that is what `FRESH_DAYS` is for
   * and it stays. **With one**, the edge is already the last day this block
   * traded, so the weekend is accounted for and no tolerance is left to spend:
   * a member that printed on the edge has a reading for it and a member that
   * did not, does not.
   *
   * That is stricter than what shipped an hour ago, and deliberately: with the
   * edge at Friday, `us-10y` last printing Thursday drew its Wed→Thu move
   * captioned as the latest day, beside `vix` drawing Thu→Fri. Two different
   * days under one label is the `BRENT −8.46%` error in miniature — the thing
   * the shared right edge exists to prevent — and it costs a line at the 24h
   * step that was never entitled to be there. The row prints `4d` instead.
   */
  const recent = blockEdge != null ? to : to - FRESH_DAYS * DAY_MS
  const current = undated
    ? members
    : dated.flatMap((d) => (d && (d.dates[d.dates.length - 1] ?? 0) >= recent ? [d] : []))
  /**
   * **A carry-in was tried here and reverted** (2026-08-03).
   *
   * The complaint it answered is real and stands: `vix`, last printing three
   * days back, drew a line at 24h, a **dotted rule at 3d** and a line again at
   * 7d — a range control whose middle rung is emptier than the rungs either side
   * of it is one a reader cannot form a model of. Letting the observation
   * *before* the window count toward the pair fixed the monotonicity and
   * recreated the failure the paragraph above records: both of `vix`'s points
   * sit at the window's left edge, so `coverage` clamps the span to its 5% floor
   * and the row draws **a 12px line in a 250px box**. A stub is not more
   * informative than a dotted rule; it is the same absence drawn as though it
   * were a reading.
   *
   * The residual inconsistency belongs to the *day* step, not to this gate: it
   * tests `FRESH_DAYS` rather than the window, and that tolerance exists so a
   * Monday does not blank every exchange over the weekend. Narrowing it to
   * genuine non-trading gaps needs each series' own calendar, which the FRED
   * dailies do not carry. Left written down rather than guessed at.
   */
  const covered = dated.flatMap((d) => (d && d.dates.filter((t) => t >= from).length >= 2 ? [d] : []))

  // --- The day step ------------------------------------------------------
  // Two closes, drawn as the segment between them against a fixed scale. The
  // group's figure is the mean of its members' displayed percentages — the same
  // quantity `summarise()` derives `net` from, so the slope and the tick above
  // it cannot disagree about which way the basket went.
  //
  // It reads `pct`, which is last-against-previous whatever the dates say — so
  // before the gate above a row with no print for a week still answered "what
  // did this do today". Today that was `BRENT −8.46%` at the 24h step: a real
  // number, correctly computed, describing Jul 24 → Jul 27 and captioned as the
  // past day, beside crypto's genuinely-yesterday −0.51%.
  if (days <= 1) {
    const source = current
    const pcts = source.map((m) => m.pct).filter((p) => Number.isFinite(p))
    if (!pcts.length) return null
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length
    const drawn = Math.max(-DAY_SLOPE_CAP, Math.min(DAY_SLOPE_CAP, mean))
    // The one member's own last two closes, which is exactly the pair the slope
    // above is drawn from — so a row printing points and a row printing percent
    // are describing the same two observations.
    const only = source.length === 1 ? source[0] : undefined
    const raw = only?.values ?? []
    const pair: [number, number] | undefined =
      raw.length >= 2
        ? [raw[raw.length - 2] as number, raw[raw.length - 1] as number]
        : undefined
    return {
      values: [0, drawn],
      span: [0, 1],
      domain: [-DAY_SLOPE_CAP, DAY_SLOPE_CAP],
      pct: mean,
      members: { drawn: pcts.length, total: members.length },
      ends: pair,
    }
  }

  // --- The calendar steps ------------------------------------------------
  if (undated) {
    const index = meanIndex(members.map((m) => m.values))
    return index ? { values: index, span: [0, 1], pct: null } : null
  }

  if (!covered.length) return null

  const all = covered.flatMap((d) => {
    const w = windowByDate(d.values, d.dates, from)
    return w ? [w] : []
  })
  if (!all.length) return null

  /**
   * Members whose window is materially the window everyone else has.
   *
   * `meanIndex` aligns by index and takes the last N where N is the *shortest*
   * member, so one gappy series decides the shape of the whole composite — and
   * measured against a real payload that is not hypothetical. Four exchanges
   * (Tadawul, DFM, SET, PSE) publish series with multi-week holes in them, so
   * inside a 7-day window they hold **one** observation against a median of six,
   * and the world's thirty equity indices were drawing as a two-point straight
   * line: a clean trend, stated confidently, sourced from the one member least
   * able to support it.
   *
   * So a member joins if it carries at least four fifths of what the median
   * member carries. Not half, which was tried and still let an 11-session
   * member set N for a 21-session window; four fifths is "substantially the
   * same period", which is the actual condition for averaging two series
   * together. Below two survivors the filter is abandoned rather than trusted —
   * a rule that can empty its own input is not a rule.
   *
   * What is dropped is dropped for a fact about the data, so the row says so
   * where it can: `sparkInput` reports the membership and the caller puts it in
   * the label. A bounded set that does not state its bound reads as the whole.
   */
  const counts = all.map((w) => w.values.length).sort((a, b) => a - b)
  const median = counts[Math.floor(counts.length / 2)] ?? 0
  const kept = all.filter((w) => w.values.length >= median * 0.8)
  const windows = kept.length >= 2 ? kept : all

  const index = meanIndex(windows.map((w) => w.values))
  if (!index) return null

  // `meanIndex` takes the last N of every member where N is the shortest, so
  // the composite covers the period of its *shortest* member — the latest
  // start, not the earliest. Taking the earliest would draw a line claiming a
  // reach that only one constituent has.
  const drawnFrom = Math.max(...windows.map((w) => w.from))
  // The right edge is the *furthest* member, which is the mirror of the rule
  // above rather than an exception to it. `meanIndex` aligns by index from the
  // right, so the composite's last point is every member's last point — a group
  // reaches as far as the member that reaches furthest, and the one lagging
  // behind is reported through `members` and named by the row's age token.
  const drawnTo = Math.max(...windows.map((w) => w.to))
  const sole = windows.length === 1 ? windows[0] : undefined
  const soleEnds: [number, number] | undefined =
    sole && sole.values.length >= 2
      ? [sole.values[0] as number, sole.values[sole.values.length - 1] as number]
      : undefined
  return {
    values: index,
    span: coverage(drawnFrom, drawnTo, from, to),
    pct: null,
    members: { drawn: windows.length, total: members.length },
    ends: soleEnds,
  }
}

// --- Nisab -----------------------------------------------------------------

/** Troy ounce in grams. Both metals in the payload are quoted `$/oz`. */
const TROY_OZ_G = 31.1034768

/**
 * The weights of gold and silver at which zakat becomes due.
 *
 * The classical thresholds are 20 dinars of gold and 200 dirhams of silver.
 * Converting those into grams is where the schools part company, because it
 * depends on the mithqal and the dirham you measure against — so the figures
 * in circulation are 85 g and 87.48 g for gold, 595 g and 612.36 g for silver,
 * and all four are defensible.
 *
 * This prints the range rather than choosing. Picking one would make the site
 * appear to hold a fiqh position it has no business holding, and the range is
 * about 3% wide — narrow enough to be useful for the only thing a reader wants
 * it for, which is knowing roughly where the line is today.
 */
const NISAB_WEIGHTS: Record<string, { metal: string; grams: [number, number] }> = {
  paxg: { metal: 'gold', grams: [85, 87.48] },
  xag: { metal: 'silver', grams: [595, 612.36] },
}

export interface Nisab {
  metal: string
  grams: [number, number]
  /** The threshold in the currency the metal is quoted in — USD, for both. */
  value: [number, number]
}

/**
 * The zakat threshold, from the metal price the ribbon already prints.
 *
 * This is the one question a Muslim reader actually has about the gold price,
 * and the whole answer is arithmetic on a number already on the card — so it
 * costs no fetch, no payload and no new surface. It appears only inside a card
 * the reader has opened, on the two rows it applies to.
 *
 * `null` for everything else, including silver until the `xag` series lands in
 * `/api/trends.json`. Silver is the more consequential of the two — it is the
 * lower threshold, so it catches more wealth, which is the majority position
 * for zakat on cash — and it is currently the one this site cannot compute.
 */
export const nisab = (entry: Pick<TickerEntry, 'id' | 'unit' | 'level'>): Nisab | null => {
  const w = NISAB_WEIGHTS[entry.id]
  if (!w || entry.unit !== '$/oz' || !Number.isFinite(entry.level) || entry.level <= 0) return null
  const perGram = entry.level / TROY_OZ_G
  return { metal: w.metal, grams: w.grams, value: [perGram * w.grams[0], perGram * w.grams[1]] }
}

/** ISO 3166-1 alpha-2 → regional-indicator pair. */
const flagOf = (iso2?: string): string =>
  iso2 && iso2.length === 2
    ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : ''

/**
 * One table row and its published series, as the entry both the ribbon and the
 * card read.
 *
 * Extracted rather than written twice when the world block arrived: the
 * inversion below is the single most consequential line in this module — get it
 * wrong and a collapsing lira draws green — and a second copy of it is a second
 * chance to get it wrong for one of the two callers only.
 */
const entryFrom = (
  group: string,
  item: TickerItem,
  ind: TrendIndicator,
  pct: number,
): TickerEntry => ({
  group,
  id: item.id,
  label: item.label,
  name: ind.label,
  flag: flagOf(item.iso2),
  // The payload's sentence where there is one, the catalog's otherwise. The
  // catalog held three hand-written notes for fifty-seven series and two
  // block-wide constants standing in for the rest; `standing` is the same
  // sentence written for every row, so it wins where it exists and the
  // hardcoded ones remain the fallback for a build that predates the stage.
  note: ind.standing || item.note,
  pct,
  unit: ind.unit,
  level: ind.values[ind.values.length - 1],
  values: item.invert
    ? ind.values.map((v) => (Number.isFinite(v) && v !== 0 ? 1 / v : Number.NaN))
    : ind.values,
  periods: ind.periods ?? [],
  asOf: ind.asOf,
  sourceLabel: (ind as { sourceLabel?: string }).sourceLabel,
})

/**
 * How many rows a selected block may hold.
 *
 * **Five since 2026-08-03**, and it is still a layout number rather than an
 * editorial one. It was three because two open-ended blocks any larger put the
 * ground picker below the fold of a 1080p rail, and the rail's stated reading
 * order stopped being what the reader saw. Two groups have since left that
 * column — the categories to the story rail, the layers to a sheet — and the
 * second of those alone freed 223px against the 50.4px a two-line row costs.
 * Four more rows is 202px of it, which is the trade stated plainly: seven
 * switches a reader touches rarely, for four readings they look at constantly.
 *
 * The ceiling was real and it was a ceiling on **height**, not on interest
 * (2026-08-07). The argument below is still the right shape and its number was
 * a function of the row: at 50.4px a two-line row, five was what a 1080px column
 * could hold. These rows are one line now — they print the movement and not the
 * level, which is what the blocks are scanned for — so the same pixels buy twice
 * as many, and ten is what fits with the money and the world above them.
 *
 * The tail argument survives and is what stops this going further. The selection
 * ranks by change over the window, so a larger cap is a longer tail rather than
 * more information, and both blocks draw from feeds whose interesting end is
 * short: **six** live Polymarket series and **fifteen** Wikipedia ones. Ten is
 * therefore every market there is — the ranking has nothing left to decide on
 * `odds`, which is honest, since a block that shows all six is not selecting —
 * and two thirds of the pageview set, where it still is.
 *
 * **Twelve** since the money block went two-up and gave 54px back, and since
 * measurement showed the rail running to ~730px of a 1080px column with the
 * rest empty: the cap was rationing a resource that was not scarce. Twelve of
 * fifteen Wikipedia series still leaves the ranking something to decide, which
 * is the line the paragraph above draws and the reason this is not fifteen.
 */
export const BLOCK_ROWS = 12

/**
 * The shortest series a selected block will draw.
 *
 * Polymarket publishes a market from the day it opens, so the payload routinely
 * carries a question with **seven** points beside one with thirty-two. Ranked
 * on change, a young market wins almost by construction — its whole history is
 * the move that created it — so without a floor the block would fill with
 * whatever opened this week. Fourteen is a fortnight, which is also the corpus
 * the map itself opens on.
 */
const MIN_SELECT_POINTS = 14

/**
 * The floor under a percentage ranking, as the series' own median views a day.
 *
 * This is the missing half of a fix made twice and got wrong both times.
 * `attention` ranked on **percent** first, and the diagnosis of its failure was
 * exactly right: *Wildfire at 1,132 views moved 219 and outranked Donald Trump
 * at 34,427 moving 2,365* — a move eleven times smaller winning because the base
 * was thirty times smaller. Small-denominator bias, measured, in a block whose
 * subject is how much attention moved.
 *
 * The remedy chosen was to rank on **volume** instead, and that treated the
 * symptom by inverting the bias. Ranked on views moved, the articles with the
 * most views to move are the same articles every day: measured on a live
 * payload, the block printed `United States · India · Artificial intelligence`
 * at 3d and `Donald Trump · Iran · Artificial intelligence` at 30d, and it
 * printed them yesterday too. A block whose membership is a constant is a
 * caption, not a reading — which is what a reader reported.
 *
 * A *floor* treats the cause. Small denominators are the problem; excluding
 * small denominators is the fix; and percentage is then free to do the thing it
 * is good at, which is finding the article that moved unusually rather than the
 * article that is merely large. Measured against the same payload, at 3d it
 * gives `Lebanon +17% · Strait of Hormuz +16% · India +15%`.
 *
 * **2,000 is a guard rather than a cull.** All fifteen published series clear it
 * today — the smallest sits near 4,900 — so it removes nothing this map
 * currently fetches; what it removes is the 1,132-view article the record above
 * names, and any future series of that size. A bound that does nothing yet is
 * still worth stating, which is the rule `fetch-firms.js` keeps for `skipped`.
 *
 * A z-score against each series' own volatility was written first and measured
 * *worse*: large articles are proportionally **less** volatile, so dividing by
 * their own deviation promotes them, and the block came back
 * `Russia · India · United States` — the perennials, arrived at by a longer
 * route. Recorded because it is the obvious idea and it does not work.
 */
const MIN_ATTENTION_LEVEL = 2000

/** The series' own typical level, for the floor `attention` needs under it. */
const medianOf = (values: number[]): number => {
  const ok = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!ok.length) return 0
  const mid = ok.length >> 1
  return ok.length % 2 ? (ok[mid] ?? 0) : ((ok[mid - 1] ?? 0) + (ok[mid] ?? 0)) / 2
}

/**
 * The most-moved members of a source, as instrument rows.
 *
 * A *rule over the payload* rather than a catalog of ids, and that is forced
 * rather than preferred: `trends-sources/polymarket.js` fetches the top twenty
 * markets by 24-hour volume and emits `poly-<slug>` with no registry entry, so
 * the ids rotate as attention rotates. A `WORLD`-style table would have gone
 * quietly blank the first week a question closed. The row names its own
 * subject, so a changed subject is visible rather than silent — which is the
 * condition under which a rotating set is honest at all.
 *
 * Ranked through `sparkInput` rather than through the payload's own last-two,
 * so the ordering is computed over exactly the window the line will be drawn
 * across. Ranking on one period and drawing another is the `reference: 'open'`
 * trap in `charts.md` arriving at the selection step, where it would be
 * invisible: the rows would simply be the wrong three.
 */
const selectEntries = (
  indicators: TrendIndicator[],
  source: string,
  group: string,
  days: number,
  now: number,
  /**
   * How the ranking reads a move.
   *
   * `points` for odds: a probability's points are comparable across markets by
   * construction — 20→25 and 70→75 are both five points of probability.
   *
   * `percent` for attention, **with `minLevel` under it** — see
   * `MIN_ATTENTION_LEVEL` for why the floor is the fix and ranking on views
   * moved was not. The figure printed is the same percentage the ranking used,
   * so the ordering is derivable from what is on the row.
   */
  metric: 'points' | 'percent',
  /**
   * The smallest series the block will consider, as the published median.
   *
   * Absent where every candidate is comparable by construction: a probability's
   * points mean the same thing at 5% and at 95%, so `odds` needs no floor and
   * giving it one would silently drop the quiet markets it exists to surface.
   */
  minLevel: number | null,
  shorten: (label: string) => string,
  /** The block's fallback description, used only where the payload carries no
   *  `standing` for the row. */
  note: string,
  /** The block's standing provenance disclosure, if it has one. Never replaced
   *  by generated prose — see `TickerEntry.caveat`. */
  caveat?: string,
): TickerEntry[] => {
  const scored: Array<{ entry: TickerEntry; score: number; young: boolean }> = []
  for (const ind of indicators) {
    if (ind.source !== source) continue
    if (ind.cadence && ind.cadence !== 'daily') continue
    /**
     * The young-market floor **ranks** now; it used to exclude (2026-08-07).
     *
     * Its argument is about *selection*: a market's whole history is the move
     * that created it, so ranked against thirty-day series a week-old one wins
     * almost by construction and the block fills with whatever opened. Every
     * word of that holds while there are more candidates than rows.
     *
     * It stops holding when there are not. `odds` draws on six live Polymarket
     * series against a cap of twelve — the ranking has nothing to decide, so the
     * floor is not protecting an order, it is deleting a row. Measured: five of
     * the six rendered, and the missing one was an Israel–Iran ceasefire market
     * with eleven points, which is a question this map exists to carry.
     *
     * So a short series sorts *below* every qualified one and fills what is
     * left. It can never displace a series with a real history, which is the
     * whole of what the floor was for, and it appears exactly when the
     * alternative is an empty slot.
     */
    const young = ind.values.length < MIN_SELECT_POINTS
    const member: SparkMember = {
      values: ind.values,
      periods: ind.periods,
      asOf: ind.asOf,
      pct: seriesChangePct(ind.values) ?? 0,
    }
    const input = sparkInput([member], days, now)
    const ends = input?.ends
    if (!input || !ends) continue
    const [open, last] = ends
    const pct = open === 0 ? 0 : ((last - open) / open) * 100
    const move = metric === 'points' ? last - open : pct
    if (!Number.isFinite(move)) continue
    // `ind.values`, the **published** series — never `input.values`, which is
    // `meanIndex` output and therefore rebased to 100. A floor compared against
    // that measures every article on earth against the number 100 and empties
    // the block; found by running the selection against a real payload and
    // getting nothing back, which is a mistake with no shape to it — the
    // comparison ran and the answer was silently empty.
    if (minLevel !== null && medianOf(ind.values) < minLevel) continue
    scored.push({
      entry: {
        group,
        id: ind.id,
        label: shorten(ind.label),
        name: ind.label,
        flag: '',
        // The per-row sentence where the dispatch wrote one, the block-wide
        // constant otherwise. `note` was *only* ever the constant here, so
        // twelve attention rows carried one identical paragraph about what a
        // pageview is — the boilerplate this whole change exists to remove.
        note: ind.standing || note,
        caveat,
        // The tick's direction, and it is the *window's* move rather than the
        // last day's: these rows have no other figure, so a green tick over a
        // falling week would be the row disagreeing with its own line.
        pct,
        unit: ind.unit,
        level: ind.values[ind.values.length - 1],
        values: ind.values,
        periods: ind.periods ?? [],
        asOf: ind.asOf,
        sourceLabel: (ind as { sourceLabel?: string }).sourceLabel,
      },
      // Either direction: a collapse in attention is as much a fact as a
      // spike, and an unsigned rank is what lets the block say so.
      score: Math.abs(move),
      young,
    })
  }
  // Ties break on id so a payload that scores two rows identically still
  // produces the same three rows on every render — a block whose membership
  // flickers between two redraws of the same data is a block nobody can read.
  scored.sort(
    (a, b) =>
      // Qualified first, always — see `young` above. Only then by how far it
      // moved, and only then by id, so a payload that scores two rows
      // identically still produces the same block on every render: a membership
      // that flickers between two redraws of the same data is unreadable.
      Number(a.young) - Number(b.young) ||
      b.score - a.score ||
      (a.entry.id < b.entry.id ? -1 : 1),
  )
  return scored.slice(0, BLOCK_ROWS).map((s) => s.entry)
}

/**
 * What traders are paying for a question about the world — the `odds` block.
 *
 * Six live probability series sit in the payload, about exactly what this map
 * draws: whether the US invades Iran, whether the Israel–Iran ceasefire holds,
 * whether there is a nuclear deal, what the Fed does. Nothing on the site has
 * ever surfaced them.
 *
 * **It gets its own block rather than a seat in `world`, and the reason is
 * provenance.** Every other reading on this rail comes from an institution that
 * published a number and put its name to it — FRED, the IMF, an exchange, a
 * central bank. A prediction market is a *price*, set by people with money on
 * the outcome, and it is the weakest chain of transmission anywhere in this
 * rail. Mixing it into a column that opens with Brent would lend it the
 * standing of the rows above it. Its own heading, its own note on every row,
 * and a position below the instruments says what it is.
 *
 * The label is the question, shortened: a market is only readable as the thing
 * it is asking, so unlike every other row here the label cannot be a code.
 *
 * **The horizon stays.** The obvious shortening is to drop the deadline —
 * "Fed raises rates 25 bps after Sept 2026" becomes a tidy "Fed raises 25bp" —
 * and it changes the question. A probability without a date is not a shorter
 * statement of the same claim, it is a different and unanswerable one, and 56%
 * against a September deadline says something 56% on its own does not. So what
 * is cut is only what carries no information: the question mark, the "Will the"
 * every market opens with, and the year on a deadline that already names a
 * month and a day. "before 2027" keeps its year, because there the year *is*
 * the horizon.
 */
const oddsShort = (label: string): string =>
  label
    .replace(/\?\s*$/, '')
    // The article is required — see the matching note in
    // `scripts/lib/trends-sources/polymarket.js`. A bare "Will " strip leaves
    // "there be no change in Fed interest rates", which is not a phrase.
    .replace(/^will\s+the\s+/i, '')
    .replace(/(\b[A-Z][a-z]{2,8}\.?\s+\d{1,2}),?\s+\d{4}\b/g, '$1')
    .trim()

/**
 * The provenance disclosure, which is a `caveat` and no longer the row's whole
 * description (2026-08-08).
 *
 * It used to be both, because it was the only sentence these rows had. Now that
 * `narrate-indicators.js` writes a `standing` per market, the description job is
 * covered and this keeps the job it was actually written for: saying that the
 * number is a price rather than a forecast. Kept as a distinct field
 * deliberately — see `TickerEntry.caveat` — because a generated sentence could
 * drop it and the reason it is here is not editorial taste.
 */
const ODDS_CAVEAT =
  'The price of a bet, not a forecast: what traders on Polymarket are currently paying for this outcome, read as a probability. It moves with money and attention, and nobody has put their name to it.'

/** The fallback description, for a payload built before the dispatch stage. */
const ODDS_NOTE = 'What traders are paying for one outcome of an open question, read as a probability.'

export const oddsEntries = (
  indicators: TrendIndicator[],
  days: number,
  now = Date.now(),
): TickerEntry[] =>
  selectEntries(
    indicators,
    'polymarket',
    'odds',
    days,
    now,
    'points',
    null,
    oddsShort,
    ODDS_NOTE,
    ODDS_CAVEAT,
  )

/**
 * What the world is reading — the `attention` block.
 *
 * Fifteen daily Wikipedia pageview series, one day in arrears, about Iran, the
 * Strait of Hormuz, wildfires, Ukraine, Nigeria. It is the only measurement on
 * this rail of *the audience* rather than of the world, which is both why it is
 * interesting on a news map and why it is last: attention is not an event, and a
 * spike in it is a fact about readers rather than about Iran.
 *
 * The label is already short — Wikipedia titles the article, and the fetcher
 * appends the suffix — so these fit the row shape unchanged.
 */
const attentionShort = (label: string): string => label.replace(/\s*—\s*Wikipedia views$/i, '')

/**
 * The fallback description only — and it used to be the whole answer.
 *
 * It read: *"How many people read this article on Wikipedia each day. It
 * measures the audience rather than the event, and it runs on a weekly
 * rhythm…"* — three sentences about the metric, shown identically on all twelve
 * rows, at the moment a reader had just asked what was happening. It described
 * the instrument correctly and told nobody anything about the world, and the
 * second half of it was redundant besides: `attentionEntries` already returns
 * nothing at the 24h step precisely because a day of pageviews against the day
 * before is mostly the calendar, so the caveat warned about a reading the block
 * declines to print.
 *
 * What replaces it is per-row and is the point of the whole stage: the dispatch
 * bundles the *feed stories carrying this article's Wikipedia concept* — including
 * the ones we never published — so the card explains the event that drew the
 * readers rather than restating that readers arrived. This string survives only
 * for a payload built before that stage first ran.
 */
const ATTENTION_NOTE =
  'Daily readership of one Wikipedia article, as a gauge of where public attention is going.'

export const attentionEntries = (
  indicators: TrendIndicator[],
  days: number,
  now = Date.now(),
): TickerEntry[] =>
  days <= 1
    ? // Nothing at the day step, and this is the caveat handled rather than
      // noted. Pageviews are strongly day-of-week seasonal, so "yesterday
      // against the day before" on a Sunday is the weekend, not the news — a
      // real number measuring the calendar. The block simply has no answer at
      // 24h, which is the same reply a stale row gives and for the same reason.
      []
    : selectEntries(
        indicators,
        'wikipedia',
        'attention',
        days,
        now,
        // Ranked on the percentage it moved, above a readership floor — see
        // `MIN_ATTENTION_LEVEL` for why the floor is what makes a percentage
        // safe here and ranking on views moved was not.
        'percent',
        MIN_ATTENTION_LEVEL,
        attentionShort,
        ATTENTION_NOTE,
      )

/**
 * The world block's rows — three instruments, no groups.
 *
 * Same daily-cadence rule as the ribbon and for the same reason, which matters
 * more here than there: `wheat`, `rice` and `copper` are monthly and sit in the
 * same payload, so a future addition to `WORLD` that forgot this would put a
 * month's move in a column of six-week sparklines with no visible difference.
 */
/**
 * The last day any series in a set actually printed, as a UTC midnight.
 *
 * Weekday instruments stop on Friday and a calendar window ending on a Monday
 * contains one close and two days of nothing — see `sparkInput`'s `blockEdge`
 * for the failure this exists to end. Undefined when no member carries usable
 * dates, which leaves the window ending at the clock, as it did before.
 *
 * Typed structurally rather than as `TrendIndicator[]`, because the exchange
 * tally needs the same edge and its members are `SparkMember`s: thirty stock
 * exchanges are the most weekday-bound block on this rail, and for five days
 * this function existed and was called by `worldEntries` alone.
 */
export const lastTradedDay = (
  inds: ReadonlyArray<{ periods?: readonly string[] | undefined; asOf?: string | undefined }>,
): number | undefined => {
  let max = 0
  for (const ind of inds) {
    const dates = seriesDates(ind.periods, ind.asOf)
    const last = dates?.[dates.length - 1]
    if (last && last > max) max = last
  }
  return max || undefined
}

export const worldEntries = (indicators: TrendIndicator[]): TickerEntry[] => {
  const byId = new Map(indicators.map((i) => [i.id, i]))
  const out: TickerEntry[] = []
  const used: TrendIndicator[] = []
  for (const item of WORLD) {
    const ind = byId.get(item.id)
    if (!ind || (ind.cadence && ind.cadence !== 'daily')) continue
    const pct = seriesChangePct(ind.values, item.invert)
    if (pct == null) continue
    out.push(entryFrom('world', item, ind, pct))
    used.push(ind)
  }
  // One edge for the block, applied after the members are known — the whole
  // point is that these rows share it.
  const edge = lastTradedDay(used)
  const withEdge = edge == null ? out : out.map((e) => ({ ...e, edge }))
  // Ranked like every other block on the rail: the biggest mover first, not
  // Brent-VIX-yield by catalog order — a reader scanning the rail should never
  // have to learn a second sort rule.
  return withEdge.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
}

/**
 * The ribbon's rows, from the trends payload.
 *
 * Anything the payload does not carry is dropped rather than shown empty: the
 * row states what it knows, and a gap here is a gap in the data commons, not a
 * hole in the layout. Only `daily` series qualify — a monthly change printed
 * beside a row of daily ones reads as today's move and is not.
 */
export const tickerEntries = (indicators: TrendIndicator[]): TickerEntry[] => {
  const byId = new Map(indicators.map((i) => [i.id, i]))
  const out: TickerEntry[] = []
  const seen = new Set<string>()
  // The raw `X / USD` series behind the currency row, kept so the dollar can be
  // derived from the same numbers the row prints.
  const basket: number[][] = []
  let basketAsOf: string | undefined
  let basketSource: string | undefined
  for (const { group, items } of TICKER) {
    for (const item of items) {
      if (seen.has(item.label)) continue
      const ind = byId.get(item.id)
      if (!ind || (ind.cadence && ind.cadence !== 'daily')) continue
      const pct = seriesChangePct(ind.values, item.invert)
      if (pct == null) continue
      seen.add(item.label)
      if (item.invert) {
        basket.push(ind.values)
        basketAsOf = ind.asOf
        basketSource = (ind as { sourceLabel?: string }).sourceLabel
      }
      out.push(entryFrom(group, item, ind, pct))
    }
  }

  // The dollar goes first, because it is the thing the rest of the row is
  // measured against. Its percentage is read off the derived series rather than
  // averaged from the six printed figures, so the number and the chart on its
  // card cannot disagree — the same rule the exchange sparkline follows.
  //
  // There is no dollar index in the payload and the obvious entry is
  // impossible: every rate in this row is `X / USD`, so the dollar against
  // itself is 0.0% every day forever. But the row already contains the answer —
  // if all six currencies fell, the dollar rose — so it is derived from exactly
  // the series printed beside it rather than fetched from somewhere that would
  // not agree with them. `X / USD` rising means more of X per dollar, so the
  // mean rising means the dollar strengthening: this one needs no inversion,
  // unlike the currencies themselves.
  //
  // Two or more, because a "dollar index" over one currency is that currency
  // upside down wearing a different name. `meanIndex` itself is happy with one,
  // which is right for a group summary and wrong here.
  const usd = basket.length >= 2 ? meanIndex(basket) : null
  const usdPct = usd ? seriesChangePct(usd) : null
  if (usd && usdPct != null) {
    const firstCurrency = out.findIndex((e) => e.group === 'currencies')
    const periods =
      indicators.find((i) => i.id === 'fx-eur')?.periods?.slice(-usd.length) ?? []
    out.splice(firstCurrency < 0 ? 0 : firstCurrency, 0, {
      group: 'currencies',
      id: 'usd-index',
      label: 'USD',
      name: 'US dollar',
      flag: flagOf('US'),
      pct: usdPct,
      unit: `index vs ${basket.length} currencies, unweighted`,
      level: usd[usd.length - 1],
      values: usd,
      periods,
      asOf: basketAsOf,
      sourceLabel: basketSource
        ? `Derived from ${basketSource} — not DXY, and not trade-weighted`
        : undefined,
    })
  }
  return out
}

// --- The strip -------------------------------------------------------------

export interface MarketStrip {
  element: HTMLElement
  /**
   * The `odds` and `attention` blocks, which live at the foot of the rail
   * rather than inside the money box.
   *
   * A second element rather than a second component: they are built from the
   * same payload, redrawn by the same range press and made of the same rows, so
   * splitting the module would be two copies of `instrumentRow` kept in step by
   * hand. Only their *placement* differs, and placement is the island's.
   */
  signals: HTMLElement
  update(markets: MapExchange[], now?: number): void
  /**
   * The trends payload: every series, and the events calendar beside them.
   *
   * The calendar is optional because a build before `narrate-events.js` first
   * ran, or an older cached payload, may not carry it — a rail that threw on a
   * snapshot from last week would be a strictly worse failure than one that
   * omits a block about next month.
   */
  setTrends(indicators: TrendIndicator[], events?: TrendEvent[]): void
  /** The chokepoint set, as the money block's fifth row. */
  setStraits(points: MapChokepoint[]): void
  setVisible(on: boolean): void
  /**
   * The box the detail panel should open under, or `null` to open it as a
   * popover above whichever summary was pressed.
   *
   * Set by whoever re-parents the strip: the placement follows where the strip
   * is standing, and only the island knows that.
   *
   * `clearOf` is a box the panel must not open over — the map's own right-hand
   * control cluster, which stands in the same corner the panel is anchored to.
   * Optional, and `null` in the layout that has no such cluster.
   */
  setDock(box: HTMLElement | null, clearOf?: HTMLElement | null): void
  /**
   * The window the rail is showing, in days, so a card opened from a row can
   * draw the same period the row does.
   *
   * A reader who has set the money to a week and then presses a row is still
   * asking about that week; opening the card on the whole published series
   * answers a question they moved away from.
   */
  rangeDays(): number
  /** Follow the rail's one time range. Redraws from the payloads it holds. */
  setRangeDays(days: number): void
  destroy(): void
}

export interface MarketStripOptions {
  /** Fly to an exchange and pin its card. */
  onSelect: (id: string, anchor: HTMLElement) => void
  /** Open a currency, metal or coin's card. Nothing to fly to — these are not
   *  places — so this only opens the sheet. */
  onQuote: (entry: TickerEntry, anchor: HTMLElement) => void
  /**
   * The window the rail opens on, in days.
   *
   * Passed in rather than defaulted here, because there is one range on this
   * page and two defaults would be a disagreement waiting for a first paint:
   * the control would read `3d` over lines drawn across a month, and only a
   * press would reconcile them. The island owns `RANGES`, so the island owns
   * where the ladder starts.
   */
  rangeDays: number
  /** Fly to a chokepoint and pin its card, the way `onSelect` does an exchange. */
  onStrait: (id: string, anchor: HTMLElement) => void
  /** Open an event's card. Nothing to fly to — a calendar entry is not a
   *  place — so this only opens the sheet, the way `onQuote` does. */
  onEvent: (entry: TrendEvent, anchor: HTMLElement) => void
}

/**
 * A percentage for the ribbon, at one decimal.
 *
 * The sign is dropped when the figure rounds to nothing: `−0.0%` claims a
 * direction that the number it is printing explicitly does not have, and it
 * turned up immediately — the Egyptian pound moved 0.005% and the row said it
 * fell. Below the flat band the tone goes neutral too, so the colour agrees
 * with the tick beside it rather than tinting a flat bar.
 */
export const ribbonPct = (pct: number): string => {
  const abs = Math.abs(pct).toFixed(1)
  return abs === '0.0' ? '0.0%' : `${pct > 0 ? '+' : '−'}${abs}%`
}

/**
 * The change on a row whose value is *already* a percentage, in points.
 *
 * A percentage of a percentage is an error of kind, not of arithmetic, and the
 * rail was making it before this block existed: **US 10Y** is quoted in percent,
 * so a yield going 4.60 to 4.68 was printed as `+1.7%` — a true statement about
 * the ratio and a wrong one about the instrument, which moved eight basis
 * points. The odds block would have made it far louder, since a market going
 * 20% to 25% moved *five points* and `+25.0%` beside a level reading `25%` is
 * two numbers that cannot both be about the same thing.
 *
 * So the rule is the unit's, not the block's: when a series is published in `%`,
 * its change is a difference. One word for it — `pts` — rather than `pts` here
 * and `bp` on the yield, because those are the same quantity at two scales and
 * a rail with two vocabularies for one thing is a rail that has to be learned
 * twice. The decimals adapt instead: a five-point swing in a market needs none
 * and eight basis points needs two.
 */
export const ribbonPoints = (delta: number): string => {
  const abs = Math.abs(delta)
  const body = abs >= 1 ? abs.toFixed(0) : abs.toFixed(2)
  return Number(body) === 0 ? '0 pts' : `${delta > 0 ? '+' : '−'}${body} pts`
}

/**
 * `is-stale` / `is-pos` / `is-neg` / neither.
 *
 * Staleness outranks direction: a row too old to trust is not "flat", it is
 * unknown, and the three colours the rail has are green, orange and the one
 * grey-blue that covers both "flat" and "too old to say" — the age label
 * beside the figure is what tells those two apart for a reader who wants to.
 */
const toneClass = (pct: number, stale = false): string =>
  stale || Math.abs(pct) <= FLAT_PCT ? ' is-stale' : pct < 0 ? ' is-neg' : ' is-pos'

/**
 * Where a rail-docked detail panel's top edge goes, as arithmetic.
 *
 * Extracted from `placePanel` so it can be pinned: the geometry it settles is
 * three rules that only ever disagree at the ends of the rail, which is exactly
 * where nobody looks, and jsdom has no layout to catch it with.
 *
 * The row decides the top. Then the window's foot pulls it back up, because a
 * group near the bottom of a scrolled rail would otherwise open a panel whose
 * own bottom is off-screen and this dialog does not scroll the page. And
 * `clearBottom` — the foot of the map's own right-hand control box — pushes it
 * down, because that box stands in the canvas's top-right corner while the
 * panel is anchored to the rail's inner edge, which is the same corner. Before
 * this, the money block's first row opened a panel that covered the whole `key`
 * button and cut the ground ramp in half.
 *
 * **The foot wins.** It is applied last and outside the push, so a viewport too
 * short to hold both simply lets the panel overlap the controls again rather
 * than hanging off the screen — a covered control is recoverable in one press
 * and a panel below the fold is not. `null` for `clearBottom` is the layout with
 * no such box, where the whole term drops out.
 */
export const dockedPanelTop = ({
  rowTop,
  clearBottom,
  panelH,
  viewportH,
  gap = 10,
}: {
  rowTop: number
  clearBottom: number | null
  panelH: number
  viewportH: number
  gap?: number
}): number => {
  const pushed = clearBottom == null ? rowTop : Math.max(rowTop, clearBottom + gap)
  return Math.round(Math.max(gap, Math.min(pushed, viewportH - panelH - gap)))
}

/**
 * A ranked readout of what the world's exchanges did.
 *
 * The map is bad at ranking and a list is bad at location, so the layer gets
 * both: thirty marks answer "where", and this answers "how much, and which
 * way" without the reader hovering thirty times. It is the whole reason the map
 * does not need to print thirty numerals to be read as a set.
 *
 * Tick marks are inline SVG from the shared vertex table, not characters:
 * Source Sans 3 has no ▲, so a character would fall back to a system font — a
 * second typeface on a site whose first principle is that the typography is the
 * design.
 */
export function createMarketStrip(opts: MarketStripOptions): MarketStrip {
  const root = el('div', 'map-markets')
  root.hidden = true

  /**
   * One row, four summaries, and every detail behind a fold-up panel.
   *
   * The strip used to be two rows — the exchange tally and its named movers on
   * one, then eleven currency, metal and crypto quotes on the other — and it
   * cost between 97 and 141px of the map depending on width, wrapping to three
   * lines at the narrow end. Every rule that followed was width management:
   * culling the two comparison currencies below 1300, halving the movers at the
   * same breakpoint, dropping the movers entirely on a phone, and a
   * `flex: 1 1 34rem` basis swept against real line counts to stop the currencies
   * group breaking mid-group.
   *
   * All of that was the same problem: the strip printed a set when the reader
   * had asked a question about a set. `markets ⌃15 ⌄9 6 flat` is the answer —
   * it is what the phone block worked out on its own and said so in as many
   * words — and the eleven quotes are the follow-up. So the row now carries four
   * of those answers and nothing else, and the follow-up opens where a follow-up
   * belongs: in front of the map, at a size that can hold it, rather than in a
   * strip competing with the planet for the bottom of the screen.
   */
  const row = el('div', 'map-markets-row')
  const label = el('span', 'map-markets-label', 'markets')
  const tally = el('span', 'map-markets-tally')
  const note = el('span', 'map-markets-note')
  /**
   * The label and the counts are one statement — "markets: 5 up, 19 down, 6
   * flat" — so they travel as one item. As siblings in the row's wrap run they
   * broke apart: at 1000px and below the row came out four lines deep with
   * `markets` alone on the first, the counts on the second, the movers on the
   * third and `15 closed` on the fourth. A heading on a line of its own is a
   * heading that has stopped labelling anything.
   */
  const tallyMove = el('span', 'map-markets-move')
  const tallyGroup = el('button', 'map-markets-group map-markets-summary')
  tallyGroup.append(label, tally, tallyMove, note)

  /**
   * One row of the money block.
   *
   * **No switches live here, and the two that briefly did are why this comment
   * exists.** `markets` and `straits` are the only money rows with a layer on
   * the map, so they carried its silhouette and toggled it — which left the
   * other six rows with an empty 23px column reserved purely to keep the labels
   * on one edge, and a blank square beside seven silhouettes reads as an icon
   * that failed to load. Building the column only where it was real fixed the
   * emptiness and bought a second problem: two rows indented and six flush.
   *
   * The way out is that a reading and a switch are different jobs and were
   * never owed the same row. The value lives here, where the reader asks what
   * the world's money is doing; the switch lives with every other switch in
   * `layers`, where the reader asks what is drawn on the map. Neither group
   * repeats the other — the chip carries no reading — and this block goes back
   * to being what it reads as: one column of readings, every label flush, every
   * figure on one edge.
   */
  const moneyItem = (summary: HTMLElement) => {
    const box = el('div', 'map-markets-item')
    box.append(summary)
    return box
  }

  row.append(moneyItem(tallyGroup))

  /**
   * Two headings and a second block, which exist only in the rail.
   *
   * They are `.map-group-label` — the same class `stories`, `layers` and
   * `ground` use — so the money block reads as a member of the rail rather than
   * as something parked in it, and a change to that heading's rhythm reaches
   * all five at once. In the scrubber's line the stylesheet hides them: a
   * heading over a single wrapped row is a heading that has stopped labelling
   * anything, which is the failure `map-markets-group` already exists to
   * prevent one level down.
   *
   * `world` starts hidden rather than empty. The trends payload is
   * idle-deferred, so for the first seconds of every load there is genuinely no
   * world block, and an empty heading is a promise the page has not kept.
   */
  const moneyHead = el('span', 'map-group-label map-markets-head', 'money')
  const worldHead = el('span', 'map-group-label map-markets-head', 'world')
  worldHead.hidden = true
  const world = el('div', 'map-markets-world')
  world.hidden = true
  const straitsHead = el('span', 'map-group-label map-markets-head', 'straits')
  straitsHead.hidden = true
  const straits = el('div', 'map-markets-straits')
  straits.hidden = true

  /**
   * The two instrument blocks the payload has always carried and nothing read.
   *
   * Same construction as `world` — a heading and a box, both hidden until there
   * is something in them — because they are the same kind of thing: a short
   * column of rows that *are* instruments, each opening its own card. What
   * differs is only which series fill them, which is a selection rule rather
   * than a second row grammar.
   */
  const oddsHead = el('span', 'map-group-label map-markets-head', 'odds')
  oddsHead.hidden = true
  const odds = el('div', 'map-markets-odds')
  odds.hidden = true
  const attentionHead = el('span', 'map-group-label map-markets-head', 'attention')
  attentionHead.hidden = true
  const attention = el('div', 'map-markets-attention')
  attention.hidden = true

  /**
   * The two blocks stand apart from the money, at the foot of the rail, and
   * that placement was decided by a measurement rather than by taste.
   *
   * Built into the money box first, where they read correctly — each block a
   * step further from a price and closer to an opinion. Measured at 1920×1080
   * the rail then wanted **1299px of a 1080px column**, and what fell off the
   * bottom was the ground picker and the legend: two more blocks of *readings*
   * had buried every remaining *control*. That is the same complaint this rail
   * already records about the folded pane — the readings should survive and the
   * controls should go, never the reverse — running backwards.
   *
   * So they take their own box at the end of the reading order. The controls
   * stay where the reader can reach them without discovering that the column
   * scrolls, and what a reader scrolls to is the material this rail trusts
   * least. The spine drops it entirely, unlike `.map-money`: at 71px the fold is
   * keeping the readings that cannot be got anywhere else, and a bet is not one
   * of those.
   */
  const signals = el('div', 'map-signals')
  signals.append(oddsHead, odds, attentionHead, attention)

  /**
   * What the money is waiting for — the events calendar.
   *
   * Everything else in the rail is a record: a beacon is a story that ran, a
   * change is a month that happened, the scrubber is a fortnight already
   * spent. This is the one block that points the other way, and it used to be
   * a single US-only caption line (`releaseCalendar`/`nextRelease`, superseded
   * 2026-08-08) — central-bank decisions, OPEC+, major non-US releases and
   * summits merged server-side into `events`, each explained by
   * `narrate-events.js`.
   *
   * Same row grammar as `odds`/`attention` — a phrase can only be read as the
   * thing it names, so the caption takes a line and the countdown stands where
   * a percentage would. `aria-live` is deliberately absent; this changes on the
   * scale of days and announcing it would interrupt a reader for something
   * that is not news.
   */
  const eventsHead = el('span', 'map-group-label map-markets-head map-markets-events-head', 'events')
  eventsHead.hidden = true
  // Named `eventsBox` rather than `events`, which `setTrends` below takes as
  // the incoming payload's own events array — the two would otherwise shadow
  // each other in the same closure.
  const eventsBox = el('div', 'map-markets-events')
  eventsBox.hidden = true

  /**
   * How far back the lines reach.
   *
   * Owned here, set from outside. The money block briefly had a switch of its
   * own on the reasoning that stories and money are different clocks measured
   * against different data — which is true, and it produced two segmented
   * controls in one column, four positions apart, each governing half of what
   * was under it. A reader adjusting "the time range" on a map has adjusted the
   * time range; being told that the beacons heard them and the lines did not is
   * an explanation of the implementation.
   *
   * So there is one control, at the head of the rail, and this is the strip's
   * end of it. The ladder is the island's `RANGES`, and so is the opening step.
   */
  let rangeDays = opts.rangeDays

  // Reading order, and it is the order of the argument: what the money did,
  // what it is waiting for, the world it is moving in, and the chokepoints
  // that world ships through. `signals` continues the sequence — what is
  // being bet on that world, then what the world is reading about it — but
  // from its own box at the foot of the rail, for the reason given where it
  // is built.
  root.append(moneyHead, row, eventsHead, eventsBox, worldHead, world, straitsHead, straits)

  /**
   * The panel the summaries open, folded up from the strip.
   *
   * A `<dialog>` — but `show()`, not `showModal()`. The difference is the whole
   * design: a modal dialog renders a backdrop, makes the rest of the page inert
   * and takes the focus with it, which for *a glance at a ticker* is far more
   * ceremony than the question deserves. This one leaves the map live
   * underneath, so a reader can read the currencies and keep watching the
   * planet, and closes on a second press of the same control.
   *
   * It is still a `<dialog>` rather than an absolutely positioned `<div>`
   * because of where it has to escape from. `.map-markets` lives inside the
   * scrubber's own box, which clips and carries a scrim; an in-flow panel would
   * be cut off by it. The top layer ignores ancestor clipping and stacking
   * entirely, and a non-modal dialog is in the top layer just as a modal one is.
   *
   * The cost of `show()` is that the platform stops doing three things for us —
   * Escape, the light-dismiss and the focus ring — so all three are wired below.
   */
  const panel = el('dialog', 'map-markets-panel')
  const panelTitle = el('h2', 'map-markets-panel-title')
  const panelName = el('span', 'map-markets-panel-name')
  /**
   * The counts, and what share of them is yesterday's.
   *
   * They used to be on the strip. They are here because the rail's row spends
   * its width on a shape instead, and because this is where they were always
   * the reason to have opened something: a reader who has pressed `currencies`
   * is asking how unanimous the move was, which is exactly what
   * `7 up, 3 down` answers and what a line cannot.
   */
  const panelMeta = el('span', 'map-markets-panel-meta')
  panelTitle.append(panelName, panelMeta)
  /**
   * The group's composite, drawn where there is finally room to draw it.
   *
   * The rail's rows stopped drawing a shape on 2026-08-07 — the argument is in
   * `sparkInto` — and for six of them that cost nothing, because a press already
   * opens `showIndicator`'s full chart. **For the four group rows and the
   * straits it would have deleted a reading outright**: a basket has no card of
   * its own, so its composite existed on this rail as a 17px line and nowhere
   * else on the site. Pressing `currencies` opened fifteen constituent rows and
   * never once said what the basket had done.
   *
   * So the line moves here, and it arrives larger than it left: the panel is up
   * to 24rem wide against a rail row's 158px, and the box gives it 2.6rem of
   * height against 1.05, which is about six times the area. It sits directly
   * above the rows it composites, which is the one place it can be checked
   * against its own constituents.
   *
   * It is a sparkline and not a `createChart` figure, and `charts.md`'s "a chart
   * that can only be looked at is half a chart" is the reason rather than an
   * objection to it: that rule is about a card whose *subject* is the series, and
   * it is what `showIndicator` spends a cursor, a range control, ringed extremes
   * and a table of every observation on. This is a summary standing over a list —
   * the same job `_spark.ts` exists for — and every constituent under it is one
   * press from exactly that card.
   */
  const panelFig = el('div', 'map-markets-panel-figure')
  const panelList = el('div', 'map-markets-panel-list')
  panel.append(panelTitle, panelFig, panelList)
  document.body.append(panel)

  /** Which summary the panel is currently open on, so a second press closes. */
  let openOn: HTMLElement | null = null

  const closePanel = () => {
    if (!openOn) return
    openOn.classList.remove('is-open')
    openOn.setAttribute('aria-expanded', 'false')
    openOn = null
    panel.close()
  }

  /**
   * Put the panel directly above the control that opened it.
   *
   * Measured rather than declared, for the reason every other offset on this
   * surface is: the strip rewraps, the summaries move, and a fixed `left` would
   * point at whichever one happened to be there when the number was written.
   * Clamped into the viewport so the last summary on the row does not open a
   * panel half off the right edge.
   */
  /**
   * Where the detail opens, which depends on where the strip is standing.
   *
   * Two placements, because the strip has two homes and they face opposite
   * ways. In the scrubber it is at the foot of the screen, so the panel rises
   * from the control that summoned it — a popover, sized to its rows. In the
   * rail it is at the side, so the panel comes *out* of the rail's inner edge,
   * over the map, with its top on the row that summoned it.
   *
   * The drawer this replaced belonged to the top bar and could not survive the
   * move: it worked by sharing the bar's two edges, which is what made it read
   * as the bar opening rather than as something that happened near it, and it
   * needed the whole width of the canvas to hold `columns: 3`. A rail is
   * 18–21rem and folds to a spine. Sharing *its* edges would be a 96px-wide
   * drawer, so the panel takes the one dimension the rail is not using.
   *
   * Anchoring to the rail's edge rather than to the button's own left is what
   * makes the spine work: at 6rem the rows are 80px wide and four panels opened
   * from four of them would each start at a different place three pixels apart.
   * The row decides the *top*, the rail decides the side.
   *
   * `dock` is the element to align to — the island passes the money box when it
   * puts the strip in the rail, and null when it does not, so this module never
   * has to ask which layout is live. `dockClear` is the map's own right-hand
   * control box, which the panel opens straight over; see `placePanel`.
   */
  let dock: HTMLElement | null = null
  let dockClear: HTMLElement | null = null

  const placePanel = (btn: HTMLElement) => {
    const r = btn.getBoundingClientRect()
    const gap = 10
    panel.classList.toggle('is-rail', dock !== null)

    if (dock) {
      const d = dock.getBoundingClientRect()
      const h = panel.offsetHeight
      panel.style.left = 'auto'
      panel.style.right = `${Math.round(Math.max(gap, window.innerWidth - d.left + gap))}px`
      panel.style.bottom = 'auto'
      // The row decides the top, and then two things are allowed to move it.
      //
      // The window's foot, because a group near the bottom of a scrolled rail
      // would otherwise open a panel whose own bottom is below the viewport,
      // and this dialog does not scroll the page.
      //
      // And `.map-mapctl.is-right`, because the ground picker stands in the
      // canvas's top-right corner and this panel is anchored to the rail's
      // inner edge — the *same* corner, by construction, so the two overlap
      // horizontally always and vertically whenever the pressed row is near
      // the head of the rail. Measured at 1896×913: the first row (`markets`)
      // opened a panel that covered the whole of the `key` button and sliced
      // the ground ramp through the middle, so a control the reader can see
      // half of was drawn as a rendering fault. Only the money block's top two
      // rows can reach it. The side is not what gives, for the reason written
      // above — four panels opened from four rows have to start on one column.
      panel.style.top = `${dockedPanelTop({
        rowTop: r.top,
        clearBottom: dockClear ? dockClear.getBoundingClientRect().bottom : null,
        panelH: h,
        viewportH: window.innerHeight,
        gap,
      })}px`
      return
    }

    const w = panel.offsetWidth
    panel.style.right = 'auto'
    panel.style.top = 'auto'
    panel.style.left = `${Math.max(gap, Math.min(r.left, window.innerWidth - w - gap))}px`
    panel.style.bottom = `${Math.max(gap, window.innerHeight - r.top + gap)}px`
  }

  const tick = (dir: -1 | 0 | 1) => {
    const id = dir > 0 ? 'tick-up' : dir < 0 ? 'tick-down' : 'tick-flat'
    const span = el('span', 'map-markets-tick')
    span.innerHTML = glyphSvg(id)
    return span
  }

  /**
   * A group's whole state as three counts and one direction.
   *
   * The flat band is `FLAT_PCT`, the same threshold the marks use, so a quote
   * the map draws as neutral is counted as flat here — the strip and the canvas
   * cannot disagree about whether something moved.
   *
   * `net` is the mean of the displayed percentages, not of the raw ones. The
   * currencies are quoted `X / USD` and inverted on the way in, so averaging
   * anything else would report the basket rising as the basket falling.
   */
  const summarise = (pcts: number[]) => {
    const up = pcts.filter((p) => p > FLAT_PCT).length
    const down = pcts.filter((p) => p < -FLAT_PCT).length
    const mean = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0
    return { up, down, flat: pcts.length - up - down, net: marketDirection(mean) }
  }

  /**
   * The counts, in the vocabulary the exchange tally already established.
   *
   * Reused rather than re-invented for the ribbon groups: a reader who has
   * learned that `⌃15 ⌄9 6 flat` means the exchanges should not have to learn a
   * second shape to read the same fact about the currencies.
   */
  /**
   * What the last `sparkInto` left out, as a phrase, or `''` when it left out
   * nothing. Read straight afterwards by the caller building the label — the
   * two calls are adjacent and single-threaded, which is the whole reason this
   * can be a variable rather than another return value threaded through three
   * call sites.
   */
  let sparkNote = ''

  /**
   * The change exactly as the row printed it, for the label a screen reader
   * hears.
   *
   * A sibling of `sparkNote` and read the same way — straight after the call,
   * single-threaded — because the alternative is every caller re-deriving a
   * figure `sparkInto` has already chosen the units for, which is how a row
   * comes to say `+25.0%` aloud while printing `+5 pts`.
   */
  let sparkFigure = ''

  /**
   * How old the freshest reading behind a row is, as a token, or `''`.
   *
   * The **newest** `asOf`, not the oldest, and the difference matters on the
   * thirty-member exchange row: one index that stopped publishing in May would
   * make an otherwise-current composite report three months, when what is
   * actually true is that the row is up to date and one constituent was left
   * out. That second fact already has a channel — `members.drawn < total`, which
   * `sparkNote` states in words — so this one answers only its own question:
   * *the most recent observation anywhere in this row is N days old*, which is a
   * floor on the age of everything the row says.
   */
  const rowAge = (members: SparkMember[], now: number): string => {
    let newest: string | undefined
    for (const m of members) {
      if (m.asOf && (newest === undefined || m.asOf > newest)) newest = m.asOf
    }
    return staleLabel(newest, rangeDays, now) ?? ''
  }

  /**
   * The reading: a direction, a change, and — when there is neither — an age.
   *
   * ── Why there is no line here any more (2026-08-07) ────────────────────────
   *
   * Every row in this rail drew a 100x20 sparkline, and the argument for it was
   * good: *"a column can carry a line, which is thirty observations, and a line
   * is the one thing about the world's money that this map could not otherwise
   * state at any length."* What that argument never asked is **what a reader
   * does with a column of fourteen of them.** Measured off the built rail: 1,323
   * px of content in a 1,080px column, every row carrying the same 17px shape,
   * and the one question a glance is actually asking — *is this up or down* —
   * answerable only by reading a slope or the sign of a numeral. A reader said
   * so about the odds block in as many words (*"I get the point, but it isn't
   * intuitive at first glance"*), the fix was a tick, and the tick was given to
   * six rows of fourteen because the other eight had a tinted line and a glyph
   * beside a tinted line is the same fact twice.
   *
   * Both halves of that resolve the same way: **the line goes and the tick
   * stays.** A shape is what a reader asks for *second*, and it has had a home
   * one press away the whole time — `showIndicator`'s card, which is the
   * interrogable figure `charts.md` argues a shape is only half of (a cursor,
   * a range, the extremes ringed, every observation in a table). What is lost is
   * a glance at where a series has been; what is bought is a glance at which way
   * everything went, which is the question the rail exists to answer.
   *
   * So the box holds `[tick] [figure] [age]`, keeps its tone, and keeps its
   * name's job even though its name has changed with it — see
   * `.map-markets-move`.
   *
   * ── The tick is drawn at zero too, and that is not a stray glyph ───────────
   *
   * `tick-flat` is a rule rather than a decoration. The figure sits in a fixed
   * `min-width` column so every change in the rail ends on one edge; a row that
   * omitted its glyph would push its own figure 9px plus a gap left of its
   * neighbours', which is the ragged column this file has already had to
   * measure its way out of twice. And a flat bar is the true answer for a move
   * inside `FLAT_PCT` — the same threshold the marks on the canvas use, so a
   * quote the map draws as neutral reads as neutral here.
   */
  const sparkInto = (
    host: HTMLElement,
    members: SparkMember[],
    /**
     * The series' published unit, where the row is one instrument.
     *
     * Read for one thing only: whether the change belongs in points rather than
     * as a percentage. See `ribbonPoints`.
     */
    unit?: string,
    /**
     * The last day this row's block traded, when that is not today. Passed
     * through untouched — see `sparkInput`'s `blockEdge` for why a weekday
     * instrument cannot be windowed against the wall clock.
     */
    edge?: number,
  ): number | null => {
    // Read once per row rather than taken as an argument: `redraw` runs every
    // row off one press, and a clock read per row could in principle straddle a
    // midnight and window two rows against two different days.
    const now = Date.now()
    const input = sparkInput(members, rangeDays, now, edge)
    const m = input?.members
    sparkNote =
      m && m.drawn < m.total
        ? rangeDays <= 1
          ? `, from ${m.drawn} of ${m.total} that printed today`
          : `, from ${m.drawn} of ${m.total} with a full window`
        : ''
    const age = rowAge(members, now)
    /**
     * The window's own change, taken without building the shape it describes.
     *
     * `sparkPct` is `sparkline`'s first four lines, exported so this row and the
     * chart a press opens still resolve one `seriesModel` over one window — the
     * `reference: 'open'` trap in `charts.md`, which is only ever avoided by
     * there being one calculation rather than two that agree today.
     *
     * `null` here means exactly what `sparkline` returning `null` used to mean:
     * fewer than two finite points inside the window, so there is no change to
     * state and the age is the only true thing left to say.
     */
    const windowPct = input
      ? sparkPct({
          values: input.values,
          window: input.values.length,
          domain: input.domain,
        })
      : null
    if (windowPct === null || !input) {
      // `is-stale` here too: nothing measured is the strongest form of "don't
      // read a direction into this row", not an exemption from the rule.
      host.className = 'map-markets-move is-stale'
      sparkFigure = ''
      /**
       * No line, and the age is the answer rather than the excuse.
       *
       * A row that simply empties reads as a layout fault or a failed fetch. A
       * row that prints `7d` where its figure was has told the reader the one
       * true thing available: this instrument has not reported inside the
       * period you asked about. That is the honest reply to "what did oil do
       * today" when the last print is a week old, and it is strictly more than
       * the confident wrong percentage it replaces.
       *
       * The age alone was not enough, which a browser said and no measurement
       * could. At the 24h step four rows of the nine — straits, brent, vix and
       * the 10-year — carried a level, a hundred and forty pixels of nothing,
       * and a date. Four holes in a column reads as content that failed to
       * arrive, however true each row is. `.map-markets-nil` fills the slot
       * with a *mark*: a dotted rule where the reading would have been, in the
       * ink the rail draws its rules in. A drawn absence is a measurement; a
       * gap is a bug.
       *
       * **And no tick.** The glyph is drawn at zero everywhere else precisely
       * because a flat bar is a true statement about a move — here there is no
       * move to be flat about, and `tick-flat` would be the row claiming it
       * measured a quiet period rather than none at all. That is the whole
       * difference this branch exists to draw.
       */
      host.replaceChildren(
        el('span', 'map-markets-nil'),
        ...(age ? [el('span', 'map-markets-age', age)] : []),
      )
      if (age) sparkNote = `, ${age} old`
      return null
    }
    // The window's own change, except at the day step, where `sparkInput`
    // measures a slope in percent space and `windowPct` would be a percentage
    // of zero.
    const pct = input.pct ?? windowPct
    // A percent-quoted series states its change as a difference. The tone and
    // the tick still ride on `pct`, because "which way" is the same question
    // whichever unit answers "how far".
    const ends = input.ends
    const figure =
      unit === '%' && ends ? ribbonPoints(ends[1] - ends[0]) : ribbonPct(pct)
    sparkFigure = figure
    host.className = `map-markets-move${toneClass(pct, !!age)}`
    host.replaceChildren(
      // Direction first, because it is what the glance is for, and it is read
      // before the figure it qualifies rather than after it.
      tick(marketDirection(pct)),
      el('span', 'map-markets-window', figure),
      // Reported *and* late. Without the line there is no short right-hand end
      // to say the shortfall silently, so this token is now the only thing that
      // says it — which is why it survived a change that removed the shape it
      // used to be a footnote to.
      ...(age ? [el('span', 'map-markets-age', age)] : []),
    )
    if (age) sparkNote += `, ${age} old`
    return pct
  }

  /** The counts as a sentence, for the label a bar cannot provide. */
  const countsText = (s: ReturnType<typeof summarise>) =>
    [s.up && `${s.up} up`, s.down && `${s.down} down`, s.flat && `${s.flat} flat`]
      .filter(Boolean)
      .join(', ')

  const countsInto = (host: HTMLElement, s: ReturnType<typeof summarise>) => {
    for (const [dir, n, cls] of [
      [1, s.up, 'is-pos'],
      [-1, s.down, 'is-neg'],
    ] as Array<[-1 | 1, number, string]>) {
      if (!n) continue
      const g = el('span', `map-markets-count ${cls}`)
      g.append(tick(dir), el('span', undefined, String(n)))
      host.append(g)
    }
    // Omitted at zero — a strip that says "0 flat" is spending a word to
    // report the absence of a thing nobody asked about.
    if (s.flat) host.append(el('span', 'map-markets-count', `${s.flat} flat`))
  }

  /**
   * Fill the panel's figure box from a group's members, or empty and hide it.
   *
   * Built at open rather than cached with the trigger, and windowed with the
   * *current* `rangeDays` — the same discipline the rows and the counts follow,
   * for the same reason: a panel that drew the window the reader had selected
   * when the block was last rebuilt would be a shape captioned with a period it
   * does not cover, which is the `reference: 'open'` trap in `charts.md`.
   *
   * Hidden rather than emptied when there is nothing to draw. A titled box with
   * no line in it reads as a chart that failed to load; the constituent rows
   * below are still the answer, and the row that opened this has already printed
   * its own dotted rule and its age.
   */
  const fillPanelFigure = (members: SparkMember[]) => {
    const input = sparkInput(members, rangeDays, Date.now())
    const spark = input
      ? sparkline({
          values: input.values,
          window: input.values.length,
          span: input.span,
          domain: input.domain,
        })
      : null
    if (!spark || !input) {
      panelFig.replaceChildren()
      panelFig.hidden = true
      return
    }
    const pct = input.pct ?? spark.windowPct
    // The tone on the box, never on the caption's words — the same one-fact-one-
    // channel rule the rail rows keep, and the reason a falling basket does not
    // paint its own name orange.
    panelFig.className = `map-markets-panel-figure${toneClass(pct)}`
    panelFig.hidden = false
    const caption = el('p', 'map-markets-panel-caption')
    caption.append(
      tick(marketDirection(pct)),
      el('span', 'map-markets-panel-change', ribbonPct(pct)),
      // The period in words, because the shape above it has no axis and the
      // reader has no other way to learn what it spans. `sparkNote` is not read
      // here: it belongs to whichever row `sparkInto` last touched, and this
      // runs on a press rather than on a redraw.
      el('span', 'map-markets-panel-window', `over ${rangeLabel()}`),
    )
    panelFig.replaceChildren(spark.element, caption)
  }

  /**
   * Make a summary open the modal on its own group.
   *
   * Per group rather than one control for the whole strip, because the four
   * groups are independent questions — a reader checking the ummah basket is not
   * thereby asking about crypto — and because a single "expand everything"
   * control would put the reader back in front of the set the summaries exist to
   * spare them.
   *
   * The rows are built fresh on each open rather than cached, so the modal
   * cannot show a figure the strip behind it has already replaced. These are
   * fifteen rows off data the island is already holding; there is nothing to
   * amortise.
   */
  const openPanel = (
    btn: HTMLElement,
    name: string,
    meta: () => string,
    rows: () => HTMLElement[],
    /**
     * The group's constituents, for the composite drawn above them.
     *
     * A thunk rather than an array, because the members of a group are rebuilt
     * on every payload and a captured array would be the set that existed when
     * the trigger was wired. Absent on any panel that is not a composite of
     * anything — see the call sites.
     */
    members?: () => SparkMember[],
  ) => {
    // A second press on the control that opened it closes it. Pressing a
    // *different* summary swaps the contents rather than stacking a second
    // panel, which is the behaviour a row of four peers should have.
    if (openOn === btn) {
      closePanel()
      return
    }
    closePanel()
    panelName.textContent = name
    // Read at open rather than cached with the trigger, for the reason the rows
    // are built fresh: the counts must not be able to describe a state the
    // strip behind the panel has already replaced.
    panelMeta.textContent = meta()
    if (members) fillPanelFigure(members())
    else {
      panelFig.replaceChildren()
      panelFig.hidden = true
    }
    panelList.replaceChildren(...rows())
    panel.show()
    openOn = btn
    btn.classList.add('is-open')
    btn.setAttribute('aria-expanded', 'true')
    // After `show()`, so `offsetWidth`/`offsetHeight` are the laid-out box and
    // not zero.
    placePanel(btn)
  }

  const trigger = (
    btn: HTMLButtonElement,
    name: string,
    meta: () => string,
    rows: () => HTMLElement[],
    members?: () => SparkMember[],
  ) => {
    btn.setAttribute('type', 'button')
    btn.setAttribute('aria-haspopup', 'dialog')
    btn.setAttribute('aria-expanded', 'false')
    btn.setAttribute('aria-label', `${name}, show detail`)
    btn.addEventListener('click', () => openPanel(btn, name, meta, rows, members))
  }

  /**
   * The three things `show()` does not give us, unlike `showModal()`.
   *
   * Escape is registered here, at strip construction, which is before the
   * island's own `keydown` — so it runs first and `stopPropagation` keeps the
   * same key from also resetting the camera. That is the island's stated
   * "innermost first" order, honoured by registration rather than by asking.
   *
   * The light-dismiss is `pointerdown`, not `click`: a `click` listener on
   * `document` fires *after* the summary's own handler on the way back up, so
   * opening the panel and immediately closing it again was the first behaviour
   * this had. `pointerdown` also dismisses on a drag of the map, which is right
   * — the reader has moved on.
   */
  const onDocKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !openOn) return
    const btn = openOn
    closePanel()
    btn.focus()
    e.stopPropagation()
  }
  const onDocDown = (e: Event) => {
    if (!openOn) return
    const t = e.target
    if (t instanceof Node && (panel.contains(t) || openOn.contains(t))) return
    closePanel()
  }
  document.addEventListener('keydown', onDocKey)
  document.addEventListener('pointerdown', onDocDown, true)
  // The panel is fixed to a measured point, so anything that moves the strip
  // moves what it is pointing at.
  const onReflow = () => { if (openOn) placePanel(openOn) }
  window.addEventListener('resize', onReflow, { passive: true })

  /**
   * An exchange, as a row in the panel.
   *
   * The index, not the institution: KOSPI, not Korea Exchange. It is shorter and
   * it is what a market is called in a headline. Selecting one closes the modal
   * first — the card it opens is anchored to a place on the map, and leaving a
   * modal in front of the flight would hide the answer.
   */
  const exchangeRow = (m: MapExchange) => {
    const btn = el('button', `map-markets-row-item${toneClass(m.changePct)}`)
    btn.setAttribute('type', 'button')
    btn.append(
      tick(marketDirection(m.changePct)),
      el('span', 'map-markets-row-name', m.indexName),
      el('span', 'map-markets-row-pct', ribbonPct(m.changePct)),
    )
    btn.addEventListener('click', () => {
      const from = openOn ?? btn
      closePanel()
      opts.onSelect(m.id, from)
    })
    return btn
  }

  const quoteRow = (e: TickerEntry) => {
    const btn = el('button', `map-markets-row-item${toneClass(e.pct)}`)
    btn.setAttribute('type', 'button')
    if (e.flag) btn.append(el('span', 'map-markets-flag', e.flag))
    btn.append(
      tick(e.pct > FLAT_PCT ? 1 : e.pct < -FLAT_PCT ? -1 : 0),
      // The full name here, where there is room for it. The strip never had it
      // and the code alone is unreadable to most people, which is the whole
      // reason every quote carried a flag.
      el('span', 'map-markets-row-name', e.name),
      el('span', 'map-markets-row-pct', ribbonPct(e.pct)),
    )
    btn.addEventListener('click', () => {
      // `openOn` and not `btn`: the panel is about to close, so the row pressed
      // is on its way out of the document and the card would be anchored to a
      // rectangle that no longer exists. The summary that opened the panel is a
      // rail row and stays put.
      const from = openOn ?? btn
      closePanel()
      opts.onQuote(e, from)
    })
    return btn
  }

  /** The whole exchange set, ranked, not the four the strip used to name. */
  let allExchanges: MapExchange[] = []
  /** What the panel's meta line says about the exchanges, set by `update`. */
  let exchangeMeta = ''

  /**
   * The last payloads, held so a range press can redraw.
   *
   * Neither was retained before, because nothing ever needed to re-render from
   * them: `update` ran on the markets fetch and `setTrends` exactly once, on
   * the idle one. A control that changes how the same numbers are drawn needs
   * the numbers, and refetching to answer a button press would put a network
   * round trip behind a control that is pure arithmetic.
   */
  let lastMarkets: MapExchange[] | null = null
  let lastIndicators: TrendIndicator[] | null = null
  let lastEvents: TrendEvent[] = []

  /**
   * The thirty exchanges as composite members, from whatever landed last.
   *
   * Read off `lastMarkets` rather than taken as an argument, because the two
   * callers reach it at different moments — the row builds it on a payload and
   * the panel builds it on a press, which may be a range change and two
   * refreshes later. One function so the panel's line and the row's figure are
   * composited from the same thirty series; two would be a chance for them to
   * disagree, which is what this file's own header keeps a rule about.
   */
  const exchangeMembers = (): SparkMember[] =>
    (lastMarkets ?? []).flatMap((m) =>
      Array.isArray(m.series?.values)
        ? [{ values: m.series.values, periods: m.series.periods, asOf: m.asOf, pct: m.changePct ?? 0 }]
        : [],
    )

  const update = (markets: MapExchange[], now = Date.now()) => {
    lastMarkets = markets
    const t = marketTally(markets, now)
    allExchanges = [...markets].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))

    const s = { up: t.up, down: t.down, flat: t.flat, net: 0 as const }
    tally.replaceChildren()
    countsInto(tally, s)
    // Two renderings of the same group, one per layout: the counts for the
    // scrubber's line, the direction and its size for the rail. Both are built
    // and CSS shows one, because which layout is live is a media query the
    // island resolves and this module has no business asking about.
    //
    // The world's equity market as one figure, composited from the thirty
    // indices this map already draws. `series.values` has been in the payload
    // since the layer shipped and nothing but the exchange card ever read it.
    //
    // Windowed against the last day an exchange actually traded, not the wall
    // clock — the same `blockEdge` `worldEntries` computes, which this row was
    // never given even though it is the block the argument was written about.
    // A calendar window ending on a Monday is `[Fri, Mon]`: one close and two
    // days on which no exchange on earth was open, so `covered` finds a single
    // observation and the row draws a dotted rule. Measured on Monday
    // 2026-08-10 at the map's own default range: **24h +0.2%, 3d nothing, 7d
    // +0.5%, 30d +1.7%, 90d +3.6%** — a range control whose middle rung is
    // emptier than the rungs either side, which this file already records as
    // unreadable when `vix` did it, beside three neighbours that all printed a
    // figure. The 24h step only escaped because `FRESH_DAYS` tolerates three
    // days back when there is no edge; supplying one makes that tolerance
    // unnecessary and the calendar steps correct.
    const members = exchangeMembers()
    const pct = sparkInto(tallyMove, members, undefined, lastTradedDay(members))
    tallyGroup.setAttribute(
      'aria-label',
      `Exchanges — ${countsText(s)}${t.closed ? `, ${t.closed} closed` : ''}${
        pct == null ? '' : `, ${ribbonPct(pct)} over ${rangeLabel()}${sparkNote}`
      }`,
    )

    // The caveat on the whole readout: at any given moment most exchanges are
    // shut, and those numbers are last night's. One number rather than thirty
    // mark-states. In the scrubber it sits on the line beside the counts; in
    // the rail the row has room for a direction and a figure and not for a
    // sentence, so it travels with the counts into the panel — it is not a
    // re-encoding of either, it says how much of them is yesterday's.
    note.textContent = t.closed ? `${t.closed} closed` : ''
    exchangeMeta = countsText(s) + (t.closed ? ` · ${t.closed} closed` : '')
  }

  trigger(
    tallyGroup,
    'markets',
    () => exchangeMeta,
    () => allExchanges.map(exchangeRow),
    exchangeMembers,
  )

  /**
   * The three money groups, as three more summaries on the same row.
   *
   * This replaced a second row that printed all eleven quotes, and with it goes
   * every rule that existed to manage that row's width — the mid-group wrap
   * problem the group boxes were built to solve, and the `flex: 1 1 34rem` basis
   * swept against real line counts to keep the currencies group on one line. A
   * summary is four tokens wide and the problem does not arise.
   *
   * A `Map` rather than a running `current` string, so a payload that ever
   * interleaves groups still produces three summaries rather than six.
   */
  /**
   * The chokepoints, as the fifth money row.
   *
   * They were a layer chip, filed between `thermal` and `conflict` in a group
   * that is otherwise disasters, war and famine — and a chokepoint series is
   * daily vessel transits, which is a fact about trade. It reads as one of
   * these rows and never read as one of those chips.
   *
   * These used to be one composite row behind a click-through panel — eleven
   * members summarised into a single "straits" reading, a second press away
   * from which of them had actually moved. Replaced (2026-08-08) with the top
   * movers shown directly, the same one-tap-to-card row every other block in
   * the rail already uses — see `chokepointEntries` and `instrumentRow`.
   */
  let lastStraits: MapChokepoint[] = []

  /**
   * How many chokepoints get a row of their own — three, the same short-list
   * size the rest of the rail settles on for "which of these moved".
   */
  const STRAITS_ROWS = 3

  /**
   * The busiest chokepoints, as rows in the shared instrument grammar.
   *
   * Ranked by `delta7vs90.n_total`, the week-against-quarter structural swing
   * PortWatch publishes and the panel this replaced already ranked by — not by
   * each row's own window-change, which would make *which three* appear jump
   * with whatever range the reader has scrubbed to. The figure a row prints is
   * still its own window-change, same as every other row here.
   */
  const chokepointEntries = (points: MapChokepoint[]): TickerEntry[] =>
    [...points]
      .sort(
        (a, b) => Math.abs(b.delta7vs90?.n_total ?? 0) - Math.abs(a.delta7vs90?.n_total ?? 0),
      )
      .slice(0, STRAITS_ROWS)
      .flatMap((c) => {
        const vals = c.series?.total
        if (!Array.isArray(vals) || vals.length < 2) return []
        return [{
          group: 'straits',
          id: c.id,
          label: c.name,
          name: c.name,
          flag: '',
          note: c.blurb,
          pct: seriesChangePct(vals) ?? 0,
          level: vals[vals.length - 1],
          values: vals,
          periods: c.series?.periods ?? [],
          asOf: c.asOf,
        }]
      })

  const setStraits = (points: MapChokepoint[]) => {
    lastStraits = points
    fillInstruments(straits, straitsHead, chokepointEntries(points), true, (entry, item) =>
      opts.onStrait(entry.id, item),
    )
  }

  const setTrends = (indicators: TrendIndicator[], events: TrendEvent[] = lastEvents) => {
    lastIndicators = indicators
    lastEvents = events

    fillEvents(eventsBox, eventsHead, eventEntries(events))
    // The *row box*, not the group inside it. When these summaries were direct
    // children of `row` this line was right; wrapping them left the wrapper
    // behind on every rebuild, so each press of the time range added three
    // empty 27px rows between `markets` and `currencies` and kept them. Found
    // by measuring row offsets, which is the only way an empty box that is
    // exactly a row tall ever shows up.
    for (const stale of row.querySelectorAll('.map-markets-group[data-trend]')) {
      ;(stale.closest('.map-markets-item') ?? stale).remove()
    }
    const quotes = tickerEntries(indicators)

    const byGroup = new Map<string, TickerEntry[]>()
    for (const e of quotes) {
      const list = byGroup.get(e.group)
      if (list) list.push(e)
      else byGroup.set(e.group, [e])
    }

    // Ranked by the same figure the row itself prints, biggest mover first —
    // built before any group is appended, since `sparkInto`'s own return value
    // *is* that figure and re-deriving it would risk it disagreeing with what
    // the row shows.
    const groupRows: Array<{ pct: number; node: HTMLElement }> = []
    for (const [name, items] of byGroup) {
      const summary = el('button', 'map-markets-group map-markets-summary')
      summary.dataset.trend = ''
      const counts = el('span', 'map-markets-tally')
      const s = summarise(items.map((e) => e.pct))
      countsInto(counts, s)
      // The group's own direction, in the shape the marks already use. This is
      // the "average colour": one glyph saying which way the basket as a whole
      // went, ahead of the counts saying how unanimous that was. A group can be
      // 4 up and 3 down and still net down, and those are two different facts —
      // which is the whole reason the tick is not derived from the counts.
      const move = el('span', 'map-markets-move')
      // `values` and not the raw series: FX is published `X / USD` and inverted
      // on the way into the entry, so this is the basket the way the row reads
      // it. `usd-index` is excluded because it is *derived from* the rest of the
      // basket — it moves opposite to them by construction, so averaging it back
      // in cancels a fifteenth of the signal the composite exists to carry.
      const pct = sparkInto(
        move,
        items.filter((e) => e.id !== 'usd-index'),
      )
      summary.append(tick(s.net), el('span', 'map-markets-label', name), counts, move)
      summary.setAttribute(
        'aria-label',
        `${name} — ${countsText(s)}${
          pct == null ? '' : `, ${ribbonPct(pct)} over ${rangeLabel()}${sparkNote}`
        }`,
      )
      trigger(
        summary,
        name,
        () => countsText(s),
        () => items.map(quoteRow),
        // Safe to capture, unlike the exchanges: these summaries are rebuilt
        // from scratch on every `setTrends`, so the closure and the row it is
        // wired to are always the same generation of the payload.
        () => items.filter((e) => e.id !== 'usd-index'),
      )
      groupRows.push({ pct: pct ?? 0, node: moneyItem(summary) })
    }
    groupRows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    for (const { node } of groupRows) row.append(node)

    /**
     * The world block: three instruments, no groups, no panel.
     *
     * A press opens the indicator's own card, because there is nothing to
     * summarise — the row *is* the instrument. That also means these carry no
     * `aria-expanded`: the card is the sheet's dialog, not this module's, and
     * claiming to own its state would be a lie a screen reader has no way to
     * check.
     */
    fillInstruments(world, worldHead, worldEntries(indicators))
    // Both selected blocks are re-derived on every redraw rather than chosen
    // once, because "the three that moved most" is a question about the *window*
    // — at 24h and at 90d they are legitimately different three, and a block
    // that kept its 90d membership while printing 24h figures would be ranking
    // on one period and reporting another where nothing could see it.
    const now = Date.now()
    fillInstruments(odds, oddsHead, oddsEntries(indicators, rangeDays, now), true)
    fillInstruments(attention, attentionHead, attentionEntries(indicators, rangeDays, now), true)
  }

  /**
   * A row that *is* an instrument: a tick, a name, the level, the reading.
   *
   * Four blocks are built from this — `world`, `straits`, `odds` and
   * `attention` — and it was written out once for the first of them.
   * Extracting it is the rule this file's own header states: duplication is
   * only free while the copies agree, and the thing four copies would have
   * had to agree about is the row's grammar, which is the one thing the rail
   * is arranged around.
   *
   * **The level is the fact.** The rail printed a change and never a value, so
   * it could say Brent rose 1.2% and never say what a barrel costs — the
   * footnote without the sentence. `entry.level` and `entry.unit` were on the
   * entry the whole time and reached only the card.
   *
   * ── Direction is a shape and a colour, on every block (2026-08-08) ──
   *
   * `odds` and `attention` used to read their tone from the topic palette —
   * `--map-pos`/`--map-neg` read as good and bad, and a green *US invade Iran
   * +35 pts* looked like this map calling a likelier war good news — so
   * identity carried the hue and only the tick carried direction. The rail now
   * treats every row the same way: `--map-pos`/`--map-neg` mean "the number
   * went up or down", a factual statement rather than a verdict, and the tick
   * stays as a second, redundant channel for the same fact rather than the
   * only one. One rule, scanned the same way down the whole column.
   *
   * `sparkInto` draws the tick for every row family, once, in the box that
   * carries the tone.
   */
  const instrumentRow = (
    entry: TickerEntry,
    caption = false,
    // A chokepoint row flies the camera and pins a place; every other
    // instrument opens its card in place. Parameterized rather than forked,
    // since the row itself — grammar, tone, tick — does not change.
    onClick: (entry: TickerEntry, anchor: HTMLElement) => void = opts.onQuote,
  ) => {
    const item = el('button', 'map-markets-group map-markets-summary')
    item.setAttribute('type', 'button')
    item.setAttribute('aria-haspopup', 'dialog')
    const move = el('span', 'map-markets-move')
    const pct = sparkInto(move, [entry], entry.unit, entry.edge)
    const figure = sparkFigure
    const note = sparkNote
    const level = quoteLevel(entry.level, entry.unit)
    item.append(
      tick(marketDirection(entry.pct)),
      /**
       * A code sits in the shared label column; a *phrase* becomes a caption
       * over its own reading, and that is a level of hierarchy rather than a
       * layout escape.
       *
       * `BRENT` and `currencies` fit 4.8rem because they are codes. A
       * prediction market is only readable as the question it asks and a
       * Wikipedia series as the article it counts, and neither survives that
       * column — `US–Iran nuclear deal` truncates to `US–Iran nu…`, which is a
       * row that kept its alignment and lost its subject. Inventing a short
       * label instead is worse: two of the six live markets are ceasefires, so
       * any table of subjects short enough to fit produces two rows reading
       * CEASEFIRE.
       *
       * So the phrase takes a line of its own, set one rung down and out of
       * small caps so it reads as a caption, and the **reading indents to the
       * shared grid** — see `.map-markets-caption` in the stylesheet. Every
       * level and figure in the rail then stands in the same columns whichever
       * block it is in, which is the alignment a column of readings is for; the
       * captions are a second, subordinate rhythm the eye separates by weight
       * rather than by position.
       */
      el('span', `map-markets-label${caption ? ' map-markets-caption' : ''}`, entry.label),
      /**
       * The level, on the one-line blocks only (2026-08-07).
       *
       * `odds` and `attention` print the movement and not the reading it moved
       * from — a reader's decision, and the right one for what these blocks are
       * for: *which questions are moving*, scanned. It is what buys them one line
       * each instead of two and therefore twice as many rows, which is more
       * information than a column of probabilities beside half as many subjects.
       *
       * What it costs is stated rather than hidden. On `odds` the row no longer
       * says whether `−18 pts` landed at 37% or at 5%, and those are different
       * facts; the card a press opens leads with the level, and the `aria-label`
       * below still carries it, so nothing is unreachable — it is one press
       * further away than it was.
       *
       * On `attention` it costs nothing at all, and only because of the change
       * directly above it: the block used to rank on **views moved** while
       * printing a percentage, so the level was the only thing making the
       * ordering derivable from the row. It ranks on that same percentage now,
       * so the figure explains its own position and the level was the third
       * number the record wanted removed rather than the one it wanted kept.
       */
      ...(level && !caption ? [el('span', 'map-markets-level', level)] : []),
      /* There was a `map-markets-break` here — a zero-height `flex: 1 0 100%`
         item, the idiom for breaking a flex line without taking the whole of it.
         It is gone (2026-08-07): these rows are a **grid** now, so a second line
         is a second row rather than a thing that has to be manufactured, and the
         caret gets a track instead of a reserved margin. The change that forced
         it was the caption, which had to be allowed to *wrap* — a reader
         reported `US x Iran Effective Ceasefire by August…`, a row that kept its
         alignment and lost its subject. */
      move,
    )
    item.setAttribute(
      'aria-label',
      `${entry.name}${level ? `, ${level} ${entry.unit ?? ''}`.trimEnd() : ''}${
        pct == null ? '' : ` — ${figure} over ${rangeLabel()}${note}`
      }, show detail`,
    )
    // The same sentence the card leads with, where a pointer can find it
    // without committing to a press — the treatment `PRAYER_NOTE` and
    // `THERMAL_NOTE` already get on their chips. The full name goes with it,
    // because these labels are codes and a `title` is where a code is expanded.
    item.title = entry.note ? `${entry.name} — ${entry.note}` : entry.name
    item.addEventListener('click', () => {
      closePanel()
      onClick(entry, item)
    })
    return moneyItem(item)
  }

  /**
   * Fill one instrument block, or hide it and its heading together.
   *
   * `hidden` on both rather than an empty box: the trends payload is
   * idle-deferred, so for the first seconds of every load there is genuinely no
   * block, and a heading over nothing is a promise the page has not kept.
   */
  const fillInstruments = (
    host: HTMLElement,
    head: HTMLElement,
    rows: TickerEntry[],
    caption = false,
    onClick?: (entry: TickerEntry, anchor: HTMLElement) => void,
  ) => {
    host.replaceChildren(...rows.map((r) => instrumentRow(r, caption, onClick)))
    host.hidden = rows.length === 0
    head.hidden = host.hidden
  }

  /**
   * A row for one upcoming event — the money block's forward-looking
   * counterpart to `instrumentRow`, and deliberately not built through it.
   *
   * `instrumentRow` reads `entry.pct`/`.level`/`.unit` from a real series via
   * `sparkInto`, and an event has none of those: there is nothing to measure a
   * direction or a level from, only a date. Forcing an event through that
   * machinery would mean faking a series so `sparkInto` degrades into its
   * "nothing in this window" branch — a dotted rule captioned with an age,
   * which states the wrong thing (there is no missing *reading*, there is no
   * reading to be missing). So the countdown is written directly into the same
   * `.map-markets-move`/`.map-markets-window` classes a real reading would use
   * — same column, same grid, same caret — and no tick, because there is no
   * direction to draw one about.
   */
  const eventRow = (
    entry: TrendEvent & { daysUntil: number },
    onClick: (entry: TrendEvent, anchor: HTMLElement) => void = opts.onEvent,
  ) => {
    const item = el('button', 'map-markets-group map-markets-summary')
    item.setAttribute('type', 'button')
    item.setAttribute('aria-haspopup', 'dialog')
    const countdown = eventCountdown(entry.daysUntil, entry.date)
    const move = el('span', 'map-markets-move')
    move.append(el('span', 'map-markets-window', countdown))
    item.append(el('span', 'map-markets-label map-markets-caption', entry.title), move)
    item.setAttribute('aria-label', `${entry.title}, ${entry.institution}, ${countdown}, show detail`)
    // The full institution name, the way a code's `title` expands it elsewhere
    // in this rail — the caption already carries the event's own name.
    item.title = entry.institution
    item.addEventListener('click', () => {
      closePanel()
      onClick(entry, item)
    })
    return moneyItem(item)
  }

  /** Fill the events block, or hide it and its heading together — same
   *  contract as `fillInstruments`. */
  const fillEvents = (
    host: HTMLElement,
    head: HTMLElement,
    rows: Array<TrendEvent & { daysUntil: number }>,
  ) => {
    host.replaceChildren(...rows.map((r) => eventRow(r)))
    host.hidden = rows.length === 0
    head.hidden = host.hidden
  }

  /**
   * The window in words, for the labels a screen reader hears.
   *
   * These used to read "over 30 days" and "over 30 sessions" off one constant —
   * two different nouns for one number, which was the count bug stated out loud
   * and heard by nobody who could check it. A calendar window has one noun.
   */
  function rangeLabel(): string {
    if (rangeDays <= 1) return 'the past day'
    const found = RANGES.find(([, d]) => d === rangeDays)
    return found ? `the past ${found[0].replace('d', ' days')}` : `the past ${rangeDays} days`
  }

  /**
   * Redraw both blocks from what is already held.
   *
   * `update` is given no `now`, so the tally re-reads the clock: a reader who
   * has left the map open across an opening bell should not have a range press
   * restore the session states from whenever the payload landed.
   */
  function redraw() {
    if (lastMarkets) update(lastMarkets)
    if (lastIndicators) setTrends(lastIndicators)
    if (lastStraits.length) setStraits(lastStraits)
  }

  return {
    element: root,
    signals,
    update,
    setTrends,
    setStraits,
    rangeDays: () => rangeDays,
    setRangeDays(days: number) {
      if (days === rangeDays) return
      rangeDays = days
      redraw()
    },
    setVisible(on: boolean) {
      root.hidden = !on
    },
    setDock(box: HTMLElement | null, clearOf: HTMLElement | null = null) {
      dock = box
      dockClear = clearOf
      // A panel open across a move would keep the geometry of the layout it was
      // opened in — and the two are not adjustments of each other, they are a
      // popover and a drawer. Shutting it is the honest answer.
      closePanel()
    },
    destroy() {
      root.remove()
      // The panel lives on `document.body`, not inside `root`, so clearing the
      // container does not take it — the same debt the sheet and the story
      // popup carry for the same reason. Its three document-level listeners go
      // with it; they are the price of `show()` over `showModal()`.
      document.removeEventListener('keydown', onDocKey)
      document.removeEventListener('pointerdown', onDocDown, true)
      window.removeEventListener('resize', onReflow)
      panel.remove()
    },
  }
}

/**
 * Kept honest against the table the marks are drawn from.
 *
 * Nothing reads this value and nothing is meant to: the whole of it is the
 * `satisfies` clause, which fails the build if either chip glyph name stops
 * being a key of `GLYPHS`. `@knipignore` because an export analyser can only
 * see that no module imports it, and deleting it on that basis would delete
 * the check rather than dead code.
 *
 * @knipignore
 */
export const MARKET_CHIP_GLYPHS = ['tick-up', 'tick-down'] as const satisfies ReadonlyArray<
  keyof typeof GLYPHS
>
