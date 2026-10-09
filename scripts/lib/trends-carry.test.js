// Run: node --test scripts/lib/trends-carry.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CARRY_DAYS, carriedCalendar, carriedRow, carriedStocks } from './trends-carry.js'

// The 10:00 cycle of 2026-10-09, reading the snapshot the 05:00 cycle left.
const NOW = Date.parse('2026-10-09T10:08:00Z')

const stock = (ticker, asOf, more = {}) => ({
  id: `stocks:${ticker}`,
  source: 'stocks',
  seriesId: ticker,
  values: [182.4, 185.1],
  periods: ['Oct 7', 'Oct 8'],
  asOf,
  ...more,
})
const prior = (...indicators) => ({ fetchedAt: '2026-10-09T05:12:00.000Z', asOf: '2026-10-09', indicators })
const ids = (rows) => rows.map((r) => r.id)

test('a stock row outlives the cycle that found it', () => {
  // What the 05:00 articles named, and what the 10:00 fetch used to drop.
  const left = prior(
    { id: 'brent', source: 'fred', asOf: '2026-10-06' },
    stock('NVDA', '2026-10-08'),
    stock('BX', '2026-10-08'),
    stock('TCS.NS', '2026-10-08'),
  )
  const { kept, lapsed } = carriedStocks(left, new Set(['brent']), NOW)
  assert.deepEqual(ids(kept), ['stocks:NVDA', 'stocks:BX', 'stocks:TCS.NS'])
  assert.equal(lapsed, 0)
  // The row as it stood: the entity stage replaces it when an article names
  // the ticker again, and nothing here has anything fresher to put in it.
  assert.equal(kept[0], left.indicators[1])
})

test('only stock rows are carried, and none over a row this run holds', () => {
  const left = prior(
    { id: 'brent', source: 'fred', asOf: '2026-10-06' },
    { id: 'poly-putin-out-before-2027-346', source: 'polymarket', asOf: '2026-10-09' },
    { id: 'wiki-strait-of-hormuz', source: 'wikipedia', asOf: '2026-10-08' },
    stock('NVDA', '2026-10-08'),
    stock('MARA', '2026-10-08'),
  )
  assert.deepEqual(ids(carriedStocks(left, new Set(), NOW).kept), ['stocks:NVDA', 'stocks:MARA'])
  assert.deepEqual(ids(carriedStocks(left, new Set(['stocks:NVDA']), NOW).kept), ['stocks:MARA'])
})

test('a row whose last close is over a week old is left behind', () => {
  const left = prior(
    stock('OLD', '2026-10-01'),
    stock('EDGE', '2026-10-02'), // seven days and ten hours before NOW
    stock('WEEK', '2026-10-03'),
    stock('NODATE', undefined),
    stock('BAD', 'last Tuesday'),
  )
  const { kept, lapsed } = carriedStocks(left, new Set(), NOW)
  assert.deepEqual(ids(kept), ['stocks:WEEK'])
  assert.equal(lapsed, 4)
  // Friday's close, read on the Monday: carried until the next Friday.
  const friday = prior(stock('FRI', '2026-10-09'))
  assert.equal(carriedStocks(friday, new Set(), Date.parse('2026-10-15T22:00:00Z')).kept.length, 1)
  assert.equal(carriedStocks(friday, new Set(), Date.parse('2026-10-16T05:00:00Z')).kept.length, 0)
})

test('with no snapshot before it, or none it can read, a run carries nothing', () => {
  for (const nothing of [null, undefined, {}, { indicators: null }, { indicators: [null, 'x', { source: 'stocks' }] }]) {
    assert.deepEqual(carriedStocks(nothing, new Set(), NOW), { kept: [], lapsed: 0 })
    assert.equal(carriedRow({ id: 'xmr', source: 'crypto', seriesId: 'monero' }, nothing, NOW), null)
    assert.deepEqual(carriedCalendar(nothing, '2026-10-09'), [])
  }
})

// Monero, as the registry names it and as a snapshot holds it. Its fetch
// failed on CoinGecko's rate limit on most cycles of September 2026 and the
// row was absent from the payload each time.
const XMR = { id: 'xmr', source: 'crypto', seriesId: 'monero' }
const xmrRow = (more = {}) => ({
  id: 'xmr',
  label: 'Monero',
  unit: '$',
  source: 'crypto',
  seriesId: 'monero',
  cadence: 'daily',
  values: [341.2, 338.9],
  periods: ['Oct 8', 'Oct 9'],
  asOf: '2026-10-09',
  ...more,
})

