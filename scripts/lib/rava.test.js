import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { MARKET_CATALOG, exchangeRecord } from './market-metadata.js'
import { fetchRavaIndex, ravaSeries } from './trends-sources/rava.js'

const HEAD = 'especie,apertura,maximo,minimo,ultimo,fecha,cierre,timestamp,usd_apertura,usd_maximo,usd_minimo,usd_cierre,volumen'
const row = (date, close, especie = 'MERVAL') => `${especie},0,0,0,${close},${date},${close},0,0,0,0,0,0`
// As served: a byte-order mark, oldest first, no rows for a holiday (11-09, 11-10).
const CSV = `﻿${[
  HEAD,
  row('2026-07-30', 71000),
  row('2026-08-14', 72000), // a day before the quarter begins
  row('2026-08-17', 72500),
  row('2026-10-15', 100355),
  row('2026-10-16', 100000),
  row('2026-10-19', 98214.7),
  row('2026-11-06', 84093.11),
  row('2026-11-11', 83440),
  row('2026-11-12', 82491.8),
  row('2026-11-13', 85096),
].join('\n')}\n`

// Sunday 2026-11-15 18:00 UTC, 15:00 in Buenos Aires.
const SUNDAY = Date.parse('2026-11-15T18:00:00Z')

test('a quarter of closes, oldest first, the newest session as of', () => {
  const s = ravaSeries(CSV, 'MERVAL', { range: '3mo', now: SUNDAY })
  assert.deepEqual(s.dates, ['2026-08-17', '2026-10-15', '2026-10-16', '2026-10-19', '2026-11-06', '2026-11-11', '2026-11-12', '2026-11-13'])
  assert.equal(s.values.at(-1), 85096)
  assert.equal(s.asOf, '2026-11-13')
  assert.ok(s.completed.every(Boolean))
  assert.equal(s.periods.at(-1), 'Nov 13')
  assert.deepEqual([s.currency, s.currencyReported, s.timezone, s.source, s.exchange], ['ARS', '', '', 'Rava Bursátil', 'BYMA'])
  assert.equal(ravaSeries(CSV, 'MERVAL', { range: '1mo', now: SUNDAY }).dates[0], '2026-10-15')
})

test('the day of an open session is not a close until a quarter-hour after BYMA shuts', () => {
  const csv = `${CSV}${row('2026-11-16', 86000)}\n`
  const during = ravaSeries(csv, 'MERVAL', { now: Date.parse('2026-11-16T19:00:00Z') }) // 16:00 there
  assert.equal(during.completed.at(-1), false)
  assert.equal(during.asOf, '2026-11-13')
  const after = ravaSeries(csv, 'MERVAL', { now: Date.parse('2026-11-16T20:20:00Z') }) // 17:20 there
  assert.equal(after.completed.at(-1), true)
  assert.equal(after.asOf, '2026-11-16')
})

test('a file about another index, a changed header or too few closes is refused', () => {
  assert.throws(() => ravaSeries(`${CSV}${row('2026-11-14', 1, 'GGAL')}\n`, 'MERVAL', { now: SUNDAY }), /a row for GGAL, not MERVAL/)
  assert.throws(() => ravaSeries('fecha,valor\n2026-11-13,1\n', 'MERVAL', { now: SUNDAY }), /missing columns: especie, cierre/)
  assert.throws(() => ravaSeries([HEAD, row('2026-11-12', 1), row('2026-11-13', 2)].join('\n'), 'MERVAL', { now: SUNDAY }), /2 closes since/)
  assert.throws(() => ravaSeries('<html>blocked</html>', 'MERVAL', { now: SUNDAY }), /missing columns/)
})

test('a failed fetch serves the week-old series marked stale, and nothing past it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rava-'))
  const cachePath = join(dir, 'cache.json')
  try {
    const live = await fetchRavaIndex('MERVAL', { cachePath, now: SUNDAY, fetchText: async () => CSV })
    assert.equal(live?.values.at(-1), 85096)
    assert.equal(live?.stale, undefined)
    const down = async () => {
      throw new Error('HTTP 503')
    }
    const cached = await fetchRavaIndex('MERVAL', { cachePath, now: SUNDAY + 86_400_000, fetchText: down })
    assert.equal(cached?.stale, true)
    assert.equal(cached?.asOf, '2026-11-13')
    assert.equal(await fetchRavaIndex('MERVAL', { cachePath, now: SUNDAY + 8 * 86_400_000, fetchText: down }), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("BYMA's record is the MSCI Merval, credited to Rava, with the day's change from the last two closes", () => {
  const byma = /** @type {any} */ (MARKET_CATALOG.find((m) => m.id === 'byma'))
  assert.equal(byma.symbol, 'rava:MERVAL')
  const { record, rejected } = exchangeRecord(byma, ravaSeries(CSV, 'MERVAL', { now: SUNDAY }))
  assert.equal(rejected, null)
  assert.equal(record?.indexName, 'MSCI Merval')
  assert.equal(record?.sourceLabel, 'Rava Bursátil · BYMA')
  assert.equal(record?.level, 85096)
  assert.equal(record?.changePct, Number((((85096 - 82491.8) / 82491.8) * 100).toFixed(3)))
})
