// CoinGecko crypto price fetcher.
// Docs: https://docs.coingecko.com/v3.0.1/reference/coins-id-market-chart
// Works keyless, but keyless traffic shares an IP-based rate pool and we saw
// recurring HTTP 429 on the 4-coin fan-out. A free Demo key (100 calls/min,
// sent via x-cg-demo-api-key against the same host) moves us to a private
// pool. Set COINGECKO_API_KEY in the systemd service to enable; absent key
// keeps the old keyless behavior.

const CG_BASE = 'https://api.coingecko.com/api/v3'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'
const CG_KEY = process.env.COINGECKO_API_KEY || ''

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

  const headers = { 'User-Agent': USER_AGENT, accept: 'application/json' }
  if (CG_KEY) headers['x-cg-demo-api-key'] = CG_KEY

  try {
    let res = await fetch(url, { signal: AbortSignal.timeout(15000), headers })
    if (res.status === 429) {
      // Shared-pool rate limit — one retry after a short backoff clears most.
      await new Promise((r) => setTimeout(r, 2500))
      res = await fetch(url, { signal: AbortSignal.timeout(15000), headers })
    }
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
