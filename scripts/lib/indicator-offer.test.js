import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractEntities } from './entity-registry.js'
import { ageDays, carriedLevels, chartProblem, citesFigure, offerFor, weekMove } from './indicator-offer.js'

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
  // Which series is drawn is the chart desk's to say, not the offer's.
  assert.equal('chart' in row, false)
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

const iso = (t) => new Date(t).toISOString().slice(0, 10)
const label = (date) => new Date(`${date}T00:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
/** Every `step`th day from `from` to `to`, weekends left out when `weekdays`. */
const calendar = (from, to, { step = 1, weekdays = false } = {}) => {
  const out = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += step * 86400_000) {
    const dow = new Date(t).getUTCDay()
    if (!weekdays || (dow !== 0 && dow !== 6)) out.push(iso(t))
  }
  return out
}
/** A row as FRED's arrive: one value a date, each with its label. */
const dated = (id, dates, over = {}) =>
  series({ id, values: dates.map((_, i) => 100 + i), dates, periods: dates.map(label), asOf: dates.at(-1), ...over })
const offerOf = (title, ...indicators) => offerFor({ title }, { ...sources, trends: { ...trends, indicators } }).indicators

test('a daily series’ wider move is a month of days, not thirty observations', () => {
  // A price that skips weekends, as Brent does: 56 closes from 13 July to 28
  // September. Thirty closes back is 17 August, six weeks; thirty days back is
  // a Saturday, so the anchor is the Friday before it.
  const dates = calendar('2026-07-13', '2026-09-28', { weekdays: true })
  const [brent] = offerOf('Brent crude falls', dated('brent', dates, { label: 'Brent crude' }))
  const at = (date) => 100 + dates.indexOf(date)
  assert.equal(dates.length, 56)
  assert.deepEqual(brent.wider, {
    pct: Number((((at('2026-09-28') - at('2026-08-28')) / at('2026-08-28')) * 100).toFixed(1)),
    over: '31 days',
  })
  assert.notEqual(brent.wider.pct, Number((((at('2026-09-28') - at('2026-08-17')) / at('2026-08-17')) * 100).toFixed(1)))
  // The week beside it is unchanged.
  assert.equal(brent.recent.over, '7 days')
})

test('a weekly print carried as daily has its weeks counted as weeks', () => {
  // Freddie Mac's Thursday survey: thirteen prints. Twelve of them were
  // offered as "12 days".
  const thursdays = calendar('2026-07-02', '2026-09-24', { step: 7 })
  const [mortgage] = offerOf('US mortgage rates climb again', dated('us-mortgage', thursdays, { label: 'US 30-year mortgage rate', unit: '%' }))
  assert.equal(thursdays.length, 13)
  assert.deepEqual(mortgage.wider, { pct: Number(((5 / 107) * 100).toFixed(1)), over: '35 days' })
  assert.deepEqual(mortgage.recent, { pct: Number(((1 / 111) * 100).toFixed(1)), over: '7 days' })
})

test('with no dates on the row, the labels and `asOf` date it, across a New Year too', () => {
  // The fixture's Brent: 31 labels, 29 August to 28 September, 80 to 110.
  const brent = offer('Brent crude falls').indicators.find((r) => r.id === 'brent')
  assert.deepEqual(brent.wider, { pct: 37.5, over: '30 days' })
  // A currency's 30 days of history is a 29-day span, and says so.
  const [lira] = offerOf('Turkey’s lira slides', series({ id: 'fx-try', label: 'Lira', values: Array.from({ length: 30 }, (_, i) => 40 + i), periods: days(30, '2026-09-28') }))
  assert.deepEqual(lira.wider, { pct: 72.5, over: '29 days' })
  // 6 December to 5 January: the December labels are the year before `asOf`.
  const acrossNewYear = series({ id: 'brent', label: 'Brent crude', asOf: '2027-01-05', periods: days(31, '2027-01-05') })
  const [row] = offerFor(
    { title: 'Brent crude falls' },
    { ...sources, now: Date.parse('2027-01-06T12:00:00Z'), trends: { ...trends, indicators: [acrossNewYear] } },
  ).indicators
  assert.deepEqual(row.wider, { pct: 37.5, over: '30 days' })
  assert.deepEqual(row.recent, { pct: 6.8, over: '7 days' })
})

test('a monthly print still counts prints, and names them months', () => {
  const cpi = offer('US inflation rises again').indicators.find((r) => r.id === 'us-cpi')
  assert.deepEqual(cpi.recent, { pct: 7.4, over: '1 month' })
  assert.deepEqual(cpi.wider, { pct: 7.4, over: '1 month' })
  const months = Array.from({ length: 24 }, (_, i) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(i + 8) % 12]} ${i < 4 ? 2024 : i < 16 ? 2025 : 2026}`)
  const [long] = offerOf('US inflation rises again', series({ id: 'us-cpi', label: 'US inflation', cadence: 'monthly', unit: '%', asOf: '2026-08-01', values: months.map((_, i) => 100 + i), periods: months }))
  assert.equal(long.period, 'Aug 2026')
  assert.deepEqual([long.recent.over, long.wider.over], ['3 months', '12 months'])
})

