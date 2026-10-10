// Run: node --test scripts/lib/futures.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INDICATORS } from './trends-registry.js'
import { alignSessions, fetchFuturesSeries, futuresMismatch } from './trends-sources/futures.js'

const NOW = Date.parse('2026-10-10T14:00:00Z')

/** What the quote source reported for each contract on 2026-10-10: the name
 *  (`longName`, else `shortName`), the currency and the zone. */
const REPORTED = {
  'BZ=F': 'Brent Crude Oil Last Day Financial Futures',
  'CL=F': 'Crude Oil Nov 26',
  'NG=F': 'Natural Gas Nov 26',
  'GC=F': 'Gold Dec 26',
  'SI=F': 'Silver Dec 26',
}

const DATES = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
const PERIODS = ['Oct 5', 'Oct 6', 'Oct 7', 'Oct 8', 'Oct 9']

/** A quote as `fetchYahooStock` answers one. */
const quote = (symbol, over = {}) => ({
  values: [100.2, 101.4, 100.2, 104.28, 104.72],
  periods: PERIODS,
  dates: DATES,
  completed: [true, true, true, true, true],
  asOf: '2026-10-09',
  name: REPORTED[symbol],
  currency: 'USD',
  currencyReported: 'USD',
  exchange: 'NYM',
  timezone: 'America/New_York',
  marketPrice: 104.72,
  ...over,
})

const rows = INDICATORS.filter((i) => i.source === 'futures')
const row = (id) => /** @type {any} */ (rows.find((i) => i.id === id))
const spot = { values: [124, 125.44], periods: ['Oct 5', 'Oct 6'], dates: ['2026-10-05', '2026-10-06'], completed: [true, true], asOf: '2026-10-06' }

/** `fetchFuturesSeries` with nothing reaching the network or the terminal. */
const fetchWith = (t, id, { answer, fallback = async (/** @type {any} */ _row) => /** @type {any} */ (spot) }) => {
  t.mock.method(console, 'error', () => {})
  /** @type {any[]} */
  const asked = []
  const ask = async (r, env) => {
    asked.push({ r, env })
    return fallback(r)
  }
  const fallbacks = { fred: ask, crypto: ask }
  return fetchFuturesSeries(row(id), { fetchQuote: async () => answer, fallbacks, env: { FRED_API_KEY: 'k' }, now: NOW }).then((out) => ({ out, asked }))
}

test('the five rows are the contracts the quote source reports under their symbols', () => {
  assert.deepEqual(rows.map((r) => r.id), ['brent', 'wti', 'natgas-hh', 'paxg', 'xag'])
  for (const r of rows) assert.equal(futuresMismatch(r, quote(r.seriesId)), null, r.id)
})

test('a quote of another instrument is refused: by its name, its currency or its zone', () => {
  // The two oil contracts cannot stand in for each other.
  assert.match(String(futuresMismatch(row('wti'), quote('BZ=F'))), /named "Brent Crude Oil/)
  assert.match(String(futuresMismatch(row('brent'), quote('CL=F'))), /named "Crude Oil Nov 26"/)
  assert.match(String(futuresMismatch(row('paxg'), quote('GC=F', { currencyReported: 'EUR' }))), /priced in EUR/)
  assert.match(String(futuresMismatch(row('paxg'), quote('GC=F', { currencyReported: '' }))), /no stated currency/)
  assert.match(String(futuresMismatch(row('paxg'), quote('GC=F', { timezone: 'Europe/London' }))), /trades in Europe\/London/)
})

test('a good quote is published as the series alone, and no fallback is asked', async (t) => {
  const { out, asked } = await fetchWith(t, 'brent', { answer: quote('BZ=F') })
  assert.deepEqual(out, { values: [100.2, 101.4, 100.2, 104.28, 104.72], periods: PERIODS, dates: DATES, completed: [true, true, true, true, true], asOf: '2026-10-09' })
  assert.equal(asked.length, 0)
})

test('no quote, the wrong instrument or a stale close is answered from the fallback, under its own name', async (t) => {
  for (const answer of [null, quote('CL=F'), quote('BZ=F', { asOf: '2026-09-30' })]) {
    const { out, asked } = await fetchWith(t, 'brent', { answer })
    assert.deepEqual(out, { ...spot, source: 'fred', seriesId: 'DCOILBRENTEU', sourceLabel: 'FRED · EIA' })
    // Asked as FRED's own row would be: its series, the row's cadence, the key.
    assert.equal(asked[0].r.seriesId, 'DCOILBRENTEU')
    assert.equal(asked[0].r.cadence, 'daily')
    assert.equal(asked[0].env.FRED_API_KEY, 'k')
  }
  const gold = await fetchWith(t, 'paxg', { answer: null })
  assert.equal(gold.out?.source, 'crypto')
  assert.equal(gold.out?.seriesId, 'pax-gold')
  assert.equal(gold.out?.sourceLabel, 'CoinGecko · PAXG (gold-backed)')
})

test('with neither a quote nor a fallback series the row has no answer', async (t) => {
  const { out } = await fetchWith(t, 'brent', { answer: null, fallback: async () => null })
  assert.equal(out, null)
})

test('a pair is cut to the sessions both rows have, and dated by what is left', () => {
  const gold = { id: 'paxg', values: [1, 2, 3, 4], periods: ['Oct 6', 'Oct 7', 'Oct 8', 'Oct 9'], dates: DATES.slice(1), completed: [true, true, true, false], asOf: '2026-10-08' }
  // Silver lacks the 7th, and has not yet its bar for the 9th.
  const silver = { id: 'xag', values: [10, 30], periods: ['Oct 6', 'Oct 8'], dates: ['2026-10-06', '2026-10-08'], completed: [true, true], asOf: '2026-10-08' }
  const oil = { id: 'brent', values: [5, 6], periods: ['Oct 8', 'Oct 9'], dates: ['2026-10-08', '2026-10-09'], completed: [true, true], asOf: '2026-10-09' }
  alignSessions([oil, gold, silver])
  assert.deepEqual(gold, { id: 'paxg', values: [1, 3], periods: ['Oct 6', 'Oct 8'], dates: ['2026-10-06', '2026-10-08'], completed: [true, true], asOf: '2026-10-08' })
  assert.deepEqual(silver.values, [10, 30])
  assert.equal(oil.values.length, 2)
})

test('a pair with a fallback in it is left as it came', () => {
  const gold = { id: 'paxg', values: [1, 2], periods: ['Oct 8', 'Oct 9'], dates: ['2026-10-08', '2026-10-09'], completed: [true, true], asOf: '2026-10-09' }
  // A token's series: a day for every day, and no `dates`.
  const silver = { id: 'xag', values: [10, 20, 30], periods: ['Oct 8', 'Oct 9', 'Oct 10'], asOf: '2026-10-10' }
  alignSessions([gold, silver])
  assert.equal(gold.values.length, 2)
  assert.equal(silver.values.length, 3)
  // And a pair with one row missing altogether.
  alignSessions([gold])
  assert.equal(gold.values.length, 2)
})
