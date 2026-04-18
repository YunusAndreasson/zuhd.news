// CoinGecko crypto price fetcher.
// Docs: https://docs.coingecko.com/v3.0.1/reference/coins-id-market-chart
// Free tier, no API key required. Rate-limited to ~10-30 calls/min for
// unauthenticated clients — well within our daily-pull budget.

const CG_BASE = 'https://api.coingecko.com/api/v3'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'

/** Format "Mar 18" from a unix-ms timestamp. */
function formatPeriod(ms) {
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}

/**
 * Fetch 30 daily closes for a CoinGecko coin id.
 *
 * @param {{ id: string, seriesId: string }} indicator  seriesId = CG coin id ("bitcoin")
 * @returns {Promise<{ values: number[], periods: string[], asOf: string } | null>}
 */
export async function fetchCoinGeckoSeries(indicator) {
  const url = new URL(`${CG_BASE}/coins/${indicator.seriesId}/market_chart`)
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('days', '30')
  url.searchParams.set('interval', 'daily')

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const prices = Array.isArray(data.prices) ? data.prices : []
    if (prices.length < 2) {
      console.error(`  ✗ crypto:${indicator.id}: only ${prices.length} points`)
      return null
    }

    const values = prices.map(([, p]) => Number(p.toFixed(2)))
    const periods = prices.map(([ms]) => formatPeriod(ms))
    const asOf = new Date(prices[prices.length - 1][0]).toISOString().slice(0, 10)

    return { values, periods, asOf }
  } catch (err) {
    console.error(`  ✗ crypto:${indicator.id}: ${err.message}`)
    return null
  }
}
