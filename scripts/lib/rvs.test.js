// Run: node --test scripts/lib/rvs.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ARTICLE_CEILING } from './article.js'
import { CATEGORY_FLOORS, FLOORS_MAY_GO_UNMET } from './dedup.js'
import { SCHEMA, TARGET_BALANCE, appendRecord, checkGuardrails, flagsOf, readBatch, rvsRecord, scoreCoverage, scoreSourcing, scoreWriting } from './rvs.js'

/** `n` words that are no rule's business. */
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
/** A body of `n` words, the dateline's two among them. */
const bodyOf = (n) => `Lyon — ${words(n - 2)}.`

/** When the cycle these batches belong to began. */
const RUN = Date.parse('2026-10-09T05:01:27Z')
const DAY = 86_400_000

/** An article nothing is wrong with: 60 words, one source, in Lyon, published as the cycle began. @param {Record<string, any>} over */
const row = (over = {}) => ({
  slug: '2026-10-09-a',
  title: 'An Unrelated Headline Entirely',
  category: 'politics',
  body: bodyOf(60),
  lat: 45.76,
  lng: 4.84,
  date: RUN,
  sourceNames: ['Dawn'],
  sourceCountries: ['PK'],
  ...over,
})

/** A dateline in each region `lib/regions.js` knows, and one in none. */
const AT = { ME: [30, 45], AS: [20, 100], AF: [0, 20], EU: [50, 10], AM: [40, -100], OC: [-30, 150], GL: [-80, 0] }
/** @param {keyof typeof AT} region @param {number} n */
const inRegion = (region, n) => Array.from({ length: n }, () => row({ lat: AT[region][0], lng: AT[region][1] }))

const near = (actual, expected, message = '', within = 1e-5) => assert.ok(Math.abs(actual - expected) < within, `${message} ${actual} is not ${expected}`)

// ── The reader ───────────────────────────────────────────────────────

test('the batch is read through the parser, however a value is quoted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rvs-'))
  const file = (name, yaml) => {
    writeFileSync(join(dir, name), `---\n${yaml}\n---\n\nLyon — The council voted.\n\nIt matters.\n`)
    return { path: join(dir, name) }
  }
  const quoted = file('2026-10-09-quoted.md', 'title: "Council Closes The Bridge"\ndate: "2026-10-09T04:54:25Z"\ncategory: "politics"\nlat: 45.76\nlng: 4.84\nsources:\n  - name: "Dawn"\n    url: "https://www.dawn.com/1"\n    country: "PK"\n  - name: "Reuters"\n    url: "https://www.reuters.com/x"\n    country: null')
  // As two articles of 2026-09-09 were written: the reader this replaced took
  // only double-quoted values and read these as having no category.
  const bare = file('2026-10-09-bare.md', "title: 'In Single Quotes'\ndate: 2026-10-09T04:54:25Z\ncategory: economy\nlat: 0\nsources:\n  - name: Dawn\n    url: https://www.dawn.com/2")
  const rows = readBatch([quoted, bare, { path: join(dir, '2026-10-09-quarantined.md') }, { path: join(dir, 'notes.txt') }])

  assert.deepEqual(rows[0], {
    slug: '2026-10-09-quoted',
    title: 'Council Closes The Bridge',
    category: 'politics',
    body: 'Lyon — The council voted.\n\nIt matters.',
    lat: 45.76,
    lng: 4.84,
    date: Date.parse('2026-10-09T04:54:25Z'),
    sourceNames: ['Dawn', 'Reuters'],
    sourceCountries: ['PK', 'null'],
  })
  assert.deepEqual([rows[1].title, rows[1].category, rows[1].lat, rows[1].lng], ['In Single Quotes', 'economy', 0, null])
  assert.equal(rows[1].date, rows[0].date, 'a date YAML read as a date is the same moment')
  assert.deepEqual([rows[1].sourceNames, rows[1].sourceCountries], [['Dawn'], []], 'no country key is not a null country')
  assert.equal(rows.length, 2, 'a file the validator moved aside, and one that is no article, are left out')
})

// ── The detectors ────────────────────────────────────────────────────

test('length is measured on what the reader sees, against the article ceiling', () => {
  const linked = `Lyon — ${'[Iran](country:IR) '.repeat(140)}`
  assert.equal(flagsOf(row({ body: 'x'.repeat(ARTICLE_CEILING) })).charInRange, true)
  assert.equal(flagsOf(row({ body: 'x'.repeat(ARTICLE_CEILING + 1) })).charInRange, false)
  assert.ok(linked.length > 2000)
  assert.equal(flagsOf(row({ body: linked })).charInRange, false, 'a link costs its label')
  assert.equal(flagsOf(row({ body: `Lyon — ${'[Iran](country:IR) '.repeat(100)}` })).charInRange, true)
})

