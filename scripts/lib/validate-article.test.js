// Run: node --test scripts/lib/validate-article.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FILENAME_DATE_MARGIN_MS } from './article-files.js'
import { parseCycleLog } from './cycle-log.js'
import { parseFrontmatter } from './frontmatter.js'
import { WINDOW_MS, createValidator, duplicateKey, normTitle, publishedKeys } from './validate-article.js'

const BLOCKS = ['The first block of a story.', 'The second block says why it matters.', 'The third block gives the mechanism.', 'The fourth block says what comes next.']

/**
 * An article as the writer saves it: `chart:` above `sources:`.
 * A key set to undefined is left out; `blocks` are the body's, `dateline` is
 * what the first one opens with.
 *
 * @param {Record<string, any>} [opts]
 */
function article({ blocks = BLOCKS, dateline = 'Lyon', ...over } = {}) {
  const front = {
    title: '"Trade Body Doubles Its Growth Forecast"',
    date: '"2026-10-08T17:00:00Z"',
    category: '"economy"',
    location: '"Lyon"',
    chart: undefined,
    sources: '\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/2035725"',
    ...over,
  }
  const yaml = Object.entries(front).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}:${String(v).startsWith('\n') ? '' : ' '}${v}`).join('\n')
  const [first, ...rest] = blocks
  return `---\n${yaml}\n---\n\n${[dateline ? `${dateline} — ${first}` : first, ...rest].join('\n\n')}\n`
}
const source = (url, name = 'Dawn') => `\n  - name: "${name}"\n    url: "${url}"`
const validator = (known = {}) => createValidator({ published: [], offeredBySlug: new Map(), knownIds: new Set(), ...known })
const FILE = '2026-10-08-trade-body.md'

test('an article in the writer\'s shape ships untouched', () => {
  const v = validator()
  assert.deepEqual(v.check(article(), FILE), { bad: null, text: null, events: [], problems: [] })
  assert.deepEqual(v.counts, { removed: 0, repaired: 0, chartsSet: 0, chartsDropped: 0, chartsCited: 0 })
})

test('what cannot be read as an article is stopped, with the reason', () => {
  const v = validator()
  assert.equal(v.check('Just prose.\n', FILE).bad, 'no frontmatter')
  // A headline with a quote inside its quotes: what `socialTitle` once did to five cycles.
  assert.match(v.check(article({ title: '"Record "$50 Billion" Deal"' }), FILE).bad ?? '', /^unparseable frontmatter: /)
  // The reason names the field. As "missing fields" it sent eight articles
  // aside in four cycles (2026-10-06 and 07), every one for want of `location`.
  for (const key of ['title', 'date', 'category', 'location', 'sources']) {
    assert.equal(v.check(article({ [key]: undefined }), FILE).bad, `missing ${key}`)
  }
  assert.equal(v.check(article({ sources: ' []' }), FILE).bad, 'missing sources', 'a source list with nothing in it')
  assert.equal(v.check(article({ location: undefined, date: undefined, sources: undefined }), FILE).bad, 'missing date, location, sources', 'all of them, in one order')
  assert.equal(v.counts.removed, 9)
})

// The stage prints `SKIP (<reason>): <file>`. The cycle counts the lines that
// open `SKIP (` (`validate`, `lib/cycle-steps.js`) and the run record takes the
// reason from between the brackets (`lib/cycle-log.js`).
test('a reason reaches the run record whole, brackets and commas in it or not', () => {
  const v = validator()
  const batch = [
    [article({ location: undefined, date: undefined }), 'content/articles/2026-10-08-a.md'],
    [article(), 'content/articles/2026-10-08-b.md'],
    [article({ sources: source('https://www.reuters.com/y') }), 'content/articles/2026-10-08-c.md'],
    [article({ location: '"Paris"', title: '"Another Headline"', sources: source('https://www.reuters.com/z') }), 'content/articles/2026-10-08-d.md'],
  ]
  const lines = batch.map(([raw, file]) => [v.check(raw, file.replace(/.*\//, '')).bad, file]).filter(([bad]) => bad).map(([bad, file]) => `SKIP (${bad}): ${file}`)
  assert.deepEqual(parseCycleLog(lines.join('\n')).skips, [
    { reason: 'missing date, location', file: 'content/articles/2026-10-08-a.md' },
    { reason: 'duplicate of 2026-10-08-b.md (same title)', file: 'content/articles/2026-10-08-c.md' },
    { reason: 'location "Paris" is not the dateline city "Lyon"', file: 'content/articles/2026-10-08-d.md' },
  ])
  assert.ok(lines.every((line) => line.startsWith('SKIP (')))
})

test('two to five blocks ship, and outside that the file is malformed', () => {
  const more = [...BLOCKS, 'A fifth block, earned by a counterpoint.', 'A sixth block, which is one too many.']
  const v = validator()
  const verdictFor = (n) => v.check(article({ blocks: more.slice(0, n), title: `"Headline Number ${n} Of Its Own"`, sources: source(`https://www.dawn.com/news/${n}`) }), `2026-10-08-n${n}.md`).bad
  assert.equal(verdictFor(1), '1 blocks')
  for (const n of [2, 3, 4, 5]) assert.equal(verdictFor(n), null, `${n} blocks`)
  assert.equal(verdictFor(6), '6 blocks')
})

