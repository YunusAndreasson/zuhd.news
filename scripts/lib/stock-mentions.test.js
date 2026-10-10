import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VENUES, chartsUntil, companyEntries, onVenueList, parseStockMentions, parseStoryReadings, readingBlocks, stockMentionsPrompt, subjectsBlock } from './stock-mentions.js'

test('the prompt carries each article and asks for the subject', () => {
  const prompt = stockMentionsPrompt([
    { slug: 'a-story', title: 'Micron Sees Tighter Memory', body: 'Boise — Micron said """so""".' },
  ])
  assert.match(prompt, /slug: a-story/)
  assert.match(prompt, /title: Micron Sees Tighter Memory/)
  assert.match(prompt, /subject: true when the article is ABOUT this company/)
  // A body cannot close the block it is quoted in.
  assert.ok(!prompt.includes('said """so"""'))
})

test('a body is cut to what the scan reads', () => {
  const prompt = stockMentionsPrompt([{ slug: 's', title: 't', body: `${'x'.repeat(1500)}TAIL` }])
  assert.ok(!prompt.includes('TAIL'))
})

test('subject is true only for a literal true', () => {
  const out = parseStockMentions({
    story: [
      { mention: 'Meta', ticker: 'META', name: 'Meta Platforms', subject: true },
      { mention: 'Nvidia', ticker: 'NVDA', name: 'Nvidia', subject: false },
      { mention: 'Apple', ticker: 'AAPL', name: 'Apple' },
      { mention: 'Tesla', ticker: 'TSLA', name: 'Tesla', subject: 'true' },
    ],
  })
  assert.deepEqual(
    out.get('story').map((c) => [c.ticker, c.subject]),
    [
      ['META', true],
      ['NVDA', false],
      ['AAPL', false],
      ['TSLA', false],
    ],
  )
})

test('a malformed company is dropped and its article is still answered for', () => {
  const out = parseStockMentions({
    story: [
      { mention: 'Meta', ticker: 'not a ticker!', name: 'Meta Platforms', subject: true },
      { ticker: 'NVDA', name: 'Nvidia' },
      null,
    ],
    quiet: [],
    odd: 'nothing',
  })
  assert.deepEqual(out.get('story'), [])
  // Read, and nothing there: not the same answer as never read.
  assert.deepEqual(out.get('quiet'), [])
  assert.deepEqual(out.get('odd'), [])
  assert.equal(out.has('absent'), false)
})

test('an answer that is not an object is no answer', () => {
  assert.equal(parseStockMentions(null).size, 0)
  assert.equal(parseStockMentions([]).size, 0)
  assert.equal(parseStockMentions('{}').size, 0)
})

// ── The same reading: venues and thermal ────────────────────────────────────

