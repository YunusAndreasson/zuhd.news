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

import { isTrading } from './format'
import { GLYPHS, glyphSvg } from './glyphs'
import { MAP_COLOURS, OVERLAY_COLOUR } from './style'
import type { MapExchange } from './types'

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
const TONE = [
  'case',
  ['==', ['get', 'dir'], 0],
  MAP_COLOURS.neutral,
  ['<', ['get', 'dir'], 0],
  OVERLAY_COLOUR.marketDown,
  OVERLAY_COLOUR.marketUp,
]

export const marketLayout = () => ({
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

export const marketPaint = () => ({
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
 * today's move. Silver is absent because there is no source for it yet — see
 * the note in `situation-map.ts` where the ribbon is filled.
 */
const TICKER: Array<{ group: string; items: TickerItem[] }> = [
  {
    group: 'currencies',
    items: [
      { id: 'fx-try', label: 'TRY', iso2: 'TR', invert: true },
      { id: 'fx-egp', label: 'EGP', iso2: 'EG', invert: true },
      { id: 'fx-pkr', label: 'PKR', iso2: 'PK', invert: true },
      { id: 'fx-idr', label: 'IDR', iso2: 'ID', invert: true },
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
  unit?: string
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
  asOf?: string
  sourceLabel?: string
}

/**
 * The dollar, as an index over the basket it is quoted against.
 *
 * There is no dollar index in the payload and the obvious entry is impossible:
 * every rate in this row is `X / USD`, so the dollar against itself is 0.0%
 * every day forever. But the row already contains the answer — if all six
 * currencies fell, the dollar rose — so the index is derived from exactly the
 * series printed beside it rather than fetched from somewhere that would not
 * agree with them.
 *
 * Each `X / USD` series is normalised to its own first value and the six are
 * averaged. `X / USD` rising means more of X per dollar, so the average rising
 * means the dollar strengthening — the index needs no inversion, unlike the
 * currencies themselves.
 *
 * Two things this is *not*, both stated on the card rather than left to be
 * assumed: it is not DXY, and it is not trade-weighted. It is an unweighted
 * mean over an editorially chosen basket, which makes it exactly as broad as
 * the row it summarises and no broader.
 */
const dollarIndex = (series: number[][]): number[] | null => {
  const usable = series.filter((s) => s.length > 1 && Number.isFinite(s[0]) && s[0] !== 0)
  if (usable.length < 2) return null
  // Align on the most recent N points, since the basket's series need not be
  // the same length.
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
      const values = item.invert
        ? ind.values.map((v) => (Number.isFinite(v) && v !== 0 ? 1 / v : Number.NaN))
        : ind.values
      out.push({
        group,
        id: item.id,
        label: item.label,
        name: ind.label,
        flag: flagOf(item.iso2),
        pct,
        unit: ind.unit,
        level: ind.values[ind.values.length - 1],
        values,
        periods: ind.periods ?? [],
        asOf: ind.asOf,
        sourceLabel: (ind as { sourceLabel?: string }).sourceLabel,
      })
    }
  }

  // The dollar goes first, because it is the thing the rest of the row is
  // measured against. Its percentage is read off the derived series rather than
  // averaged from the six printed figures, so the number and the chart on its
  // card cannot disagree — the same rule the exchange sparkline follows.
  const usd = dollarIndex(basket)
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
  setVisible(on: boolean): void
  destroy(): void
}

export interface MarketStripOptions {
  /** Fly to an exchange and pin its card. */
  onSelect: (id: string) => void
  /** Open a currency, metal or coin's card. Nothing to fly to — these are not
   *  places — so this only opens the sheet. */
  onQuote: (entry: TickerEntry) => void
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
const ribbonPct = (pct: number): string => {
  const abs = Math.abs(pct).toFixed(1)
  return abs === '0.0' ? '0.0%' : `${pct > 0 ? '+' : '−'}${abs}%`
}

/** `is-pos` / `is-neg` / neither — the same threshold the tick shape uses. */
const toneClass = (pct: number): string =>
  Math.abs(pct) <= FLAT_PCT ? '' : pct < 0 ? ' is-neg' : ' is-pos'

const el = (tag: string, className?: string, text?: string) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
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

  const exchanges = el('div', 'map-markets-row')
  const label = el('span', 'map-markets-label', 'markets')
  const tally = el('span', 'map-markets-tally')
  const movers = el('ul', 'map-markets-movers')
  const note = el('span', 'map-markets-note')
  exchanges.append(label, tally, movers, note)

  // The second rung: money, metal and crypto. Same vocabulary as the row above
  // — tick, name, signed figure — because they are the same kind of fact, and
  // one rung quieter because the exchanges are the layer the map is drawing.
  const ribbon = el('div', 'map-markets-row is-ribbon')
  root.append(exchanges, ribbon)

  const tick = (dir: -1 | 0 | 1) => {
    const id = dir > 0 ? 'tick-up' : dir < 0 ? 'tick-down' : 'tick-flat'
    const span = el('span', 'map-markets-tick')
    span.innerHTML = glyphSvg(id)
    return span
  }

  const update = (markets: MapExchange[], now = Date.now()) => {
    const t = marketTally(markets, now)

    tally.replaceChildren()
    for (const [dir, n, cls] of [
      [1, t.up, 'is-pos'],
      [-1, t.down, 'is-neg'],
    ] as Array<[-1 | 1, number, string]>) {
      const group = el('span', `map-markets-count ${cls}`)
      group.append(tick(dir), el('span', undefined, String(n)))
      tally.append(group)
    }
    // Omitted at zero — a strip that says "0 flat" is spending a word to
    // report the absence of a thing nobody asked about.
    if (t.flat) tally.append(el('span', 'map-markets-count', `${t.flat} flat`))

    movers.replaceChildren()
    // Risers, then fallers — a ranking, read down each side. With two per side
    // the phone rule `li:nth-child(even)` happens to leave the top riser and
    // the top faller, which is exactly the pair worth keeping, so grouping
    // costs nothing at the narrow end.
    for (const m of [...t.risers, ...t.fallers]) {
      const li = el('li')
      const btn = el('button', `map-markets-mover${toneClass(m.changePct)}`)
      btn.setAttribute('type', 'button')
      // The index, not the institution: KOSPI, not Korea Exchange. It is
      // shorter and it is what a market is called in a headline.
      btn.append(
        tick(marketDirection(m.changePct)),
        el('span', 'map-markets-mover-name', m.indexName),
        el('span', 'map-markets-mover-pct', ribbonPct(m.changePct)),
      )
      btn.addEventListener('click', () => opts.onSelect(m.id))
      li.append(btn)
      movers.append(li)
    }

    // The caveat on the whole readout: at any given moment most exchanges are
    // shut, and those numbers are last night's. One number rather than thirty
    // mark-states.
    note.textContent = t.closed ? `${t.closed} closed` : ''
  }

  const setTrends = (indicators: TrendIndicator[]) => {
    ribbon.replaceChildren()
    const entries = tickerEntries(indicators)
    if (!entries.length) return
    let current = ''
    for (const e of entries) {
      if (e.group !== current) {
        current = e.group
        ribbon.append(el('span', 'map-markets-label', e.group))
      }
      const item = el('button', `map-markets-quote${toneClass(e.pct)}`)
      item.setAttribute('type', 'button')
      // The code is what fits; the name is what the reader needs. The flag
      // bridges them at no cost in width, and the card carries the rest.
      item.setAttribute('aria-label', `${e.name}, ${ribbonPct(e.pct)}`)
      if (e.flag) item.append(el('span', 'map-markets-flag', e.flag))
      item.append(
        tick(e.pct > FLAT_PCT ? 1 : e.pct < -FLAT_PCT ? -1 : 0),
        el('span', 'map-markets-quote-name', e.label),
        el('span', 'map-markets-quote-pct', ribbonPct(e.pct)),
      )
      item.addEventListener('click', () => opts.onQuote(e))
      ribbon.append(item)
    }
  }

  return {
    element: root,
    update,
    setTrends,
    setVisible(on: boolean) {
      root.hidden = !on
    },
    destroy() {
      root.remove()
    },
  }
}

/** Kept honest against the table the marks are drawn from. */
export const MARKET_CHIP_GLYPHS = ['tick-up', 'tick-down'] as const satisfies ReadonlyArray<
  keyof typeof GLYPHS
>