// The two articles the validator's own cut of the file cost, byte for byte as
// it moved them aside (2026-09-27 14:19 and 2026-10-01 14:14 UTC). Each is
// five blocks under the right dateline, and each has a `---` inside a link:
// a source's `url:` in one, an `image:` the scaffold stage had added in the
// other. The cut took the prose to start there, counted the rest of the
// frontmatter as a block, and said "6 blocks".
const QUARANTINED = [
  '2026-09-27-oleshky-drone-food-deliveries-occupied-kherson.md',
  '2026-10-01-uae-prosecutor-probes-flydubai-cockpit-attack-pilot-vetting.md',
]
const quarantined = (/** @type {string} */ name) => readFileSync(new URL(`./fixtures/quarantined/${name}`, import.meta.url), 'utf8')

test('a `---` inside a link does not end the frontmatter: the two articles it cost are five blocks and ship', () => {
  for (const name of QUARANTINED) {
    assert.match(quarantined(name), /^ {4}(url|image): ".*---.*"$/m, 'the fixture still holds its dashes')
    assert.deepEqual(validator().check(quarantined(name), name), { bad: null, text: null, events: [], problems: [] }, name)
  }
})

test('under such a link four blocks are four, six are six, and a dateline goes back on the prose', () => {
  const dashed = (/** @type {number} */ n) => source(`https://www.hindustantimes.com/specials/flydubai-FZ1073---HT-Immersive-${n}/index.html`)
  const v = validator()
  // It read as five blocks with no dateline, and "restored" one inside the link.
  assert.deepEqual(v.check(article({ sources: dashed(1) }), 'a.md'), { bad: null, text: null, events: [], problems: [] })
  const six = [...BLOCKS, 'A fifth block, earned by a counterpoint.', 'A sixth block, which is one too many.']
  assert.equal(v.check(article({ blocks: six, title: '"A Second Headline"', sources: dashed(2) }), 'b.md').bad, '6 blocks')

  const bare = article({ dateline: null, title: '"A Third Headline"', sources: dashed(3) })
  const mended = v.check(bare, 'c.md')
  assert.deepEqual(mended.events, ['REPAIRED (dateline "Lyon — " restored)'])
  assert.equal(mended.text, bare.replace('\n\nThe first block', '\n\nLyon — The first block'))
  assert.equal(parseFrontmatter(mended.text ?? '').meta.sources[0].url, 'https://www.hindustantimes.com/specials/flydubai-FZ1073---HT-Immersive-3/index.html')
})

