import assert from 'node:assert/strict'
import { test } from 'node:test'
import { headlineName, MOVER_PCT, moverLine, unexplainedMovers } from './company-gaps.js'
import { namedSeries, pickTracked, seriesOf } from './tracked-stories.js'

const NOW = Date.parse('2026-10-04T10:00:00Z')

/** Eight daily closes ending Oct 2, the last `pct` above the one a week before. */
const company = (id, name, pct, over = {}) => ({
  id,
  name,
  about: 'chipmaking machines',
  asOf: '2026-10-02',
  series: {
    periods: ['Sep 23', 'Sep 24', 'Sep 25', 'Sep 28', 'Sep 29', 'Sep 30', 'Oct 1', 'Oct 2'],
    values: [100, 100, 100, 100, 100, 100, 100, 100 + pct],
  },
  tickers: [id.toUpperCase()],
  topicTags: [id],
  ...over,
})

const story = (title, date, over = {}) => ({ title, date, concepts: [], entities: [], ...over })

test('a share that moved sharply with no story about it is a mover', () => {
  const movers = unexplainedMovers([company('asml', 'ASML', 8.6)], [], { now: NOW })
  assert.deepEqual(movers, [
    { id: 'asml', name: 'ASML', about: 'chipmaking machines', pct: 8.6, keyword: 'ASML' },
  ])
  assert.equal(moverLine(movers[0]), '- ASML (chipmaking machines): up 8.6% in a week')
})

test('a fall counts as a rise does', () => {
  const [mover] = unexplainedMovers([company('tesla', 'Tesla', -9)], [], { now: NOW })
  assert.equal(mover.pct, -9)
  assert.equal(moverLine(mover), '- Tesla (chipmaking machines): down 9% in a week')
})

test('an ordinary week is not a mover', () => {
  assert.deepEqual(unexplainedMovers([company('asml', 'ASML', MOVER_PCT - 0.5)], [], { now: NOW }), [])
})

test('a story about the company inside the fortnight explains it', () => {
  const co = [company('asml', 'ASML', 8.6)]
  const recent = story('ASML Nears Fully Booked 2027', '2026-09-28T10:00:00Z')
  assert.deepEqual(unexplainedMovers(co, [recent], { now: NOW }), [])
  // July's story is not why the share moved in October.
  const old = story('ASML Nears Fully Booked 2027', '2026-07-15T10:00:00Z')
  assert.equal(unexplainedMovers(co, [old], { now: NOW }).length, 1)
})

test('a story that only mentions the company explains nothing', () => {
  const mention = story('Dutch exports rise on chip demand', '2026-09-30T10:00:00Z', {
    concepts: ['Netherlands', 'Export', 'Semiconductor', 'ASML'],
    entities: [{ indicatorId: 'stocks:ASML', mention: 'ASML' }],
    subjects: [],
  })
  assert.equal(unexplainedMovers([company('asml', 'ASML', 8.6)], [mention], { now: NOW }).length, 1)
})

test('an old quote is last week’s move, and a stale one is none', () => {
  const old = company('asml', 'ASML', 8.6, { asOf: '2026-09-25' })
  assert.deepEqual(unexplainedMovers([old], [], { now: NOW }), [])
  assert.deepEqual(unexplainedMovers([company('asml', 'ASML', 8.6, { stale: true })], [], { now: NOW }), [])
})

test('the largest moves come first, three at most', () => {
  const movers = unexplainedMovers(
    [company('a', 'A', 8), company('b', 'B', -12), company('c', 'C', 9), company('d', 'D', 10)],
    [],
    { now: NOW },
  )
  assert.deepEqual(movers.map((m) => m.id), ['b', 'd', 'c'])
})

test('a company is searched by the word a headline prints, and not at all by an ordinary word', () => {
  assert.equal(headlineName({ name: 'Samsung Electronics', topicTags: ['samsung'] }), 'Samsung')
  assert.equal(headlineName({ name: 'Saudi Aramco', topicTags: ['aramco'] }), 'Aramco')
  assert.equal(headlineName({ name: 'Berkshire Hathaway', topicTags: ['berkshire hathaway', 'berkshire', 'buffett'] }), 'Berkshire')
  assert.equal(headlineName({ name: 'AMD', topicTags: ['advanced micro devices', 'amd'] }), 'AMD')
  assert.equal(headlineName({ name: 'Eli Lilly', topicTags: ['mounjaro'] }), 'Eli Lilly')
  const [apple] = unexplainedMovers(
    [company('apple', 'Apple', 9, { topicTags: ['apple inc', 'iphone'], commonName: 'apple' })],
    [],
    { now: NOW },
  )
  assert.equal(apple.keyword, null)
})

test('a mover’s report takes a slot of its own among the tracked stories', () => {
  const named = namedSeries([{ id: 'asml', keyword: 'ASML' }, { id: 'apple', keyword: null }])
  assert.equal(named.length, 1)
  assert.equal(seriesOf('ASML lifts 2027 outlook as orders jump', named), 'co:asml')
  assert.equal(seriesOf('Plasmlab opens a new site', named), 'other', 'never inside a word')
  // A charted series still outranks the name: this is the strait's story.
  assert.equal(seriesOf('ASML cargo held as tankers hit in Hormuz', named), 'cp:hormuz')

  let n = 0
  const art = (title) => ({
    title,
    url: `https://reuters.com/${n++}`,
    source: { uri: `outlet-${n}`, title: 'x' },
    dateTimePub: '2026-10-04T08:00:00Z',
    eventUri: null,
  })
  const others = ['A headline that names nothing', 'Another one that names nothing', 'A third naming nothing']
  const picked = pickTracked([...others.map(art), art('ASML lifts 2027 outlook as orders jump')], { named, perSeries: 2 })
  assert.ok(
    picked.some((g) => g[0].title.startsWith('ASML')),
    'two `other` slots would have gone to the first two unnamed headlines',
  )
})
