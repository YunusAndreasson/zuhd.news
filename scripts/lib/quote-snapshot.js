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
 * @property {number} carried how many records are the last snapshot's own, the stage having run out of time
 * @property {number} hourly how many records are sessions rebuilt from hourly bars, Yahoo serving the symbol no daily history
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
 * **Out of time** (`signal`, the stage's budget), Yahoo is not asked again. An
 * entry not reached keeps the record the last snapshot had for it, marked
 * `stale`, which is what it is; one the last snapshot did not hold is listed
 * in `skipped`. That is the row-by-row form of "degrade to the previous
 * snapshot": before, the stage was killed and the whole of the last snapshot
 * stood, with nothing to say it was not this run's. The signal is tested
 * between symbols, because `fetchYahooStock` takes none: the request in flight
 * when it fires runs to its own end, twenty seconds at the worst, and the
 * budget has to keep that back.
 *
 * @template {{ id: string, symbol: string | null }} E
 * @param {E[]} entries
 * @param {(entry: E, data: any, opts: { stale: boolean }) => { record: any, rejected: string | null }} toRecord
 * @param {{ range?: string, signal?: AbortSignal, previous?: { id: string }[], fetchQuote?: (symbol: string, opts: { range: string }) => Promise<any>, now?: number }} [opts]
 *   `previous`: the last snapshot's records; `fetchQuote` and `now` are for the tests
 * @returns {Promise<QuoteRun>}
 */
export async function fetchQuotes(entries, toRecord, { range = QUOTE_RANGE, signal, previous = [], fetchQuote = fetchYahooStock, now = Date.now() } = {}) {
  const records = []
  const skipped = []
  const last = new Map((Array.isArray(previous) ? previous : []).map((record) => [record.id, record]))
  let missing = 0
  let rejected = 0
  let fromCache = 0
  let carried = 0
  let hourly = 0
  let unasked = 0

  for (const entry of entries) {
    if (signal?.aborted) {
      unasked++
      const kept = last.get(entry.id)
      if (kept) {
        records.push({ ...kept, stale: true })
        carried++
      } else {
        skipped.push({ id: entry.id, reason: 'not asked: the stage ran out of time' })
      }
      continue
    }

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
    if (data.hourly) hourly++
    if (data.stale) fromCache++
    else if (stale) console.error(`  ⚠ ${entry.id} (${entry.symbol}): last completed session ${data.asOf} — marked stale`)
    records.push(built.record)
  }

  if (unasked > 0) {
    console.error(
      `  ⚠ out of time: ${unasked} of ${entries.length} not asked, ${carried} of them carried from the last snapshot and marked stale`,
    )
  }
  return { records, skipped, missing, rejected, fromCache, carried, hourly }
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
    (run.missing ? `, ${run.missing} with no series` : '') +
    (run.carried ? `, ${run.carried} carried from the last snapshot` : '') +
    (run.hourly ? `, ${run.hourly} rebuilt from hourly bars` : '')
  )
}
