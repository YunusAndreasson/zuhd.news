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
import { sparkline } from '../_spark'
import { FRESH_DAYS, isTrading, quoteLevel, shortDate, staleLabel } from './format'
import { coverage, DAY_MS, seriesDates, windowByDate } from './series-window'
import { glyphSvg } from './glyphs'
import type { GLYPHS } from './glyphs'
import { CATEGORY_COLOUR, MAP_COLOURS, OVERLAY_COLOUR } from './style'
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
}

/** One entry of `/api/trends.json`'s `releaseCalendar` — a date and a name. */
export interface TrendRelease {
  date: string
  release: string
}

/**
 * The releases worth naming, and what to call them.
 *
 * FRED's calendar is fetched every cycle, published in `/api/trends.json`, and
 * has been rendered by nothing anywhere on this site since it landed. It is the
 * only forward-looking field in the whole payload — every other thing in this
 * rail is a record of what already happened — and one line of it answers the
 * question a reader has after looking at the money: *what is next*.
 *
 * It has to be an editorial shortlist rather than "the nearest entry", because
 * most of what FRED schedules is plumbing. The nearest entry today is **"H.4.1
 * Factors Affecting Reserve Balances"** — a weekly Fed balance-sheet statement,
 * forty-three characters of jargon standing where a reader expects a fact. So
 * an unrecognised release is skipped and the next one is offered instead, and
 * the rail says nothing rather than something unreadable.
 *
 * **Every name carries `US`**, and that is not decoration. These are all US
 * federal releases; an unqualified "CPI" on a world map claims a scope it has
 * not got, on the one line of the rail that is about a country rather than the
 * world. `^` anchors on the price indices because FRED also publishes "Research
 * Consumer Price Index", which is a methodological series and not the print
 * anyone is waiting for.
 */
const RELEASES: Array<[test: RegExp, label: string]> = [
  [/^consumer price index/i, 'US CPI'],
  [/^producer price index/i, 'US PPI'],
  [/^employment situation/i, 'US jobs'],
  [/^gross domestic product/i, 'US GDP'],
  [/^personal income and outlays/i, 'US PCE'],
  [/^advance monthly sales|^retail sales/i, 'US retail sales'],
  [/federal open market|^fomc/i, 'Fed decision'],
]

/**
 * The next release a reader would recognise, or `null`.
 *
 * Compared at day granularity, so a release scheduled for today still counts as
 * next — it is published at 8:30 Eastern and the rail may well be read before
 * that, and "today" is the answer in either case.
 */
