// Yahoo Finance — single-ticker daily-chart fetcher.
// Endpoint: /v8/finance/chart/<symbol>?interval=1d&range=<range>  (default 1mo)
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

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
const USER_AGENT =
  'Mozilla/5.0 (zuhd-news/1.0; +https://zuhd.news) AppleWebKit/537.36 (KHTML, like Gecko)'

const CACHE_PATH = new URL('../../../content/.stocks-cache.json', import.meta.url).pathname
const CACHE_MAX_AGE_MS = 7 * 86400_000
const DEFAULT_RANGE = '1mo'

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

function writeCache(key, entry) {
  try {
    const cache = readCache()
    cache[key] = { ...entry, cachedAt: Date.now() }
    // Rotate entries older than the max age so the file doesn't grow unbounded.
    for (const [k, v] of Object.entries(cache)) {
      if (!v.cachedAt || Date.now() - v.cachedAt > CACHE_MAX_AGE_MS) delete cache[k]
    }
    writeFileSync(CACHE_PATH, JSON.stringify(cache))
  } catch {}
}

function readCachedSeries(key) {
  const entry = readCache()[key]
  if (!entry?.cachedAt || Date.now() - entry.cachedAt > CACHE_MAX_AGE_MS) return null
  const { cachedAt, ...series } = entry
  return { ...series, stale: true }
}

/**
 * Cache key. The range is part of it because two callers now ask for different
 * windows of the same ticker — entity extraction wants a month, the markets
 * layer wants a quarter — and a shared key would serve one of them the other's
 * series with no way to notice. The default range keeps its bare-symbol key so
 * the existing cache file stays warm.
 */
const cacheKey = (symbol, range) => (range === DEFAULT_RANGE ? symbol : `${symbol}@${range}`)

/**
 * A too-short-series failure that still carries the live quote from the same
 * response. `currencyReported` and `timezone` are what let the caller confirm
 * the quote is the instrument it asked for before overlaying the price.
 *
 * @typedef {Error & { quote?: {
 *   marketPrice: number,
 *   currencyReported: string,
 *   timezone: string,
 * } }} ShortSeriesError
 */

async function fetchFromHost(host, symbol, range) {
  const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`
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
    // Too short to chart, but the response still carries a live quote — and for
    // four indices (TASI, DFMGI, SET, PSEI) Yahoo stopped serving history on
    // 2026-08-26 while continuing to serve today's level. Discarding the whole
    // response meant the cached fallback supplied a *price* days old alongside
    // its stale sparkline. Carry the quote on the error so the caller can keep
    // the level fresh; currency and zone ride along so it can verify the quote
    // describes the same instrument before trusting it.
    const err = /** @type {ShortSeriesError} */ (new Error(`only ${timestamps.length}/${closes.length} points`))
    if (typeof result.meta?.regularMarketPrice === 'number') {
      err.quote = {
        marketPrice: result.meta.regularMarketPrice,
        currencyReported: result.meta?.currency ?? '',
        timezone: result.meta?.exchangeTimezoneName ?? '',
      }
    }
    throw err
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
    /** The currency exactly as reported, undefaulted. A caller that asserts
     *  the currency must be able to tell "Yahoo says USD" from "Yahoo said
     *  nothing" — ^MERV reports none at all — and the defaulting above makes
     *  those two indistinguishable. */
    currencyReported: result.meta?.currency ?? '',
    exchange: result.meta?.exchangeName || '',
    /** IANA zone Yahoo attributes to the instrument. Used to catch a symbol
     *  that resolved to a different instrument than the one asked for. */
    timezone: result.meta?.exchangeTimezoneName ?? '',
    /** Live/most-recent price. Note `chartPreviousClose` is deliberately NOT
     *  forwarded: it is the close before the *window*, not the previous day,
     *  so a caller reaching for it to compute a daily change gets the change
     *  over the whole range instead. Use the last two `values`. */
    marketPrice: typeof result.meta?.regularMarketPrice === 'number'
      ? result.meta.regularMarketPrice
      : null,
  }
}

/**
 * Fetch daily closes for one Yahoo Finance symbol.
 *
 * @param {string} symbol  Yahoo ticker (e.g. "META", "2222.SR", "^TASI.SR")
 * @param {{ range?: string }} [opts]  Yahoo range token - "1mo" (default,
 *   ~21 closes) or "3mo" (~62), which is what the markets layer asks for so a
 *   sparkline has a shape rather than a wobble.
 * @returns {Promise<{
 *   values: number[],
 *   periods: string[],
 *   asOf: string,
 *   name: string,
 *   currency: string,
 *   currencyReported: string,
 *   exchange: string,
 *   timezone: string,
 *   marketPrice: number | null,
 *   stale?: boolean
 * } | null>}
 */
export async function fetchYahooStock(symbol, opts = {}) {
  const range = opts.range || DEFAULT_RANGE
  const key = cacheKey(symbol, range)
  /** @type {ShortSeriesError | null} */
  let lastErr = null
  for (const host of YAHOO_HOSTS) {
    try {
      const series = await fetchFromHost(host, symbol, range)
      writeCache(key, series)
      return series
    } catch (err) {
      lastErr = err
    }
  }
  const cached = readCachedSeries(key)
  if (cached) {
    // Overlay a live quote onto the stale series when the failure still handed
    // us one — but only when it describes the same instrument. Yahoo answers an
    // unknown symbol with a DIFFERENT one rather than a 404 (see the header of
    // market-metadata.js), so an unchecked overlay is how a plausible number
    // from the wrong exchange gets printed. Currency and zone must both match
    // what the cached series recorded.
    const q = lastErr?.quote
    const sameInstrument = q
      && q.currencyReported === cached.currencyReported
      && q.timezone === cached.timezone
    if (sameInstrument) {
      console.error(`  ⚠ yahoo:${symbol}: ${lastErr?.message} — cached series from ${cached.asOf}, live price kept`)
      return { ...cached, marketPrice: q.marketPrice }
    }
    console.error(`  ⚠ yahoo:${symbol}: ${lastErr?.message} — serving cached series from ${cached.asOf}`)
    return cached
  }
  console.error(`  ✗ yahoo:${symbol}: ${lastErr?.message}`)
  return null
}
