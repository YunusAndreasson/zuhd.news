import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chokepointRows, parseArcgisDate } from './trends-sources/portwatch.js'

// PortWatch re-published `date` as a DateOnly string around 2026-04-28. The
// per-indicator fetcher compared it against epoch ms, dropped every row, and
// returned null without a log for 130 days. These pin both serialisations.

test('parseArcgisDate reads a DateOnly string as UTC midnight', () => {
  assert.equal(parseArcgisDate('2026-08-30'), Date.UTC(2026, 7, 30))
  assert.equal(parseArcgisDate('2026-08-30T00:00:00'), Date.UTC(2026, 7, 30))
})

test('parseArcgisDate passes epoch milliseconds through and rejects garbage', () => {
  assert.equal(parseArcgisDate(1756512000000), 1756512000000)
  assert.equal(parseArcgisDate(Number.NaN), null)
  assert.equal(parseArcgisDate('yesterday'), null)
  assert.equal(parseArcgisDate(null), null)
  assert.equal(parseArcgisDate(undefined), null)
})

const feature = (date, n_tanker) => ({ attributes: { date, portname: 'Strait of Hormuz', n_tanker } })

test('chokepointRows windows and orders string-dated features — the exact regression', () => {
  // DESC from the server, the oldest outside a window that starts on the 29th.
  const features = [feature('2026-08-30', 4), feature('2026-08-29', 5), feature('2026-08-01', 9)]
  const rows = chokepointRows(features, 'n_tanker', Date.UTC(2026, 7, 29))
  assert.deepEqual(rows, [
    { ts: Date.UTC(2026, 7, 29), calls: 5 },
    { ts: Date.UTC(2026, 7, 30), calls: 4 },
  ])
})

test('chokepointRows gives the same answer for epoch-ms features', () => {
  const features = [
    feature(Date.UTC(2026, 7, 30), 4),
    feature(Date.UTC(2026, 7, 29), 5),
    feature(Date.UTC(2026, 7, 1), 9),
  ]
  const rows = chokepointRows(features, 'n_tanker', Date.UTC(2026, 7, 29))
  assert.deepEqual(rows.map((r) => r.calls), [5, 4])
})

test('chokepointRows drops rows with no value for the requested class', () => {
  const rows = chokepointRows([feature('2026-08-30', null), feature('2026-08-29', 5)], 'n_tanker', 0)
  assert.deepEqual(rows.map((r) => r.calls), [5])
})
