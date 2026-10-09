// What a new trends snapshot keeps of the one before it.
//
// `fetch-trends.js` builds each snapshot from the registry and the live
// sources, and nothing else, so whatever it did not fetch itself was gone from
// the file the moment it wrote. These are the rows it carries across, each
// with the limit that keeps a carried row from standing in for a fresh one.
// Pure, so the choice has tests; the script is the reading and writing.

import { isStaleAsOf } from './trends-sources/stocks.js'

/**
 * The previous snapshot's stock rows that still stand.
 *
 * The file has a second writer. `extract-entities.js` (Stage 3.6) appends a
 * `stocks:<TICKER>` row for each listed company the cycle's new articles
 * name, and the chip under such an article resolves against this file. The
 * next cycle's fetch rebuilt the file without them, so a chip lasted one
 * cycle: on 2026-10-09 the fortnight's articles carried 92 distinct stock ids
 * and 5 resolved, the five the running cycle had just appended.
 *
 * Carried while the row's last close is inside the week `stocks.js` calls
 * current (`STALE_AFTER_DAYS`, the bar the exchange and company layers mark
 * `stale` at). A row is not refreshed here, only by a later article naming
 * the ticker again, so past that week the line under the chip would be an old
 * price drawn as the stock's chart, and no chip is the honest state. In
 * practice four to seven days, by the weekday the article ran.
 *
 * `extract-entities.js` replaces a carried row in place when a new article
 * names the ticker, which is what its own comment has always said it did.
 *
 * @param {{ indicators?: any[] } | null | undefined} prior the snapshot being replaced
 * @param {Set<string>} held ids this run already has
 * @param {number} [now]
 * @returns {{ kept: any[], lapsed: number }} the rows to append, in their
 *   order, and how many were left behind for age
 */
export function carriedStocks(prior, held, now = Date.now()) {
  const kept = []
  let lapsed = 0
  for (const row of prior?.indicators ?? []) {
    if (row?.source !== 'stocks' || typeof row.id !== 'string' || held.has(row.id)) continue
    if (isStaleAsOf(row.asOf, now)) lapsed++
    else kept.push(row)
  }
  return { kept, lapsed }
}