test('an exchange’s wider move is a month of days by its dates', () => {
  // 45 sessions to Friday 25 September; thirty of them back is seven weeks.
  const dates = calendar('2026-07-27', '2026-09-25', { weekdays: true })
  const tse = {
    id: 'tse',
    name: 'Tokyo Stock Exchange',
    indexName: 'Nikkei 225',
    currency: 'JPY',
    asOf: '2026-09-25',
    series: { values: dates.map((_, i) => 50000 + i * 100), periods: dates.map(label), dates, completed: dates.map(() => true) },
  }
  const [row] = offerFor({ title: 'The Nikkei 225 fell 3%' }, { ...sources, markets: [tse] }).indicators
  assert.equal(row.id, 'mkt:tse')
  // Thirty days before the 25th is Wednesday 26 August.
  const at = (date) => 50000 + dates.indexOf(date) * 100
  assert.deepEqual(row.wider, { pct: Number((((at('2026-09-25') - at('2026-08-26')) / at('2026-08-26')) * 100).toFixed(1)), over: '30 days' })
})

test('an exchange open at the fetch is read at its last close, and still has its week', () => {
  // Monday 28 September, Tokyo open: the series ends in that minute's price,
  // marked uncompleted, and `asOf` is Friday's close. 12 of 26 exchanges were
  // in this state in the snapshot of 2026-10-09 10:09.
  const dates = calendar('2026-07-27', '2026-09-28', { weekdays: true })
  const closes = dates.map((_, i) => 50000 + i * 100)
  closes[closes.length - 1] = 51234.5 // not a close
  const tse = {
    id: 'tse',
    name: 'Tokyo Stock Exchange',
    indexName: 'Nikkei 225',
    currency: 'JPY',
    asOf: '2026-09-25',
    series: { values: closes, periods: dates.map(label), dates, completed: dates.map((d) => d !== '2026-09-28') },
  }
  const [row] = offerFor({ title: 'The Nikkei 225 fell 3%' }, { ...sources, now: Date.parse('2026-09-28T03:00:00Z'), markets: [tse] }).indicators
  const at = (date) => 50000 + dates.indexOf(date) * 100
  assert.equal(row.asOf, '2026-09-25')
  assert.equal(row.level, at('2026-09-25'), 'the close `asOf` dates, not the open session’s price')
  const pct = (from, to) => Number((((at(to) - at(from)) / at(from)) * 100).toFixed(1))
  assert.deepEqual(row.recent, { pct: pct('2026-09-18', '2026-09-25'), over: '7 days' })
  assert.deepEqual(row.wider, { pct: pct('2026-08-26', '2026-09-25'), over: '30 days' })
  // One completed close is not a series to read a level off.
  const young = { ...tse, series: { values: [50000, 50100], periods: ['Sep 25', 'Sep 28'], dates: ['2026-09-25', '2026-09-28'], completed: [true, false] } }
  assert.deepEqual(offerFor({ title: 'The Nikkei 225 fell 3%' }, { ...sources, markets: [young] }).indicators, [])
})

test('a week is counted from the newest observation, wherever `asOf` stands', () => {
  const values = Array.from({ length: 10 }, (_, i) => 100 + i)
  // A label a day past `asOf` is this year's, not last year's: the week was
  // null for every series that ended in an open session's bar.
  assert.deepEqual(weekMove({ values, periods: days(10, '2026-09-29'), asOf: '2026-09-28' }), { pct: Number(((7 / 102) * 100).toFixed(1)), over: '7 days' })
  // `asOf` past the newest label, across a New Year: the label is December's.
  assert.deepEqual(weekMove({ values, periods: days(10, '2026-12-31'), asOf: '2027-01-02' }), { pct: Number(((7 / 102) * 100).toFixed(1)), over: '7 days' })
  // And the plain case is as it was.
  assert.deepEqual(weekMove({ values, periods: days(10, '2026-09-28'), asOf: '2026-09-28' }), { pct: Number(((7 / 102) * 100).toFixed(1)), over: '7 days' })
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

test('a chart stands only on a series the cycle publishes', () => {
  assert.equal(chartProblem('cp:hormuz', { known: new Set(['cp:hormuz']) }), null)
  assert.match(chartProblem('made-up', { known: new Set(['brent']) }), /not a known series/)
  assert.equal(chartProblem('  ', { known: new Set(['brent']) }), 'empty')
})

test('a level counts as carried by the stories that name the series and print it', () => {
  const rows = [{ id: 'cp:hormuz', level: 3.1 }, { id: 'brent', level: 125.4 }]
  const names = (id) => ({ entities: [{ mention: 'x', indicatorId: id, kind: 'k' }] })
  const articles = [
    { meta: names('cp:hormuz'), body: 'Traffic averaged 3.1 ships a day as of 27 September.' },
    { meta: { chart: 'cp:hormuz' }, body: 'Hormuz traffic ran 44% below normal, at 3.1 ships a day.' },
    // Names the strait and prints another number: not the level.
    { meta: names('cp:hormuz'), body: 'Three tankers were hit near the strait, 31 crew rescued.' },
    // Prints 3.1 and never names the strait.
    { meta: {}, body: 'Growth slowed to 3.1%.' },
    // Half a per cent, not five: 120 is not Brent at 125.4.
    { meta: names('brent'), body: 'Some 120 ships waited as Brent rose.' },
  ]
  assert.deepEqual(carriedLevels(articles, rows), { 'cp:hormuz': 2 })
})

test('cite check: the body quotes one of the row’s figures, within rounding', () => {
  const row = { level: 3.1, normal: 6.3, vsNormalPct: -51 }
  assert.equal(citesFigure('Traffic fell to 3.1 ships a day.', row), true)
  assert.equal(citesFigure('Traffic is down 51% on its normal.', row), true)
  assert.equal(citesFigure('[Iran](country:IR) seized 2 tankers.', row), false)
})
