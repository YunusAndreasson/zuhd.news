// The exchange rates the quote snapshots need, read from the history the
// trends fetch keeps (`trends-sources/oer.js`, `content/trends/.fx-history.json`).
//
// That file held the fifteen currencies the app lists. An index and a share
// are priced in their own: the Kospi in won, TSMC in Taiwan dollars. To say
// what either did in dollars, or what a company is worth beside one priced in
// another currency, the day's rate has to be on hand, so the same file keeps
// those too (`QUOTE_CURRENCIES`, the fetcher's `keep`). They are not rows of
// the trends snapshot: the app's currency list is its own.

import { COMPANY_TRACKED } from './company-metadata.js'
import { pathOf } from './datasets.js'
import { readJson } from './json-file.js'
import { MARKET_TRACKED } from './market-metadata.js'

/** Every currency a tracked exchange or company is priced in, the dollar
 *  aside. From the catalogs, so a new listing brings its currency with it. */
export const QUOTE_CURRENCIES = [
  ...new Set([...MARKET_TRACKED, ...COMPANY_TRACKED].map((entry) => entry.currency).filter((cc) => typeof cc === 'string' && cc !== 'USD')),
].sort()

/**
 * The history's days, `{ 'YYYY-MM-DD': { TRY: 41.2, … } }`, units of the
 * currency to one US dollar. Empty when there is no file or it will not parse
 * (`readJson` says so).
 *
 * @param {string} [path]
 * @returns {Record<string, Record<string, number>>}
 */
export function readFxHistory(path = pathOf('fxHistory')) {
  const days = readJson(path)?.days
  return days && typeof days === 'object' ? days : {}
}

/** Six significant figures: a rate's own precision, and a third of the bytes. */
const sig6 = (/** @type {number} */ n) => Number(n.toPrecision(6))

/**
 * The rates of some currencies over the history's days, one row of dates for
 * all of them: `{ dates, perUsd: { TRY: [41.2, null, …] } }`, a null where a
 * day has no rate for that currency. A currency with no rate at all is left
 * out, and so are the days before the first on which any of them has one.
 * Null when nothing is left.
 *
 * @param {Record<string, Record<string, number>>} days
 * @param {string[]} codes
 * @returns {{ dates: string[], perUsd: Record<string, (number | null)[]> } | null}
 */
export function fxWindow(days, codes) {
  const rated = (/** @type {string} */ date, /** @type {string} */ cc) => Number.isFinite(days[date]?.[cc]) && days[date][cc] > 0
  const wanted = [...new Set(codes)].filter((cc) => cc !== 'USD').sort()
  const all = Object.keys(days).sort()
  const first = all.findIndex((date) => wanted.some((cc) => rated(date, cc)))
  if (first < 0) return null
  const dates = all.slice(first)
  /** @type {Record<string, (number | null)[]>} */
  const perUsd = {}
  for (const cc of wanted) {
    if (!dates.some((date) => rated(date, cc))) continue
    perUsd[cc] = dates.map((date) => (rated(date, cc) ? sig6(days[date][cc]) : null))
  }
  return { dates, perUsd }
}

/**
 * Each currency's newest rate in the history, units to one US dollar, with
 * the dollar at 1. A currency the history never rated is absent.
 *
 * @param {Record<string, Record<string, number>>} days
 * @returns {Record<string, number>}
 */
export function latestPerUsd(days) {
  /** @type {Record<string, number>} */
  const latest = { USD: 1 }
  for (const date of Object.keys(days).sort()) {
    for (const [cc, rate] of Object.entries(days[date] ?? {})) {
      if (Number.isFinite(rate) && rate > 0) latest[cc] = rate
    }
  }
  return latest
}
