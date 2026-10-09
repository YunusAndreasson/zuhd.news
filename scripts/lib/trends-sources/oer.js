// Open Exchange Rates fetcher.
// Free tier: 1000 requests/month, hourly updates, USD base only.
// Docs: https://docs.openexchangerates.org/reference/historical-json
//
// OER's free plan does NOT include /time-series, so we build history by
// maintaining an accumulating local cache at content/trends/.fx-history.json.
// First run: bootstrap last 30 days (30 API calls per currency? NO — a
// single /historical call returns ALL rates for that date, so 30 calls total
// covers every currency for 30 days). Subsequent runs: 1 call/day, merged
// into the cache.

import { ZUHD_UA } from '../http.js'
import { readJson, writeJson } from '../json-file.js'

const OER_BASE = 'https://openexchangerates.org/api'
const HISTORY_DAYS = 30

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

function formatPeriod(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}

async function fetchOneDay(date, appId, get) {
  const url = `${OER_BASE}/historical/${date}.json?app_id=${appId}`
  const res = await get(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': ZUHD_UA },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.rates) throw new Error('missing rates')
  return { date, rates: data.rates } // { USD: 1, PKR: 278.5, ... }
}

/**
 * Fetch and accumulate FX history. Returns a map keyed by currency code.
 *
 * @param {string[]} currencies  ISO codes to retain in the cache (others dropped).
 * @param {string} appId
 * @param {string} cachePath
 * @param {{ fetch?: typeof fetch, now?: number }} [opts]  what a test holds it by
 * @returns {Promise<Record<string, { values: number[], periods: string[], asOf: string }> | null>}
 */
export async function fetchOerRates(currencies, appId, cachePath, { fetch: get = fetch, now = Date.now() } = {}) {
  // Through `readJson`, which says so when the file will not parse. Read as
  // an empty history in silence, a cut file cost thirty calls of the month's
  // thousand to rebuild and nobody knew why.
  const read = readJson(cachePath)
  const cache = read?.days && typeof read.days === 'object' ? read : { days: {} }

  const today = new Date(now)
  const wantedDates = []
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    wantedDates.push(ymd(d))
  }

  // Missing dates get fetched; already-cached dates reused.
  const missing = wantedDates.filter((d) => !cache.days[d])
  if (missing.length > 0) {
    console.log(`  · oer: fetching ${missing.length} missing days`)
  }

  let fetched = 0
  for (const date of missing) {
    try {
      const { rates } = await fetchOneDay(date, appId, get)
      // Store only the currencies we care about to keep cache small.
      const filtered = {}
      for (const cc of currencies) {
        if (rates[cc] != null) filtered[cc] = rates[cc]
      }
      cache.days[date] = filtered
      fetched++
    } catch (err) {
      console.error(`  ✗ oer ${date}: ${err.message}`)
      // Don't abort — continue with the days we got.
    }
  }

  // Prune cache to only wantedDates window so it doesn't grow forever.
  const trimmed = { days: {} }
  for (const d of wantedDates) {
    if (cache.days[d]) trimmed.days[d] = cache.days[d]
  }

  // Persist the cache when a day was added to it, by rename. It was a bare
  // `writeFileSync` on every run, and four of a day's five runs fetch nothing:
  // four rewrites of a history under the stage's `timeout`, each a chance to
  // leave it cut short, for no new byte.
  if (fetched > 0) {
    try {
      writeJson(cachePath, trimmed, { pretty: false })
    } catch (err) {
      console.error(`  ✗ oer cache write: ${err.message}`)
    }
  }

  const datesWithData = wantedDates.filter((d) => trimmed.days[d])
  if (datesWithData.length === 0) return null

  // Build per-currency time series.
  const result = {}
  for (const cc of currencies) {
    const values = []
    const periods = []
    for (const date of datesWithData) {
      const v = trimmed.days[date]?.[cc]
      if (v != null) {
        values.push(v)
        periods.push(formatPeriod(date))
      }
    }
    if (values.length > 0) {
      result[cc] = { values, periods, asOf: datesWithData[datesWithData.length - 1] }
    }
  }
  return result
}
