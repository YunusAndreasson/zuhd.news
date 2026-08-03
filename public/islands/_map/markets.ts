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
import { isTrading } from './format'
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
  values: number[]
  periods?: string[]
  asOf?: string
}

interface TickerItem {
  id: string
  label: string
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
 * 2026-07, so the `silver`/`xag` pair below resolves and — since
 * `NISAB_WEIGHTS` was already keyed for it — the silver threshold on the metals
 * card computes with no code change, exactly as that note predicted.
 */
const TICKER: Array<{ group: string; items: TickerItem[] }> = [
  {
    group: 'currencies',
    items: [
      { id: 'fx-try', label: 'TRY', iso2: 'TR', invert: true },
      { id: 'fx-egp', label: 'EGP', iso2: 'EG', invert: true },
      { id: 'fx-pkr', label: 'PKR', iso2: 'PK', invert: true },
      { id: 'fx-idr', label: 'IDR', iso2: 'ID', invert: true },
      // Comparison, not subject. The basket above is what this site is for;
      // USD, spliced in at the head, is the denominator all six are quoted
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
      { id: 'silver', label: 'SILVER' },
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
  { id: 'brent', label: 'BRENT' },
  { id: 'vix', label: 'VIX' },
  { id: 'us-10y', label: 'US 10Y' },
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
}

/**
 * A row's members, resolved into one line over one calendar window.
 *
 * The whole of the range control's arithmetic, kept out of the DOM so it can be
 * tested against real payload shapes.
 */
export const sparkInput = (members: SparkMember[], days: number): SparkInput | null => {
  if (!members.length) return null

  // --- The day step ------------------------------------------------------
  // Two closes, drawn as the segment between them against a fixed scale. The
  // group's figure is the mean of its members' displayed percentages — the same
  // quantity `summarise()` derives `net` from, so the slope and the tick above
  // it cannot disagree about which way the basket went.
  if (days <= 1) {
    const pcts = members.map((m) => m.pct).filter((p) => Number.isFinite(p))
    if (!pcts.length) return null
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length
    const drawn = Math.max(-DAY_SLOPE_CAP, Math.min(DAY_SLOPE_CAP, mean))
    return {
      values: [0, drawn],
      span: [0, 1],
      domain: [-DAY_SLOPE_CAP, DAY_SLOPE_CAP],
      pct: mean,
    }
  }

  // --- The calendar steps ------------------------------------------------
  const dated = members.map((m) => {
    const dates = seriesDates(m.periods, m.asOf)
    return dates && dates.length === m.values.length ? { values: m.values, dates } : null
  })

  // All or none. A composite mixing date-windowed members with count-windowed
  // ones is the incomparable-periods bug rebuilt inside a single row, and a
  // source that changes its date format should cost the range control's
  // precision rather than its correctness — so the whole row falls back to the
  // count window the rail used before there was one.
  if (dated.some((d) => d === null)) {
    const index = meanIndex(members.map((m) => m.values))
    return index ? { values: index, span: [0, 1], pct: null } : null
  }

  const usable = dated.flatMap((d) => (d ? [d] : []))
  const ends = usable.flatMap((d) => {
    const last = d.dates[d.dates.length - 1]
    return last === undefined ? [] : [last]
  })
  if (!ends.length) return null
  const to = Math.max(...ends)
  const from = to - days * DAY_MS

  const all = usable.flatMap((d) => {
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
  return {
    values: index,
    span: coverage(drawnFrom, to, from),
    pct: null,
    members: { drawn: windows.length, total: members.length },
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
  update(markets: MapExchange[], now?: number): void
  setTrends(indicators: TrendIndicator[]): void
  /** The chokepoint set, as the money block's fifth row. */
  setStraits(points: MapChokepoint[]): void
  /** Follow a toggle made somewhere else — the phone keeps chips for these. */
  setLayerState(key: 'markets' | 'straits', on: boolean): void
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
  onSelect: (id: string) => void
  /** Open a currency, metal or coin's card. Nothing to fly to — these are not
   *  places — so this only opens the sheet. */
  onQuote: (entry: TickerEntry) => void
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
  /**
   * Which of the two map layers this block now switches, at mount.
   *
   * `markets` and `straits` moved here from the layer chips (2026-08-03),
   * because both are economic series with a published line and the exchange
   * composite was already drawn here as one of the four money rows — so a
   * `markets` chip carrying a trend would have been the same line twice,
   * fifteen rows apart. The island keeps `layersOn` as the source of truth;
   * this is the opening state and `onToggleLayer` is how it hears about a
   * press.
   */
  layers: { markets: boolean; straits: boolean }
  onToggleLayer: (key: 'markets' | 'straits', on: boolean) => void
  /** Fly to a chokepoint and pin its card, the way `onSelect` does an exchange. */
  onStrait: (id: string) => void
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

  /** The two layers this block switches, mirrored from the island's `layersOn`. */
  const layerState = { ...opts.layers }
  /** Each switch's own repaint, so `setLayerState` can drive it from outside. */
  const syncToggles: Partial<Record<'markets' | 'straits', () => void>> = {}

  /**
   * A row's layer switch: the silhouette, and pressing it toggles.
   *
   * One grammar for the whole rail — **a mark means there is something to
   * switch**. A row with no mark (currencies, metals, crypto, Brent) has
   * nothing on the map to turn off, and a reader can read that off the column
   * without being told. It is why the story chips have a dot and the world
   * instruments do not.
   *
   * A sibling of the summary, never inside it: a `<button>` within a `<button>`
   * is invalid and browsers drop the inner one, which is the same trap the rail
   * head records for its disclosure and refresh pair. So the two controls sit
   * in one flex box and each keeps its own hit area, its own pressed state and
   * its own accessible name.
   *
   * It borrows `.map-filter-mark`, which is the chips' glyph column, so the
   * switch here and the switch there are the same object at the same width —
   * and it is what makes every label down the rail start on one edge.
   */
  const layerToggle = (key: 'markets' | 'straits', glyphs: Array<keyof typeof GLYPHS>, name: string) => {
    const btn = el('button', 'map-filter-mark map-markets-toggle')
    btn.setAttribute('type', 'button')
    // The same inline-`--cat` channel the chips take, so a switch cannot
    // disagree with the mark it names and no hue enters the stylesheet.
    if (key === 'markets') {
      btn.dataset.mark = 'market'
      btn.style.setProperty('--cat-up', OVERLAY_COLOUR.marketUp)
      btn.style.setProperty('--cat-down', OVERLAY_COLOUR.marketDown)
    } else {
      btn.style.setProperty('--cat', OVERLAY_COLOUR.straits)
    }
    btn.innerHTML = glyphs.map(glyphSvg).join('')
    const sync = () => {
      const on = layerState[key]
      btn.classList.toggle('is-on', on)
      btn.setAttribute('aria-pressed', String(on))
      btn.setAttribute('aria-label', `${name} on the map`)
    }
    btn.addEventListener('click', () => {
      layerState[key] = !layerState[key]
      sync()
      opts.onToggleLayer(key, layerState[key])
    })
    sync()
    syncToggles[key] = sync
    return btn
  }

  /**
   * One row of the money block: a switch where there is one, then the summary.
   *
   * The first version gave *every* row the column and left it empty on the six
   * that have nothing to switch, so the labels would all start on one edge.
   * That bought alignment with six blank 23px boxes down the block, which reads
   * as a glyph that failed to load rather than as space deliberately kept — the
   * emptiness is louder than the misalignment it was buying off.
   *
   * So the element is only built when it is real, and the stylesheet gives a
   * switchless row's label the column's width instead: the sparklines still
   * begin on one line, which is what alignment here was ever for, and the only
   * thing that moves is the word. The two rows that are indented are exactly
   * the two that also drive the map, so the indent is the grammar made visible
   * rather than a hole.
   */
  const moneyItem = (summary: HTMLElement, toggle: HTMLElement | null) => {
    const box = el('div', 'map-markets-item')
    if (toggle) box.append(toggle)
    box.append(summary)
    return box
  }

  row.append(
    moneyItem(tallyGroup, layerToggle('markets', ['tick-up', 'tick-down'], 'exchanges')),
  )

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

  root.append(moneyHead, row, worldHead, world)

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

  const sparkInto = (host: HTMLElement, members: SparkMember[]): number | null => {
    const input = sparkInput(members, rangeDays)
    const m = input?.members
    sparkNote =
      m && m.drawn < m.total ? `, from ${m.drawn} of ${m.total} with a full window` : ''
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
      host.replaceChildren()
      return null
    }
    // The drawn line's own change, except at the day step, where the line is a
    // slope in percent space and `windowPct` would be a percentage of zero.
    const pct = input.pct ?? spark.windowPct
    host.className = `map-markets-spark${toneClass(pct)}`
    host.replaceChildren(spark.element, el('span', 'map-markets-window', ribbonPct(pct)))
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
      closePanel()
      opts.onSelect(m.id)
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
      closePanel()
      opts.onQuote(e)
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
  const straitsItem = moneyItem(straitsSummary, layerToggle('straits', ['strait-rest'], 'straits'))
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
              closePanel()
              opts.onStrait(c.id)
            })
            return btn
          }),
    )
  }

