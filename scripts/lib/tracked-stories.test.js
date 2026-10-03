import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractEntities } from './entity-registry.js'
import { pickTracked, seriesOf, TRACKED_KEYWORDS } from './tracked-stories.js'

let n = 0
const art = (title, outlet, over = {}) => ({
  title,
  url: `https://${outlet}/${n++}`,
  source: { uri: outlet, title: outlet },
  dateTimePub: '2026-10-01T10:00:00Z',
  eventUri: null,
  ...over,
})

const titles = (groups) => groups.map((g) => g[0].title)

test('several outlets on one event are one story, and it comes first', () => {
  const picked = pickTracked([
    art('Three oil tankers hit by projectiles in Hormuz strait', 'reuters.com', { dateTimePub: '2026-10-01T12:00:00Z' }),
    art('Oil prices barely changed as investors assess talks', 'reuters.com', { eventUri: 'eng-1', dateTimePub: '2026-10-01T01:00:00Z' }),
    art('Is Iran losing its leverage over the Strait of Hormuz?', 'aljazeera.com', { eventUri: 'eng-1', dateTimePub: '2026-09-30T12:00:00Z' }),
  ])
  assert.equal(picked.length, 2)
  assert.equal(picked[0].length, 2)
  assert.equal(picked[0][0].source.uri, 'reuters.com', 'newest leads its group')
  assert.equal(picked[1][0].title, 'Three oil tankers hit by projectiles in Hormuz strait')
})

test('an outlet is counted once per event', () => {
  const picked = pickTracked([
    art('Consumer inflation eases to 10.3pc', 'dawn.com', { eventUri: 'eng-2' }),
    art('Inflation hits Peshawar households hard', 'dawn.com', { eventUri: 'eng-2' }),
  ])
  assert.equal(picked.length, 1)
  assert.equal(picked[0].length, 1)
})

test('commentary, opinion and live blogs take no slot', () => {
  const picked = pickTracked([
    art("COMMENTARY: ENERGY WATCH: Bangladesh's coal turn a bad sign for LNG", 'reuters.com'),
    art("Opinion | How China became the world's gold superpower", 'scmp.com'),
    art('Live Updates: Bitcoin flat near $84,000', 'coindesk.com'),
    art('VIEW Bond markets take a drubbing again', 'reuters.com'),
    art('Yen Weakens as BOJ Summary Damps Bets for Back-to-Back Rate Hike', 'bloomberg.com'),
  ])
  assert.deepEqual(titles(picked), ['Yen Weakens as BOJ Summary Damps Bets for Back-to-Back Rate Hike'])
})

test('a word that only starts like a label is still a report', () => {
  // "Viewers", "Livestock", "Columbia" — the label has to be a whole word.
  const picked = pickTracked([
    art('Livestock losses mount as wheat prices climb', 'reuters.com'),
    art('Columbia study links crude spills to asthma', 'bbc.com'),
  ])
  assert.equal(picked.length, 2)
})

test('an event already in the feed, or an article already in a panel, is skipped', () => {
  const inPanel = art('Rupee to weaken as oil, US yields weigh', 'reuters.com')
  const picked = pickTracked(
    [art('Korea Disputes Claim It Agreed to Invest in Alaska LNG', 'bloomberg.com', { eventUri: 'eng-9' }), inPanel],
    { usedEventUris: new Set(['eng-9']), usedUrls: new Set([inPanel.url]) },
  )
  assert.equal(picked.length, 0)
})

test('one outlet leads at most two single-outlet stories', () => {
  const picked = pickTracked([
    art('Tanker Congestion Shunts Vital Transfers Farther From Hormuz', 'bloomberg.com', { dateTimePub: '2026-10-01T09:00:00Z' }),
    art('Yen Weakens as BOJ Summary Damps Rate-Hike Bets', 'bloomberg.com', { dateTimePub: '2026-10-01T08:00:00Z' }),
    art('Iraq Deepens October Crude Price Discounts', 'bloomberg.com', { dateTimePub: '2026-10-01T07:00:00Z' }),
    art('Gold inches higher as softer data dims hike bets', 'reuters.com', { dateTimePub: '2026-10-01T06:00:00Z' }),
  ])
  assert.deepEqual(
    picked.map((g) => g[0].source.uri),
    ['bloomberg.com', 'bloomberg.com', 'reuters.com'],
  )
})

