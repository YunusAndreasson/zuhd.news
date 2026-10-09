import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { chartSeries, fetchYahooStock, isStaleAsOf, seriesAsOf, STALE_AFTER_DAYS } from './trends-sources/stocks.js'

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

// ── The fetch around it: two hosts and the last-good cache ──────────────────

const dir = mkdtempSync(join(tmpdir(), 'stocks-'))
// Saturday noon UTC: the week's last session is yesterday in New York and in Riyadh.
const SATURDAY = Date.UTC(2026, 9, 10, 12)
const week = (zone, hour, meta) => ({ chart: { result: [chart(zone, [5, 6, 7, 8, 9].map((d) => Date.UTC(2026, 9, d, hour)), meta)] } })
const onePoint = (meta) => ({ chart: { result: [{ timestamp: [1], indicators: { quote: [{ close: [11000] }] }, meta }] } })

/** A Yahoo that gives its answers in turn: a body, or a status for a host that fails. */
const yahoo = (...answers) => {
  const asked = []
  const get = async (url) => {
    const answer = answers[Math.min(asked.length, answers.length - 1)]
    asked.push(new URL(String(url)).host)
    return typeof answer === 'number' ? { ok: false, status: answer, json: async () => ({}) } : { ok: true, status: 200, json: async () => answer }
  }
  return { asked, get: /** @type {typeof fetch} */ (/** @type {unknown} */ (get)) }
}

/** Run a fetch with stderr kept, since every failure path here reports on it. */
const fetched = async (symbol, opts) => {
  const said = []
  const error = console.error
  console.error = (line) => {
    said.push(String(line))
  }
  try {
    return { series: await fetchYahooStock(symbol, opts), said }
  } finally {
    console.error = error
  }
}

test('a series too short to chart is the answer, and the other host is not asked for it', async () => {
  const { asked, get } = yahoo(onePoint({ currency: 'SAR', exchangeTimezoneName: 'Asia/Riyadh' }))
  const { series, said } = await fetched('^TASI.SR', { fetch: get, cachePath: join(dir, 'none.json'), now: SATURDAY })
  assert.equal(series, null)
  assert.deepEqual(asked, ['query1.finance.yahoo.com'])
  assert.deepEqual(said, ['  ✗ yahoo:^TASI.SR: only 1/1 points'])
})

test('a host that fails is followed by the other, and the series is cached whole', async () => {
  const cachePath = join(dir, 'cache.json')
  const { asked, get } = yahoo(429, week('America/New_York', 13.5, { currency: 'USD', exchangeName: 'NYSE' }))
  const { series } = await fetched('^NYA', { fetch: get, cachePath, now: SATURDAY })
  assert.deepEqual(asked, ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'])
  assert.equal(series.asOf, '2026-10-09')
  // One line of JSON, written by rename: no half-file for a kill to leave.
  const text = readFileSync(cachePath, 'utf8')
  assert.ok(text.endsWith('}\n') && text.trimEnd().split('\n').length === 1)
  assert.deepEqual(JSON.parse(text), { '^NYA': { ...series, cachedAt: SATURDAY } })
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [])

  // A second symbol joins it, and a range other than the default has its own key.
  await fetched('AAPL', { range: '3mo', fetch: yahoo(week('America/New_York', 13.5, { currency: 'USD' })).get, cachePath, now: SATURDAY })
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(cachePath, 'utf8'))), ['^NYA', 'AAPL@3mo'])
})

test('with both hosts down the cached series is served as stale, for a week', async () => {
  const cachePath = join(dir, 'cache.json')
  const down = () => yahoo(503, 503)
  const first = down()
  const { series, said } = await fetched('^NYA', { fetch: first.get, cachePath, now: SATURDAY + 86400_000 })
  assert.equal(first.asked.length, 2)
  assert.equal(series.stale, true)
  assert.equal(series.asOf, '2026-10-09')
  assert.equal('cachedAt' in series, false)
  assert.match(said[0], /yahoo:\^NYA: HTTP 503 — serving cached series from 2026-10-09/)
  const later = await fetched('^NYA', { fetch: down().get, cachePath, now: SATURDAY + 8 * 86400_000 })
  assert.equal(later.series, null)
})

test('a short answer with a live quote is laid over the cached series of the same instrument', async () => {
  const cachePath = join(dir, 'riyadh.json')
  const riyadh = { currency: 'SAR', exchangeTimezoneName: 'Asia/Riyadh' }
  await fetched('^TASI.SR', { fetch: yahoo(week('Asia/Riyadh', 7, riyadh)).get, cachePath, now: SATURDAY })
  const monday = Date.UTC(2026, 9, 12, 10)
  const { asked, get } = yahoo(onePoint({ ...riyadh, regularMarketPrice: 11052.3 }))
  const { series } = await fetched('^TASI.SR', { fetch: get, cachePath, now: monday })
  assert.equal(asked.length, 1)
  assert.deepEqual([series.values.at(-1), series.dates.at(-1), series.periods.at(-1), series.completed.at(-1)], [11052.3, '2026-10-12', 'Oct 12', false])
  assert.equal(series.asOf, '2026-10-09', 'the last real close')
  // A quote in another currency is another instrument: the cached series alone.
  const other = await fetched('^TASI.SR', { fetch: yahoo(onePoint({ currency: 'USD', exchangeTimezoneName: 'Asia/Riyadh', regularMarketPrice: 9 })).get, cachePath, now: monday })
  assert.equal(other.series.values.length, 5)
})

test('a cache file cut short is said, and the next success writes a whole one', async () => {
  const cachePath = join(dir, 'cut.json')
  writeFileSync(cachePath, '{"^NYA":{"values":[8700,87')
  const { series, said } = await fetched('AAPL', { fetch: yahoo(week('America/New_York', 13.5, { currency: 'USD' })).get, cachePath, now: SATURDAY })
  assert.equal(series.values.length, 5)
  assert.ok(said.some((line) => /readJson: .*cut\.json is not valid JSON/.test(line)), said.join('\n'))
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(cachePath, 'utf8'))), ['AAPL'])
})