export const nextRelease = (
  calendar: readonly TrendRelease[] | undefined,
  now = Date.now(),
): { label: string; date: string } | null => {
  if (!calendar?.length) return null
  const today = Math.floor(now / DAY_MS) * DAY_MS
  let best: { label: string; date: string; t: number } | null = null
  for (const entry of calendar) {
    const t = Date.parse(`${entry.date}T00:00:00Z`)
    if (!Number.isFinite(t) || t < today) continue
    const hit = RELEASES.find(([re]) => re.test(entry.release))
    if (!hit) continue
    if (!best || t < best.t) best = { label: hit[1], date: entry.date, t }
  }
  return best ? { label: best.label, date: best.date } : null
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
   */
  note?: string | undefined
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
   */
  now = Date.now(),
): SparkInput | null => {
  if (!members.length) return null

  const to = Math.floor(now / DAY_MS) * DAY_MS
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
  const recent = to - FRESH_DAYS * DAY_MS
  const current = undated
    ? members
    : dated.flatMap((d) => (d && (d.dates[d.dates.length - 1] ?? 0) >= recent ? [d] : []))
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
  note: item.note,
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
 * Three, and it is a layout number rather than an editorial one. The money
 * block is five rows and the world three; two more open-ended blocks would put
 * the ground picker and the legend below the fold of a 1080p rail, and the
 * rail's stated reading order stops being what the reader sees. Three is enough
 * for a block to read as a set rather than as a single fact.
 */
const BLOCK_ROWS = 3

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
  /** How the ranking reads a move — a difference in points, or a percentage. */
  metric: 'points' | 'percent',
  shorten: (label: string) => string,
  note: string,
): TickerEntry[] => {
  const scored: Array<{ entry: TickerEntry; score: number }> = []
  for (const ind of indicators) {
    if (ind.source !== source) continue
    if (ind.cadence && ind.cadence !== 'daily') continue
    if (ind.values.length < MIN_SELECT_POINTS) continue
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
    const move =
      metric === 'points' ? last - open : open === 0 ? 0 : ((last - open) / open) * 100
    if (!Number.isFinite(move)) continue
    scored.push({
      entry: {
        group,
        id: ind.id,
        label: shorten(ind.label),
        name: ind.label,
        flag: '',
        note,
        // The tick's direction, and it is the *window's* move rather than the
        // last day's: these rows have no other figure, so a green tick over a
        // falling week would be the row disagreeing with its own line.
        pct: metric === 'points' ? (open === 0 ? 0 : ((last - open) / open) * 100) : move,
        unit: ind.unit,
        level: ind.values[ind.values.length - 1],
        values: ind.values,
        periods: ind.periods ?? [],
        asOf: ind.asOf,
        sourceLabel: (ind as { sourceLabel?: string }).sourceLabel,
      },
      score: Math.abs(move),
    })
  }
  // Ties break on id so a payload that scores two rows identically still
  // produces the same three rows on every render — a block whose membership
  // flickers between two redraws of the same data is a block nobody can read.
  scored.sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? -1 : 1))
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
    .replace(/^will\s+(the\s+)?/i, '')
    .replace(/(\b[A-Z][a-z]{2,8}\.?\s+\d{1,2}),?\s+\d{4}\b/g, '$1')
    .trim()

const ODDS_NOTE =
  'The price of a bet, not a forecast: what traders on Polymarket are currently paying for this outcome, read as a probability. It moves with money and attention, and nobody has put their name to it.'

export const oddsEntries = (
  indicators: TrendIndicator[],
  days: number,
  now = Date.now(),
): TickerEntry[] =>
  selectEntries(indicators, 'polymarket', 'odds', days, now, 'points', oddsShort, ODDS_NOTE)

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

