import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractEntities } from './entity-registry.js'
import { ageDays, chartProblem, citesFigure, offerFor } from './indicator-offer.js'

const NOW = Date.parse('2026-09-30T12:00:00Z')

const days = (n, end = '2026-09-30') => {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.parse(`${end}T00:00:00Z`) - i * 86400_000)
    out.push(d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }))
  }
  return out
}

const series = (over) => ({
  source: 'fred',
  cadence: 'daily',
  unit: '$/bbl',
  values: Array.from({ length: 31 }, (_, i) => 80 + i),
  periods: days(31, over.asOf ?? '2026-09-28'),
  asOf: '2026-09-28',
  topicTags: [],
  ...over,
})

const contract = (id, label, tags, values = [40, 40, 40, 40, 40, 40, 40, 30, 25, 21]) => ({
  id,
  label,
  source: 'polymarket',
  cadence: 'daily',
  unit: '%',
  topicTags: ['prediction', 'polymarket', 'odds', ...tags],
  values,
  periods: days(values.length),
  asOf: '2026-09-30',
})

const trends = {
  asOf: '2026-09-30',
  indicators: [
    series({ id: 'brent', label: 'Brent crude' }),
    series({ id: 'wheat', label: 'Wheat', cadence: 'monthly', asOf: '2026-09-01', periods: undefined, values: [300, 310] }),
    series({ id: 'us-cpi', label: 'US inflation', cadence: 'monthly', unit: '%', asOf: '2026-08-01', values: [2.7, 2.9], periods: ['Jul 2026', 'Aug 2026'] }),
    series({ id: 'fed-funds', label: 'Fed target rate', cadence: 'monthly', unit: '%', asOf: '2026-09-01', values: [3.75, 4], periods: ['Aug 2026', 'Sep 2026'] }),
    series({ id: 'fx-try', label: 'Lira', asOf: '2026-09-17' }),
    contract('poly-invade', 'Will the U.S. invade Iran before 2027?', ['iran']),
    contract('poly-truce', 'Israel-Iran ceasefire holds to Oct 31?', ['iran', 'israel', 'ceasefire']),
    contract('poly-hormuz', 'Hormuz traffic normal by Dec 31?', ['hormuz']),
    contract('poly-lepen', 'Marine Le Pen wins France 2027?', ['election']),
    contract('poly-fed', 'Another Fed rate hike in 2026?', ['fed']),
    contract('poly-pm', 'Netanyahu next Israeli PM?', ['israel']),
    contract('poly-putin', 'Putin out as President of Russia by June 30, 2027?', ['ukraine']),
  ],
  events: [
    { id: 'fomc-2026-10', title: 'FOMC decision', institution: 'Federal Reserve', date: '2026-10-28', topicTags: ['fomc', 'federal reserve', 'fed', 'interest rate'], countryTags: ['US'] },
    { id: 'uk-cpi-2026-10', title: 'UK CPI', institution: 'ONS', date: '2026-10-21', topicTags: ['uk inflation', 'consumer price index', 'cpi'], countryTags: ['GB'] },
    { id: 'boj-2026-12', title: 'BoJ decision', institution: 'Bank of Japan', date: '2026-12-18', topicTags: ['bank of japan', 'boj'], countryTags: ['JP'] },
  ],
}

const hormuz = {
  id: 'hormuz',
  name: 'Strait of Hormuz',
  last7Avg: { n_total: 3.1 },
  baseline90Avg: { n_total: 6.3 },
  delta7vs90: { n_total: -0.508 },
  series: { periods: ['Sep 26', 'Sep 27'], total: [3, 2] },
  asOf: '2026-09-27',
}

const dispatch = {
  brent: { standing: 'The global oil benchmark.' },
  'poly-truce': { standing: 'A contract on the truce.' },
  'poly-hormuz': { standing: 'A contract on traffic.' },
  'us-cpi': { standing: 'US consumer prices.' },
}

const sources = { trends, chokepoints: [hormuz], markets: [], dispatch, now: NOW }
const offer = (title, angle = '', concepts = []) => offerFor({ title, angle, concepts }, sources)
const ids = (o) => o.indicators.map((r) => r.id)

