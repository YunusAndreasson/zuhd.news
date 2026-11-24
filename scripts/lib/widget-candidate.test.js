import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanMarket } from './market-signals.js'
import { widgetCandidate } from './widget-candidate.js'

const previous = 'mkt:tadawul'
const edition = '2026-11-23', now = Date.parse(`${edition}T22:00:00Z`)
const audio = { available: true, date: edition, generated: `${edition}T05:29:19.894Z`, duration: 587 }
const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-22', edition]
const values = [10219.89, 10235.51, 10186.64, 10118.63, 9981.03, 9937.26]
const close = { id: previous, exchange: 'Saudi Exchange', country: 'SA', title: 'TASI', asOf: edition, series: { dates, values } }
const india = { ...close, id: 'mkt:bse', title: 'SENSEX', exchange: 'Bombay Stock Exchange', country: 'IN' }
const events = (...signals) => Object.fromEntries(signals.map(signal => [signal.id, { signal }]))
const make = (signals = [close], briefing = audio, pref = previous, opener = null) =>
  widgetCandidate(edition, events(...signals), briefing, pref, opener, now)

test('23 November publishes all six observed closes, dated audio and no news text', () => {
  const c = make([{ ...close, directNews: ['private-story'], standing: 'private prose' }])
  assert.equal(c.close.completed, true)
  assert.equal(c.close.value, 9937.26)
  assert.deepEqual(c.close.observations, dates.map((date, i) => ({ date, value: values[i] })))
  assert.equal((100 * (c.close.value / c.close.observations[0].value - 1)).toFixed(1), '-2.8')
  assert.deepEqual(c.audio, { status: 'available', date: edition, generated: audio.generated, durationSeconds: 587 })
  assert.equal(JSON.stringify(c).includes('private'), false)
  assert.equal(c.sourceRevision, make().sourceRevision)
})

test('a same-date correction replaces the close and line together; a recording revision also changes the payload', () => {
  const corrected = make([{ ...close, series: { dates, values: [...values.slice(0, -1), 9920] } }])
  assert.notEqual(corrected.close.sourceRevision, make().close.sourceRevision)
  assert.equal(corrected.close.value, corrected.close.observations.at(-1).value)
  assert.notEqual(make([close], { ...audio, generated: `${edition}T10:00:00Z` }).sourceRevision, make().sourceRevision)
})

test('previous exchange, approved opener, stable id order; withdrawal permits replacement', () => {
  assert.equal(make([india, close], audio, previous, india.id).close.id, previous)
  assert.equal(make([india, close], audio, null, previous).close.id, previous)
  assert.equal(make([close, india], audio, null).close.id, india.id)
  assert.equal(make([india]).close.id, india.id)
})

test('mismatched identities, missing week, future observations and rollover cannot borrow a reading', () => {
  for (const patch of [{ title: 'Unknown index' }, { country: 'US' }, { asOf: '2026-11-24' },
    { series: { dates: [edition, edition], values: [1, 2] } }, { series: { dates: [edition], values: [Infinity] } },
    { series: { dates, values, completed: dates.map((_, i) => i < dates.length - 1) } }]) {
    const c = make([{ ...close, ...patch }])
    assert.equal(c.close, undefined)
    assert.equal(c.audio.status, 'available')
  }
  assert.equal(make([{ ...close, series: { dates: dates.slice(-2), values: values.slice(-2) } }]).close.observations, undefined)
  const next = '2026-11-24'
  assert.equal(widgetCandidate(next, events(close), audio, previous, null, Date.parse(next)), null)
  assert.equal(widgetCandidate(next, events(close), audio, previous, null, now), null)
})

test('unavailable recordings have no duration or play; an available file can lack duration', () => {
  for (const record of [null, { ...audio, date: '2026-11-22' }, { ...audio, available: false },
    { ...audio, generated: 'bad' }, { ...audio, generated: `${edition}T23:00:00Z` }]) {
    assert.deepEqual(make([close], record).audio, { status: 'unavailable' })
  }
  assert.equal('durationSeconds' in make([], { ...audio, duration: 0 }).audio, false)
})

test('signal-state provenance excludes the intraday fallback before candidate selection', () => {
  const seriesDates = Array.from({ length: 24 }, (_, i) => new Date(now - (23 - i) * 86400000).toISOString().slice(0, 10))
  const market = { values: seriesDates.map((_, i) => i + 1), dates: seriesDates, completed: seriesDates.map((_, i) => i < 23) }
  const cleaned = cleanMarket(market, now)
  assert.equal(cleaned.dates.at(-1), '2026-11-22')
  assert.equal(make([{ ...close, asOf: cleaned.dates.at(-1), series: cleaned }], null), null)
})