test('a strait outranks the commodity in the same headline', () => {
  assert.equal(seriesOf('Three oil tankers hit by projectiles in Hormuz strait'), 'cp:hormuz')
  assert.equal(seriesOf('Oil prices barely changed as investors assess talks'), 'brent')
  assert.equal(seriesOf('10-year Treasury yields highest since 2002'), 'us-10y')
  assert.equal(seriesOf('OPEC ministers meet in Vienna'), 'other')
})

test('every series takes a slot before any takes a second', () => {
  // The first real run: two wires each on three Fed speakers and a bank's
  // bitcoin target took six of eight slots, and Hormuz — one Reuters report —
  // took none.
  const fed = (title, ev, hour) => [
    art(title, 'reuters.com', { eventUri: ev, dateTimePub: `2026-10-01T${hour}:00:00Z` }),
    art(`${title} (2)`, 'bloomberg.com', { eventUri: ev, dateTimePub: `2026-10-01T${hour}:00:00Z` }),
  ]
  const picked = pickTracked(
    [
      ...fed("Fed's Kashkari Says He Doesn't Know How High Rates Need to Go", 'eng-1', '14'),
      ...fed("Fed's Jefferson Says Officials May Need More Time", 'eng-2', '13'),
      ...fed('Top Fed official signals rates on hold in October', 'eng-3', '12'),
      art('Three oil tankers hit by projectiles in Hormuz strait', 'reuters.com', { dateTimePub: '2026-10-01T06:00:00Z' }),
      art('Yen Weakens as BOJ Summary Damps Rate-Hike Bets', 'bloomberg.com', { dateTimePub: '2026-10-01T02:00:00Z' }),
    ],
    { slots: 4 },
  )
  // The yen headline names the Bank of Japan, whose rate is a series of its
  // own since 2026-10-03 (`boj-rate`); it was filed under the yen before.
  // Either way it is one more series, and takes its slot before the Fed's
  // second.
  assert.deepEqual(
    picked.map((g) => seriesOf(g[0].title)),
    ['fed-funds', 'cp:hormuz', 'boj-rate', 'fed-funds'],
  )
})

test('no series takes more than two', () => {
  const many = Array.from({ length: 6 }, (_, i) => art(`Bitcoin story ${i}`, `outlet${i}.com`))
  assert.equal(pickTracked(many).length, 2)
})

test('the cap on slots holds, newest first', () => {
  const names = ['Brent', 'Hormuz', 'yen', 'lira', 'gold', 'copper', 'wheat', 'Bitcoin', 'naira', 'yuan']
  const many = names.map((name, i) =>
    art(`${name} moves`, `outlet${i}.com`, { dateTimePub: `2026-10-01T${String(i).padStart(2, '0')}:00:00Z` }),
  )
  const picked = pickTracked(many, { slots: 3 })
  assert.deepEqual(titles(picked), ['yuan moves', 'naira moves', 'Bitcoin moves'])
})

test('a story the feed would drop as stale takes no slot', () => {
  const now = Date.parse('2026-10-01T18:00:00Z')
  const picked = pickTracked(
    [
      art('Gold inches higher as softer data dims hike bets', 'reuters.com', { dateTimePub: '2026-10-01T05:00:00Z' }),
      art('Three oil tankers hit by projectiles in Hormuz strait', 'reuters.com', { dateTimePub: '2026-10-01T07:00:00Z' }),
      // One fresh report keeps the event; the older one stays as a source.
      art('Yen weakens again', 'reuters.com', { eventUri: 'eng-5', dateTimePub: '2026-10-01T16:00:00Z' }),
      art('Yen Weakens as BOJ Summary Damps Rate-Hike Bets', 'bloomberg.com', { eventUri: 'eng-5', dateTimePub: '2026-10-01T02:00:00Z' }),
    ],
    { now, maxAgeMs: 12 * 3600_000 },
  )
  assert.deepEqual(titles(picked), ['Yen weakens again', 'Three oil tankers hit by projectiles in Hormuz strait'])
  assert.equal(picked[0].length, 2)
})

test('every keyword is a phrase the registry or a contract can use', () => {
  // A keyword that resolves to no series fetches stories nothing can chart.
  // Three name a subject rather than a series — the cartel behind the oil
  // price, the sea two straits open onto, the bond market the 10-year sits
  // in — and the series reaches the story through the selector's angle. A new
  // one has to be argued for here.
  const viaOther = new Set(['OPEC', 'Red Sea', 'bond yields'])
  for (const k of TRACKED_KEYWORDS) {
    if (viaOther.has(k)) continue
    const { resolved } = extractEntities(`${k} moved on Tuesday`)
    assert.ok(resolved.length > 0, `"${k}" resolves to no series`)
  }
})
