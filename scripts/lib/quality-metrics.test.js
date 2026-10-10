// Run: node --test scripts/lib/quality-metrics.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { pathOf } from './datasets.js'
import { SCHEMA, articleFlags, qualityRow, qualitySnapshot, qualitySummary, withSnapshot } from './quality-metrics.js'

const NOW = Date.parse('2026-10-08T22:30:00Z')
const CUTOFF = NOW - 7 * 86400_000
const FOUR = ['Lyon — The council voted on Tuesday to close the bridge.', 'It carries a third of the traffic into the old town.', 'Engineers found the cables had lost strength.', 'A vote on the repair budget follows next month.']

/** @param {Record<string, string | undefined>} over @param {string[]} blocks */
function article(over = {}, blocks = FOUR) {
  const f = { title: '"Council Closes The Bridge"', date: '"2026-10-08T17:00:00Z"', category: '"politics"', location: '"Lyon"', sources: '\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n    country: "PK"', ...over }
  const yaml = Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}:${String(v).startsWith('\n') ? '' : ' '}${v}`).join('\n')
  return `---\n${yaml}\n---\n\n${blocks.join('\n\n')}\n`
}
/** @param {Record<string, any>} over */
const row = (over = {}) => ({ file: 'a.md', title: 'An Unrelated Headline Entirely', body: FOUR.join('\n\n'), location: 'Lyon', category: 'politics', sourceNames: ['Dawn'], sourceCountries: ['PK'], ...over })
/** @param {Record<string, any>[]} rows */
const metrics = (rows) => qualitySnapshot(/** @type {any} */ (rows), NOW).metrics

test('an article in the window is read through the parser', () => {
  const two = '\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n    country: "PK"\n  - name: "Reuters"\n    url: "https://www.reuters.com/x"\n    country: null\n  - name: "AFP"\n    url: "https://www.afp.com/x"\n    country: "null"'
  assert.deepEqual(qualityRow('a.md', article({ sources: two }), CUTOFF), {
    file: 'a.md',
    title: 'Council Closes The Bridge',
    body: FOUR.join('\n\n'),
    location: 'Lyon',
    category: 'politics',
    sourceNames: ['Dawn', 'Reuters', 'AFP'],
    sourceCountries: ['PK', 'null', 'null'],
  })
})

test('what is not in the window is left out: no frontmatter, no date, a date before it', () => {
  assert.equal(qualityRow('a.md', 'Just prose.\n', CUTOFF), null, 'no frontmatter')
  assert.equal(qualityRow('a.md', article({ date: undefined }), CUTOFF), null, 'no date')
  assert.equal(qualityRow('a.md', article({ date: '"soon"' }), CUTOFF), null, 'a date that is not one')
  assert.equal(qualityRow('a.md', article({ date: '"2026-09-30T00:00:00Z"' }), CUTOFF), null, 'before the window')
  assert.ok(qualityRow('a.md', article({ date: '"2026-10-01T22:30:00Z"' }), CUTOFF), 'on the edge of it')
  assert.throws(() => qualityRow('a.md', article({ title: '"A "Quote" Inside"' }), CUTOFF), 'a file that does not parse')
})

// Until 2026-10-09 the scan read only double-quoted values, and an article
// whose date had no quotes was left out of the week without a word.
test('how a value is quoted does not decide whether the article counts', () => {
  const bare = qualityRow('a.md', article({ date: '2026-10-08T17:00:00Z', title: "'In Single Quotes'", category: 'tech' }), CUTOFF)
  assert.deepEqual([bare?.title, bare?.category], ['In Single Quotes', 'tech'])
  const empty = '\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n    country: ""\n  - name: "AFP"\n    url: "https://www.afp.com/x"'
  assert.deepEqual(qualityRow('a.md', article({ sources: empty }), CUTOFF)?.sourceCountries, [''], 'an empty country is not a missing one')
})

// The per-article half of the scan, for the week's sums here and for a
// per-cycle scorer's: the RVS scorer carried its own copy of six of these.
test('the detectors answer for one article, whoever asks and whatever else its record holds', () => {
  const body = [FOUR[0], 'The report was delayed twice; nobody was told amid the strike.', ...FOUR.slice(2)].join('\n\n')
  assert.deepEqual(articleFlags({ title: 'Council Votes To Close The Bridge', body, location: 'Lyon', sourceNames: ['Dawn', 'Reuters'] }), {
    charLength: body.length,
    visibleLength: body.length,
    wordCount: 38,
    overTarget: false,
    overCeiling: false,
    wordInRange: false,
    blockCount: 4,
    titleEcho: true,
    passiveHook: false,
    passiveBody: true,
    semicolon: true,
    causalClaim: false,
    pressEra: false,
    hedge: true,
    multiSource: true,
  })
  // The scorer's own record: no `location` of the frontmatter's, and keys this does not read.
  const scored = { file: 'content/articles/2026-10-08-a.md', slug: '2026-10-08-a', title: 'Mayor Promises A Second Tunnel', category: 'politics', lat: 45.76, lng: 4.84, sourceNames: ['Dawn'], sourceCountries: ['PK'], body: `[Lyon](country:FR) — ${'[Iran](country:IR) signed. '.repeat(30)}` }
  const flags = articleFlags(scored, { wordBandMax: 78 })
  assert.deepEqual([flags.overTarget, flags.overCeiling, flags.visibleLength < flags.charLength, flags.titleEcho, flags.multiSource], [true, false, true, false, false])
})

test('the word band ends at 75 for the week, and where a caller that counts the dateline in sets it', () => {
  const words = (/** @type {number} */ n) => ({ title: '', body: `Lyon — ${'word '.repeat(n - 2).trim()}`, location: 'Lyon', sourceNames: [] })
  assert.deepEqual([51, 52, 75, 76, 78].map((n) => articleFlags(words(n)).wordInRange), [false, true, true, false, false])
  assert.deepEqual([51, 52, 75, 76, 78, 79].map((n) => articleFlags(words(n), { wordBandMax: 78 }).wordInRange), [false, true, true, true, true, false])
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

// The editor's flag (`lib/title-echo.js`), so the week's rate is the rate of
// what the editor was shown. Until schema 4 the scan had a test of its own:
// half the title's words of three letters or more, "the" among them, whatever
// the hook added. It called the third and fourth of these echoes too.
test('a hook is an echo when it repeats two thirds of the headline and brings no figure of its own', () => {
  const withHook = (/** @type {string} */ hook) => [`Lyon — ${hook}`, ...FOUR.slice(1)].join('\n\n')
  const rows = [
    row({ title: 'Council Votes To Close The Bridge' }),
    row({ title: 'Mayor Promises A Second Tunnel' }),
    // Half its words, and under two thirds of the ones that say which story it is.
    row({ title: 'Council Closes The Bridge After Storm Damage' }),
    // Every word of it, and the count the headline does not carry.
    row({ title: 'Council Votes To Close The Bridge', body: withHook('The council voted 31 to 12 to close the bridge.') }),
    row({ title: '' }),
  ]
  assert.equal(metrics(rows.slice(0, 1)).titleEchoRatePct, 100)
  assert.equal(metrics(rows).titleEchoRatePct, 20)
  // The dateline is not part of the hook, found by the location or without one:
  // with "Lyon" counted, this hook would hold two of the headline's three words.
  const datelined = { title: 'Lyon Bridge Vote', body: withHook('The bridge reopens on Tuesday.') }
  assert.equal(metrics([row(datelined)]).titleEchoRatePct, 0)
  assert.equal(metrics([row({ ...datelined, location: '' })]).titleEchoRatePct, 0)
  assert.equal(metrics([row({ ...datelined, body: datelined.body.replace('Lyon — ', '') })]).titleEchoRatePct, 0)
})

test('passive voice is counted in the hook and anywhere in the body', () => {
  const passiveHook = ['Paris — The minister was dismissed on Monday after the vote.', ...FOUR.slice(1)].join('\n\n')
  const passiveBody = [FOUR[0], 'The report was delayed twice. It matters to the budget.', ...FOUR.slice(2)].join('\n\n')
  const m = metrics([row(), row({ body: passiveHook }), row({ body: passiveBody }), row()])
  assert.equal(m.passiveHookRatePct, 25)
  assert.equal(m.passiveBodyRatePct, 50, 'the hook is part of the body')

  // The dateline is taken off by the location. It was cut at the first em dash
  // wherever that stood, so a body with no dateline and a dash further down
  // was read from the dash on, and its hook was never tested.
  const bare = ['The minister was dismissed on Monday after the vote.', 'The vote — the third this year — failed by 4.', ...FOUR.slice(2)].join('\n\n')
  assert.equal(metrics([row({ body: bare, location: 'Paris' })]).passiveHookRatePct, 100)
  assert.equal(metrics([row({ body: bare, location: '' })]).passiveHookRatePct, 100)
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
  // Each once an article, however often it is written (`unexpandedAcronyms`).
  assert.equal(m.acronymViolations, 5)
  assert.deepEqual(m.topAcronymViolators, [['IAEA', 2], ['WTO', 2], ['OPEC', 1]], 'IR is a link target, UN and NATO are known')
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

// The stage's one output is the series. It also wrote the snapshot alone to a
// scratch file in /tmp that nothing opened. Asked of the stage's text, since
// no test starts it: it writes the series in `content/`.
test('the weekly stage writes the series and nothing beside it', () => {
  const stage = readFileSync(new URL('../measure-quality.js', import.meta.url), 'utf8')
  assert.deepEqual([...new Set(stage.match(/pathOf\('[A-Za-z]+'\)/g))], ["pathOf('articles')", "pathOf('qualityTrend')"])
  assert.equal(stage.match(/\bwriteJson\(/g)?.length, 1)
  assert.throws(() => pathOf('qualityMetrics'), /no dataset named "qualityMetrics"/)
})