test('a missing dateline is restored from the location, and a wrong one stops the article', () => {
  const v = validator()
  const bare = article({ dateline: null })
  const mended = v.check(bare, FILE)
  assert.equal(mended.bad, null)
  assert.deepEqual(mended.events, ['REPAIRED (dateline "Lyon — " restored)'])
  assert.equal(mended.text, bare.replace('The first block', 'Lyon — The first block'))
  assert.equal(parseFrontmatter(mended.text ?? '').body.startsWith('Lyon — The first block of a story.'), true)
  assert.equal(v.counts.repaired, 1)

  assert.equal(v.check(article({ dateline: null, location: '""' }), 'b.md').bad, 'no dateline and no location')
  assert.equal(v.check(article({ location: '"Paris"' }), 'c.md').bad, 'location "Paris" is not the dateline city "Lyon"')
})

test('a city with a dollar sign in its name is restored as written', () => {
  // The replacement is a function: as a string, `$&` and `$1` would be read as patterns.
  const out = validator().check(article({ dateline: null, location: '"St. $& Mary"' }), FILE)
  assert.ok(out.text?.includes('\n\nSt. $& Mary — The first block of a story.'))
})

test('the same first source or the same title within 72 hours is a duplicate', () => {
  const published = [duplicateKey('2026-10-07-earlier.md', { date: '2026-10-07T09:00:00Z', title: 'An Earlier Story Entirely', sources: [{ url: 'https://www.dawn.com/news/2035725?utm_source=x' }] })]
  const v = validator({ published })
  assert.equal(v.check(article(), FILE).bad, 'duplicate of 2026-10-07-earlier.md (same source URL)', 'tracking parameters do not make it another link')

  const other = article({ sources: source('https://www.dawn.com/news/777') })
  assert.equal(v.check(other, 'first.md').bad, null)
  assert.equal(v.check(article({ title: '"Trade body doubles its growth forecast!"', sources: source('https://www.reuters.com/y') }), 'second.md').bad, 'duplicate of first.md (same title)', 'an earlier file of the batch counts, and case and punctuation do not')
  assert.equal(published.length, 1, 'the caller\'s list is not written to')

  // Two links that key nothing are both '' and were reported as "same source URL".
  const fronts = validator()
  assert.equal(fronts.check(article({ sources: source('https://www.dawn.com/') }), 'a.md').bad, null)
  assert.equal(fronts.check(article({ sources: source('https://www.reuters.com/') }), 'b.md').bad, 'duplicate of a.md (same title)', 'the title is what the two share')
})

test('four days apart is another story, and nothing matches on an empty title or link', () => {
  const published = [
    duplicateKey('2026-10-04-old.md', { date: '2026-10-04T16:00:00Z', title: 'Trade Body Doubles Its Growth Forecast', sources: [{ url: 'https://www.dawn.com/news/2035725' }] }),
    duplicateKey('2026-10-08-blank.md', { date: '2026-10-08T16:00:00Z', title: '', sources: [] }),
  ]
  assert.equal(validator({ published }).check(article(), FILE).bad, null)
  // A link that names a site and not a story keys nothing (`normalizeUrl`).
  const v = validator()
  assert.equal(v.check(article({ sources: source('https://www.dawn.com/') }), 'a.md').bad, null)
  assert.equal(v.check(article({ title: '"Another Headline Altogether"', sources: source('https://www.dawn.com/') }), 'b.md').bad, null)
})

