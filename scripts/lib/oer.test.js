// Run: node --test scripts/lib/oer.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fetchOerRates } from './trends-sources/oer.js'

// The currency history is built a day at a time and kept in one file, so the
// file is the series: what is read from it, and when it is written.

const dir = mkdtempSync(join(tmpdir(), 'oer-'))
const NOON = Date.parse('2026-10-09T12:00:00Z')
const DAY = 86400_000

/**
 * An OER that answers each day asked for, and remembers which.
 * @param {(date: string) => boolean} [fail] the days it refuses
 */
const oer = (fail = () => false) => {
  const asked = []
  const get = async (url) => {
    const date = /historical\/(\d{4}-\d{2}-\d{2})\.json/.exec(String(url))?.[1] ?? ''
    asked.push(date)
    if (fail(date)) return { ok: false, status: 429, json: async () => ({}) }
    const day = Number(date.slice(8, 10))
    return { ok: true, status: 200, json: async () => ({ rates: { USD: 1, TRY: 40 + day / 10, PKR: 278, XAU: 0.0003 } }) }
  }
  return { asked, get: /** @type {typeof fetch} */ (/** @type {unknown} */ (get)) }
}

/** Run it with stdout and stderr kept, since it reports on both. */
const run = async (cachePath, opts) => {
  const said = []
  const { log, error } = console
  const keep = (line) => {
    said.push(String(line))
  }
  console.log = keep
  console.error = keep
  try {
    return { rates: await fetchOerRates(['TRY', 'PKR'], 'app-id', cachePath, opts), said }
  } finally {
    console.log = log
    console.error = error
  }
}

test('the first run asks for every day of the window and keeps what it was asked to keep', async () => {
  const cachePath = join(dir, 'fx.json')
  const { asked, get } = oer()
  const { rates } = await run(cachePath, { fetch: get, now: NOON })
  assert.equal(asked.length, 30)
  assert.deepEqual([asked[0], asked.at(-1)], ['2026-09-10', '2026-10-09'])
  assert.deepEqual(Object.keys(rates), ['TRY', 'PKR'])
  assert.deepEqual([rates.TRY.values.length, rates.TRY.periods[0], rates.TRY.periods.at(-1), rates.TRY.asOf], [30, 'Sep 10', 'Oct 9', '2026-10-09'])
  assert.equal(rates.TRY.values.at(-1), 40.9)
  // One line of JSON, by rename, holding only the two currencies.
  const text = readFileSync(cachePath, 'utf8')
  assert.ok(text.endsWith('}\n') && text.trimEnd().split('\n').length === 1)
  assert.deepEqual(JSON.parse(text).days['2026-10-09'], { TRY: 40.9, PKR: 278 })
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [])
})

test('a run that fetches nothing leaves the file as it is', async () => {
  const cachePath = join(dir, 'fx.json')
  // The same history, laid out another way: a rewrite would put it back on one line.
  const marked = `${JSON.stringify(JSON.parse(readFileSync(cachePath, 'utf8')), null, 2)}\n`
  writeFileSync(cachePath, marked)
  const { asked, get } = oer()
  const { rates } = await run(cachePath, { fetch: get, now: NOON + 5 * 3600_000 })
  assert.deepEqual(asked, [])
  assert.equal(rates.TRY.values.length, 30)
  assert.equal(readFileSync(cachePath, 'utf8'), marked)
})

test('the next day asks for that day alone, and the window moves on in the file', async () => {
  const cachePath = join(dir, 'fx.json')
  const { asked, get } = oer()
  const { rates } = await run(cachePath, { fetch: get, now: NOON + DAY })
  assert.deepEqual(asked, ['2026-10-10'])
  assert.deepEqual([rates.TRY.periods[0], rates.TRY.periods.at(-1), rates.TRY.asOf], ['Sep 11', 'Oct 10', '2026-10-10'])
  const days = Object.keys(JSON.parse(readFileSync(cachePath, 'utf8')).days)
  assert.deepEqual([days.length, days[0], days.at(-1)], [30, '2026-09-11', '2026-10-10'])
})

test('a day that cannot be fetched is said, the others stand, and nothing is written for it', async () => {
  const cachePath = join(dir, 'fx.json')
  const before = readFileSync(cachePath, 'utf8')
  const { asked, get } = oer(() => true)
  const { rates, said } = await run(cachePath, { fetch: get, now: NOON + 2 * DAY })
  assert.deepEqual(asked, ['2026-10-11'])
  assert.ok(said.includes('  ✗ oer 2026-10-11: HTTP 429'), said.join('\n'))
  // The series ends at the last day there is, and says so.
  assert.deepEqual([rates.TRY.values.length, rates.TRY.asOf], [29, '2026-10-10'])
  assert.equal(readFileSync(cachePath, 'utf8'), before)
})

test('a history file cut short is said, and rebuilt', async () => {
  const cachePath = join(dir, 'cut.json')
  writeFileSync(cachePath, '{"days":{"2026-10-08":{"TRY":40.8,"PK')
  const { asked, get } = oer()
  const { rates, said } = await run(cachePath, { fetch: get, now: NOON })
  assert.ok(said.some((line) => /readJson: .*cut\.json is not valid JSON/.test(line)), said.join('\n'))
  assert.equal(asked.length, 30)
  assert.equal(rates.PKR.values.length, 30)
  assert.equal(Object.keys(JSON.parse(readFileSync(cachePath, 'utf8')).days).length, 30)
})

test('with no history and no answer there are no rates', async () => {
  const { rates } = await run(join(dir, 'never.json'), { fetch: oer(() => true).get, now: NOON })
  assert.equal(rates, null)
  assert.equal(readdirSync(dir).includes('never.json'), false)
})