  const setTrends = (indicators: TrendIndicator[]) => {
    lastIndicators = indicators
    for (const stale of row.querySelectorAll('.map-markets-group[data-trend]')) stale.remove()
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
      // it. `usd-index` is excluded because it is *derived from* the other six —
      // it moves opposite to them by construction, so averaging it back in
      // cancels a seventh of the signal the line exists to carry.
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
      row.append(moneyItem(summary, null))
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
    const worldRows = worldEntries(indicators)
    world.replaceChildren()
    world.hidden = worldRows.length === 0
    worldHead.hidden = world.hidden
    for (const entry of worldRows) {
      const item = el('button', 'map-markets-group map-markets-summary')
      item.setAttribute('type', 'button')
      item.setAttribute('aria-haspopup', 'dialog')
      const spark = el('span', 'map-markets-spark')
      const pct = sparkInto(spark, [entry])
      item.append(
        tick(marketDirection(entry.pct)),
        el('span', 'map-markets-label', entry.label),
        spark,
      )
      item.setAttribute(
        'aria-label',
        `${entry.name}${pct == null ? '' : ` — ${ribbonPct(pct)} over ${rangeLabel()}${sparkNote}`}, show detail`,
      )
      item.addEventListener('click', () => {
        closePanel()
        opts.onQuote(entry)
      })
      world.append(moneyItem(item, null))
    }
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
    update,
    setTrends,
    setStraits,
    setLayerState(key, on) {
      layerState[key] = on
      syncToggles[key]?.()
    },
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
