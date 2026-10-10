// Yahoo Finance — single-ticker daily-chart fetcher.
// Endpoint: /v8/finance/chart/<symbol>?interval=1d&range=<range>  (default 1mo)
// Free, no auth, no key — but unofficial and degrading (crumb walls, 429s).
// Hardening (2026-07-03):
//   • host alternation: query1 → query2 when a host fails (Yahoo rate-limits
//     the hosts independently). Not when it answers with a series too short
//     to chart: that is the data, and the other host has the same.
//   • hourly bars for a symbol with no daily history (2026-10-10): four
//     indices are answered with one daily bar whatever the range, and their
//     sessions are rebuilt from the hourly bars of the same window.
//   • last-good cache: successful series are persisted to
//     content/.stocks-cache.json; when both hosts fail, a <7-day-old cached
//     series is served (marked stale) so a blocked cycle degrades to
//     stale-but-present instead of a vanished chart.
//
// Returns Yahoo tickers verbatim (e.g. "META", "2222.SR", "2330.TW",
// "9988.HK"). The caller can namespace them into indicator ids (we use
// `stocks:<TICKER>` so the id stays unique against other sources' ids).

import { pathOf } from '../datasets.js'
import { readJson, writeJson } from '../json-file.js'
import { dayLabel, isoDay } from '../period.js'

const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
const USER_AGENT =
  'Mozilla/5.0 (zuhd-news/1.0; +https://zuhd.news) AppleWebKit/537.36 (KHTML, like Gecko)'

const CACHE_MAX_AGE_MS = 7 * 86400_000
const DEFAULT_RANGE = '1mo'

/** An exchange whose last completed close is older than this is published as
 *  `stale`, whichever path produced it. */
export const STALE_AFTER_DAYS = 7

/**
 * The date of the last *completed* close, never of the last timestamp.
 *
 * When an exchange's feed stops, Yahoo keeps returning the whole requested
 * axis with `close: null` after the stop. The null bars are dropped below, but
 * `asOf` used to be read from the final timestamp — so TASI, SET and PSEi
 * published an `asOf` of today over a series that ended in mid-July, and the
 * web rail toned a seven-week-old close as yesterday's. The last completed
 * session is the honest date; a series whose only bar is today's in-session
 * one falls back to that bar's date.
 *
 * @param {string[]} dates exchange-local 'YYYY-MM-DD', aligned with `completed`
 * @param {boolean[]} completed
 * @returns {string}
 */
export function seriesAsOf(dates, completed) {
  const i = completed.lastIndexOf(true)
  return i >= 0 ? dates[i] : (dates.at(-1) ?? '')
}

/** @param {string} asOf @param {number} [now] */
export function isStaleAsOf(asOf, now = Date.now()) {
  const t = Date.parse(`${asOf}T00:00:00Z`)
  return !Number.isFinite(t) || now - t > STALE_AFTER_DAYS * 86400_000
}

/**
 * The last-good cache, through the one read and the one write
 * (`lib/json-file.js`), for the two things the hand-rolled pair got wrong.
 *
 * The write was a bare `writeFileSync` of the whole file, once for every
 * symbol that succeeded: about fifty times a cycle, across three stages that
 * each run under `timeout`. A stage killed during one leaves the file cut
 * short. And the read caught everything and said nothing, so a cut file was
 * an empty cache, the next success wrote that one entry back as the whole
 * file, and every other last-good series was gone, on exactly the cycle a
 * slow Yahoo had made the kill likely. Now the write is a rename, so the file
 * is the old cache or the new one, and a file that will not parse is said.
 *
 * Still read and written per symbol and not held for the run: a stage killed
 * half way keeps what it had fetched, and a run by hand beside a cycle does
 * not write the cycle's entries back out of an older copy.
 *
 * @param {string} path
 * @returns {Record<string, any>}
 */
function readCache(path) {
  const cache = readJson(path, {})
  return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {}
}

function writeCache(path, key, entry, now) {
  try {
    const cache = readCache(path)
    cache[key] = { ...entry, cachedAt: now }
    // Rotate entries older than the max age so the file doesn't grow unbounded.
    for (const [k, v] of Object.entries(cache)) {
      if (!v?.cachedAt || now - v.cachedAt > CACHE_MAX_AGE_MS) delete cache[k]
    }
    writeJson(path, cache, { pretty: false })
  } catch (err) {
    // The series is in hand either way; a cache that cannot be written costs
    // the fallback, not the fetch.
    console.error(`  ⚠ yahoo cache: not written (${/** @type {Error} */ (err).message})`)
  }
}