test('a registry row whose fetch returned nothing takes the previous snapshot’s', () => {
  const row = carriedRow(XMR, prior({ id: 'brent', source: 'fred', seriesId: 'DCOILBRENTEU', values: [1, 2] }, xmrRow()), NOW)
  // The row as it was fetched, and when: `asOf` is still the reading's date.
  assert.deepEqual(row, { ...xmrRow(), fetchedAt: '2026-10-09T05:12:00.000Z' })
})

test('a row carried again keeps the time it was fetched, and lapses a week after it', () => {
  const fetchedAt = '2026-10-03T05:10:00.000Z'
  // The snapshot it is carried out of was written this morning; the row says
  // it is six days older than that.
  const again = carriedRow(XMR, prior(xmrRow({ asOf: '2026-10-03', fetchedAt })), NOW)
  assert.equal(again.fetchedAt, fetchedAt)
  assert.equal(CARRY_DAYS, 7)
  const at = (iso) => carriedRow(XMR, prior(xmrRow({ fetchedAt })), Date.parse(iso))
  assert.ok(at('2026-10-10T05:00:00Z'), 'inside the week')
  assert.equal(at('2026-10-10T05:20:00Z'), null, 'past it: the source has not answered for a week')
})

test('a row is carried only as the series the registry still names', () => {
  // Pointed at another source or series since: a different reading under the id.
  assert.equal(carriedRow({ ...XMR, source: 'fred' }, prior(xmrRow()), NOW), null)
  assert.equal(carriedRow({ ...XMR, seriesId: 'monero-classic' }, prior(xmrRow()), NOW), null)
  assert.equal(carriedRow({ id: 'zec', source: 'crypto', seriesId: 'zcash' }, prior(xmrRow()), NOW), null, 'never fetched')
  // Nothing to draw, or nothing to date the fetch by.
  assert.equal(carriedRow(XMR, prior(xmrRow({ values: [] })), NOW), null)
  assert.equal(carriedRow(XMR, { indicators: [xmrRow()] }, NOW), null)
  assert.equal(carriedRow(XMR, { fetchedAt: 'this morning', indicators: [xmrRow()] }, NOW), null)
})

test('a row the app could not draw is never carried', () => {
  // `isTrendsSnapshot` (mobile/lib/validate.ts) accepts the payload only if
  // every row has two finite values and a label for each. A NaN is `null` by
  // the time the file is read back.
  for (const bad of [
    { values: [341.2] , periods: ['Oct 9'] },
    { values: [341.2, null], periods: ['Oct 8', 'Oct 9'] },
    { values: [341.2, '338.9'], periods: ['Oct 8', 'Oct 9'] },
    { values: [341.2, 338.9], periods: ['Oct 9'] },
    { values: [341.2, 338.9], periods: ['Oct 8', 9] },
    { values: [341.2, 338.9], periods: undefined },
  ]) {
    assert.equal(carriedRow(XMR, prior(xmrRow(bad)), NOW), null, JSON.stringify(bad))
    assert.deepEqual(carriedStocks(prior(stock('NVDA', '2026-10-08', bad)), new Set(), NOW), { kept: [], lapsed: 1 }, JSON.stringify(bad))
  }
})

test('a failed calendar call keeps the previous snapshot’s releases that are still ahead', () => {
  const left = {
    releaseCalendar: [
      { date: '2026-10-07', release: 'Employment Situation' },
      { date: '2026-10-09', release: 'Producer Price Index' },
      { date: '2026-10-14', release: 'Consumer Price Index' },
      { release: 'undated' },
    ],
  }
  assert.deepEqual(carriedCalendar(left, '2026-10-09'), [
    { date: '2026-10-09', release: 'Producer Price Index' },
    { date: '2026-10-14', release: 'Consumer Price Index' },
  ])
  assert.deepEqual(carriedCalendar(left, '2026-10-15'), [])
  assert.deepEqual(carriedCalendar({ releaseCalendar: 'none' }, '2026-10-09'), [])
})