test('the prompt lists every exchange and strait the site draws, by its id', () => {
  const prompt = stockMentionsPrompt([{ slug: 's', title: 't', body: 'b' }])
  assert.ok(VENUES.length >= 40)
  for (const v of VENUES) assert.ok(prompt.includes(`  ${v.id} — ${v.label}`), v.id)
  assert.match(prompt, /mkt:lse — London Stock Exchange/)
  assert.match(prompt, /cp:hormuz — Strait of Hormuz/)
  assert.match(prompt, /"venues" \(an array of ids from the list/)
})

test('companies are read from under their key, beside the new answers', () => {
  const out = parseStockMentions({
    story: { companies: [{ mention: 'Meta', ticker: 'META', name: 'Meta Platforms', subject: true }], venues: ['mkt:nyse'], thermal: false },
    quiet: { companies: [], venues: [], thermal: false },
    odd: { venues: [], thermal: false },
  })
  assert.deepEqual(out.get('story').map((c) => c.ticker), ['META'])
  assert.deepEqual(out.get('quiet'), [])
  assert.deepEqual(out.get('odd'), [])
})

test('a reading keeps the venues that are venues, once each', () => {
  const out = parseStoryReadings({
    tanker: { companies: [], venues: ['cp:hormuz', 'mkt:tadawul', 'cp:hormuz', 'mkt:nikkei', 'hormuz', 7], thermal: true },
    quiet: { companies: [], venues: [], thermal: false },
  })
  assert.deepEqual(out.get('tanker'), { venues: ['cp:hormuz', 'mkt:tadawul'], thermal: true })
  assert.deepEqual(out.get('quiet'), { venues: [], thermal: false })
})

test('an article not answered for both is not read, and is not recorded as about none', () => {
  const out = parseStoryReadings({
    old: [{ mention: 'Meta', ticker: 'META', name: 'Meta Platforms' }],
    half: { companies: [], venues: ['cp:suez'] },
    guess: { companies: [], venues: [], thermal: 'false' },
    listless: { companies: [], venues: 'cp:suez', thermal: true },
    nothing: null,
  })
  assert.equal(out.size, 0)
  assert.equal(parseStoryReadings(null).size, 0)
  assert.equal(parseStoryReadings([]).size, 0)
})

test('the reading is written under its own two keys', () => {
  assert.deepEqual(readingBlocks({ venues: ['cp:hormuz', 'mkt:tadawul'], thermal: true }), {
    venues: ['venues:', '  - "cp:hormuz"', '  - "mkt:tadawul"'],
    thermal: ['thermal: true'],
  })
  assert.deepEqual(readingBlocks({ venues: [], thermal: false }), { venues: ['venues: []'], thermal: ['thermal: false'] })
})

test('a story is on a list only when it was read and named it', () => {
  assert.equal(onVenueList({ venues: ['mkt:lse'] }, 'mkt:lse'), true)
  assert.equal(onVenueList({ venues: ['mkt:lse'] }, 'cp:dover'), false)
  assert.equal(onVenueList({ venues: [] }, 'mkt:lse'), false)
  // Never read: on no list, whatever its title says.
  assert.equal(onVenueList(/** @type {any} */ ({ title: 'London Stock Exchange Halts Trading' }), 'mkt:lse'), false)
  assert.equal(onVenueList({ venues: 'mkt:lse' }, 'mkt:lse'), false)
  assert.equal(onVenueList(undefined, 'mkt:lse'), false)
})

test('subjectsBlock writes one id a line, once each, and says so when there are none', () => {
  assert.deepEqual(subjectsBlock(['stocks:NVDA', 'stocks:MU', 'stocks:NVDA']), [
    'subjects:',
    '  - "stocks:NVDA"',
    '  - "stocks:MU"',
  ])
  assert.deepEqual(subjectsBlock([]), ['subjects: []'])
})

/** @param {string} mention @param {string} ticker @param {boolean} subject */
const company = (mention, ticker, subject) => ({ mention, ticker, name: mention, subject })

test('a company with a chart is an entity, and the one the article is about is a subject', () => {
  const companies = [company('Nvidia', 'nvda', true), company('Microsoft', 'MSFT', false), company('NVIDIA Corp', 'NVDA', true)]
  assert.deepEqual(companyEntries(companies, new Set(['stocks:NVDA', 'stocks:MSFT'])), {
    entities: [
      { mention: 'Nvidia', indicatorId: 'stocks:NVDA', kind: 'stock' },
      { mention: 'Microsoft', indicatorId: 'stocks:MSFT', kind: 'stock' },
    ],
    subjects: ['stocks:NVDA'],
  })
  assert.deepEqual(companyEntries([], new Set(['stocks:NVDA'])), { entities: [], subjects: [] })
})

// The model still calls Sony SNE, and Yahoo has no such symbol. The article
// about Sony was written down as `subjects: []`: read, and about no company.
test('what an article is about does not depend on Yahoo answering for the ticker', () => {
  const companies = [company('Sony', 'SNE', true), company('Nintendo', 'NTDOY', false)]
  assert.deepEqual(companyEntries(companies, new Set()), { entities: [], subjects: ['stocks:SNE'] }, 'no chart, so nothing to press, and the subject stands')
  assert.deepEqual(companyEntries(companies, new Set(['stocks:NTDOY'])), {
    entities: [{ mention: 'Nintendo', indicatorId: 'stocks:NTDOY', kind: 'stock' }],
    subjects: ['stocks:SNE'],
  })
})

test('charts are fetched one at a time until time is up, and the tickers left out are named', async () => {
  let clock = 0
  /** @type {string[]} */
  const asked = []
  const fetchOne = async (/** @type {string} */ ticker) => {
    asked.push(ticker)
    clock += 20_000 // both hosts hung
    return ticker === 'RMST' ? null : { values: [1, 2] }
  }
  const { charts, unasked } = await chartsUntil(['NVDA', 'RMST', 'MSFT', 'AAPL', 'TSM'], fetchOne, { until: 50_000, now: () => clock })
  assert.deepEqual(asked, ['NVDA', 'RMST', 'MSFT'], 'none is begun after the deadline')
  assert.deepEqual([...charts.keys()], ['NVDA', 'MSFT'], 'one with no chart to be had is not a chart')
  assert.deepEqual(unasked, ['AAPL', 'TSM'])
})

test('with time in hand every ticker is asked for', async () => {
  const { charts, unasked } = await chartsUntil(new Map([['NVDA', 1], ['MSFT', 2]]).keys(), async (t) => ({ t }), { until: Date.now() + 60_000 })
  assert.deepEqual([[...charts.keys()], unasked], [['NVDA', 'MSFT'], []])
  assert.deepEqual(await chartsUntil([], async () => null, { until: 0 }), { charts: new Map(), unasked: [] })
})
