// The rail's rows that do not follow the range: the monthly economy lists, the
// AI labs' scores, and the two daily groups that arrived with them (energy,
// companies).
//
// Each assertion pins a wrong number this could print: a rate's change as a
// percentage of a percentage, a cut of two and a half points rounded to three,
// a tenth of a point drawn as no move, a month compared across a gap, a lab
// without the whole window averaged into it, and a week's move in a column of
// days.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bundleIsland, scratchDir } from './island-bundle.js'

const dir = scratchDir('map-slow')
const slow = await import(await bundleIsland(dir, 'public/islands/_map/slow.ts', 'slow.mjs'))
const markets = await import(await bundleIsland(dir, 'public/islands/_map/markets.ts', 'mk.mjs'))

const { economyGroups, aiScoreChange, aiSummary, AI_CHANGE_DAYS } = slow
const {
  economyBlocks, aiBlock, companyEntries, pointsFigure, tickerEntries, worldEntries,
  createMarketStrip, sparkInput,
} = markets

const DAY_MS = 86_400_000

const monthly = (id, label, values, last = ['Jul 2026', 'Aug 2026', 'Sep 2026'], unit = '%') => ({
  id,
  label,
  unit,
  cadence: 'monthly',
  values,
  periods: last.slice(-values.length),
  asOf: '2026-09-01',
})

/** `["Oct 5", "Oct 6", …]`, one label per day given. */
const dayLabels = (days) =>
  days.map((iso) => {
    const d = new Date(`${iso}T00:00:00Z`)
    return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
  })

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement']
  const saved = Object.fromEntries(keys.map((k) => [k, globalThis[k]]))
  for (const k of keys) globalThis[k] = dom.window[k] ?? dom.window
  globalThis.document = dom.window.document
  try {
    return fn()
  } finally {
    for (const k of keys) globalThis[k] = saved[k]
  }
}

// --- The monthly lists -------------------------------------------------------

test('a rate moves in points, and the list is its median at the month every bank has', () => {
  const groups = economyGroups([
    monthly('fed-funds', 'Fed target rate', [3.75, 3.75, 4]),
    monthly('ecb-rate', 'ECB deposit rate', [2.25, 2.25, 2.5]),
    // A month ahead of the other two, as the BIS's rates are of FRED's.
    monthly('tcmb-rate', 'Turkey interest rate', [37, 37, 37, 34.5], [
      'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026',
    ]),
  ])
  const rates = groups.find((g) => g.key === 'rates')
  assert.equal(rates.rows.length, 3)
  // Sep is the newest month all three have: median 4 against median 3.75.
  assert.deepEqual(rates.move, { delta: 0.25, kind: 'points', month: 'Sep', against: 'Aug' })
  const turkey = rates.rows.find((r) => r.ind.id === 'tcmb-rate')
  assert.equal(turkey.level, 34.5)
  assert.deepEqual(turkey.move, { delta: -2.5, kind: 'points', month: 'Oct', against: 'Sep' })
})

test('a month is never compared across a gap', () => {
  const [group] = economyGroups([
    monthly('us-unemployment', 'US unemployment', [4.1, 4.3], ['Jul 2026', 'Sep 2026']),
  ])
  assert.equal(group.key, 'jobs')
  assert.equal(group.rows[0].level, 4.3)
  assert.equal(group.rows[0].move, null, 'August is missing: July is not the month before')
  assert.equal(group.move, null)
})

test('inflation is the difference of the two printed readings', () => {
  const [group] = economyGroups([
    monthly('us-cpi', 'US inflation', [3.46353, 3.30386, 3.35302]),
    monthly('ez-cpi', 'Eurozone inflation', [2.73289, 2.93179, 3.22645]),
  ])
  // 3.4 against 3.3, not 0.04916: a level of 3.4% beside +0.05 pts is two
  // numbers at two precisions about one figure.
  const us = group.rows.find((r) => r.ind.id === 'us-cpi')
  assert.equal(us.level, 3.4)
  assert.ok(Math.abs(us.move.delta - 0.1) < 1e-9)
  // The average: 3.3 (of 3.35 and 3.23) against 3.1.
  assert.ok(Math.abs(group.move.delta - 0.2) < 1e-9)
})

test('prices in different units average their own changes', () => {
  const [group] = economyGroups([
    monthly('wheat', 'Wheat', [200, 220], undefined, '$/mt'),
    monthly('rice', 'Rice', [400, 420], undefined, '$/mt'),
  ])
  assert.equal(group.key, 'food')
  assert.equal(group.move.kind, 'percent')
  assert.ok(Math.abs(group.move.delta - 7.5) < 1e-9, '+10% and +5%')
})