function readCachedSeries(path, key, now) {
  const entry = readCache(path)[key]
  if (!entry?.cachedAt || now - entry.cachedAt > CACHE_MAX_AGE_MS) return null
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
 * `short` marks the failure as the host's answer and not the host's fault:
 * the response arrived and the series in it is too short. `fetchYahooStock`
 * does not ask the other host for the same data.
 *
 * @typedef {Error & { short?: true, quote?: {
 *   marketPrice: number,
 *   currencyReported: string,
 *   timezone: string,
 * } }} ShortSeriesError
 */

/** The day a moment falls on in `zone`, `2026-10-09`, as a function of ms. */
function localDay(zone) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return (/** @type {number} */ ms) => format.format(new Date(ms))
}

/**
 * An hourly chart result as a daily one: a bar a session, its close the last
 * hourly bar's of that day in the exchange's own zone.
 *
 * For the indices whose daily history Yahoo no longer serves. Since
 * 2026-08-26 a daily request for TASI, DFMGI, SET or PSEI is answered with
 * one bar, whatever the range, and the four were off the map; the hourly bars
 * of the same symbols still reach back the quarter.
 *
 * **The closes are the last trade of the last hour, not the official close.**
 * Held against the daily closes Yahoo published for the four before the stop
 * (35 to 49 sessions each, May to July 2026): Dubai and Manila the same to
 * the cent, Riyadh within 0.32% and Bangkok within 0.40%, off on most days,
 * as an exchange that sets its close in an auction after the last hour is.
 * No session was missing and none was invented. The newest session takes the
 * quote's own price where the quote is of that day, which is the close once
 * the session has ended.
 *
 * @param {any} result `chart.result[0]` of an `interval=1h` request
 */
export function sessionsFromHourly(result) {
  const stamps = Array.isArray(result.timestamp) ? result.timestamp : []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const day = localDay(result.meta?.exchangeTimezoneName || 'UTC')
  /** @type {Map<string, { stamp: number, close: number }>} */
  const sessions = new Map()
  for (let i = 0; i < stamps.length; i++) {
    const close = closes[i]
    if (typeof close !== 'number' || !Number.isFinite(close)) continue
    sessions.set(day(stamps[i] * 1000), { stamp: stamps[i], close })
  }
  const days = [...sessions.keys()].sort()
  const newest = sessions.get(days[days.length - 1] ?? '')
  const { regularMarketTime: quotedAt, regularMarketPrice: quoted } = result.meta ?? {}
  if (newest && typeof quoted === 'number' && Number.isFinite(quotedAt) && day(quotedAt * 1000) === days[days.length - 1]) {
    newest.close = quoted
  }
  return {
    ...result,
    timestamp: days.map((d) => /** @type {{ stamp: number }} */ (sessions.get(d)).stamp),
    indicators: { quote: [{ close: days.map((d) => /** @type {{ close: number }} */ (sessions.get(d)).close) }] },
  }
}

async function fetchFromHost(host, symbol, range, get, now) {
  const ask = async (/** @type {string} */ interval) => {
    const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
    const res = await get(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) throw new Error('no chart result')
    return result
  }
  const daily = await ask('1d')
  try {
    return chartSeries(daily, symbol, now)
  } catch (err) {
    if (!(/** @type {ShortSeriesError} */ (err).short)) throw err
    // Too short by the day: the same window by the hour (`sessionsFromHourly`).
    // Whatever that comes to, a failure or as short a series, the daily answer
    // stands, with the quote it carries for the cached series.
    try {
      const series = chartSeries(sessionsFromHourly(await ask('1h')), symbol, now)
      console.log(`  · yahoo:${symbol}: ${/** @type {Error} */ (err).message} by the day, ${series.values.length} sessions rebuilt from hourly bars`)
      return { ...series, hourly: true }
    } catch {
      throw err
    }
  }
}

/**
 * One chart result (`chart.result[0]`) as the series this module returns.
 * Pure, so it has a test. Throws for a result too short to chart, with the
 * live quote on the error where the response carried one.
 *
 * @param {any} result
 * @param {string} symbol
 * @param {number} [now]
 */
