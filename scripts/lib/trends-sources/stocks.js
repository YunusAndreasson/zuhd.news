// Yahoo Finance — single-ticker daily-chart fetcher.
// Endpoint: /v8/finance/chart/<symbol>?interval=1d&range=1mo
// Free, no auth, no key — but unofficial and degrading (crumb walls, 429s).
// Hardening (2026-07-03):
//   • host alternation: query1 → query2 on any failure (Yahoo rate-limits
//     the hosts independently)
//   • last-good cache: successful series are persisted to
//     content/.stocks-cache.json; when both hosts fail, a <7-day-old cached
//     series is served (marked stale) so a blocked cycle degrades to
//     stale-but-present instead of a vanished chart.
//
// Returns Yahoo tickers verbatim (e.g. "META", "2222.SR", "2330.TW",
// "9988.HK"). The caller can namespace them into indicator ids (we use
// `stocks:<TICKER>` so the id stays unique against other sources' ids).

import { readFileSync, writeFileSync, existsSync } from 'fs'

const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
const USER_AGENT =
  'Mozilla/5.0 (zuhd-news/1.0; +https://zuhd.news) AppleWebKit/537.36 (KHTML, like Gecko)'

const CACHE_PATH = new URL('../../../content/.stocks-cache.json', import.meta.url).pathname
const CACHE_MAX_AGE_MS = 7 * 86400_000

function formatPeriod(ms) {
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}

function readCache() {
  try {
    if (existsSync(CACHE_PATH)) return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
  } catch {}
  return {}
}

function writeCache(symbol, entry) {
  try {
    const cache = readCache()
    cache[symbol] = { ...entry, cachedAt: Date.now() }
    // Rotate entries older than the max age so the file doesn't grow unbounded.
    for (const [k, v] of Object.entries(cache)) {
      if (!v.cachedAt || Date.now() - v.cachedAt > CACHE_MAX_AGE_MS) delete cache[k]
    }
    writeFileSync(CACHE_PATH, JSON.stringify(cache))
  } catch {}
}

function readCachedSeries(symbol) {
  const entry = readCache()[symbol]
  if (!entry?.cachedAt || Date.now() - entry.cachedAt > CACHE_MAX_AGE_MS) return null
  const { cachedAt, ...series } = entry
  return { ...series, stale: true }
}

async function fetchFromHost(host, symbol) {
  const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error('no chart result')
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  if (timestamps.length < 5 || closes.length < 5) {
    throw new Error(`only ${timestamps.length}/${closes.length} points`)
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
  if (values.length < 5) throw new Error('fewer than 5 usable closes')
  const asOf = new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10)
  return {
    values,
    periods,
    asOf,
    name: result.meta?.longName || result.meta?.shortName || symbol,
    currency: result.meta?.currency || 'USD',
    exchange: result.meta?.exchangeName || '',
  }
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
 *   exchange: string,
 *   stale?: boolean
 * } | null>}
 */
export async function fetchYahooStock(symbol) {
  let lastErr = null
  for (const host of YAHOO_HOSTS) {
    try {
      const series = await fetchFromHost(host, symbol)
      writeCache(symbol, series)
      return series
    } catch (err) {
      lastErr = err
    }
  }
  const cached = readCachedSeries(symbol)
  if (cached) {
    console.error(`  ⚠ yahoo:${symbol}: ${lastErr?.message} — serving cached series from ${cached.asOf}`)
    return cached
  }
  console.error(`  ✗ yahoo:${symbol}: ${lastErr?.message}`)
  return null
}