// The stage read "the last four days by filename": a second number that had to
// cover the gate's 72 hours, and a cut by filename where the gate compares
// `date`. The same link written up again later than that carries the first
// article's `date`, and the first article was not among what the gate was shown.
test('the gate is shown every article that could be dated inside its window, and not the batch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'published-'))
  const now = Date.parse('2026-10-08T18:00:00Z')
  const day = (/** @type {number} */ ms) => new Date(ms).toISOString().slice(0, 10)
  const floor = now - WINDOW_MS - FILENAME_DATE_MARGIN_MS
  /** @param {string} name @param {number} n */
  const put = (name, n, date = '2026-10-07T09:00:00Z') => writeFileSync(join(dir, name), article({ title: `"Headline Number ${n}"`, date: `"${date}"`, sources: source(`https://www.dawn.com/news/${n}`) }))
  put('2026-10-08-in-the-batch.md', 1)
  put('2026-10-07-yesterday.md', 2)
  put('2026-09-21-filed-long-ago.md', 3, '2026-09-21T09:00:00Z')
  put(`${day(floor)}-on-the-edge.md`, 4)
  put(`${day(floor - 86400000)}-past-it.md`, 5)
  writeFileSync(join(dir, '2026-10-07-does-not-parse.md'), article({ title: '"A "Quote" Inside"' }))
  writeFileSync(join(dir, '2026-10-07-moved-aside.md.bad'), article())

  const keys = publishedKeys(dir, now, new Set(['2026-10-08-in-the-batch.md']))
  assert.deepEqual(keys.map((k) => k.slug).sort(), ['2026-09-21-filed-long-ago.md', '2026-10-07-yesterday.md', `${day(floor)}-on-the-edge.md`].sort())
  assert.deepEqual(keys.find((k) => k.slug === '2026-10-07-yesterday.md'), duplicateKey('2026-10-07-yesterday.md', { date: '2026-10-07T09:00:00Z', title: 'Headline Number 2', sources: [{ url: 'https://www.dawn.com/news/2' }] }))

  // What it is for: a link first published seventeen days ago, written up again with the source's own date.
  const v = validator({ published: keys })
  const again = article({ title: '"Told A Second Time"', date: '"2026-09-21T09:00:00Z"', sources: source('https://www.dawn.com/news/3') })
  assert.equal(v.check(again, '2026-10-08-told-a-second-time.md').bad, 'duplicate of 2026-09-21-filed-long-ago.md (same source URL)')
  // The dates still decide: the same headline over this week's event is another story.
  assert.equal(v.check(article({ title: '"Headline Number 3"', sources: source('https://www.dawn.com/news/9') }), '2026-10-08-same-words.md').bad, null)
})

test('normTitle keeps letters, digits and single spaces', () => {
  assert.equal(normTitle('  Trump’s “$100,000” Fee — Explained  '), 'trumps 100000 fee explained')
  assert.equal(normTitle(undefined), '')
})

test('a chart the story was not offered is taken out, and the article ships', () => {
  const offeredBySlug = new Map([
    ['2026-10-08-trade-body', [{ id: 'brent', chart: true, level: 71.2 }, { id: 'gold', chart: false, level: 2650 }]],
    ['2026-10-08-other', []],
  ])
  const v = validator({ offeredBySlug })
  const out = v.check(article({ chart: '"wti"' }), FILE)
  assert.equal(out.bad, null)
  assert.deepEqual(out.events, ['CHART DROPPED ("wti" was not offered for this story)'])
  assert.equal(out.text, article(), 'only the chart line is gone')

  assert.deepEqual(v.check(article({ chart: '"gold"', title: '"A Second Headline"', sources: source('https://www.dawn.com/news/2') }), FILE).events, ['CHART DROPPED ("gold" has no chart the app can draw)'])
  // Another story's offer is not this one's.
  assert.deepEqual(v.check(article({ chart: '"brent"', title: '"A Third Headline"', sources: source('https://www.dawn.com/news/3') }), '2026-10-08-other.md').events, ['CHART DROPPED ("brent" was not offered for this story)'])
  assert.deepEqual(v.counts, { removed: 0, repaired: 0, chartsSet: 3, chartsDropped: 3, chartsCited: 0 })
})

// The batch is every article the last commit does not hold. One a failed build
// or deploy left on disk is in the next cycle's batch, written from a selection
// that is gone: against this cycle's it had been offered nothing, and its chart
// was taken out as "not offered for this story".
test('an article this selection does not name keeps a chart the build can resolve', () => {
  const offeredBySlug = new Map([['2026-10-08-trade-body', [{ id: 'brent', chart: true, level: 71.2 }]]])
  const v = validator({ offeredBySlug, knownIds: new Set(['brent', 'cp:hormuz']) })
  assert.deepEqual(v.check(article({ chart: '"cp:hormuz"' }), '2026-10-07-carried-over.md'), { bad: null, text: null, events: [], problems: [] })
  // Not any word: what the build cannot resolve still goes, as on a rerun.
  assert.deepEqual(v.check(article({ chart: '"invented"', title: '"A Second Headline"', sources: source('https://www.dawn.com/news/2') }), '2026-10-07-also-carried.md').events, ['CHART DROPPED ("invented" is not a known series)'])
  // And a story the selection does name is held to its own offer.
  assert.deepEqual(v.check(article({ chart: '"cp:hormuz"', title: '"A Third Headline"', sources: source('https://www.dawn.com/news/3') }), FILE).events, ['CHART DROPPED ("cp:hormuz" was not offered for this story)'])
  assert.deepEqual(v.counts, { removed: 0, repaired: 0, chartsSet: 3, chartsDropped: 2, chartsCited: 0 })
})