const ATTENTION_NOTE =
  'How many people read this article on Wikipedia each day. It measures the audience rather than the event, and it runs on a weekly rhythm — weekdays are busier than weekends — so a single day against the one before it is mostly the calendar.'

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
        'percent',
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
export const worldEntries = (indicators: TrendIndicator[]): TickerEntry[] => {
  const byId = new Map(indicators.map((i) => [i.id, i]))
  const out: TickerEntry[] = []
  for (const item of WORLD) {
    const ind = byId.get(item.id)
    if (!ind || (ind.cadence && ind.cadence !== 'daily')) continue
    const pct = seriesChangePct(ind.values, item.invert)
    if (pct == null) continue
    out.push(entryFrom('world', item, ind, pct))
  }
  return out
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
   * The trends payload: every series, and the release calendar beside them.
   *
   * The calendar is optional because it is the newer half of the same fetch and
   * an older cached payload may not carry it — a rail that threw on a snapshot
   * from last week would be a strictly worse failure than one that omits a line
   * about next week.
   */
  setTrends(indicators: TrendIndicator[], releases?: TrendRelease[]): void
  /** The chokepoint set, as the money block's fifth row. */
  setStraits(points: MapChokepoint[]): void
  setVisible(on: boolean): void
  /**
   * The box the detail panel should open under, or `null` to open it as a
   * popover above whichever summary was pressed.
   *
   * Set by whoever re-parents the strip: the placement follows where the strip
   * is standing, and only the island knows that.
   */
  setDock(box: HTMLElement | null): void
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

/** `is-pos` / `is-neg` / neither — the same threshold the tick shape uses. */
const toneClass = (pct: number): string =>
  Math.abs(pct) <= FLAT_PCT ? '' : pct < 0 ? ' is-neg' : ' is-pos'


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
  const tallySpark = el('span', 'map-markets-spark')
  const tallyGroup = el('button', 'map-markets-group map-markets-summary')
  tallyGroup.append(label, tally, tallySpark, note)

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
   * repeats the other — the chip carries no line — and this block goes back to
   * being what it reads as: one column of readings, every label flush, every
   * sparkline on one edge.
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

  /**
   * The two instrument blocks the payload has always carried and nothing read.
   *
   * Same construction as `world` — a heading and a box, both hidden until there
   * is something in them — because they are the same kind of thing: a short
   * column of rows that *are* instruments, each opening its own card. What
   * differs is only which series fill them, which is a selection rule rather
   * than a second row grammar.
   */
  /**
   * These two blocks are tinted from the **topic palette**, never from the
   * money's green and orange, and that is a correctness rule rather than a
   * preference.
   *
   * `--map-pos`/`--map-neg` mean "a signed change" and read as good and bad. On
   * a market that is a convention old enough to be invisible; on the odds of an
   * invasion it is a verdict — a green **US invade Iran +35 pts** is this map
   * telling a reader that a war becoming likelier is good news. It is exactly
   * the trap the layer trends already record for a green *DISASTERS +40%*, and
   * exactly why those carry their layer's own hue instead. Attention is the
   * same case one step milder: more people reading about a famine is not good
   * and not bad, it is more.
   *
   * So identity rides on hue, direction on the shape, magnitude on the figure,
   * and none of the three is a judgement. The hues come from `CATEGORY_COLOUR`
   * so the rail reads as one palette rather than as a money block and two
   * strangers — **economy's gold** for a block of prices-of-opinions, and
   * **tech's blue-violet** for attention, which is the coolest and quietest
   * thing here and belongs to the block furthest from a fact. Set as `--cat`,
   * inline, the way a filter chip receives its layer's colour, so the
   * stylesheet never names a hue.
   */
  const oddsHead = el('span', 'map-group-label map-markets-head', 'odds')
  oddsHead.hidden = true
  const odds = el('div', 'map-markets-odds')
  odds.hidden = true
  odds.style.setProperty('--cat', CATEGORY_COLOUR.economy ?? '')
  const attentionHead = el('span', 'map-group-label map-markets-head', 'attention')
  attentionHead.hidden = true
  const attention = el('div', 'map-markets-attention')
  attention.hidden = true
  attention.style.setProperty('--cat', CATEGORY_COLOUR.tech ?? '')

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
   * What the money is waiting for — the one forward-looking line on this map.
   *
   * Everything else in the rail is a record: a beacon is a story that ran, a
   * sparkline is a month that happened, the scrubber is a fortnight already
   * spent. `releaseCalendar` is the only field in any payload the site fetches
   * that points the other way, and it has been published and drawn by nothing
   * since it landed.
   *
   * A closing line for the money block rather than a row of it: it has no
   * value, no direction and no series, so giving it a row would be a row with
   * three of its four columns empty — the reserved-but-blank failure the mark
   * column already records. `aria-live` is deliberately absent; it changes
   * about once a week and announcing it would interrupt a reader for something
   * that is not news.
   */
  const nextLine = el('p', 'map-markets-next')
  nextLine.hidden = true

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
  // what it is waiting for, and the world it is moving in. `signals` continues
  // the sequence — what is being bet on that world, then what the world is
  // reading about it — but from its own box at the foot of the rail, for the
  // reason given where it is built.
  root.append(moneyHead, row, nextLine, worldHead, world)

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
  const panelList = el('div', 'map-markets-panel-list')
  panel.append(panelTitle, panelList)
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
   * has to ask which layout is live.
   */
  let dock: HTMLElement | null = null

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
      // Pinned to the row, then pushed back inside the window — a group near
      // the foot of a scrolled rail would otherwise open a panel whose bottom
      // is below the viewport, and this dialog does not scroll the page.
      panel.style.top = `${Math.round(Math.max(gap, Math.min(r.top, window.innerHeight - h - gap)))}px`
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
   * A group's path, and the change across it.
   *
   * What replaced the breadth bar on the rail, and the two answer different
   * questions: breadth is *how much of the group moved which way today*, which
   * a bar states in no time at all; a sparkline is *where the group has been*,
   * which no bar and no numeral can state at any length. On a row there was
   * only ever space for one shape and breadth was the better one. A column has
   * room for a line, and a line is the thing a reader cannot get anywhere else
   * on this map — the counts go where the user put them, in the panel.
   *
   * The tone lands on this box rather than on the row, so it reaches the line
   * and the figure and nothing else: the group's name is not a signed quantity
   * and colouring it would make a falling basket read as an alert about the
   * interface, which is the mistake the genocide caption records one file over.
   * It is one fact in one channel — and it is the channel that survives the
   * fold, where the figure is dropped and the shape is all there is.
   *
   * `null` when the constituents have no drawable series between them, so the
   * caller can leave the row unshaped rather than reserving space for a gap.
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
  ): number | null => {
    // Read once per row rather than taken as an argument: `redraw` runs every
    // row off one press, and a clock read per row could in principle straddle a
    // midnight and window two rows against two different days.
    const now = Date.now()
    const input = sparkInput(members, rangeDays, now)
    const m = input?.members
    sparkNote =
      m && m.drawn < m.total
        ? rangeDays <= 1
          ? `, from ${m.drawn} of ${m.total} that printed today`
          : `, from ${m.drawn} of ${m.total} with a full window`
        : ''
    const age = rowAge(members, now)
    const spark = input
      ? sparkline({
          values: input.values,
          window: input.values.length,
          span: input.span,
          domain: input.domain,
        })
      : null
    if (!spark || !input) {
      host.className = 'map-markets-spark'
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
       * and a date. Four holes in a column of lines reads as content that
       * failed to arrive, however true each row is. `.map-markets-nil` fills
       * the slot with a *mark*: a dotted rule where the line would have been,
       * in the ink the rail draws its rules in. A drawn absence is a
       * measurement; a gap is a bug.
       */
      host.replaceChildren(
        el('span', 'map-markets-nil'),
        ...(age ? [el('span', 'map-markets-age', age)] : []),
      )
      if (age) sparkNote = `, ${age} old`
      return null
    }
    // The drawn line's own change, except at the day step, where the line is a
    // slope in percent space and `windowPct` would be a percentage of zero.
    const pct = input.pct ?? spark.windowPct
    // A percent-quoted series states its change as a difference. The tone and
    // the tick still ride on `pct`, because "which way" is the same question
    // whichever unit answers "how far".
    const ends = input.ends
    const figure =
      unit === '%' && ends ? ribbonPoints(ends[1] - ends[0]) : ribbonPct(pct)
    sparkFigure = figure
    host.className = `map-markets-spark${toneClass(pct)}`
    host.replaceChildren(
      spark.element,
      el('span', 'map-markets-window', figure),
      // Drawn *and* late: the line is short at its right-hand end, which says
      // the shortfall without naming it, and the token names it. Both, because
      // the gap is only legible against a neighbouring row that fills the box —
      // and at 90d the gap is 8% of the width, which nothing would notice.
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
  ) => {
    btn.setAttribute('type', 'button')
    btn.setAttribute('aria-haspopup', 'dialog')
    btn.setAttribute('aria-expanded', 'false')
    btn.setAttribute('aria-label', `${name}, show detail`)
    btn.addEventListener('click', () => openPanel(btn, name, meta, rows))
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
  let lastReleases: TrendRelease[] = []

  const update = (markets: MapExchange[], now = Date.now()) => {
    lastMarkets = markets
    const t = marketTally(markets, now)
    allExchanges = [...markets].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))

    const s = { up: t.up, down: t.down, flat: t.flat, net: 0 as const }
    tally.replaceChildren()
    countsInto(tally, s)
    // Two renderings of the same group, one per layout: the counts for the
    // scrubber's line, the shape for the rail. Both are built and CSS shows
    // one, because which layout is live is a media query the island resolves
    // and this module has no business asking about.
    //
    // The world's equity market as one line, from the thirty indices this map
    // already draws. `series.values` has been in the payload since the layer
    // shipped and nothing but the exchange card ever read it.
    const pct = sparkInto(
      tallySpark,
      markets.flatMap((m) =>
        Array.isArray(m.series?.values)
          ? [
              {
                values: m.series.values,
                periods: m.series.periods,
                asOf: m.asOf,
                pct: m.changePct ?? 0,
              },
            ]
          : [],
      ),
    )
    tallyGroup.setAttribute(
      'aria-label',
      `Exchanges — ${countsText(s)}${t.closed ? `, ${t.closed} closed` : ''}${
        pct == null ? '' : `, ${ribbonPct(pct)} over ${rangeLabel()}${sparkNote}`
      }`,
    )

    // The caveat on the whole readout: at any given moment most exchanges are
    // shut, and those numbers are last night's. One number rather than thirty
    // mark-states. In the scrubber it sits on the line beside the counts; in
    // the rail the line is spent on a shape, so it travels with the counts into
    // the panel — it is not a re-encoding of either, it says how much of them
    // is yesterday's.
    note.textContent = t.closed ? `${t.closed} closed` : ''
    exchangeMeta = countsText(s) + (t.closed ? ` · ${t.closed} closed` : '')
  }

  trigger(
    tallyGroup,
    'markets',
    () => exchangeMeta,
    () => allExchanges.map(exchangeRow),
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
   * A summary with a panel behind it, exactly like `markets`: eleven members,
   * each a place on the map with a card, so a press has somewhere to go. The
   * composite is `sparkInput` over the eleven — the same date-windowing, the
   * same short-member filter, the same short-draw — because these are published
   * series and not a pile of timestamps.
   *
   * `series.total` and not `series.values`: the payload names this one
   * differently from every other series on the site, which is the sort of
   * detail that reads as a typo until it silently draws nothing.
   */
  let lastStraits: MapChokepoint[] = []
  const straitsSummary = el('button', 'map-markets-group map-markets-summary')
  const straitsSpark = el('span', 'map-markets-spark')
  const straitsItem = moneyItem(straitsSummary)
  straitsItem.classList.add('is-straits')
  straitsItem.hidden = true

  const setStraits = (points: MapChokepoint[]) => {
    lastStraits = points
    straitsItem.hidden = points.length === 0
    if (!points.length) return
    straitsSummary.replaceChildren(el('span', 'map-markets-label', 'straits'), straitsSpark)
    const pct = sparkInto(
      straitsSpark,
      points.flatMap((c) => {
        const vals = c.series?.total
        if (!Array.isArray(vals) || vals.length < 2) return []
        return [{
          values: vals,
          periods: c.series?.periods,
          asOf: c.asOf,
          // The day step wants this member's own last-against-previous.
          // `delta7vs90` is on the payload and is a week against a quarter —
          // a different quantity, and printing it here would caption a line
          // that does not draw it.
          pct: seriesChangePct(vals) ?? 0,
        }]
      }),
    )
    straitsSummary.setAttribute(
      'aria-label',
      `Straits${pct == null ? '' : ` — ${ribbonPct(pct)} over ${rangeLabel()}${sparkNote}`}`,
    )
    trigger(
      straitsSummary,
      'straits',
      () => `${points.length} chokepoints`,
      () =>
        [...points]
          .sort((a, b) => (b.delta7vs90?.n_total ?? 0) - (a.delta7vs90?.n_total ?? 0))
          .map((c) => {
            const d = (c.delta7vs90?.n_total ?? 0) * 100
            const btn = el('button', `map-markets-row-item${toneClass(d)}`)
            btn.setAttribute('type', 'button')
            btn.append(
              tick(marketDirection(d)),
              el('span', 'map-markets-row-name', c.name),
              el('span', 'map-markets-row-pct', ribbonPct(d)),
            )
            btn.addEventListener('click', () => {
              const from = openOn ?? btn
              closePanel()
              opts.onStrait(c.id, from)
            })
            return btn
          }),
    )
  }

  const setTrends = (indicators: TrendIndicator[], releases: TrendRelease[] = lastReleases) => {
    lastIndicators = indicators
    lastReleases = releases

    const next = nextRelease(releases)
    nextLine.hidden = next === null
    if (next) {
      // A `·` between the three parts and no verb: the heading above it says
      // this is the money block, the word `next` says which direction in time,
      // and a sentence would be three times the ink for the same statement.
      nextLine.textContent = `next · ${next.label} · ${shortDate(next.date)}`
      nextLine.title = `The next scheduled US release the money above will move on, from FRED's calendar`
    }
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
      const spark = el('span', 'map-markets-spark')
      // `values` and not the raw series: FX is published `X / USD` and inverted
      // on the way into the entry, so this is the basket the way the row reads
      // it. `usd-index` is excluded because it is *derived from* the rest of the
      // basket — it moves opposite to them by construction, so averaging it back
      // in cancels a fifteenth of the signal the line exists to carry.
      const pct = sparkInto(
        spark,
        items.filter((e) => e.id !== 'usd-index'),
      )
      summary.append(tick(s.net), el('span', 'map-markets-label', name), counts, spark)
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
      )
      row.append(moneyItem(summary))
    }

    // Last of the money rows, and re-appended on every `setTrends` so it stays
    // under the three groups that rebuild above it.
    row.append(straitsItem)

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
    // that kept its 90d membership while drawing 24h lines would be ranking on
    // one period and drawing another where nothing could see it.
    const now = Date.now()
    fillInstruments(odds, oddsHead, oddsEntries(indicators, rangeDays, now), true)
    fillInstruments(attention, attentionHead, attentionEntries(indicators, rangeDays, now), true)
  }

  /**
   * A row that *is* an instrument: a tick, a name, the level, the line.
   *
   * Three blocks are built from this — `world`, `odds` and `attention` — and it
   * was written out once for the first of them. Extracting it is the rule this
   * file's own header states: duplication is only free while the copies agree,
   * and the thing three copies would have had to agree about is the row's
   * grammar, which is the one thing the rail is arranged around.
   *
   * **The level is new, and it is the fact.** The rail printed a change and
   * never a value, so it could say Brent rose 1.2% and never say what a barrel
   * costs — the footnote without the sentence. `entry.level` and `entry.unit`
   * were on the entry the whole time and reached only the card.
   */
  const instrumentRow = (entry: TickerEntry, caption = false) => {
    const item = el('button', 'map-markets-group map-markets-summary')
    item.setAttribute('type', 'button')
    item.setAttribute('aria-haspopup', 'dialog')
    const spark = el('span', 'map-markets-spark')
    const pct = sparkInto(spark, [entry], entry.unit)
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
       * level, line and figure in the rail then stands in the same three
       * columns whichever block it is in, which is the alignment a column of
       * readings is for; the captions are a second, subordinate rhythm the eye
       * separates by weight rather than by position.
       */
      el('span', `map-markets-label${caption ? ' map-markets-caption' : ''}`, entry.label),
      ...(level ? [el('span', 'map-markets-level', level)] : []),
      /**
       * A zero-height flex break, so the trend starts a line without taking the
       * whole of it.
       *
       * The obvious way to break a flex line is `flex-basis: 100%` on the item
       * you want moved down — and it moves everything *after* it down too. The
       * disclosure caret is a `::after` and therefore always the last item, so
       * it landed on a third line of its own: 11px tall, invisible, and enough
       * to let the change figure run 10px right of every other figure in the
       * rail because nothing followed it on its own line. Measured at 50px
       * against a money row's 22.
       *
       * An empty item with `flex: 1 0 100%; height: 0` is the idiom that does
       * only the one thing. The line it occupies costs nothing, and the trend
       * and the caret then sit together exactly as they do on a money row.
       */
      ...(caption ? [el('span', 'map-markets-break')] : []),
      spark,
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
      opts.onQuote(entry, item)
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
  ) => {
    host.replaceChildren(...rows.map((r) => instrumentRow(r, caption)))
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
    setDock(box: HTMLElement | null) {
      dock = box
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