test('a move in points is printed at its series’ places', () => {
  assert.equal(pointsFigure(-2.5, 2), '−2.50 pts', 'not −3 pts')
  assert.equal(pointsFigure(0.25, 2), '+0.25 pts')
  assert.equal(pointsFigure(0.1, 1), '+0.1 pts')
  assert.equal(pointsFigure(0.004, 2), '0 pts', 'no sign on a figure that prints as nothing')
})

test('a tenth of a point is a move, and a held rate is not', () => {
  const blocks = economyBlocks([
    monthly('us-unemployment', 'US unemployment', [4.1, 4.1, 4.2]),
    monthly('fed-funds', 'Fed target rate', [4, 4, 4]),
    monthly('ecb-rate', 'ECB deposit rate', [2.5, 2.5, 2.25]),
  ])
  const jobs = blocks.find((b) => b.key === 'jobs')
  assert.equal(jobs.entries.length, 1, 'one series: its row opens its card')
  assert.deepEqual(jobs.entries[0].own, { pct: 1, figure: '+0.1 pts', period: 'Sep against Aug' })
  assert.equal(jobs.entries[0].stamp, 'Sep')
  assert.equal(jobs.entries[0].step, 'months')

  const rates = blocks.find((b) => b.key === 'rates')
  // Risen first, fallen last: a hold stands between them.
  assert.deepEqual(rates.entries.map((e) => e.id), ['fed-funds', 'ecb-rate'])
  assert.deepEqual(rates.entries[0].own, { pct: 0, figure: '0 pts', period: 'Sep against Aug' })
  assert.equal(rates.entries[1].own.pct, -1)
  assert.equal(rates.meta, 'median of 2 · Sep against Aug')
})

// --- AI labs -----------------------------------------------------------------

const NOW = Date.UTC(2026, 9, 11)
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString().slice(0, 10)

test('a lab’s score 90 days ago is its last release before then', () => {
  const change = aiScoreChange(
    { periods: [daysAgo(400), daysAgo(120), daysAgo(30)], values: [140, 150, 156] },
    NOW,
  )
  assert.deepEqual(change, { points: 6, full: true, since: daysAgo(400) })
  // Nothing released inside the window: the score stood, which is no move.
  const still = aiScoreChange({ periods: [daysAgo(200)], values: [141] }, NOW)
  assert.equal(still.points, 0)
  assert.equal(still.full, true)
})

test('a lab younger than the window is measured from its first model, and left out of the average', () => {
  const young = { periods: [daysAgo(60), daysAgo(10)], values: [150, 158] }
  assert.deepEqual(aiScoreChange(young, NOW), { points: 8, full: false, since: daysAgo(60) })

  const lab = (id, score, series) => ({
    id, name: id, iso2: 'US', blurb: '', model: `${id} 1`, score, asOf: daysAgo(10),
    series: { ...series, models: series.periods.map(() => `${id} 1`) },
  })
  const labs = [
    lab('a', 160, { periods: [daysAgo(200), daysAgo(20)], values: [154, 160] }),
    lab('b', 150, { periods: [daysAgo(300), daysAgo(40)], values: [148, 150] }),
    lab('c', 158, young),
  ]
  const summary = aiSummary(labs, NOW)
  assert.equal(summary.counted, 2)
  assert.equal(summary.gain, 4, 'the mean of +6 and +2, without the +8 over sixty days')

  const block = aiBlock({ generated: '', labs }, NOW)
  assert.deepEqual(block.own, { pct: 1, figure: '+4.0 pts', period: `over ${AI_CHANGE_DAYS} days` })
  assert.deepEqual(block.entries.map((e) => e.id), ['ai:a', 'ai:b', 'ai:c'], 'the payload’s order')
  const c = block.entries[2]
  assert.match(c.own.period, /^since \d+ [A-Z][a-z]{2}$/)
  assert.equal(c.stamp, c.own.period, 'a shorter window is said on the row')
  assert.equal(block.entries[0].stamp, '')
  assert.deepEqual(block.entries[0].account, {}, 'no entity record to fetch for a lab')
  // And each release in the card's table is points too, never a percentage of
  // an index whose zero means nothing: the unit alone does not say so.
  assert.ok(block.entries.every((e) => e.change === 'points'))
})

test('one lab is not a field', () => {
  assert.equal(aiSummary([{ score: 160, series: { periods: [], values: [] } }], NOW), null)
  assert.equal(aiBlock(null, NOW), null)
})

// --- The daily groups that came with them ------------------------------------

const daily = (id, label, days, values, unit = '$/bbl') => ({
  id, label, unit, cadence: 'daily', values, periods: dayLabels(days), asOf: days.at(-1),
})