test('the word band is 52 to 78, dateline included', () => {
  const inBand = (n) => flagsOf(row({ body: bodyOf(n) })).wordInRange
  assert.deepEqual([51, 52, 78, 79].map(inBand), [false, true, true, false])
  assert.equal(flagsOf(row({ body: bodyOf(60) })).wordCount, 60)
})

test('the voice faults: a passive hook, a hedge, a press-era phrase, a hook that says the title again', () => {
  const clean = flagsOf(row())
  assert.deepEqual([clean.passive, clean.hedge, clean.pressEra, clean.titleEcho], [false, false, false, false])

  assert.equal(flagsOf(row({ body: 'Lyon — The bridge was closed on Tuesday. The council voted.' })).passive, true)
  assert.equal(flagsOf(row({ body: 'Lyon — The council closed the bridge. It was closed on Tuesday.' })).passive, false, 'only the hook is read')
  for (const phrase of ['amid protests', 'a significant vote', 'could reshape the city', 'is poised to close']) {
    assert.equal(flagsOf(row({ body: `Lyon — The council voted ${phrase}.` })).hedge, true, phrase)
  }
  for (const phrase of ['this week', 'at press time']) {
    assert.equal(flagsOf(row({ body: `Lyon — The council voted ${phrase}.` })).pressEra, true, phrase)
  }
  const echo = (title, hook) => flagsOf(row({ title, body: `Lyon — ${hook}. The cables had lost strength.` })).titleEcho
  assert.equal(echo('Council Closes Bridge', 'The council closes the bridge'), true)
  assert.equal(echo('Council Closes Bridge', 'Engineers found the cables had lost strength'), false)
  assert.equal(echo('Council Closes Old Lyon Bridge', 'The council shut a bridge'), false, 'two words of five is under half')
})

test('two sources or more is multi-source', () => {
  assert.deepEqual([[], ['Dawn'], ['Dawn', 'AFP']].map((sourceNames) => flagsOf(row({ sourceNames })).multiSource), [false, false, true])
})

// ── The clusters ─────────────────────────────────────────────────────

test('writing: half for brevity, half for voice, and two faults an article cost the whole voice half', () => {
  assert.equal(scoreWriting([row(), row()]).score, 100)
  assert.deepEqual(scoreWriting([]), { score: 0, detail: { reason: 'no articles' } })

  const batch = [
    row(),
    row({ body: bodyOf(40) }),
    row({ body: `Lyon — ${words(55)} amid it this week.` }),
    row({ title: 'Council Closes Bridge', body: `Lyon — The council bridge was closed. ${words(53)}.` }),
  ]
  const { score, detail } = scoreWriting(batch)
  assert.deepEqual(
    [detail.charInRange, detail.wordInRange, detail.passive, detail.hedge, detail.pressEra, detail.titleEcho],
    [1, 0.75, 0.25, 0.25, 0.25, 0.25],
  )
  assert.deepEqual([detail.brevity, detail.voice, score], [43.75, 25, 68.75])

  const faulty = row({ body: `Lyon — ${words(55)} amid it this week.` })
  assert.equal(scoreWriting([faulty, faulty]).detail.voice, 0)
})

test('sourcing: sixty for articles with a second source, forty for outlets beyond the three most cited', () => {
  const batch = [row({ sourceNames: ['Dawn', 'Reuters'] }), row({ sourceNames: ['Dawn'] }), row({ sourceNames: ['Dawn', 'AFP', 'BBC'] }), row({ sourceNames: ['Al Jazeera'] })]
  const { score, detail } = scoreSourcing(batch)
  assert.deepEqual([detail.multiSourceRate, detail.uniqueOutlets], [0.5, 5])
  near(detail.top3Share, 5 / 7, 'Dawn three times and two others, of seven citations')
  near(score, 0.5 * 60 + (2 / 7) * 40)

  assert.equal(scoreSourcing([row({ sourceNames: ['Dawn'] }), row({ sourceNames: ['Dawn'] })]).score, 0, 'one outlet, one source each')
  assert.deepEqual(scoreSourcing([]), { score: 0, detail: { reason: 'no articles' } })
})

test('coverage: a batch spread as the target asks earns the region and floor points in full', () => {
  const batch = Object.entries(TARGET_BALANCE.regions).flatMap(([region, share]) => inRegion(/** @type {keyof typeof AT} */ (region), Math.round(share * 100)))
  assert.equal(batch.length, 100)
  const { score, detail } = scoreCoverage(batch, RUN)
  near(detail.regionFit, 1)
  near(detail.ummahShare, 0.6)
  assert.equal(detail.ummahMet, 1)
  near(score, 100)
})

