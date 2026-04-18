// Yahoo Finance — single-ticker daily-chart fetcher.
// Endpoint: /v8/finance/chart/<symbol>?interval=1d&range=1mo
// Free, no auth, no key. Occasional HTTP 429 under heavy load; we timeout +
// graceful-skip any failure so a single bad ticker never blocks the cycle.
//
// Returns Yahoo tickers verbatim (e.g. "META", "2222.SR", "2330.TW",
// "9988.HK"). The caller can namespace them into indicator ids (we use
// `stocks:<TICKER>` so the id stays unique against other sources' ids).

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const USER_AGENT =
  'Mozilla/5.0 (zuhd-news/1.0; +https://zuhd.news) AppleWebKit/537.36 (KHTML, like Gecko)'

function formatPeriod(ms) {
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}

/**
 * Fetch ~30 daily closes for one Yahoo Finance symbol.
 *
 * @param {string} symbol  Yahoo ticker (e.g. "META", "2222.SR", "9988.HK")
 * @returns {Promise<{
 *   values: number[],
 *   periods: string[],
 *   asOf: string,
 *   name: string,
 *   currency: string,
 *   exchange: string
 * } | null>}
 */
export async function fetchYahooStock(symbol) {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1mo`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    })
    if (!res.ok) {
      console.error(`  ✗ yahoo:${symbol}: HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) {
      console.error(`  ✗ yahoo:${symbol}: no chart result`)
      return null
    }
    const timestamps = Array.isArray(result.timestamp) ? result.timestamp : []
    const closes = result.indicators?.quote?.[0]?.close ?? []
    if (timestamps.length < 5 || closes.length < 5) {
      console.error(`  ✗ yahoo:${symbol}: only ${timestamps.length}/${closes.length} points`)
      return null
    }
    // Drop any null closes (Yahoo returns nulls for market-closed days that
    // slipped into the interval). Keep aligned index on timestamps.
    const values = []
    const periods = []
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i]
      if (typeof c !== 'number' || !Number.isFinite(c)) continue
      values.push(Number(c.toFixed(2)))
      periods.push(formatPeriod(timestamps[i] * 1000))
    }
    if (values.length < 5) return null
    const asOf = new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10)
    return {
      values,
      periods,
      asOf,
      name: result.meta?.longName || result.meta?.shortName || symbol,
      currency: result.meta?.currency || 'USD',
      exchange: result.meta?.exchangeName || '',
    }
  } catch (err) {
    console.error(`  ✗ yahoo:${symbol}: ${err.message}`)
    return null
  }
}