test('energy is a group with one edge, and oil has left the world block', () => {
  const week = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06']
  const indicators = [
    daily('brent', 'Brent crude', week, [110, 112, 120, 126]),
    daily('wti', 'WTI crude', week, [100, 101, 104, 105]),
    daily('natgas-hh', 'Natural gas (Henry Hub)', week, [3, 3, 2.9, 3.03], '$/MMBtu'),
    daily('us-gas-retail', 'US gasoline (retail)', ['2026-09-21', '2026-09-28', '2026-10-05'],
      [4.48, 4.47, 4.35], '$/gal'),
    daily('vix', 'VIX', week, [15, 16, 15, 15.4], 'index'),
  ]
  const energy = tickerEntries(indicators).filter((e) => e.group === 'energy')
  assert.deepEqual(energy.map((e) => e.id), ['brent', 'wti', 'natgas-hh', 'us-gas-retail'])
  const edge = Date.UTC(2026, 9, 6)
  assert.ok(energy.slice(0, 3).every((e) => e.edge === edge), 'the last day the set traded')
  assert.equal(energy.at(-1).step, 'weeks', 'a weekly price says so')
  assert.equal(energy.at(-1).edge, undefined, 'and is not on the set’s calendar')
  assert.deepEqual(worldEntries(indicators).map((e) => e.id), ['vix'])

  // Sunday the 11th at the map's opening three days: against the wall clock no
  // series has two closes, which is a dotted rule every weekend.
  const sunday = Date.UTC(2026, 9, 11)
  assert.equal(sparkInput(energy, 3, sunday), null)
  const drawn = sparkInput(energy, 3, sunday, edge)
  assert.deepEqual(drawn.members, { drawn: 3, total: 4 }, 'the weekly price has no pair in three days')

  // Petrol is stamped on a Monday and crude runs days behind it: the newer
  // stamp is not the set's edge, or the three daily rows have no pair to read.
  const later = indicators.map((i) =>
    i.id === 'us-gas-retail'
      ? daily(i.id, i.label, ['2026-09-28', '2026-10-05', '2026-10-12'], [4.47, 4.35, 4.3], '$/gal')
      : i,
  )
  const crude = tickerEntries(later).filter((e) => e.group === 'energy' && !e.step)
  assert.ok(crude.every((e) => e.edge === edge), 'still the last day crude traded')
  const thursday = Date.UTC(2026, 9, 15)
  assert.deepEqual(sparkInput(crude, 3, thursday, edge).members, { drawn: 3, total: 3 })
})

test('companies run from the largest rise to the largest fall, on one edge', () => {
  const company = (id, asOf, values, extra = {}) => ({
    id, name: id, about: 'chips', iso2: 'US', currency: 'USD', level: values.at(-1), asOf,
    series: { values, periods: dayLabels(['2026-10-07', '2026-10-08', '2026-10-09'].slice(-values.length)) },
    ...extra,
  })
  const entries = companyEntries([
    company('down', '2026-10-09', [100, 100, 98]),
    company('up', '2026-10-09', [100, 100, 103], { marketValue: 5.536e12, recent: 'Why.' }),
    company('flat', '2026-10-09', [50, 50, 50], { currency: 'KRW', marketValue: 8.83e11 }),
    company('one-close', '2026-10-09', [10]),
  ])
  assert.deepEqual(entries.map((e) => e.id), ['co:up', 'co:flat', 'co:down'])
  assert.ok(entries.every((e) => e.edge === Date.UTC(2026, 9, 9)))
  assert.equal(entries[0].unit, '$')
  assert.equal(entries[1].unit, 'KRW')
  assert.deepEqual(entries[0].facts, ['Market value · $5.5 trillion'])
  assert.deepEqual(entries[1].facts, ['Market value · $880 billion'])
  // Two figures of a trillion, never `$1000 billion`.
  const near = companyEntries([company('near', '2026-10-09', [100, 100, 103], { marketValue: 996.4e9 })])
  assert.deepEqual(near[0].facts, ['Market value · $1 trillion'])
  assert.equal(entries[0].account.recent, 'Why.')
  assert.deepEqual(entries[2].facts, [])
})

