// What a new trends snapshot keeps of the one before it.
//
// `fetch-trends.js` builds each snapshot from the registry and the live
// sources, and nothing else, so whatever it did not fetch itself was gone from
// the file the moment it wrote. These are the rows it carries across, each
// with the limit that keeps a carried row from standing in for a fresh one.
// Pure, so the choice has tests; the script is the reading and writing.

import { isStaleAsOf } from './trends-sources/stocks.js'

const DAY = 86400_000

/**
 * How long a registry row may stand on the fetch that last succeeded.
 *
 * Long enough for what it is for: a rate limit, a timeout, a source down over
 * a weekend. Monero was missing from the day's last snapshot on 14 of the 16
 * days from 2026-09-09 to 09-24, on CoinGecko 429s that cleared between
 * cycles. Short enough that a series its source has stopped serving leaves
 * the payload: past a week the row is not the source's answer any more, and
 * the week is the bar `stocks.js` already holds a cached series to.
 */
export const CARRY_DAYS = 7

/**
 * Whether a row can be drawn, by the test the app puts to every row of the
 * payload (`isIndicator`, mobile/lib/validate.ts): two or more finite values
 * and a label for each. The app accepts the snapshot only if every row
 * passes, so one bad row costs it every card. A carried row is a week's
 * commitment, and is never made to a row that would do that.
 *
 * @param {any} row
 */
const drawable = (row) =>
  Array.isArray(row?.values) &&
  row.values.length >= 2 &&
  row.values.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
  Array.isArray(row.periods) &&
  row.periods.length === row.values.length &&
  row.periods.every((p) => typeof p === 'string')

/**
 * The previous snapshot's row for a registry series this run fetched nothing
 * for, or null when there is none that may stand.
 *
 * Every sibling fetcher leaves its last file in place when it gets nothing
 * (`fetch-markets.js`, `fetch-chokepoints.js`, `fetch-companies.js`). This one
 * cannot: one file holds seven sources, a failed one must not hold back the
 * other six, and so each run wrote the rows it got. A row whose fetch failed
 * was simply absent, from the app's list and from the writer's offer, until a
 * cycle that fetched it.
 *
 * The row is the one fetched earlier, unchanged: its `asOf` already says how
 * old the reading is, and the writer's offer drops a level by that date. It
 * gains `fetchedAt`, the time of the snapshot that fetched it, kept across
 * further carries, which is what `CARRY_DAYS` is counted from. A row with no
 * `fetchedAt` was fetched by the snapshot it is in.
 *
 * Only the same series: a registry row since pointed at another source or
 * series id is a different reading under an old name.
 *
 * @param {{ id: string, source: string, seriesId?: string }} ind the registry row
 * @param {any} prior the snapshot being replaced, as it was read: any JSON, or none
 * @param {number} [now]
 * @returns {any | null}
 */
export function carriedRow(ind, prior, now = Date.now()) {
  const row = (prior?.indicators ?? []).find((r) => r?.id === ind.id)
  if (!row || row.source !== ind.source || row.seriesId !== ind.seriesId) return null
  if (!drawable(row)) return null
  const fetchedAt = row.fetchedAt ?? prior?.fetchedAt
  const at = Date.parse(fetchedAt ?? '')
  if (!Number.isFinite(at) || now - at > CARRY_DAYS * DAY) return null
  return { ...row, fetchedAt }
}

/**
 * The previous snapshot's release calendar, for a run whose own call for it
 * failed: the entries still ahead. They are dated, so nothing else has to
 * bound it.
 *
 * @param {any} prior the snapshot being replaced, as it was read
 * @param {string} today `YYYY-MM-DD`
 * @returns {{ date: string, release: string }[]}
 */
export function carriedCalendar(prior, today) {
  const entries = Array.isArray(prior?.releaseCalendar) ? prior.releaseCalendar : []
  return entries.filter((r) => typeof r?.date === 'string' && r.date >= today)
}

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
 * @param {any} prior the snapshot being replaced, as it was read: any JSON, or none
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
    if (!drawable(row) || isStaleAsOf(row.asOf, now)) lapsed++
    else kept.push(row)
  }
  return { kept, lapsed }
}
