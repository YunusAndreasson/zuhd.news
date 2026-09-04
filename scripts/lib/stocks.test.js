import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isStaleAsOf, seriesAsOf, STALE_AFTER_DAYS } from './trends-sources/stocks.js'

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