test('coverage: a batch in one region is marked down for it, and under the floor in proportion', () => {
  const middleEast = scoreCoverage(inRegion('ME', 6), RUN).detail
  near(middleEast.regionFit, TARGET_BALANCE.regions.ME, 'e to the minus KL of one region is its target share')
  assert.equal(middleEast.ummahMet, 1)

  const europe = scoreCoverage(inRegion('EU', 6), RUN)
  near(europe.detail.regionFit, TARGET_BALANCE.regions.EU)
  assert.equal(europe.detail.ummahMet, 0)
  near(europe.score, 40 + TARGET_BALANCE.regions.EU * 30)

  const split = scoreCoverage([...inRegion('EU', 3), ...inRegion('AS', 1)], RUN).detail
  near(split.ummahShare, 0.25)
  near(split.ummahMet, 0.5, 'a quarter in the floor regions is half the floor')
  assert.deepEqual(scoreCoverage([]), { score: 0, detail: { reason: 'no articles' } })
})

// It was 1.0 in all 365 records of schema 2: the age came from two frontmatter
// keys no article carries, and no age at all was scored as none.
test('coverage: freshness is the median age of the stories when the cycle began', () => {
  /** @param {number[]} days */
  const aged = (...days) => scoreCoverage(days.map((d) => row({ date: RUN - d * DAY })), RUN)
  const base = aged(0).score
  near(base, 40 + TARGET_BALANCE.regions.EU * 30, 'published as the cycle began: all forty')

  assert.deepEqual([aged(1).detail.medianAgeDays, aged(1).detail.freshness], [1, 0.5])
  near(aged(1).score, base - 20, 'a day old is half')
  near(aged(3).score, base - 30, 'three days old is a quarter')
  assert.equal(aged(0, 0.5, 3).detail.medianAgeDays, 0.5, 'the middle one')
  assert.equal(aged(0, 1, 2, 9).detail.medianAgeDays, 2, 'of an even number, the later of the middle two')

  assert.equal(aged(-0.25).detail.freshness, 1, 'a story dated after the start is new, not from the future')
  const undated = scoreCoverage([row({ date: Number.NaN }), row({ date: RUN - DAY })], RUN).detail
  assert.equal(undated.medianAgeDays, 1, 'an article with no date is left out of the median')
  const none = scoreCoverage([row({ date: Number.NaN })], RUN)
  assert.deepEqual([none.detail.medianAgeDays, none.detail.freshness], [null, 0], 'and a batch with none earns nothing for it')
  near(none.score, base - 40)
})

test('coverage: where a story is comes from its coordinates, then its first placed source', () => {
  const regions = (over) => Object.keys(scoreCoverage([row(over)], RUN).detail.observedRegions)
  assert.deepEqual(regions({}), ['EU'], 'Lyon')
  assert.deepEqual(regions({ sourceCountries: ['PK'] }), ['EU'], 'the dateline, not the outlet')
  assert.deepEqual(regions({ lat: null, lng: null, sourceCountries: ['null', 'QA', 'US'] }), ['ME'])
  assert.deepEqual(regions({ lat: null, lng: null, sourceCountries: [] }), ['GL'])
  assert.deepEqual(regions({ lat: AT.GL[0], lng: AT.GL[1] }), ['GL'], 'a dateline in no region')
})

// ── The guardrails ───────────────────────────────────────────────────

/** A batch that meets every category floor, one article over. */
const meetingFloors = () => Object.entries(CATEGORY_FLOORS).flatMap(([category, floor]) => Array.from({ length: floor }, (_, i) => row({ slug: `2026-10-09-${category}-${i}`, category })))

test('guardrails: a sound batch that meets the floors has no failure', () => {
  assert.ok(meetingFloors().length >= 8)
  assert.deepEqual(checkGuardrails(meetingFloors()), [])
})

test('guardrails: a floor a category misses is named, except one that may go unmet', () => {
  for (const [category, floor] of Object.entries(CATEGORY_FLOORS)) {
    const short = meetingFloors().filter((a) => a.slug !== `2026-10-09-${category}-0`)
    const expected = FLOORS_MAY_GO_UNMET.has(category) ? [] : [`category ${category} below floor ${floor} (got ${floor - 1})`]
    assert.deepEqual(checkGuardrails(short), expected, category)
  }
})

