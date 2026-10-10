import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OTHER_DAY_CAP, SUBJECT_DAY_CAP, applyCaps, candidatesFor, chartDeskPrompt, contractRows, parseChartDesk, recentCharts } from './chart-desk.js'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const days = (n, end) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${end}T00:00:00Z`) - (n - 1 - i) * 86400_000).toISOString().slice(0, 10))
const series = (id, source, over = {}) => ({
  id, source, label: id, unit: 'u', cadence: 'daily',
  values: Array.from({ length: 10 }, (_, i) => 100 + i), dates: days(10, '2026-10-07'), asOf: '2026-10-07', ...over,
})

const trends = {
  asOf: '2026-10-08',
  indicators: [
    series('brent', 'fred'),
    series('copper', 'imf'),
    series('fx-try', 'oer', { countryTags: ['TR'] }),
    series('tcmb-rate', 'bis', { countryTags: ['TR'] }),
    series('us-2y', 'fred', { countryTags: ['US'] }),
    series('wiki-turkey', 'wikipedia', { countryTags: ['TR'] }),
    series('stocks:ARGX', 'stocks'),
    series('poly-ankara-vote', 'polymarket', { label: 'Erdogan wins the snap vote?', endDate: '2026-11-20T00:00:00Z' }),
    series('poly-closing', 'polymarket', { label: 'Deal by Friday?', endDate: '2026-10-09T00:00:00Z' }),
    series('poly-unwritten', 'polymarket', { label: 'No paragraph yet?', endDate: '2026-12-01T00:00:00Z' }),
  ],
}
const strait = {
  id: 'hormuz', name: 'Strait of Hormuz', asOf: '2026-10-04',
  last7Avg: { n_total: 2.7 }, baseline90Avg: { n_total: 4.5 }, delta7vs90: { n_total: -0.4 },
  series: { total: [3, 2, 3] },
}
const exchange = {
  id: 'bist', name: 'Borsa Istanbul', indexName: 'BIST 100', currency: 'TRY', iso2: 'TR', asOf: '2026-10-07',
  series: { values: [100, 101, 102], periods: ['Oct 5', 'Oct 6', 'Oct 7'] },
}
const company = (over = {}) => ({
  id: 'nvidia', name: 'Nvidia', currency: 'USD', currencyName: 'US dollars', level: 229.28, asOf: '2026-10-07',
  series: { values: [230, 229.28], periods: ['Oct 6', 'Oct 7'] }, tickers: ['NVDA'], topicTags: ['nvidia'], ...over,
})
const standing = (...ids) => Object.fromEntries(ids.map((id) => [id, { standing: 'What it is.' }]))
const sources = {
  trends,
  chokepoints: [strait],
  markets: [exchange],
  companies: [company()],
  dispatch: standing('brent', 'fx-try', 'tcmb-rate', 'us-2y', 'wiki-turkey', 'stocks:ARGX', 'mkt:bist', 'poly-ankara-vote', 'poly-closing'),
  now: NOW,
}
const entity = (indicatorId) => ({ mention: 'x', indicatorId, kind: 'k' })
const article = (meta = {}, body = 'A body.', title = 'A Headline') => ({ slug: 's', title, body, meta: { category: 'politics', ...meta } })
const ids = (rows) => rows.map((r) => r.id)

test('a story is offered what it names, where the app has a card for it', () => {
  const rows = candidatesFor(article({ entities: [entity('brent'), entity('copper'), entity('cp:hormuz'), entity('stocks:ARGX'), entity('wiki-turkey')] }), sources)
  // Copper has no paragraph; a company outside the twenty and pageviews have no story chart.
  assert.deepEqual(ids(rows), ['brent', 'cp:hormuz'])
  assert.equal(rows[0].via, 'named')
  assert.match(rows[1].reading, /^2\.7 ships a day.*−40% against its normal.*as of 2026-10-04$/)
  // An old id is read as the one it became.
  assert.deepEqual(ids(candidatesFor(article({ entities: [entity('portwatch-hormuz-tanker')] }), sources)), ['cp:hormuz'])
})

test('what the entity stage read the story as about comes first', () => {
  const rows = candidatesFor(
    article({ entities: [entity('brent'), entity('stocks:NVDA')], subjects: ['stocks:NVDA'], venues: ['mkt:bist'] }, 'Nvidia said so.', 'Nvidia Loses Export Licence'),
    sources,
  )
  assert.deepEqual(rows.map((r) => [r.id, r.via]), [['mkt:bist', 'about'], ['co:nvidia', 'about'], ['brent', 'named']])
  assert.match(rows[1].reading, /US dollars a share/)
})

test('a tracked company is offered only to a story about it, and only on a quote from this week', () => {
  // Named, and not the subject: the entity stage said so.
  assert.deepEqual(ids(candidatesFor(article({ entities: [entity('stocks:NVDA')], subjects: [] }, 'It used chips.', 'Lab Trains New Model'), sources)), [])
  const about = article({ entities: [entity('stocks:NVDA')], subjects: ['stocks:NVDA'] }, 'x', 'Nvidia Loses Export Licence')
  assert.deepEqual(ids(candidatesFor(about, { ...sources, companies: [company({ asOf: '2026-10-01' })] })), [])
  assert.deepEqual(ids(candidatesFor(about, { ...sources, companies: [company({ stale: true })] })), [])
})

test('a country brings its currency and its rate to an economy story, and to no other', () => {
  const body = '[Turkey](country:TR) raised rates as the [US](country:US) watched.'
  assert.deepEqual(ids(candidatesFor(article({ category: 'economy' }, body), sources)), ['fx-try', 'tcmb-rate'])
  assert.equal(candidatesFor(article({ category: 'economy' }, body), sources)[0].via, 'country')
  assert.deepEqual(ids(candidatesFor(article({ category: 'politics' }, body), sources)), [])
})

test('every open contract with a paragraph is on offer, and none in its last days', () => {
  const rows = contractRows(sources)
  assert.deepEqual(ids(rows), ['poly-ankara-vote'])
  assert.equal(rows[0].label, 'Erdogan wins the snap vote?')
  assert.match(rows[0].reading, /closes 2026-11-20$/)
})

test('the prompt shows each story its own series, the contracts once, and what has already run', () => {
  const a = { ...article({ category: 'economy' }, '[Turkey](country:TR) raised rates.', 'Turkey Raises Rates'), slug: '2026-10-08-turkey' }
  const b = { ...article({}, 'A court ruled.', 'Court Jails Minister'), slug: '2026-10-08-court' }
  const candidates = new Map([[a.slug, candidatesFor(a, sources)], [b.slug, candidatesFor(b, sources)]])
  const prompt = chartDeskPrompt([a, b], candidates, contractRows(sources), { 'fx-try': 2 })
  assert.match(prompt, /slug: 2026-10-08-turkey\ncategory: economy\ntitle: Turkey Raises Rates\nplaces: Turkey\n/)
  assert.match(prompt, /Turkey raised rates\./, 'link markup costs its label')
  assert.match(prompt, / {4}fx-try — fx-try: .* — already under 2 stories today\n/)
  assert.match(prompt, /slug: 2026-10-08-court[\s\S]*series:\n {4}\(none\)/)
  assert.equal(prompt.split('poly-ankara-vote — ').length, 2, 'a contract is listed once, not under every story')
  // The examples name nothing the catalog carries (`cycle.md`).
  for (const id of ['cp:hormuz', 'brent', 'co:nvidia']) assert.ok(!prompt.includes(`"${id}"`), id)
})

test('only an id the story was shown, with one of the three roles, is kept', () => {
  const candidates = /** @type {any} */ (new Map([
    ['a', [{ id: 'brent' }]],
    ['b', [{ id: 'cp:hormuz' }]],
    ['c', []],
    ['d', [{ id: 'brent' }]],
    ['e', [{ id: 'brent' }]],
    ['unanswered', [{ id: 'brent' }]],
  ]))
  const contracts = /** @type {any} */ ([{ id: 'poly-ankara-vote' }])
  const picks = parseChartDesk(
    {
      a: { chart: 'brent', role: 'subject' },
      // Another story's series, and an alias of this one's.
      b: { chart: 'portwatch-hormuz-tanker', role: 'cause' },
      c: { chart: 'poly-ankara-vote', role: 'decides' },
      d: { chart: 'cp:hormuz', role: 'subject' },
      e: { chart: 'brent', role: 'context' },
      stranger: { chart: 'brent', role: 'subject' },
    },
    candidates,
    contracts,
  )
  assert.deepEqual([...picks], [
    ['a', { chart: 'brent', role: 'subject' }],
    ['b', { chart: 'cp:hormuz', role: 'cause' }],
    ['c', { chart: 'poly-ankara-vote', role: 'decides' }],
    ['d', { chart: null }],
    ['e', { chart: null }],
  ])
  // Read and given none is an answer; not answered for is not in the map.
  assert.equal(picks.has('unanswered'), false)
  assert.deepEqual([...parseChartDesk({ a: { chart: null } }, candidates, contracts)], [['a', { chart: null }]])
  assert.equal(parseChartDesk('no', candidates, contracts).size, 0)
  assert.equal(parseChartDesk([], candidates, contracts).size, 0)
})

test('the last day counts, by when a story was published', () => {
  const at = (h) => NOW - h * 3_600_000
  assert.deepEqual(
    recentCharts([{ chart: 'cp:hormuz', at: at(1) }, { chart: 'portwatch-hormuz-tanker', at: at(23) }, { chart: 'cp:hormuz', at: at(25) }, { chart: 'brent', at: at(2) }, { at: at(2) }], NOW),
    { 'cp:hormuz': 2, brent: 1 },
  )
})

test('a series runs once a day unless the story is about it', () => {
  const subject = /** @type {const} */ ({ chart: 'cp:hormuz', role: 'subject' })
  const cause = /** @type {const} */ ({ chart: 'cp:hormuz', role: 'cause' })
  assert.equal(OTHER_DAY_CAP, 1)

  // In a batch, the story about the strait keeps its line whatever the order.
  const { kept, capped } = applyCaps(['fuel', 'tankers'], new Map(/** @type {any} */ ([['fuel', cause], ['tankers', subject]])), {})
  assert.deepEqual(kept.get('tankers'), subject)
  assert.deepEqual(kept.get('fuel'), { chart: null })
  assert.deepEqual(capped, [{ slug: 'fuel', id: 'cp:hormuz', role: 'cause', under: 1 }])

  // Already under a story today: a citing story does without, a story about it does not.
  assert.deepEqual(applyCaps(['fuel'], new Map([['fuel', cause]]), { 'cp:hormuz': 1 }).kept.get('fuel'), { chart: null })
  assert.deepEqual(applyCaps(['tankers'], new Map([['tankers', subject]]), { 'cp:hormuz': 1 }).kept.get('tankers'), subject)
  // And even that has a ceiling.
  assert.deepEqual(applyCaps(['tankers'], new Map([['tankers', subject]]), { 'cp:hormuz': SUBJECT_DAY_CAP }).kept.get('tankers'), { chart: null })

  // No chart is passed through, and a story with no answer stays out.
  const none = applyCaps(['a', 'b'], new Map([['a', { chart: null }]]), {})
  assert.deepEqual([...none.kept], [['a', { chart: null }]])
})