test('a strait story gets the strait, with the numbers its card prints', () => {
  const o = offer('Iran turns back tankers in the Strait of Hormuz')
  const row = o.indicators.find((r) => r.id === 'cp:hormuz')
  assert.ok(row, 'cp:hormuz was offered')
  assert.equal(row.kind, 'strait')
  assert.equal(row.level, 3.1)
  assert.equal(row.normal, 6.3)
  assert.equal(row.vsNormalPct, -51)
  assert.equal(row.chart, true)
})

test('the eclipse in the wheat fields still gets nothing', () => {
  const o = offerFor(
    {
      title: 'Total solar eclipse crosses Spain',
      angle: 'Millions watch the first total eclipse over mainland Spain in a century.',
      sources: [{ body: 'Viewers gathered in wheat fields and rolling hills.' }],
    },
    sources,
  )
  assert.deepEqual(o.indicators, [])
})

test('a contract needs its subject, not only a country it mentions', () => {
  assert.ok(!ids(offer('Iran executes three protesters')).some((id) => id.startsWith('poly-')))
  assert.ok(ids(offer('Israel strikes Iran again', 'The ceasefire is fraying.')).includes('poly-truce'))
  assert.ok(ids(offer('Tanker traffic through Hormuz stalls')).includes('poly-hormuz'))
  // A name is matched in its own case: marine biology is not Marine Le Pen.
  assert.ok(!ids(offer('Marine heatwave bleaches reef', 'marine le pen')).includes('poly-lepen'))
  assert.ok(ids(offer('Marine Le Pen barred from ballot')).includes('poly-lepen'))
})

test('two countries, or a country and its demonym, are not a contract’s subject', () => {
  // Replayed: settlers in Jalud and a diverted flight both got the Netanyahu
  // contract off "Israel" + "Israeli"; every war story got Putin's off Russia +
  // Ukraine.
  assert.ok(!ids(offer('Settlers torch homes', 'Israeli settlers attacked homes as Israel expanded')).includes('poly-pm'))
  assert.ok(!ids(offer('Russia strikes Kharkiv farm', 'Ukraine says Russia hit a farm')).includes('poly-putin'))
  assert.ok(ids(offer('Netanyahu calls early vote')).includes('poly-pm'))
})

test('a question made of single words needs two of them', () => {
  // Replayed over two days of selections: "Google best AI model?" was offered
  // to ten stories that said AI or Google, "Balance of Power" to power stocks.
  const withAi = {
    ...sources,
    trends: {
      ...trends,
      indicators: [
        ...trends.indicators,
        contract('poly-google', 'Google best AI model end of Oct 2026?', []),
        contract('poly-congress', '2026 Balance of Power: R Senate, R House', []),
      ],
    },
  }
  const odds = (title, angle) => offerFor({ title, angle }, withAi).indicators.filter((r) => r.kind === 'odds').map((r) => r.id)
  assert.deepEqual(odds('Delhi roads to get 2,500 AI cameras'), [])
  assert.deepEqual(odds('Viral Google Maps images show Gaza ruins'), [])
  assert.deepEqual(odds('Power stocks fall despite grid scheme'), [])
  assert.deepEqual(odds('Google unveils Gemini 4 Argon', 'Its most powerful AI model yet'), ['poly-google'])
  assert.deepEqual(odds('Republicans defend Senate and House majorities'), ['poly-congress'])
})

test('a contract moves in points over days, not percent over observations', () => {
  const row = offer('Israel strikes Iran again', 'The ceasefire is fraying.').indicators.find((r) => r.id === 'poly-truce')
  assert.equal(row.level, 21)
  assert.deepEqual(row.recent, { points: -19, over: '7 days' })
})

test('a contract in its last days is not offered', () => {
  const closing = { ...contract('poly-fees', 'Iran charges Hormuz fees by September 30?', ['iran', 'hormuz']), endDate: '2026-09-30T23:59:00Z' }
  const o = offerFor({ title: 'Iran threatens Hormuz charterers' }, { ...sources, trends: { ...trends, indicators: [...trends.indicators, closing] } })
  assert.deepEqual(o.indicators.filter((r) => r.kind === 'odds').map((r) => r.id), ['poly-hormuz'])
})

