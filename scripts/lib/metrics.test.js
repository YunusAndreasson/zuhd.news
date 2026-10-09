// Run: node --test scripts/lib/metrics.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeDiversity, computeEducational, computeFreshness, computeSourcing, cycleRow, dailyMetrics, findDuplicates, metricsRow, sourcingRow } from './metrics.js'

const ARTICLE = `---
title: "Trade Body Doubles Its Growth Forecast"
date: "2026-10-08T17:00:00Z"
category: "economy"
location: "Geneva"
lat: 46.2
lng: 6.14
sources:
  - name: "Dawn"
    url: "https://www.dawn.com/news/2035725"
    country: "PK"
  - name: "Reuters"
    url: "https://www.reuters.com/x"
    image: "https://img.reuters.com/x.jpg"
concepts:
  - "World Trade Organization"
---

Geneva — The first block.

The second block.
`
/** @param {Record<string, any>} over */
const row = (over = {}) => ({ ...metricsRow('2026-10-08-wto.md', ARTICLE), ...over })

test('an article is read through the parser: the fields, every source name, the first link', () => {
  assert.deepEqual(metricsRow('2026-10-08-wto.md', ARTICLE), {
    slug: '2026-10-08-wto',
    title: 'Trade Body Doubles Its Growth Forecast',
    date: '2026-10-08T17:00:00Z',
    source: 'Dawn',
    sources: ['Dawn', 'Reuters'],
    sourceUrl: 'https://www.dawn.com/news/2035725',
    category: 'economy',
    location: 'Geneva',
    lat: 46.2,
    lng: 6.14,
  })
})

// Where the reader of its own that this replaced on 2026-10-09 answered
// otherwise: it kept a quoted value's escapes, read 0 as no coordinate, took a
// line of prose for a field, and counted a file the build could not have read.
test('quoting, a bare date and a coordinate of 0 are read as YAML reads them', () => {
  const odd = metricsRow('2026-10-08-odd.md', `---
title: "He Said \\"No\\" Twice"
date: 2026-10-01T06:00:00Z
category: 'tech'
lat: 0
lng: 0
sources:
  - name: 'L''Orient-Le Jour'
    url: 'https://www.lorientlejour.com/article/1'
  - name: Bare Name
    url: https://example.org/bare
---

Lyon — Body.
`)
  assert.equal(odd.title, 'He Said "No" Twice')
  assert.deepEqual(odd.sources, ["L'Orient-Le Jour", 'Bare Name'])
  assert.equal(odd.date, '2026-10-01T06:00:00Z', 'a date without quotes is read all the same')
  assert.equal(odd.category, 'tech')
  assert.deepEqual([odd.lat, odd.lng], [0, 0], 'the equator and the meridian are places')
  assert.equal(odd.sourceUrl, 'https://www.lorientlejour.com/article/1')
})

test('a file with no frontmatter has no fields, and one that does not parse is refused', () => {
  assert.deepEqual(metricsRow('2026-10-08-prose.md', 'Just prose.\ncategory: tech\n'), {
    slug: '2026-10-08-prose', title: '', date: '', source: '', sources: [], sourceUrl: '', category: '', location: '', lat: null, lng: null,
  })
  assert.throws(() => metricsRow('x.md', ARTICLE.replace('"Trade Body', '"Trade "Body')))
})

test('freshness counts only an article dated at or before its filename\'s midnight', () => {
  const day = (/** @type {string} */ date, slug = '2026-10-08-x') => row({ date, slug })
  assert.deepEqual(computeFreshness([]), { median: null, p90: null, max: null, count: 0 })
  // As found: a story dated later on the day it was published has a negative age and is left out.
  assert.deepEqual(computeFreshness([day('2026-10-08T17:00:00Z')]), { median: null, p90: null, max: null, count: 0 })
  assert.deepEqual(computeFreshness([day('2026-10-08T00:00:00Z'), day('2026-10-07T12:00:00Z'), day('2026-10-01T00:00:00Z'), day('not a date'), day('2026-10-08T09:00:00Z')]), {
    median: 0.5,
    p90: 7,
    max: 7,
    count: 3,
  })
})

test('diversity tallies categories, source names and regions, with a name for what is missing', () => {
  const out = computeDiversity([
    row(),
    row({ category: 'science', sources: ['Phys.org'], source: 'Phys.org', lat: 40.71, lng: -74.0 }),
    row({ category: '', sources: [], source: '', lat: null, lng: null }),
    row({ category: 'science', sources: ['Phys.org', 'Dawn', 'Nature'], lat: 30.04, lng: 31.24 }),
  ])
  assert.deepEqual(out, {
    categories: { economy: 1, science: 2, unknown: 1 },
    sources: { Dawn: 2, Reuters: 1, 'Phys.org': 2, unknown: 1, Nature: 1 },
    regions: { EU: 1, AM: 1, unknown: 1, ME: 1 },
    uniqueSources: 5,
    uniqueRegions: 3,
    scienceSources: ['Phys.org', 'Dawn', 'Nature'],
    multiSource: 2,
  })
})

