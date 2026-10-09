// Run: node --test scripts/lib/quality-metrics.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SCHEMA, qualityRow, qualitySnapshot, qualitySummary, withSnapshot } from './quality-metrics.js'

const NOW = Date.parse('2026-10-08T22:30:00Z')
const CUTOFF = NOW - 7 * 86400_000
const FOUR = ['Lyon — The council voted on Tuesday to close the bridge.', 'It carries a third of the traffic into the old town.', 'Engineers found the cables had lost strength.', 'A vote on the repair budget follows next month.']

/** @param {Record<string, string | undefined>} over @param {string[]} blocks */
function article(over = {}, blocks = FOUR) {
  const f = { title: '"Council Closes The Bridge"', date: '"2026-10-08T17:00:00Z"', category: '"politics"', sources: '\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n    country: "PK"', ...over }
  const yaml = Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}:${String(v).startsWith('\n') ? '' : ' '}${v}`).join('\n')
  return `---\n${yaml}\n---\n\n${blocks.join('\n\n')}\n`
}
/** @param {Record<string, any>} over */
const row = (over = {}) => ({ file: 'a.md', title: 'An Unrelated Headline Entirely', body: FOUR.join('\n\n'), category: 'politics', sourceNames: ['Dawn'], sourceCountries: ['PK'], ...over })
/** @param {Record<string, any>[]} rows */
const metrics = (rows) => qualitySnapshot(/** @type {any} */ (rows), NOW).metrics

test('an article in the window is read by its double-quoted lines', () => {
  const two = '\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n    country: "PK"\n  - name: "Reuters"\n    url: "https://www.reuters.com/x"\n    country: null\n  - name: "AFP"\n    url: "https://www.afp.com/x"\n    country: "null"'
  assert.deepEqual(qualityRow('a.md', article({ sources: two }), CUTOFF), {
    file: 'a.md',
    title: 'Council Closes The Bridge',
    body: FOUR.join('\n\n'),
    category: 'politics',
    sourceNames: ['Dawn', 'Reuters', 'AFP'],
    sourceCountries: ['PK', 'null', 'null'],
  })
})

// As it stands. The scan expects the writer's quoting, and what does not have
// it is not an error here: it is not counted.
test('what the reader leaves out, and what it reads as empty', () => {
  assert.equal(qualityRow('a.md', 'Just prose.\n', CUTOFF), null, 'no frontmatter')
  assert.equal(qualityRow('a.md', article({ date: '2026-10-08T17:00:00Z' }), CUTOFF), null, 'a date without quotes')
  assert.equal(qualityRow('a.md', article({ date: '"soon"' }), CUTOFF), null, 'a date that is not one')
  assert.equal(qualityRow('a.md', article({ date: '"2026-09-30T00:00:00Z"' }), CUTOFF), null, 'before the window')
  assert.ok(qualityRow('a.md', article({ date: '"2026-10-01T22:30:00Z"' }), CUTOFF), 'on the edge of it')
  const single = qualityRow('a.md', article({ title: "'In Single Quotes'", category: "'tech'" }), CUTOFF)
  assert.deepEqual([single?.title, single?.category], ['', ''])
})

test('lengths are averaged raw, and the ceiling is measured on what the reader sees', () => {
  const linked = `Lyon — ${'[Iran](country:IR) and [Iraq](country:IQ) signed. '.repeat(11)}`
  const long = `Lyon — ${'The engineers measured every cable along the span. '.repeat(12)}`
  const m = metrics([row(), row({ body: linked }), row({ body: long })])
  assert.equal(m.charLengthAvg, Math.round((FOUR.join('\n\n').length + linked.length + long.length) / 3))
  assert.equal(m.charOver350Pct, 66.7, 'over 480 as written: both long ones')
  assert.equal(m.charOver400Pct, 33.3, 'over 560 as read: the links cost only their labels')
})

test('the word band is 52 to 75, and a fifth block is counted when it is there', () => {
  const words = (/** @type {number} */ n) => `Lyon — ${'word '.repeat(n - 2).trim()}`
  const m = metrics([row({ body: words(51) }), row({ body: words(52) }), row({ body: words(75) }), row({ body: words(76) }), row({ body: [...FOUR, 'A fifth block, earned.'].join('\n\n') })])
  assert.equal(m.wordInRangePct, 40)
  assert.equal(m.fiveBlockRatePct, 20)
  assert.equal(m.blockCountAvg, 1.8)
})

test('a hook that repeats half the headline is an echo', () => {
  const m = metrics([
    row({ title: 'Council Votes To Close The Bridge' }),
    row({ title: 'Mayor Promises A Second Tunnel' }),
    row({ title: '' }),
  ])
  assert.equal(m.titleEchoRatePct, 33.3)
})

test('passive voice is counted in the hook and anywhere in the body', () => {
  const passiveHook = ['Paris — The minister was dismissed on Monday after the vote.', ...FOUR.slice(1)].join('\n\n')
  const passiveBody = [FOUR[0], 'The report was delayed twice. It matters to the budget.', ...FOUR.slice(2)].join('\n\n')
  const m = metrics([row(), row({ body: passiveHook }), row({ body: passiveBody }), row()])
  assert.equal(m.passiveHookRatePct, 25)
  assert.equal(m.passiveBodyRatePct, 50, 'the hook is part of the body')
})

test('semicolons, causal claims, press-era phrases and filler are counted once an article', () => {
  const withSecond = (/** @type {string} */ s) => row({ body: [FOUR[0], s, ...FOUR.slice(2)].join('\n\n') })
  const m = metrics([
    row(),
    withSecond('The bridge closed; the tunnel stayed open; nobody was told.'),
    withSecond('The ruling gave ministers cover to delay, and the plan gains credibility.'),
    withSecond('The result was not known at press time. Officials met this morning.'),
    withSecond('The move could reshape the market amid significant doubt.'),
  ])
  assert.equal(m.semicolonRatePct, 20)
  assert.equal(m.causalClaimHits, 1)
  assert.equal(m.pressEraHits, 1)
  assert.equal(m.hedgeRatePct, 20)
})

test('an acronym counts where the reader sees it, unless it is one everybody knows', () => {
  const body = [FOUR[0], 'The [IAEA](org:IAEA) and the WTO met the UN, NATO and the [Iran](country:IR) delegation. OPEC and the WTO differ.', ...FOUR.slice(2)].join('\n\n')
  const m = metrics([row({ body }), row({ body: body.replace('OPEC', 'IAEA') })])
  assert.equal(m.acronymViolations, 8)
  assert.deepEqual(m.topAcronymViolators, [['WTO', 4], ['IAEA', 3], ['OPEC', 1]], 'IR is a link target, UN and NATO are known')
})

test('sources: missing countries, the three largest outlets\' share, and how many stand on more than one', () => {
  const m = metrics([
    row({ sourceNames: ['Dawn', 'Reuters'], sourceCountries: ['PK', 'null'] }),
    row({ sourceNames: ['Dawn'], sourceCountries: ['PK'] }),
    row({ sourceNames: ['Reuters', 'AFP', 'Al Jazeera'], sourceCountries: ['null', 'FR', 'QA'] }),
    row({ sourceNames: ['Phys.org'], sourceCountries: ['US'], category: 'science' }),
    row({ sourceNames: [], sourceCountries: [], category: '' }),
  ])
  assert.equal(m.countryNullCount, 2)
  assert.deepEqual(m.top3Outlets, [{ name: 'Dawn', count: 2 }, { name: 'Reuters', count: 2 }, { name: 'AFP', count: 1 }])
  assert.equal(m.topOutletSharePct, 71.4)
  assert.equal(m.multiSourceRatePct, 40)
  assert.deepEqual(m.categoryBalance, { politics: 3, science: 1, '': 1 })
})

test('a week with no articles is a snapshot of zeros, filed under the day it was taken', () => {
  const s = qualitySnapshot([], NOW)
  assert.deepEqual({ week: s.week, schema: s.schema, windowDays: s.windowDays, articleCount: s.articleCount }, { week: '2026-10-08', schema: SCHEMA, windowDays: 7, articleCount: 0 })
  assert.deepEqual(s.metrics, {
    charLengthAvg: 0, charOver350Pct: 0, charOver400Pct: 0, wordCountAvg: 0, wordInRangePct: 0, blockCountAvg: 0, fiveBlockRatePct: 0,
    titleEchoRatePct: 0, passiveHookRatePct: 0, passiveBodyRatePct: 0, semicolonRatePct: 0, causalClaimHits: 0, pressEraHits: 0, hedgeRatePct: 0,
    acronymViolations: 0, topAcronymViolators: [], countryNullCount: 0, topOutletSharePct: 0, top3Outlets: [], multiSourceRatePct: 0, categoryBalance: {},
  })
})

test('a snapshot goes on the end of the series, in place of the same day\'s, and the series keeps a year', () => {
  const snapshot = qualitySnapshot([/** @type {any} */ (row())], NOW)
  const trend = [{ week: '2026-09-27', n: 1 }, { week: '2026-10-08', n: 2 }, { week: '2026-10-04', n: 3 }]
  assert.deepEqual(withSnapshot(trend, snapshot), [{ week: '2026-09-27', n: 1 }, { week: '2026-10-04', n: 3 }, snapshot])
  assert.equal(trend.length, 3, 'the series it was given is not written to')
  assert.deepEqual(withSnapshot([], snapshot), [snapshot])
  const year = Array.from({ length: 60 }, (_, i) => ({ week: `w${i}` }))
  const kept = withSnapshot(year, snapshot)
  assert.equal(kept.length, 52)
  assert.deepEqual([kept[0], kept.at(-1)], [{ week: 'w9' }, snapshot])
})

test('the summary is six lines, the first with the count', () => {
  const lines = qualitySummary(qualitySnapshot([/** @type {any} */ (row()), /** @type {any} */ (row())], NOW))
  assert.equal(lines.length, 6)
  assert.equal(lines[0], 'Quality metrics: 2 articles in last 7d')
  assert.match(lines[1], /^ {2}length: charAvg=\d+ over480=0% over560=0% {2}wordAvg=\d+ inRange=0%$/)
  assert.equal(lines[5], '  source: top3Share=100% multiSrc=0%')
})
