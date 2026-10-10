// Run: node --test scripts/lib/fx-history.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { COMPANY_TRACKED } from './company-metadata.js'
import { fxWindow, latestPerUsd, QUOTE_CURRENCIES, readFxHistory } from './fx-history.js'
import { MARKET_TRACKED } from './market-metadata.js'

/** A history as the trends fetch leaves it. The first two days were cached
 *  before the won and the Taiwan dollar were kept. */
const DAYS = {
  '2026-10-06': { TRY: 49.174799 },
  '2026-10-07': { TRY: 49.195399 },
  '2026-10-08': { TRY: 49.212397, KRW: 1391.2345678, TWD: 30.1 },
  '2026-10-09': { TRY: 49.322805, KRW: 1402.5, TWD: 30.2 },
  '2026-10-10': { TRY: 49.221304, KRW: 1398.75 },
}

test('the kept currencies are every one an exchange or a company is priced in, and never the dollar', () => {
  for (const entry of [...MARKET_TRACKED, ...COMPANY_TRACKED]) {
    if (entry.currency !== 'USD') assert.ok(QUOTE_CURRENCIES.includes(entry.currency), `${entry.id}: ${entry.currency}`)
  }
  assert.equal(QUOTE_CURRENCIES.includes('USD'), false)
  assert.deepEqual(QUOTE_CURRENCIES, [...new Set(QUOTE_CURRENCIES)].sort())
})

test('a window is one row of dates and a rate or a null for each currency on each', () => {
  assert.deepEqual(fxWindow(DAYS, ['KRW', 'TRY', 'USD', 'TRY']), {
    dates: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'],
    // Six significant figures.
    perUsd: { KRW: [null, null, 1391.23, 1402.5, 1398.75], TRY: [49.1748, 49.1954, 49.2124, 49.3228, 49.2213] },
  })
})

test('a window opens on the first day any of its currencies is rated, and leaves out one that never is', () => {
  assert.deepEqual(fxWindow(DAYS, ['TWD', 'KRW', 'SEK']), {
    dates: ['2026-10-08', '2026-10-09', '2026-10-10'],
    perUsd: { KRW: [1391.23, 1402.5, 1398.75], TWD: [30.1, 30.2, null] },
  })
  assert.equal(fxWindow(DAYS, ['SEK']), null)
  assert.equal(fxWindow(DAYS, ['USD']), null)
  assert.equal(fxWindow({}, ['TRY']), null)
})

test('the newest rate of each currency, whichever day it was on, with the dollar at one', () => {
  assert.deepEqual(latestPerUsd(DAYS), { USD: 1, TRY: 49.221304, KRW: 1398.75, TWD: 30.2 })
  assert.deepEqual(latestPerUsd({}), { USD: 1 })
  // A rate of nothing is no rate.
  assert.deepEqual(latestPerUsd({ '2026-10-09': { TRY: 49.3 }, '2026-10-10': { TRY: 0 } }), { USD: 1, TRY: 49.3 })
})

test('the history is read from its file, and a missing or cut file is no history', (t) => {
  t.mock.method(console, 'error', () => {})
  const dir = mkdtempSync(join(tmpdir(), 'fx-history-'))
  const path = join(dir, 'fx.json')
  assert.deepEqual(readFxHistory(path), {})
  writeFileSync(path, JSON.stringify({ days: DAYS }))
  assert.deepEqual(readFxHistory(path), DAYS)
  writeFileSync(path, '{"days":{"2026-10-08":{"TRY":49.2')
  assert.deepEqual(readFxHistory(path), {})
})