test('guardrails: a thin batch, an article with a field missing, a source with no country', () => {
  const batch = meetingFloors()
  batch[0] = row({ slug: 'no-title', title: '', category: batch[0].category })
  batch[1] = row({ slug: 'short', body: 'Lyon — Too short.', category: batch[1].category })
  batch[2] = row({ slug: 'unplaced', sourceCountries: ['PK', 'null'], category: batch[2].category })
  assert.deepEqual(checkGuardrails(batch), [
    'article no-title missing fields or body too short',
    'article short missing fields or body too short',
    'article unplaced has source with country:null',
  ])
  assert.ok(checkGuardrails(meetingFloors().slice(0, 7)).includes('publish count 7 below floor 8'))
  assert.ok(checkGuardrails([]).includes('publish count 0 below floor 8'))
})

// ── The record ───────────────────────────────────────────────────────

test('the record carries every key the series has carried, and rounds to two places', () => {
  const batch = [row({ sourceNames: ['Dawn', 'Reuters'] }), row({ sourceNames: ['Dawn'] }), row({ sourceNames: ['Dawn', 'AFP', 'BBC'] }), row({ sourceNames: ['Al Jazeera'] })]
  const record = rvsRecord(batch, { now: new Date('2026-10-09T05:15:32.349Z'), runStarted: RUN, runId: '2026-10-09_0501' })
  assert.deepEqual(Object.keys(record), ['ts', 'cycleId', 'runId', 'cycleHour', 'schema', 'rvs', 'clusters', 'articleCount', 'briefCount', 'guardrailFailures', 'degenerate'])
  assert.deepEqual(Object.keys(record.clusters), ['picking', 'writing', 'briefing', 'sourcing', 'coverage'])
  assert.deepEqual(record, {
    ts: '2026-10-09T05:15:32.349Z',
    cycleId: '2026-10-09T05-15',
    runId: '2026-10-09_0501',
    cycleHour: '05',
    schema: SCHEMA,
    rvs: 65.78,
    // Lyon four times: all of it in Europe, none in the floor's regions.
    clusters: { picking: null, writing: 100, briefing: null, sourcing: 41.43, coverage: 44.5 },
    articleCount: 4,
    briefCount: 0,
    guardrailFailures: checkGuardrails(batch),
    degenerate: false,
  })
  assert.ok(record.guardrailFailures.includes('publish count 4 below floor 8'))
  near(record.rvs, 100 * 0.4 + (30 + (2 / 7) * 40) * 0.3 + 44.5 * 0.3, 'two fifths writing, three tenths each sourcing and coverage', 0.01)
})

test('the record is schema 3, and a story is aged against the start of the cycle, not the minute it was scored', () => {
  assert.equal(SCHEMA, 3, 'freshness changed what coverage and the score mean at 3: bump it if either changes again')
  const scored = new Date(RUN + 0.5 * DAY)
  const batch = [row({ date: RUN - DAY }), row({ date: RUN - DAY })]
  assert.equal(rvsRecord(batch, { now: scored, runStarted: RUN }).clusters.coverage, 24.5, 'a day old: 20 + 4.5')
  assert.equal(rvsRecord(batch, { now: scored }).clusters.coverage, 20.5, 'with no start known, the clock: a day and a half')
})

// `cycleId` is the minute of scoring (`2026-10-09T05-15` for the cycle that
// began 05:01), which names no log and no run record.
test('the record names its run, and says so when it was scored outside one', () => {
  assert.equal(rvsRecord([row()], { runId: '2026-10-09_0501' }).runId, '2026-10-09_0501')
  assert.equal(rvsRecord([row()]).runId, null)
})

test('a batch under four articles is marked degenerate, and an empty one scores nothing', () => {
  assert.equal(rvsRecord([row(), row(), row()]).degenerate, true)
  assert.equal(rvsRecord([row(), row(), row(), row()]).degenerate, false)
  const empty = rvsRecord([])
  assert.deepEqual([empty.rvs, empty.articleCount, empty.degenerate], [0, 0, true])
  assert.deepEqual(empty.clusters, { picking: null, writing: 0, briefing: null, sourcing: 0, coverage: 0 })
})

test('the trend gains a record at its end, is made when there is none, and keeps its last 365', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rvs-')), 'trend.json')
  const record = rvsRecord([row()], { now: new Date('2026-10-09T05:15:32.349Z') })
  appendRecord(path, record)
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), [record])

  writeFileSync(path, JSON.stringify(Array.from({ length: 365 }, (_, i) => ({ n: i }))))
  appendRecord(path, record)
  const trend = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(trend.length, 365)
  assert.deepEqual([trend[0], trend[364]], [{ n: 1 }, record])
})

// The stage is a few lines around the functions above. It ran on import until
// it was moved onto `runStage`, so nothing could ask whether it still loads.
test('the stage that writes the record can be imported, and does not run when it is', async () => {
  const stage = await import('../score-production-cycle.js')
  assert.equal(typeof stage.main, 'function')
})
