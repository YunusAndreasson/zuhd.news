// Run: node --test scripts/lib/trends-carry.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carriedStocks } from './trends-carry.js'

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
  }
})
