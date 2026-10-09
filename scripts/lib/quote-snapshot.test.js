// Run: node --test scripts/lib/quote-snapshot.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { companyRecord } from './companies.js'
import { COMPANY_TRACKED } from './company-metadata.js'
import { MARKET_TRACKED, exchangeRecord } from './market-metadata.js'
import { QUOTE_RANGE, fetchQuotes, quoteSummary } from './quote-snapshot.js'

const NYSE = MARKET_TRACKED.find((m) => m.id === 'nyse')
const NOW = Date.parse('2026-10-09T10:00:00Z')

/** A response shaped as `fetchYahooStock` returns one, for the S&P 500. */
const quote = (over = {}) => ({
  values: [6400, 6500, 6630],
  periods: ['Oct 6', 'Oct 7', 'Oct 8'],
  dates: ['2026-10-06', '2026-10-07', '2026-10-08'],
  completed: [true, true, true],
  asOf: '2026-10-08',
  name: 'S&P 500',
  currencyReported: 'USD',
  timezone: 'America/New_York',
  exchange: 'SNP',
  ...over,
})

/** Run `fn` and return what it printed to stderr beside what it returned. */
async function logged(fn) {
  const err = []
  const { error } = console
  console.error = (line) => err.push(line)
  try {
    return { result: await fn(), err }
  } finally {
    console.error = error
  }
}

// ── an exchange's record ───────────────────────────────────────────────────

test("an exchange's change is its last two closes, whatever the window began at", () => {
  // map-layers.md: "The day's change is the last two closes, never
  // `chartPreviousClose`", which is the close before the *window* and against
  // three months would print the quarter's move as the day's. The rule lived in
  // a script no test could import.
  const { record, rejected } = exchangeRecord(NYSE, { ...quote(), chartPreviousClose: 5200 })
  assert.equal(rejected, null)
  assert.equal(record.level, 6630)
  assert.equal(record.changePct, 2) // (6630 − 6500) / 6500, not (6630 − 5200) / 5200
})

test("an exchange's record is the published one, key for key", () => {
  // `/api/markets.json` is this object with the build's stories joined on, and
  // the app is live: nothing here is renamed, reordered or dropped by accident.
  const { record } = exchangeRecord(NYSE, quote())
  assert.deepEqual(Object.keys(record), [
    'id', 'name', 'indexName', 'city', 'iso2', 'lat', 'lng', 'level', 'changePct', 'currency', 'tz',
    'sessionStart', 'sessionEnd', 'days', 'series', 'asOf', 'sourceLabel', 'blurb', 'topicTags', 'countryTags',
  ])
  assert.deepEqual(Object.keys(record.series), ['periods', 'values', 'dates', 'completed'])
  assert.equal(record.sourceLabel, 'Yahoo Finance · SNP')
  assert.equal(exchangeRecord(NYSE, quote({ exchange: '' })).record.sourceLabel, 'Yahoo Finance · S&P 500')
  assert.equal(record.asOf, '2026-10-08')
  assert.deepEqual(Object.keys(exchangeRecord(NYSE, quote(), { stale: true }).record).at(-1), 'stale')
})

test('an exchange with no usable pair of closes, or the wrong instrument, has no record and says why', () => {
  const why = (data) => {
    const { record, rejected } = exchangeRecord(NYSE, data)
    assert.equal(record, null)
    return rejected
  }
  // Yahoo answers a symbol it does not have with a different instrument.
  assert.equal(why(quote({ currencyReported: 'JPY' })), 'currency JPY ≠ USD')
  assert.equal(why(quote({ timezone: 'Europe/London' })), 'timezone Europe/London ≠ America/New_York')
  assert.equal(why(quote({ values: [6630] })), '1 usable close(s), cannot derive a change')
  assert.equal(why(quote({ values: [0, 6630] })), 'unusable closes 0 → 6630')
  // The app refuses the whole markets payload for one exchange at or under zero.
  assert.equal(why(quote({ values: [6500, 0] })), 'unusable closes 6500 → 0')
  assert.equal(why(quote({ values: [6500, -3] })), 'unusable closes 6500 → -3')
})

// ── the loop ───────────────────────────────────────────────────────────────

