import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyFromDaily, parseBisCsv } from './trends-sources/bis.js'
import { roundPrice } from './trends-sources/crypto.js'
import { INDICATORS, SOURCES } from './trends-registry.js'
import { ENTITY_RULES } from './entity-registry.js'

const NOW = new Date('2026-10-03T12:00:00Z')

/** Every weekday from `from` to `to`, at the rate `rateOn(date)` gives. */
function daily(from, to, rateOn) {
  const rows = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
    const date = d.toISOString().slice(0, 10)
    rows.push({ date, value: rateOn(date) })
  }
  return rows
}

test('monthlyFromDaily: one point a month, the rate in force at its last observation', () => {
  // Raised on Sep 24: August ends on the old rate, September on the new.
  const rows = daily('2026-07-01', '2026-09-29', (d) => (d >= '2026-09-24' ? 1.25 : 1))
  const out = monthlyFromDaily(rows, { now: NOW })
  assert.deepEqual(out.values, [1, 1, 1.25])
  assert.deepEqual(out.periods, ['Jul 2026', 'Aug 2026', 'Sep 2026'])
  assert.deepEqual(out.dates, ['2026-07-31', '2026-08-31', '2026-09-29'])
  assert.equal(out.asOf, '2026-09-29')
  assert.deepEqual(out.completed, [true, true, true])
})

test('monthlyFromDaily: the current month is on the line as far as it has got', () => {
  // A change last week has to be the reading today, not next month.
  const rows = daily('2026-08-03', '2026-10-01', (d) => (d >= '2026-10-01' ? 3.5 : 3.75))
  const out = monthlyFromDaily(rows, { now: NOW })
  assert.deepEqual(out.periods, ['Aug 2026', 'Sep 2026', 'Oct 2026'])
  assert.equal(out.values.at(-1), 3.5)
})

test('monthlyFromDaily: two years and the month in progress, no more', () => {
  const out = monthlyFromDaily(daily('2023-01-02', '2026-10-01', () => 4), { now: NOW })
  assert.equal(out.values.length, 25)
  assert.equal(out.periods[0], 'Oct 2024')
  assert.equal(out.periods.at(-1), 'Oct 2026')
})

test('monthlyFromDaily: a series that stopped is no series', () => {
  // India's daily series ended Jul 23 on the day this was written. The rate
  // may have changed since; printing it as current would be a guess.
  assert.equal(monthlyFromDaily(daily('2025-01-01', '2026-07-23', () => 5.25), { now: NOW }), null)
  // Inside the bar it stands.
  assert.ok(monthlyFromDaily(daily('2025-01-01', '2026-08-28', () => 2.25), { now: NOW }))
})

test('monthlyFromDaily: nothing, one month, or unusable rows give null', () => {
  assert.equal(monthlyFromDaily([], { now: NOW }), null)
  assert.equal(monthlyFromDaily(daily('2026-09-01', '2026-09-29', () => 2), { now: NOW }), null)
  assert.equal(
    monthlyFromDaily([{ date: 'soon', value: 2 }, { date: '2026-09-29', value: Number.NaN }], { now: NOW }),
    null,
  )
})

test('monthlyFromDaily: rows out of order are read in date order', () => {
  const rows = daily('2026-08-03', '2026-09-29', (d) => (d >= '2026-09-10' ? 14 : 14.25)).reverse()
  assert.deepEqual(monthlyFromDaily(rows, { now: NOW }).values, [14.25, 14])
})

test('parseBisCsv: groups by country and drops the days published as NaN', () => {
  const csv = [
    'FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE',
    'D,GB,2026-09-25,3.75',
    'D,ID,2026-09-27,NaN',
    'D,ID,2026-09-28,5.75',
    'D,GB,2026-09-28,3.75',
    '',
  ].join('\n')
  const by = parseBisCsv(csv)
  assert.deepEqual([...by.keys()], ['GB', 'ID'])
  assert.deepEqual(by.get('ID'), [{ date: '2026-09-28', value: 5.75 }])
  assert.equal(by.get('GB').length, 2)
})

test('parseBisCsv: finds its columns by name, and gives nothing without them', () => {
  const moved = 'OBS_VALUE,TIME_PERIOD,REF_AREA\n37,2026-09-25,TR\n'
  assert.deepEqual(parseBisCsv(moved).get('TR'), [{ date: '2026-09-25', value: 37 }])
  assert.equal(parseBisCsv('<html>busy</html>').size, 0)
  assert.equal(parseBisCsv('').size, 0)
})

test('roundPrice: a price keeps the decimals its size needs', () => {
  // From ten dollars up, as it always was.
  assert.equal(roundPrice(84837.123456), 84837.12)
  assert.equal(roundPrice(13.9249), 13.92)
  // Below, two decimals flattened the line: Dogecoin was 0.09 every day.
  assert.equal(roundPrice(1.493217), 1.4932)
  assert.equal(roundPrice(0.0931174), 0.093117)
  assert.notEqual(roundPrice(0.0931), roundPrice(0.0949))
})

test('registry: every row has a source that exists, and no id is used twice', () => {
  const ids = INDICATORS.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const i of INDICATORS) assert.ok(SOURCES[i.source], `${i.id}: unknown source ${i.source}`)
})

test('registry: a policy rate is a monthly per cent, keyed by a two-letter country', () => {
  const rates = INDICATORS.filter((i) => i.source === 'bis')
  assert.ok(rates.length >= 5)
  for (const r of rates) {
    // The app prints a monthly `%` series' move in points (`isMonthlyRate`).
    assert.equal(r.cadence, 'monthly', r.id)
    assert.equal(r.unit, '%', r.id)
    assert.match(r.seriesId, /^[A-Z]{2}$/, r.id)
    // The country alone must never be a tag: it would hang the rate off
    // every story about the place (`attach-indicators.js` matches tags alone).
    const country = r.label.split(' ')[0].toLowerCase()
    assert.ok(!r.topicTags.includes(country), `${r.id} is tagged with its bare country`)
  }
})

test('registry: every static mention of a series names one the registry has', () => {
  const ids = new Set(INDICATORS.map((i) => i.id))
  const prefixed = (id) => /^(cp|mkt):/.test(id)
  for (const rule of ENTITY_RULES) {
    for (const id of [rule.indicatorId, ...(rule.candidates || []).map((c) => c.id)]) {
      if (prefixed(id)) continue
      assert.ok(ids.has(id), `"${rule.mention}" points at ${id}, which no source fetches`)
    }
  }
})