test('the companies’ edge is the day most of the list closed on', () => {
  // Thursday noon UTC: Taipei has closed and New York has not opened.
  const company = (id, days, values) => ({
    id, name: id, about: 'chips', iso2: 'US', currency: 'USD', level: values.at(-1), asOf: days.at(-1),
    series: { values, periods: dayLabels(days) },
  })
  const wed = ['2026-10-06', '2026-10-07']
  const thu = ['2026-10-06', '2026-10-07', '2026-10-08']
  const entries = companyEntries([
    company('taipei', thu, [100, 100, 99]),
    company('ny-a', wed, [100, 101]),
    company('ny-b', wed, [100, 102]),
    company('ny-c', wed, [100, 103]),
  ])
  const edge = Date.UTC(2026, 9, 7)
  assert.ok(entries.every((e) => e.edge === edge), 'Wednesday, not Taipei’s Thursday')
  const day = sparkInput(entries, 1, Date.UTC(2026, 9, 8, 12), edge)
  assert.deepEqual(day.members, { drawn: 4, total: 4 }, 'the day’s move is read from every company')
})

// --- The rows ----------------------------------------------------------------

test('the slow rows print their own period, and a range press leaves them standing', () => {
  withDom(() => {
    const opened = []
    const strip = createMarketStrip({
      rangeDays: 3,
      onSelect() {},
      onQuote: (entry) => opened.push(entry),
      onStrait() {},
      onEvent() {},
    })
    const indicators = [
      monthly('fed-funds', 'Fed target rate', [3.75, 3.75, 4]),
      monthly('ecb-rate', 'ECB deposit rate', [2.25, 2.25, 2.5]),
      monthly('us-unemployment', 'US unemployment', [4.1, 4.1, 4.2]),
    ]
    strip.setTrends(indicators)

    const head = strip.element.querySelector('.map-markets-economy').previousElementSibling
    assert.equal(head.hidden, false)
    assert.equal(head.textContent, 'economy on the month', 'the period is said once, on the heading')

    const rows = [...strip.element.querySelectorAll('.map-markets-economy .map-markets-summary')]
    assert.deepEqual(
      rows.map((r) => r.querySelector('.map-markets-label').textContent),
      ['rates', 'US jobless'],
    )
    const [rates, jobs] = rows
    assert.equal(rates.querySelector('.map-markets-window').textContent, '+0.25 pts')
    assert.ok(rates.querySelector('.map-markets-move').classList.contains('is-pos'))
    assert.equal(rates.querySelector('.map-markets-age'), null, 'a month is not an age')
    assert.equal(rates.getAttribute('aria-label'), 'central bank rates — +0.25 pts, Sep against Aug, show detail')

    // The list of one opens its series' card, carrying the reading it printed.
    assert.equal(jobs.querySelector('.map-markets-level').textContent, '4.2%')
    jobs.click()
    assert.equal(opened.length, 1)
    assert.equal(opened[0].id, 'us-unemployment')
    assert.equal(opened[0].own.figure, '+0.1 pts')

    // Nothing here follows the range, so nothing is rebuilt by a press of it.
    strip.setRangeDays(30)
    assert.equal(strip.element.querySelector('.map-markets-economy .map-markets-summary'), rates)

    // The AI block is hidden until its payload lands, and takes one row.
    const ai = strip.element.querySelector('.map-markets-ai')
    assert.equal(ai.hidden, true)
    strip.setAiModels(null)
    assert.equal(ai.hidden, true)
    strip.destroy()
  })
})

test('the companies’ row stands under markets whichever payload lands first', () => {
  withDom(() => {
    const strip = createMarketStrip({
      rangeDays: 3, onSelect() {}, onQuote() {}, onStrait() {}, onEvent() {},
    })
    const days = ['2026-10-07', '2026-10-08', '2026-10-09']
    const company = (id, values) => ({
      id, name: id, about: '', iso2: 'US', currency: 'USD', level: values.at(-1),
      asOf: days.at(-1), series: { values, periods: dayLabels(days) },
    })
    const labels = () =>
      [...strip.element.querySelectorAll('.map-markets-row > .map-markets-item:not([hidden]) .map-markets-label')]
        .map((n) => n.textContent)

    assert.deepEqual(labels(), ['markets'], 'no blank row before the payload')
    strip.setTrends([
      daily('btc', 'Bitcoin', days, [60000, 61000, 62000], '$'),
      daily('eth', 'Ethereum', days, [3000, 3100, 3050], '$'),
    ])
    strip.setCompanies([company('a', [100, 101, 103]), company('b', [50, 50, 49])])
    assert.deepEqual(labels(), ['markets', 'companies', 'crypto'])

    // And it keeps its place through a redraw, which rebuilds the trend groups.
    strip.setRangeDays(7)
    assert.deepEqual(labels(), ['markets', 'companies', 'crypto'])
    const row = strip.element.querySelector('.map-markets-row > .map-markets-item:nth-child(2) .map-markets-summary')
    assert.match(row.getAttribute('aria-label'), /^companies — 1 up, 1 down/, 'the counts reach a screen reader')
    strip.destroy()
  })
})