test('one quote at a time, in the catalog order, and every entry is accounted for', async () => {
  const entries = MARKET_TRACKED.slice(0, 5)
  const asked = []
  let open = 0
  const answers = [
    quote({ currencyReported: entries[0].currency, timezone: entries[0].tz }),
    null, // both hosts failed and nothing is cached: `fetchYahooStock` has printed why
    quote({ currencyReported: 'XXX', timezone: entries[2].tz }), // an impostor
    quote({ currencyReported: entries[3].currency, timezone: entries[3].tz, stale: true }), // served from the cache
    quote({ currencyReported: entries[4].currency, timezone: entries[4].tz, asOf: '2026-09-30' }), // live, and shut for a week
  ]
  const fetchQuote = async (symbol, opts) => {
    assert.equal(++open, 1, 'two requests were open at once')
    asked.push([symbol, opts.range])
    await new Promise((resolve) => setTimeout(resolve, 2))
    open--
    return answers[asked.length - 1]
  }

  const { result: run, err } = await logged(() => fetchQuotes(entries, exchangeRecord, { fetchQuote, now: NOW }))

  assert.deepEqual(asked, entries.map((m) => [m.symbol, QUOTE_RANGE]))
  assert.deepEqual(run.records.map((r) => [r.id, r.stale === true]), [
    [entries[0].id, false],
    [entries[3].id, true],
    [entries[4].id, true],
  ])
  // What the snapshot left out, and why: this is what it writes as `skipped`.
  assert.deepEqual(run.skipped, [
    { id: entries[1].id, reason: 'no series from Yahoo, live or cached' },
    { id: entries[2].id, reason: `currency XXX ≠ ${entries[2].currency}` },
  ])
  assert.deepEqual([run.missing, run.rejected, run.fromCache], [1, 1, 1])
  // The reasons are printed as they happen, whether or not anything is written.
  assert.deepEqual(err, [
    `  ✗ rejected ${entries[2].id} (${entries[2].symbol}): currency XXX ≠ ${entries[2].currency}`,
    `  ⚠ ${entries[4].id} (${entries[4].symbol}): last completed session 2026-09-30 — marked stale`,
  ])
  // Stale is not "from cache": one of the two is a live fetch of a shut exchange.
  assert.equal(quoteSummary(run.records, run), ' (2 stale, 1 from cache), 1 rejected, 1 with no series')
})

test('when every entry is rejected the reasons are still printed, and nothing is a record', async () => {
  // The exchange fetcher printed its rejections only after a successful write,
  // so on the one day they mattered most they were never printed.
  const entries = MARKET_TRACKED.slice(0, 2)
  const { result: run, err } = await logged(() =>
    fetchQuotes(entries, exchangeRecord, { fetchQuote: async () => quote({ currencyReported: 'XXX' }), now: NOW }),
  )
  assert.deepEqual(run.records, [])
  assert.equal(err.length, 2)
  assert.match(err[0], /✗ rejected .*: currency XXX ≠ /)
  assert.equal(quoteSummary(run.records, run), ', 2 rejected')
})

test('out of time, Yahoo is not asked again and the last snapshot stands for what was not reached', async () => {
  // Thirty symbols at two hosts and ten seconds each is 600 seconds in a stage
  // of 90. The stage used to be killed, and the whole of the last snapshot
  // stood with nothing to say it was not this run's.
  const entries = MARKET_TRACKED.slice(0, 4)
  const budget = new AbortController()
  const asked = []
  const fetchQuote = async (symbol) => {
    const entry = entries[asked.push(symbol) - 1]
    if (asked.length === 2) budget.abort() // the clock runs out during the second request
    return quote({ currencyReported: entry.currency, timezone: entry.tz })
  }
  const previous = [
    { id: entries[1].id, level: 1 },
    { id: entries[2].id, level: 4321, changePct: 0.5, asOf: '2026-10-08' },
  ]

  const { result: run, err } = await logged(() =>
    fetchQuotes(entries, exchangeRecord, { fetchQuote, now: NOW, signal: budget.signal, previous }),
  )

  assert.deepEqual(asked, [entries[0].symbol, entries[1].symbol], 'the request in flight ran to its end, and no other was made')
  assert.deepEqual(run.records.map((r) => [r.id, r.level, r.stale === true]), [
    [entries[0].id, 6630, false],
    [entries[1].id, 6630, false], // asked, so it is this run's, not the last one's
    [entries[2].id, 4321, true], // not reached: what the last snapshot had, and marked as that
  ])
  assert.deepEqual(run.skipped, [{ id: entries[3].id, reason: 'not asked: the stage ran out of time' }])
  assert.equal(run.carried, 1)
  assert.deepEqual(err, ['  ⚠ out of time: 2 of 4 not asked, 1 of them carried from the last snapshot and marked stale'])
  assert.equal(quoteSummary(run.records, run), ' (1 stale), 1 carried from the last snapshot')

  // A snapshot that is not there, or not a list, is nothing to carry from.
  const none = await logged(() => fetchQuotes(entries.slice(0, 1), exchangeRecord, { fetchQuote: async () => null, signal: AbortSignal.abort(), previous: undefined }))
  assert.deepEqual(none.result.records, [])
})

test('the company list runs on the same loop, with its own record', async () => {
  const nvidia = COMPANY_TRACKED.find((c) => c.id === 'nvidia')
  const { result: run } = await logged(() =>
    fetchQuotes([nvidia], companyRecord, {
      fetchQuote: async () => quote({ name: 'NVIDIA Corporation', values: [220, 225.5, 233.95], completed: [true, true, false] }),
      now: NOW,
    }),
  )
  // Completed sessions only: the bar of a session still open is not a close.
  assert.equal(run.records[0].level, 225.5)
  assert.deepEqual(run.skipped, [])
  assert.equal(quoteSummary(run.records, run), '')
})