test('the science and tech share of a day', () => {
  assert.deepEqual(computeEducational([row(), row({ category: 'science', sources: ['Phys.org'] }), row({ category: 'tech', sources: ['Ars', 'Phys.org'] })]), {
    scienceCount: 1,
    techCount: 1,
    sciTechRatio: 67,
    scienceSources: ['Phys.org'],
    techSources: ['Ars', 'Phys.org'],
  })
  assert.equal(computeEducational([]).sciTechRatio, 0)
})

test('two articles on one first link are a duplicate', () => {
  const long = `https://example.org/${'x'.repeat(100)}`
  assert.deepEqual(findDuplicates([row({ slug: 'a' }), row({ slug: 'b' }), row({ slug: 'c', sourceUrl: long }), row({ slug: 'd', sourceUrl: long }), row({ slug: 'e', sourceUrl: '' }), row({ slug: 'f', sourceUrl: '' })]), {
    count: 2,
    details: [
      { url: 'https://www.dawn.com/news/2035725', slugs: ['a', 'b'] },
      { url: long.slice(0, 80), slugs: ['c', 'd'] },
    ],
  })
})

test('the sourcing figures read the parsed article, and refuse one that does not parse', () => {
  const r = sourcingRow('2026-10-08-wto.md', ARTICLE)
  assert.equal(r.slug, '2026-10-08-wto')
  assert.equal(r.title, 'Trade Body Doubles Its Growth Forecast')
  assert.deepEqual(r.sources.map((s) => s.name), ['Dawn', 'Reuters'])
  assert.equal(r.body, 'Geneva — The first block.\n\nThe second block.')
  assert.deepEqual([r.lat, r.lng], [46.2, 6.14])
  assert.throws(() => sourcingRow('x.md', ARTICLE.replace('"Trade Body', '"Trade "Body')))
  assert.deepEqual(sourcingRow('x.md', 'Just prose.').sources, [])
  assert.equal(sourcingRow('x.md', '\n Just prose. \n').body, 'Just prose.')
  // A `---` inside a link is not where the body starts: the dateline is still there to find.
  const dashed = sourcingRow('2026-10-08-wto.md', ARTICLE.replace('news/2035725', 'news/a---b-2035725'))
  assert.equal(dashed.body, r.body)
  assert.equal(computeSourcing([dashed], 0).missingDateline, 0)
})

test('a day\'s sourcing: how many stand on one source, where they are datelined, what is missing', () => {
  /** @param {string} slug @param {Record<string, any>} over */
  const s = (slug, over = {}) => ({ ...sourcingRow(`${slug}.md`, ARTICLE), ...over })
  const rt = [{ name: 'RT', url: 'https://www.rt.com/news/600000-x/' }]
  const out = computeSourcing([
    s('geneva'),
    s('new-york', { title: 'Port Strike Enters Second Week', lat: 40.71, lng: -74.0, sources: [{ name: 'AP', url: 'https://apnews.com/x' }] }),
    s('bogota', { title: 'Coffee Growers Reject Export Levy', lat: 4.71, lng: -74.07, sources: rt }),
    s('nowhere', { title: 'Quokka Census Finds Numbers Steady', lat: Number.NaN, lng: Number.NaN, sources: [], body: 'No city opens this body.' }),
    s('twin-a', { title: 'Central Bank Raises Rates After Inflation Surge Shocks Markets' }),
    s('twin-b', { title: 'Central Bank Raises Rates After Inflation Surge Rattles Markets' }),
  ], 2)
  assert.deepEqual(out, {
    articles: 6,
    singleSourcePct: 50,
    multiSourcePct: 50,
    stateOrAdvocacyOnly: 1,
    stateOrAdvocacyOnlySlugs: ['bogota'],
    usDatelinePct: 17,
    latAmDatelinePct: 17,
    missingDateline: 1,
    missingDatelineSlugs: ['nowhere'],
    imageUrlPct: 50,
    sameEventDuplicates: 1,
    sameEventPairs: [['twin-a', 'twin-b']],
    quarantined: 2,
  })
  assert.deepEqual(computeSourcing([], 0), { ...out, articles: 0, singleSourcePct: 0, multiSourcePct: 0, stateOrAdvocacyOnly: 0, stateOrAdvocacyOnlySlugs: [], usDatelinePct: 0, latAmDatelinePct: 0, missingDateline: 0, missingDatelineSlugs: [], imageUrlPct: 0, sameEventDuplicates: 0, sameEventPairs: [], quarantined: 0 })
})