test('at most one contract per story', () => {
  const o = offer('Hormuz blockade: Israel and Iran ceasefire strained')
  assert.equal(o.indicators.filter((r) => r.kind === 'odds').length, 1)
})

test('a monthly print is aged from the end of the month it measures', () => {
  assert.equal(ageDays('2026-08-01', 'monthly', Date.parse('2026-09-30T00:00:00Z')), 30)
  assert.ok(ids(offer('US inflation rises again')).includes('us-cpi'))
  const cpi = offer('US inflation rises again').indicators.find((r) => r.id === 'us-cpi')
  assert.equal(cpi.period, 'Aug 2026')
  // A daily series 13 days old is not a level any more.
  const lira = offer('Turkey’s lira slides')
  assert.ok(!ids(lira).includes('fx-try'))
  assert.equal(lira.stale, 1)
})

test('a daily series’ recent move is the week the chart prints, in calendar days', () => {
  const brent = offer('Brent crude falls').indicators.find((r) => r.id === 'brent')
  // 110 on Sep 28 against 103 on Sep 21.
  assert.deepEqual(brent.recent, { pct: 6.8, over: '7 days' })
  // No close within three days of a week back: no week, rather than an
  // elastic one.
  const gappy = series({ id: 'brent', label: 'Brent crude', values: [100, 110], periods: ['Sep 10', 'Sep 28'] })
  const o = offerFor({ title: 'Brent crude falls' }, { ...sources, trends: { ...trends, indicators: [gappy] } })
  assert.equal(o.indicators[0].recent, null)
})

test('only a series the desk has written up is chartable', () => {
  const o = offer('Brent crude falls as the Fed hikes')
  assert.equal(o.indicators.find((r) => r.id === 'brent').chart, true)
  assert.equal(o.indicators.find((r) => r.id === 'fed-funds').chart, false)
})

test('the calendar offers the next decision on the story’s subject', () => {
  assert.deepEqual(
    offer('The Fed signals a pause').calendar.map((e) => e.title),
    ['FOMC decision'],
  )
  // A generic tag needs the event's country beside it: Pakistan's CPI is not
  // the UK's release.
  assert.deepEqual(offer('Pakistan consumer price index jumps', 'cpi').calendar, [])
  assert.deepEqual(offer('Britain’s CPI surprises', 'UK inflation').calendar.map((e) => e.title), ['UK CPI'])
  // Beyond 60 days is not what's next.
  assert.deepEqual(offer('Bank of Japan holds').calendar, [])
})

test('rules: Fed is the bank only when capitalised, and IPC is not an exchange', () => {
  const found = (text) => extractEntities(text).resolved.map((e) => e.indicatorId)
  assert.deepEqual(found('The Fed raised rates'), ['fed-funds'])
  assert.deepEqual(found('Voters are fed up'), [])
  assert.deepEqual(found('IPC phase 5 famine declared'), [])
  assert.ok(found('The Nikkei 225 fell 3%').includes('mkt:tse'))
  assert.ok(found('Hormuz traffic').includes('cp:hormuz'))
})

test('a chart stands only if this story was offered it as chartable', () => {
  const offered = [
    { id: 'brent', chart: true },
    { id: 'fed-funds', chart: false },
  ]
  assert.equal(chartProblem('brent', { offered }), null)
  assert.match(chartProblem('wti', { offered }), /not offered/)
  assert.match(chartProblem('fed-funds', { offered }), /no chart/)
  // No selection to check against: anything the build resolves stands.
  assert.equal(chartProblem('cp:hormuz', { known: new Set(['cp:hormuz']) }), null)
  assert.match(chartProblem('made-up', { known: new Set(['brent']) }), /not a known series/)
})

test('cite check: the body quotes one of the row’s figures, within rounding', () => {
  const row = { level: 3.1, normal: 6.3, vsNormalPct: -51 }
  assert.equal(citesFigure('Traffic fell to 3.1 ships a day.', row), true)
  assert.equal(citesFigure('Traffic is down 51% on its normal.', row), true)
  assert.equal(citesFigure('[Iran](country:IR) seized 2 tankers.', row), false)
})