test('an offered chart stands, and is counted as cited when the prose quotes its figure', () => {
  const offeredBySlug = new Map([
    ['2026-10-08-cites', [{ id: 'brent', chart: true, level: 71.2 }]],
    ['2026-10-08-silent', [{ id: 'cp:hormuz', chart: true, level: 12 }]],
  ])
  const v = validator({ offeredBySlug })
  const cites = [BLOCKS[0], 'Brent crude stood at $71.20 a barrel.', ...BLOCKS.slice(2)]
  assert.deepEqual(v.check(article({ chart: '"brent"', blocks: cites }), '2026-10-08-cites.md'), { bad: null, text: null, events: [], problems: [] })
  // An old id for the series is read as the one it became.
  assert.equal(v.check(article({ chart: '"portwatch-hormuz-tanker"', title: '"A Second Headline"', sources: source('https://www.dawn.com/news/2') }), '2026-10-08-silent.md').text, null)
  assert.deepEqual(v.counts, { removed: 0, repaired: 0, chartsSet: 2, chartsDropped: 0, chartsCited: 1 })
})

test('with no selection, a chart stands on any series the build can resolve', () => {
  const v = validator({ knownIds: new Set(['brent']) })
  assert.deepEqual(v.check(article({ chart: '"brent"' }), 'a.md').events, [])
  assert.deepEqual(v.check(article({ chart: '"invented"', title: '"A Second Headline"', sources: source('https://www.dawn.com/news/2') }), 'b.md').events, ['CHART DROPPED ("invented" is not a known series)'])
  assert.deepEqual(v.check(article({ chart: '""', title: '"A Third Headline"', sources: source('https://www.dawn.com/news/3') }), 'c.md').events, ['CHART DROPPED (empty)'])
})

// Until 2026-10-09 the line was removed by a pattern that needed another line
// after it inside the block, so a `chart:` written last was logged as dropped
// and stayed in the file.
test('a refused chart is taken out wherever in the frontmatter it stands', () => {
  const last = article().replace('\n---\n\n', '\nchart: "invented"\n---\n\n')
  const out = validator().check(last, FILE)
  assert.deepEqual(out.events, ['CHART DROPPED ("invented" is not a known series)'])
  assert.equal(out.text, article(), 'the last line of the block')

  const first = article().replace('---\ntitle:', '---\nchart: "invented"\ntitle:')
  assert.equal(validator().check(first, FILE).text, article(), 'and the first')
})

test('a block two articles share is reported, by its text or by its run of figures', () => {
  const v = validator()
  const level = 'Brent crude stood at 71.20 dollars, down 8.5 percent in 14 days.'
  const reworded = 'Brent crude was 71.20 dollars after an 8.5 percent fall over 14 days.'
  const n = (i, blocks) => v.check(article({ blocks, title: `"Headline Number ${i} Of Its Own"`, sources: source(`https://www.dawn.com/news/${i}`) }), `n${i}.md`)
  n(1, [BLOCKS[0], level, BLOCKS[2], BLOCKS[3]])
  n(2, [BLOCKS[0], BLOCKS[1], reworded, 'It ends otherwise.'])
  n(3, [BLOCKS[0], 'A [linked](country:FR) block of its own here.', BLOCKS[2], 'Short one.'])
  n(4, [BLOCKS[0], 'A linked block of its own here.', 'Something else entirely.', 'Short one.'])
  // The same three figures, one of them ending its sentence in the first and
  // not in the second. With the full stop kept on it, these were two runs.
  const closed = 'Gold closed at 2,650 dollars, up 3.1 percent since day 12.'
  n(5, [BLOCKS[0], closed, 'A third block that only the fifth has.', 'And its fourth.'])
  n(6, [BLOCKS[0], 'Gold was 2,650 dollars after a 3.1 percent rise, 12 days on.', 'A third block that only the sixth has.', 'And its own end.'])
  assert.deepEqual(v.repeats(), [
    { files: ['n1.md', 'n2.md'], text: level },
    { files: ['n1.md', 'n3.md'], text: BLOCKS[2] },
    { files: ['n3.md', 'n4.md'], text: 'A linked block of its own here.' },
    { files: ['n5.md', 'n6.md'], text: closed },
  ])
  // Not reported: the opening block all four share, and a key under 12 characters.
})