const LOG = [
  '=== zuhd.news editorial cycle ===',
  'Started: Wed Oct  7 10:04:22 PM UTC 2026',
  '',
  '--- Stage 0: API + RSS feed fetch ---',
  'RSS fetch: 77 stories',
  'Merged feed: 15 multi + 45 niche — 14s',
  '',
  '--- Stage 1: Selector ---',
  'Selector exit: 0 — 168s',
  'Selection contains 13 stories',
  'Deduped selection: 13 → 12 (1 duplicates removed)',
  '',
  '--- Stage 2: Writer ---',
  'Writer exit: 124 — 1800s',
  'Writer exit: 0 — 482s',
  '',
  '--- Stage 3: Editor ---',
  'Editor exit: 0 — 128s',
  '',
  '--- Stage 3b: Build & Deploy ---',
  'Build exit: 0',
  'Deploy exit: 0',
]
const DONE = [...LOG, '', '=== Funnel ===', 'Selected:  13', 'Deduped:   12', 'Written:   12', 'Validated: 12', 'Published: 11', '', 'Finished: Wed Oct  7 10:25:22 PM UTC 2026 — total 1261s'].join('\n')

test('a cycle is read from its log: the first attempt of a stage, and no counts while it is still running', () => {
  assert.deepEqual(cycleRow('cycle-2026-10-07_2204.log', DONE), {
    file: 'cycle-2026-10-07_2204.log',
    totalSeconds: 1261,
    feedSeconds: 14,
    selectorSeconds: 168,
    writerSeconds: 1800,
    editorSeconds: 128,
    selected: 13,
    dedupBefore: 13,
    dedupAfter: 12,
    written: 12,
    published: 11,
    deploySuccess: true,
  })
  const running = cycleRow('cycle-2026-10-08_2203.log', LOG.slice(0, 16).join('\n'))
  assert.deepEqual([running.totalSeconds, running.written, running.published, running.deploySuccess, running.editorSeconds], [null, null, null, null, null])
  assert.equal(cycleRow('x.log', DONE.replace('Deploy exit: 0', 'Deploy exit: 1')).deploySuccess, false)
})

test('the record sets a day beside the day before, and averages over the cycles that have the value', () => {
  const done = cycleRow('a.log', DONE)
  const running = cycleRow('b.log', LOG.slice(0, 9).join('\n'))
  const day = (/** @type {any[]} */ logs) => ({ articles: [row()], sourcing: computeSourcing([], 0), logs })
  const m = dailyMetrics('2026-10-08', day([done, running]), day([done]))
  assert.equal(m.date, '2026-10-08')
  assert.deepEqual(m.articlesPublished, { today: 1, yesterday: 1 })
  // The cycle this runs inside is one of today's logs and is counted, but it
  // has no total and no funnel yet. Until 2026-10-09 it was averaged in as 0 s
  // and 0 published: 631 s, 900 s, 64 s and 6 articles here.
  assert.deepEqual(m.cycles, {
    today: { count: 2, completed: 1, avgDuration: 1261, avgSelectorSeconds: 168, avgWriterSeconds: 1800, avgEditorSeconds: 128, avgPublished: 11 },
    yesterday: { count: 1, completed: 1 },
  })
  // 2026-10-08 as the logs have it: four cycles done and the fifth running. It read 869 s and 9.
  const of = (/** @type {number} */ totalSeconds, /** @type {number} */ published) => ({ ...done, totalSeconds, published })
  const oct8 = dailyMetrics('2026-10-08', day([of(1729, 11), of(812, 10), of(934, 12), of(871, 10), running]), day([])).cycles.today
  assert.deepEqual([oct8.count, oct8.avgDuration, oct8.avgPublished], [5, 1087, 11])
  // A day whose only cycle is still running has no average, not an average of 0.
  assert.deepEqual(dailyMetrics('2026-10-08', day([running]), day([])).cycles.today, { count: 1, completed: 0, avgDuration: null, avgSelectorSeconds: 168, avgWriterSeconds: null, avgEditorSeconds: null, avgPublished: null })
  const none = dailyMetrics('2026-10-08', { articles: [], sourcing: null, logs: [] }, { articles: [], sourcing: null, logs: [] })
  assert.deepEqual(none.cycles.today, { count: 0, completed: 0, avgDuration: null, avgSelectorSeconds: null, avgWriterSeconds: null, avgEditorSeconds: null, avgPublished: null })
  assert.deepEqual(none.sourcing, { today: null, yesterday: null })
})
