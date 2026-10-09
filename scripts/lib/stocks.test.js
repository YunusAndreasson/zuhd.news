import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chartSeries, isStaleAsOf, seriesAsOf, STALE_AFTER_DAYS } from './trends-sources/stocks.js'

const NOW = Date.UTC(2026, 8, 4)

// Yahoo answers a stopped feed with the full axis and null closes, so the
// fetch succeeds and only the date of the last completed close says anything.

test('seriesAsOf is the last completed close, not the last bar', () => {
  assert.equal(
    seriesAsOf(['2026-07-15', '2026-07-16', '2026-09-04'], [true, true, false]),
    '2026-07-16',
  )
})

test('seriesAsOf falls back to the last bar when nothing has completed', () => {
  assert.equal(seriesAsOf(['2026-09-04'], [false]), '2026-09-04')
  assert.equal(seriesAsOf([], []), '')
})

test('isStaleAsOf flags a close older than the window and nothing newer', () => {
  assert.equal(isStaleAsOf('2026-07-16', NOW), true)
  assert.equal(isStaleAsOf('2026-09-03', NOW), false)
  assert.equal(isStaleAsOf('', NOW), true)
  const edge = new Date(NOW - STALE_AFTER_DAYS * 86400_000).toISOString().slice(0, 10)
  assert.equal(isStaleAsOf(edge, NOW), false)
})

/** A chart result as Yahoo returns one: a bar a session, stamped at its open. */
const chart = (zone, opens, meta = {}) => ({
  timestamp: opens.map((t) => t / 1000),
  indicators: { quote: [{ close: opens.map((_, i) => 8700 + i) }] },
  meta: { exchangeTimezoneName: zone, currency: 'AUD', exchangeName: 'ASX', ...meta },
})

test('a bar is labelled with its session’s own day, as `dates` has it', () => {
  // Sydney opens at 10:00. That is 00:00 UTC until its clocks go forward on
  // Sunday 4 October 2026, and 23:00 UTC the day before from then on.
  const opens = [
    Date.UTC(2026, 9, 2, 0), // Friday
    Date.UTC(2026, 9, 4, 23), // Monday the 5th
    Date.UTC(2026, 9, 5, 23),
    Date.UTC(2026, 9, 6, 23),
    Date.UTC(2026, 9, 7, 23),
    Date.UTC(2026, 9, 8, 23), // Friday the 9th
  ]
  const asx = chartSeries(chart('Australia/Sydney', opens), '^AXJO', Date.UTC(2026, 9, 10, 2))
  assert.deepEqual(asx.dates, ['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])
  // Not `Oct 4`, a Sunday, for Monday's session.
  assert.deepEqual(asx.periods, ['Oct 2', 'Oct 5', 'Oct 6', 'Oct 7', 'Oct 8', 'Oct 9'])
  assert.equal(asx.asOf, '2026-10-09')

  // New York opens at 13:30 UTC: the same day either way, as it always was.
  const ny = [5, 6, 7, 8, 9].map((d) => Date.UTC(2026, 9, d, 13, 30))
  const nyse = chartSeries(chart('America/New_York', ny, { currency: 'USD' }), '^NYA', Date.UTC(2026, 9, 10, 2))
  assert.deepEqual(nyse.periods, ['Oct 5', 'Oct 6', 'Oct 7', 'Oct 8', 'Oct 9'])
  assert.deepEqual(nyse.dates, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])
})

test('a session still open is the last bar and not the last close', () => {
  const ny = [5, 6, 7, 8, 9].map((d) => Date.UTC(2026, 9, d, 13, 30))
  const end = Date.UTC(2026, 9, 9, 20) / 1000
  const open = chartSeries(chart('America/New_York', ny, { currentTradingPeriod: { regular: { end } } }), '^NYA', Date.UTC(2026, 9, 9, 15))
  assert.deepEqual(open.completed, [true, true, true, true, false])
  assert.equal(open.asOf, '2026-10-08')
  // A quarter of an hour after the bell it is a close.
  const shut = chartSeries(chart('America/New_York', ny, { currentTradingPeriod: { regular: { end } } }), '^NYA', Date.UTC(2026, 9, 9, 20, 16))
  assert.equal(shut.asOf, '2026-10-09')
})

test('a result too short to chart is refused, with the live quote where there is one', () => {
  const short = { timestamp: [1], indicators: { quote: [{ close: [11000] }] }, meta: { regularMarketPrice: 11052.3, currency: 'SAR', exchangeTimezoneName: 'Asia/Riyadh' } }
  assert.throws(
    () => chartSeries(short, '^TASI.SR'),
    (/** @type {any} */ err) => {
      assert.match(err.message, /only 1\/1 points/)
      assert.deepEqual(err.quote, { marketPrice: 11052.3, currencyReported: 'SAR', timezone: 'Asia/Riyadh' })
      return true
    },
  )
})
