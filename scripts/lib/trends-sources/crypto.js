// CoinGecko crypto price fetcher.
// Docs: https://docs.coingecko.com/v3.0.1/reference/coins-id-market-chart
// Works keyless, but keyless traffic shares an IP-based rate pool and we saw
// recurring HTTP 429 on the 4-coin fan-out (thirteen since 2026-10-03). A free Demo key (100 calls/min,
// sent via x-cg-demo-api-key against the same host) moves us to a private
// pool. Set COINGECKO_API_KEY in the systemd service to enable; absent key
// keeps the old keyless behavior.

import { ZUHD_UA } from '../http.js'
import { dayLabel, isoDay } from '../period.js'

const CG_BASE = 'https://api.coingecko.com/api/v3'
const CG_KEY = process.env.COINGECKO_API_KEY || ''

/**
 * A dollar price at the precision its size needs.
 *
 * Two decimals was the rule while every coin here cost tens of dollars or
 * more. At two, Dogecoin at $0.0931 is `0.09` on every day of the month — a
 * flat line and a week's move of nothing — so a price under ten dollars keeps
 * four decimals and one under a dollar six. From ten up it is unchanged.
 *
 * @param {number} price
 * @returns {number}
 */
export function roundPrice(price) {
  const abs = Math.abs(price)
  return Number(price.toFixed(abs >= 10 ? 2 : abs >= 1 ? 4 : 6))
}

/**
 * The days asked for. Four past thirty: the answer is a close for each day's
 * midnight and the price now, so thirty days is twenty-nine and a price to
 * measure a thirty-day move from is not in it (the app's ladder, `gaugeSpan`,
 * `mobile/lib/cards/week-move.ts`).
 */
const SERIES_DAYS = 34

/**
 * Fetch a CoinGecko coin's daily closes (`SERIES_DAYS`) and its price now.
 *
 * @param {{ id: string, seriesId: string }} indicator  seriesId = CG coin id ("bitcoin")
 * @returns {Promise<{ values: number[], periods: string[], asOf: string } | null>}
 */
export async function fetchCoinGeckoSeries(indicator) {
  const url = new URL(`${CG_BASE}/coins/${indicator.seriesId}/market_chart`)
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('days', String(SERIES_DAYS))
  url.searchParams.set('interval', 'daily')

  const headers = { 'User-Agent': ZUHD_UA, accept: 'application/json' }
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

    const values = prices.map(([, p]) => roundPrice(p))
    const periods = prices.map(([ms]) => dayLabel(ms))
    const asOf = isoDay(prices[prices.length - 1][0])

    return { values, periods, asOf }
  } catch (err) {
    console.error(`  ✗ crypto:${indicator.id}: ${err.message}`)
    return null
  }
}