test('a state outlet as the only source must be named in the body', () => {
  const rt = source('https://www.rt.com/news/600000-x/', 'RT')
  const v = validator()
  assert.equal(v.check(article({ sources: rt }), 'a.md').bad, 'only source is Russian state outlet RT, and the body does not name it')
  const named = [BLOCKS[0], 'Russian state outlet RT reported the claim, which could not be checked.', ...BLOCKS.slice(2)]
  assert.equal(v.check(article({ sources: rt, blocks: named, title: '"A Second Headline"' }).replace('600000', '600001'), 'b.md').bad, null)
  // A second, unclassified source is enough: the claim is no longer one outlet's alone.
  assert.equal(v.check(article({ sources: `${source('https://www.rt.com/news/600002-x/', 'RT')}${source('https://www.dawn.com/news/9')}`, title: '"A Third Headline"' }), 'c.md').bad, null)
})

test('a late gate keeps what the early ones did: the repair, the chart, the count', () => {
  const v = validator()
  const raw = article({ dateline: null, chart: '"invented"', sources: source('https://www.rt.com/news/600000-x/', 'RT') })
  const out = v.check(raw, 'a.md')
  assert.equal(out.bad, 'only source is Russian state outlet RT, and the body does not name it')
  assert.deepEqual(out.events, ['REPAIRED (dateline "Lyon — " restored)', 'CHART DROPPED ("invented" is not a known series)'])
  assert.equal(out.text, article({ sources: source('https://www.rt.com/news/600000-x/', 'RT') }), 'what is moved aside is the mended file')
  // Its blocks count toward the repeats,
  assert.equal(v.check(article({ title: '"Another Headline"', sources: source('https://www.reuters.com/z') }), 'b.md').bad, null)
  // and the duplicate gate had accepted it before it was stopped, so a second copy is a duplicate of it.
  assert.equal(v.check(article({ title: '"A Third Headline"', sources: source('https://www.rt.com/news/600000-x/', 'RT') }), 'c.md').bad, 'duplicate of a.md (same source URL)')
  assert.deepEqual(v.repeats().map((r) => r.files), [['a.md', 'b.md'], ['a.md', 'b.md'], ['a.md', 'b.md']])
  assert.deepEqual(v.counts, { removed: 2, repaired: 1, chartsSet: 1, chartsDropped: 1, chartsCited: 0 })
})

test('where a shipped article departs from the contract is reported and costs it nothing', () => {
  const out = validator().check(article({ category: '"sport"', sources: source('dawn.com/news/2035725') }), FILE)
  assert.equal(out.bad, null)
  assert.deepEqual(out.problems, ['invalid category sport', 'source bad url dawn.com/news/2035725'])
})

// No test starts the stage script: its lists are the cycle's own, in /tmp. So
// this much is asked of its text. An article is a record and nothing writes it
// again, so what the stage writes back goes through `writeText`, whole or not
// at all, where `writeFileSync` truncates first and a kill in between leaves
// an empty file.
test('the stage writes a mended article back whole', () => {
  const stage = readFileSync(new URL('../validate-articles.js', import.meta.url), 'utf8')
  assert.match(stage, /\bwriteText\(/)
  assert.doesNotMatch(stage, /\bwriteFileSync\b/)
})
