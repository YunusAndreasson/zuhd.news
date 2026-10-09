// One Yahoo quote for each entry of a catalog, in turn: the loop the exchange
// layer and the company list share.
//
// `fetch-companies.js` was written with `fetch-markets.js` open beside it ("the
// model for everything here", its header said) and the two had begun to part:
// one printed why it had rejected a symbol before deciding whether to write,
// the other only after a successful write, so on the day every exchange was
// rejected the reasons were never printed. Both called any stale row "from
// cache", and logged `(1 from cache)` for a week over Shanghai, a live fetch
// of an exchange shut for a holiday. Neither left a word in its snapshot about
// a symbol that returned nothing: four exchanges of thirty for six weeks,
// known only to a log line that read the same every cycle.
//
// What differs between them is the record, and that is the caller's
// (`exchangeRecord`, `companyRecord`): an exchange publishes the bar of a
// session still open, a company only completed closes.

import { fetchYahooStock, isStaleAsOf } from './trends-sources/stocks.js'

/**
 * A quarter of daily closes. Yahoo's `1mo` default gives about 21 points,
 * which is a wobble rather than a shape once it is drawn 640 units wide.
 */
export const QUOTE_RANGE = '3mo'

/**
 * @typedef {object} QuoteRun
 * @property {any[]} records one per entry that has a usable quote, in the catalog's order
 * @property {{ id: string, reason: string }[]} skipped the entries with none, and why: what the snapshot left out
 * @property {number} missing how many of those returned no series at all, live or cached
 * @property {number} rejected how many returned one the record builder refused
 * @property {number} fromCache how many records are a cached series, Yahoo having failed this run
 */

/**
 * Fetch every entry's quote and build its record.
 *
 * Sequential on purpose. `extract-entities.js` documents why: parallel calls
 * trip Yahoo's rate limit on a shared IP. Thirty symbols at 200-400ms each is
 * about ten seconds.
 *
 * A record is `stale` whichever path said so: the cache serving a week-old
 * series, or a live fetch whose feed stopped — Yahoo keeps answering with the
 * full axis and null closes, so the fetch succeeds and only `asOf` knows.
 *
 * It prints as it goes: a rejection with its reason, and a stale live series
 * with the session it stopped at. The symbol that returned nothing is printed
 * by `fetchYahooStock` itself.
 *
 * @template {{ id: string, symbol: string | null }} E
 * @param {E[]} entries
 * @param {(entry: E, data: any, opts: { stale: boolean }) => { record: any, rejected: string | null }} toRecord
 * @param {{ range?: string, fetchQuote?: (symbol: string, opts: { range: string }) => Promise<any>, now?: number }} [opts]
 *   `fetchQuote` and `now` are for the tests
 * @returns {Promise<QuoteRun>}
 */
export async function fetchQuotes(entries, toRecord, { range = QUOTE_RANGE, fetchQuote = fetchYahooStock, now = Date.now() } = {}) {
  const records = []
  const skipped = []
  let missing = 0
  let rejected = 0
  let fromCache = 0

  for (const entry of entries) {
    const data = await fetchQuote(/** @type {string} */ (entry.symbol), { range })
    if (!data) {
      missing++
      skipped.push({ id: entry.id, reason: 'no series from Yahoo, live or cached' })
      continue
    }

    const stale = Boolean(data.stale) || isStaleAsOf(data.asOf, now)
    const built = toRecord(entry, data, { stale })
    if (!built.record) {
      rejected++
      skipped.push({ id: entry.id, reason: String(built.rejected) })
      console.error(`  ✗ rejected ${entry.id} (${entry.symbol}): ${built.rejected}`)
      continue
    }
    if (data.stale) fromCache++
    else if (stale) console.error(`  ⚠ ${entry.id} (${entry.symbol}): last completed session ${data.asOf} — marked stale`)
    records.push(built.record)
  }

  return { records, skipped, missing, rejected, fromCache }
}

/**
 * The counts that follow "wrote 26/30 …" in a quote fetcher's last line.
 *
 * @param {{ stale?: boolean }[]} records
 * @param {QuoteRun} run
 */
export function quoteSummary(records, run) {
  const stale = records.filter((r) => r.stale).length
  return (
    (stale ? ` (${stale} stale${run.fromCache ? `, ${run.fromCache} from cache` : ''})` : '') +
    (run.rejected ? `, ${run.rejected} rejected` : '') +
    (run.missing ? `, ${run.missing} with no series` : '')
  )
}
