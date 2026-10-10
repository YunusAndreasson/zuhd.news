// Front-month futures: the price a newspaper means by "Brent" or "gold".
//
// Oil and gas were FRED's spot series and the two metals were read off tokens
// backed by them. The spot series is the physical cargo's assessment, published
// four or five days late, and it is not the number a story quotes: on
// 2026-10-10 the Brent card read $125.44 while the paragraph on the ten-year's
// card, written from the day's stories, said Brent neared $110. The contract
// read $104.72 that day. One instrument, the one the coverage is about, and
// quoted the same day.
//
// The quote source is unofficial (`stocks.js`, its header). So every row keeps
// the series it had as a `fallback`, and a quote that fails, is of another
// instrument or has gone stale is answered from there, under that series' own
// source line: the card says what it is reading.

import { fetchCoinGeckoSeries } from './crypto.js'
import { fetchFredSeries } from './fred.js'
import { fetchYahooStock, isStaleAsOf, seriesAsOf } from './stocks.js'

/** About three months of sessions, as the exchanges' rows ask for
 *  (`QUOTE_RANGE`, `quote-snapshot.js`) and near what FRED's ninety days gave. */
const FUTURES_RANGE = '3mo'

/** Every contract here is a dollar one that trades in New York. */
const CURRENCY = 'USD'
const ZONE = 'America/New_York'

/**
 * Why a quote is not the contract a row asked for, or null when it is.
 *
 * The quote source answers an unknown symbol with a different instrument and
 * no error (`market-metadata.js`, its header), so a symbol is believed only
 * when what came back agrees with what the row says it is: a dollar price, in
 * New York, under a name that opens with the row's `match`. `Crude Oil Nov 26`
 * opens with `crude oil`; the Brent contract opens with `brent crude oil`, so
 * neither can stand in for the other.
 *
 * @param {{ match?: string }} indicator
 * @param {{ name?: string, currencyReported?: string, timezone?: string }} data
 * @returns {string | null}
 */
export function futuresMismatch(indicator, data) {
  if (data.currencyReported !== CURRENCY) return `priced in ${data.currencyReported || 'no stated currency'}, not ${CURRENCY}`
  if (data.timezone !== ZONE) return `trades in ${data.timezone || 'no stated zone'}, not ${ZONE}`
  const name = String(data.name ?? '').toLowerCase()
  if (!indicator.match || !name.startsWith(indicator.match)) return `named "${data.name ?? ''}", not "${indicator.match ?? ''}…"`
  return null
}

/** The fetchers a row's `fallback` may name, each called as its own source
 *  calls it. @type {Record<string, (row: any, env: Record<string, string | undefined>) => Promise<any>>} */
const FALLBACKS = {
  fred: (row, env) => (env.FRED_API_KEY ? fetchFredSeries(row, env.FRED_API_KEY) : Promise.resolve(null)),
  crypto: (row) => fetchCoinGeckoSeries(row),
}

/**
 * One contract's daily closes, or its row's fallback series, or null.
 *
 * A fallback answers with its own `source`, `seriesId` and `sourceLabel`, which
 * the snapshot row takes over the registry's (`buildIndicatorEntry`): it is a
 * different series, and `carriedRow` will not carry it forward as the contract.
 *
 * @param {{ id: string, seriesId: string, cadence: 'daily'|'monthly', match?: string,
 *   fallback?: { source: string, seriesId: string, sourceLabel: string } }} indicator
 * @param {{ fetchQuote?: typeof fetchYahooStock, fallbacks?: typeof FALLBACKS,
 *   env?: Record<string, string | undefined>, now?: number }} [opts] what a test holds it by
 * @returns {Promise<{ values: number[], periods: string[], asOf: string, dates?: string[], completed?: boolean[],
 *   source?: string, seriesId?: string, sourceLabel?: string } | null>}
 */
export async function fetchFuturesSeries(indicator, { fetchQuote = fetchYahooStock, fallbacks = FALLBACKS, env = process.env, now = Date.now() } = {}) {
  const data = await fetchQuote(indicator.seriesId, { range: FUTURES_RANGE, now })
  const refused = !data
    ? 'no quote'
    : (futuresMismatch(indicator, data) ?? (isStaleAsOf(data.asOf, now) ? `last close ${data.asOf}` : null))
  if (data && !refused) {
    const { values, periods, dates, completed, asOf } = data
    return { values, periods, dates, completed, asOf }
  }

  const fallback = indicator.fallback
  const ask = fallback ? fallbacks[fallback.source] : undefined
  if (!fallback || !ask) {
    console.error(`  ✗ futures:${indicator.id}: ${refused}, and no fallback series`)
    return null
  }
  const series = await ask({ ...indicator, ...fallback }, env)
  if (!series) {
    console.error(`  ✗ futures:${indicator.id}: ${refused}, and ${fallback.source}:${fallback.seriesId} did not answer`)
    return null
  }
  console.error(`  ⚠ futures:${indicator.id}: ${refused} — published from ${fallback.source}:${fallback.seriesId}`)
  return { ...series, source: fallback.source, seriesId: fallback.seriesId, sourceLabel: fallback.sourceLabel }
}

/** The rows drawn against each other, session by session: the app's
 *  gold-against-silver card divides one by the other and shows nothing when
 *  their lengths differ (`metalsPairCard`, `mobile/lib/cards/markets.ts`). */
const PAIRED = [['paxg', 'xag']]

/** @param {any} row @param {Set<string>} keep */
function keepSessions(row, keep) {
  const at = row.dates.map((/** @type {string} */ d, /** @type {number} */ i) => (keep.has(d) ? i : -1)).filter((/** @type {number} */ i) => i >= 0)
  if (at.length === row.dates.length) return
  for (const key of ['values', 'periods', 'dates', 'completed']) row[key] = at.map((/** @type {number} */ i) => row[key][i])
  row.asOf = seriesAsOf(row.dates, row.completed)
}

/**
 * Cut each pair to the sessions both rows have, in place.
 *
 * Two contracts on one exchange keep one calendar, but the quote source drops
 * a bar whose close it has no number for, and it does that to one contract at
 * a time. A row with no `dates` is a fallback's and is left alone: the card
 * that needs the pair then shows nothing, which is the app's own answer.
 *
 * @param {any[]} rows the source's snapshot rows, fetched or carried
 * @param {string[][]} [pairs]
 */
export function alignSessions(rows, pairs = PAIRED) {
  for (const [aId, bId] of pairs) {
    const a = rows.find((r) => r.id === aId)
    const b = rows.find((r) => r.id === bId)
    if (!Array.isArray(a?.dates) || !Array.isArray(b?.dates)) continue
    const theirs = new Set(b.dates)
    const shared = new Set(a.dates.filter((/** @type {string} */ d) => theirs.has(d)))
    keepSessions(a, shared)
    keepSessions(b, shared)
  }
}