export function chartSeries(result, symbol, now = Date.now()) {
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
    err.short = true
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
  const dates = []
  const completed = []
  const localDate = localDay(result.meta?.exchangeTimezoneName || 'UTC')
  const today = localDate(now)
  const sessionEnd = result.meta?.currentTradingPeriod?.regular?.end
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i]
    if (typeof c !== 'number' || !Number.isFinite(c)) continue
    const date = localDate(timestamps[i] * 1000)
    values.push(Number(c.toFixed(2)))
    // The session's own day, as `dates` has it, and not the UTC day of the
    // bar's timestamp. A bar is stamped at the open, and Sydney opens at 23:00
    // UTC the day before once its clocks go forward: from 4 October 2026 its
    // Monday session was labelled `Oct 4`, a Sunday, beside `dates` of the 5th.
    periods.push(dayLabel(Date.parse(`${date}T00:00:00Z`)))
    dates.push(date)
    completed.push(date < today || (date === today && Number.isFinite(sessionEnd) && now > sessionEnd * 1000 + 15 * 60000))
  }
  if (values.length < 5) {
    const err = /** @type {ShortSeriesError} */ (new Error('fewer than 5 usable closes'))
    err.short = true
    throw err
  }
  const asOf = seriesAsOf(dates, completed)
  return {
    values,
    periods,
    dates,
    completed,
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
 * @param {{ range?: string, fetch?: typeof fetch, cachePath?: string, now?: number }} [opts]
 *   `range` is a Yahoo range token - "1mo" (default, ~21 closes) or "3mo"
 *   (~62), which is what the markets layer asks for so a sparkline has a shape
 *   rather than a wobble. The rest are what a test holds it by.
 * @returns {Promise<{
 *   values: number[],
 *   periods: string[],
 *   dates: string[],
 *   completed: boolean[],
 *   asOf: string,
 *   name: string,
 *   currency: string,
 *   currencyReported: string,
 *   exchange: string,
 *   timezone: string,
 *   marketPrice: number | null,
 *   stale?: boolean,
 *   hourly?: boolean
 * } | null>}
 *   `hourly`: the sessions were rebuilt from hourly bars (`sessionsFromHourly`),
 *   so every close but the newest is near the official one, not it.
 */
export async function fetchYahooStock(symbol, opts = {}) {
  const range = opts.range || DEFAULT_RANGE
  const get = opts.fetch ?? fetch
  const cachePath = opts.cachePath ?? pathOf('stocksCache')
  const now = opts.now ?? Date.now()
  const key = cacheKey(symbol, range)
  /** @type {ShortSeriesError | null} */
  let lastErr = null
  for (const host of YAHOO_HOSTS) {
    try {
      const series = await fetchFromHost(host, symbol, range, get, now)
      writeCache(cachePath, key, series, now)
      return series
    } catch (err) {
      lastErr = /** @type {ShortSeriesError} */ (err)
      // The host answered, and what it answered with is too short, by the day
      // and by the hour. The other host has the same.
      if (lastErr.short) break
    }
  }
  const cached = readCachedSeries(cachePath, key, now)
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
      // The live close is APPENDED to the series, not just set on `marketPrice`.
      // Nothing reads `marketPrice` — `fetch-markets.js` and `extract-entities.js`
      // both take `values[values.length - 1]` — so setting it alone left the most
      // prominent number on the card days out of date while claiming a fix.
      // `changePct` then reads from the last real close to today, which is the
      // move the data actually supports, on a card the UI already marks "cached".
      const today = isoDay(now)
      const live = Number(q.marketPrice.toFixed(2))
      const appended = cached.asOf !== today
      console.error(
        `  ⚠ yahoo:${symbol}: ${lastErr?.message} — cached series from ${cached.asOf}` +
        (appended ? `, live close ${live} appended for ${today}` : ', live close already current'),
      )
      if (!appended) return { ...cached, marketPrice: q.marketPrice }
      // `asOf` stays the cached series' own — the appended bar is a live,
      // uncompleted quote, and the date of the last real close is the claim
      // the rest of the pipeline reads.
      return {
        ...cached,
        values: [...(cached.values || []), live],
        periods: [...(cached.periods || []), dayLabel(now)],
        dates: [...(cached.dates || []), today],
        completed: [...(cached.completed || []), false],
        marketPrice: q.marketPrice,
      }
    }
    console.error(`  ⚠ yahoo:${symbol}: ${lastErr?.message} — serving cached series from ${cached.asOf}`)
    return cached
  }
  console.error(`  ✗ yahoo:${symbol}: ${lastErr?.message}`)
  return null
}
