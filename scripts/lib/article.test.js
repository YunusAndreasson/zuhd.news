// Run: node --test scripts/lib/article.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { articleProblems, datelineOf, readArticle, tryReadArticle, visibleText } from './article.js'
import { CATEGORY_FLOORS } from './dedup.js'
import { ROOT } from './paths.js'
import { CATEGORIES } from './schema.js'

const GOOD = `---
title: "Trade Body Doubles Growth Forecast"
date: "2026-10-08T17:27:44Z"
category: "economy"
location: "Geneva"
lat: 46.20
lng: 6.14
sources:
  - name: "Dawn"
    url: "https://www.dawn.com/news/2035725"
    country: "PK"
---

Geneva — The World Trade Organisation doubled its 2026 goods-trade forecast.

AI-enabling goods made up 47% of merchandise trade growth in value, the organisation said.

[Pakistan](country:PK)'s sea freight exports rose 73% in the first half.

The organisation ties its 4.1% forecast for 2027 to a timely end of the conflict.
`

function inTemp(run) {
  const dir = mkdtempSync(join(tmpdir(), 'zuhd-article-'))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('an article reads as its slug, its frontmatter and its prose', () => {
  inTemp((dir) => {
    const path = join(dir, '2026-10-08-wto-doubles-forecast.md')
    writeFileSync(path, GOOD)
    const a = readArticle(path)
    assert.equal(a.slug, '2026-10-08-wto-doubles-forecast')
    assert.equal(a.raw, GOOD)
    assert.equal(a.meta.title, 'Trade Body Doubles Growth Forecast')
    assert.equal(a.meta.sources?.[0].country, 'PK')
    assert.ok(a.body.startsWith('Geneva — The World Trade'))
    assert.ok(!a.body.includes('---'), 'the frontmatter is not prose')
  })
})

// The line the build died on, 2026-09-28: a reader that scans the corpus to
// decide about other articles has to get past it.
test('a reader that must outlive a bad file gets the error back, not thrown', () => {
  inTemp((dir) => {
    const bad = join(dir, 'bad.md')
    writeFileSync(bad, '---\ntitle: "A"\nsocialTitle: "Record title: "B"50 Billion"\n---\nBody.\n')
    assert.throws(() => readArticle(bad), /bad indentation/)
    const tried = tryReadArticle(bad)
    assert.equal(tried.article, null)
    assert.match(tried.error?.message ?? '', /bad indentation/)

    const good = join(dir, 'good.md')
    writeFileSync(good, GOOD)
    assert.equal(tryReadArticle(good).error, null)
    assert.equal(tryReadArticle(good).article?.meta.location, 'Geneva')
    assert.match(tryReadArticle(join(dir, 'absent.md')).error?.message ?? '', /ENOENT/)
  })
})

test('a link costs its label and nothing else', () => {
  assert.equal(visibleText("[Pakistan](country:PK)'s exports rose"), "Pakistan's exports rose")
  assert.equal(visibleText('[Brent](e:brent) and [Iran](country:IR)'), 'Brent and Iran')
  assert.equal(visibleText('no links, [brackets] alone, (parens) alone'), 'no links, [brackets] alone, (parens) alone')
})

test('the dateline is the city before the dash, or nothing', () => {
  assert.equal(datelineOf('Geneva — The World Trade Organisation doubled'), 'Geneva')
  assert.equal(datelineOf('Port of Spain — A court ruled'), 'Port of Spain')
  assert.equal(datelineOf('The World Trade Organisation doubled its forecast.'), null)
  // The pattern is the validator's: anything up to sixty characters before the
  // dash reads as a dateline, and it is the comparison with `location` that
  // decides whether it was one.
  assert.equal(datelineOf('A sentence with a dash — in its first clause.'), 'A sentence with a dash')
  assert.equal(datelineOf('This opening sentence runs on for well over sixty characters before its dash — so no.'), null)
})

test('a sound article has no problems', () => {
  inTemp((dir) => {
    const path = join(dir, 'a.md')
    writeFileSync(path, GOOD)
    const { meta, body } = readArticle(path)
    assert.deepEqual(articleProblems(meta, body), [])
  })
})

test('each thing a surface depends on is named when it is missing or wrong', () => {
  const body = 'Geneva — One.\n\nTwo two two.\n\nThree three.\n\nFour four four.'
  const meta = { title: 'T', date: '2026-10-08T00:00:00Z', category: 'economy', location: 'Geneva', sources: [{ name: 'Dawn', url: 'https://x.pk/1', country: 'PK' }] }
  const of = (change, b = body) => articleProblems({ ...meta, ...change }, b)

  assert.deepEqual(articleProblems(/** @type {any} */ (null), body), ['unparseable'])
  assert.deepEqual(of({ title: undefined }), [], 'a key that is present and empty is the validator\'s to judge')
  const { title, ...untitled } = meta
  assert.equal(title, 'T')
  assert.deepEqual(articleProblems(untitled, body), ['missing title'])
  assert.deepEqual(of({ category: 'sport' }), ['invalid category sport'])
  assert.deepEqual(of({ sources: [] }), ['no sources'])
  assert.deepEqual(of({ sources: [{ url: 'ftp://x', country: 'usa' }] }), ['source missing name', 'source bad url ftp://x', 'bad country code usa'])
  assert.deepEqual(of({ lat: 138.9, lng: -200 }), ['lat=138.9', 'lng=-200'])
  assert.deepEqual(of({ lat: '46.2' }), ['lat=46.2'], 'a quoted number is a string')
  assert.deepEqual(of({}, `${body}\n\n[Sweden](country:swe) said so.`), ['country link swe'])
  assert.deepEqual(of({}, 'Geneva — One block only.'), ['1 blocks'])
  assert.deepEqual(of({}, `${body}\n\nFive five five.`), [], 'the earned fifth block')
  assert.deepEqual(of({}, `${body}\n\nFive five five.\n\nSix six six.`), ['6 blocks'])
})

// Seven copies, and only the ones in scripts/lib can import each other.
test('the four desks are spelled the same everywhere they are spelled', () => {
  const read = (p) => readFileSync(join(ROOT, p), 'utf8')
  const list = (text) => [...text.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
  const desks = [...CATEGORIES]

  assert.deepEqual(Object.keys(CATEGORY_FLOORS), desks, 'CATEGORY_FLOORS in lib/dedup.js')
  assert.deepEqual(list(read('shared/types.ts').match(/^export type Category = (.+);$/m)?.[1] ?? ''), desks, 'Category in shared/types.ts')
  assert.deepEqual(list(read('scripts/build.js').match(/^const CATEGORY_ORDER = (\[.+\])$/m)?.[1] ?? ''), desks, 'CATEGORY_ORDER in build.js')
  assert.deepEqual(list(read('workers/mcp/src/tools.js').match(/^const CATEGORIES = (\[.+\])$/m)?.[1] ?? ''), desks, 'CATEGORIES in the MCP worker')
  assert.deepEqual(list(read('scripts/lib/corpus.test.js').match(/^const VALID_CATS = new Set\((\[.+\])\)$/m)?.[1] ?? ''), desks, 'VALID_CATS in corpus.test.js')
  const piped = desks.join('|')
  assert.ok(read('scripts/write-prompt.md').includes(`category: "${piped}"`), 'the writer\'s frontmatter template')
  assert.ok(read('scripts/select-prompt.md').includes(`"category": "${piped}"`), 'the selector\'s schema')
  const floors = read('scripts/select-prompt.md').match(/^- Category floors: (.+)\.$/m)?.[1] ?? ''
  assert.deepEqual(floors.split(', ').map((f) => f.split(' ')[0]), desks, 'the selector\'s floors line')
})
