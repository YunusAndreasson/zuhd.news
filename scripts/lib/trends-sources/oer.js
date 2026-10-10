// Open Exchange Rates fetcher.
// Free tier: 1000 requests/month, hourly updates, USD base only.
// Docs: https://docs.openexchangerates.org/reference/historical-json
//
// OER's free plan does NOT include /time-series, so we build history by
// maintaining an accumulating local cache at content/trends/.fx-history.json.
// First run: bootstrap the window (`HISTORY_DAYS`). A single /historical call
// returns ALL rates for that date, so one call a day covers every currency.
// Subsequent runs: 1 call/day, merged into the cache.

import { ZUHD_UA } from '../http.js'
import { readJson, writeJson } from '../json-file.js'
import { dayLabel, isoDay } from '../period.js'

const OER_BASE = 'https://openexchangerates.org/api'
/**
 * The days a currency's own row answers with: its published series. Four past
 * thirty, so the row has a thirty-day move (the app's ladder, `gaugeSpan`,
 * `mobile/lib/cards/week-move.ts`): thirty observations are twenty-nine days,
 * and a day that failed to fetch must not take the month with it.
 */
const SERIES_DAYS = 34
/**
 * The days kept in the file, six past the series. An index's thirty-day move
 * in dollars (`world stocks`, `mobile/lib/world-summary.ts`) is measured from
 * a session up to three days before the thirtieth, on an exchange whose last
 * close may itself be three days old, and each needs the rate of its own day.
 */
const HISTORY_DAYS = 40

/**
 * How many days cached before `keep` named a code are asked for again in one
 * run. Every call returns every currency, so a kept code costs nothing on a
 * new day; the days already in the file are the ones that lack it. Newest
 * first and ten a run: a week's move is readable after the first run, the
 * window is whole after four, and a month's thousand calls is not spent in
 * one cycle that happens to be failing.
 */
const BACKFILL_PER_RUN = 10

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
 * @param {string[]} currencies  ISO codes to answer with a series each, and to retain in the cache.
 * @param {string} appId
 * @param {string} cachePath
 * @param {{ fetch?: typeof fetch, now?: number, keep?: string[] }} [opts]  `keep`: codes retained in the
 *   cache beside `currencies` and answered with nothing, for the readers of the file
 *   (`lib/fx-history.js`): the currencies the exchanges and the companies are priced in. Every other
 *   code is dropped. `fetch` and `now` are what a test holds it by.
 * @returns {Promise<Record<string, { values: number[], periods: string[], asOf: string }> | null>}
 */
export async function fetchOerRates(currencies, appId, cachePath, { fetch: get = fetch, now = Date.now(), keep = [] } = {}) {
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
    wantedDates.push(isoDay(d))
  }

  // Missing dates get fetched; already-cached dates reused.
  const missing = wantedDates.filter((d) => !cache.days[d])
  // And a cached day that holds none of `keep`: it was stored before the list
  // named them (`BACKFILL_PER_RUN`). A day that fails stands as it was.
  const thin = keep.length === 0
    ? []
    : wantedDates.filter((d) => cache.days[d] && !keep.some((cc) => cache.days[d][cc] != null)).reverse().slice(0, BACKFILL_PER_RUN)
  if (missing.length + thin.length > 0) {
    const again = thin.length ? `, ${thin.length} again for the kept currencies` : ''
    console.log(`  · oer: fetching ${missing.length} missing days${again}`)
  }

  const stored = [...new Set([...currencies, ...keep])]
  let fetched = 0
  for (const date of [...missing, ...thin]) {
    try {
      const { rates } = await fetchOneDay(date, appId, get)
      // Store only the currencies we care about to keep cache small.
      const filtered = {}
      for (const cc of stored) {
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

  const datesWithData = wantedDates.slice(-SERIES_DAYS).filter((d) => trimmed.days[d])
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
        periods.push(dayLabel(Date.parse(`${date}T00:00:00Z`)))
      }
    }
    if (values.length > 0) {
      result[cc] = { values, periods, asOf: datesWithData[datesWithData.length - 1] }
    }
  }
  return result
}
