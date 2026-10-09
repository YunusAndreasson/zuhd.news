// Run: node --test scripts/lib/scaffold.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseFrontmatter } from './frontmatter.js'
import { scaffoldArticle } from './scaffold.js'

const WRITTEN = `---
title: "Trade Body Doubles Growth Forecast"
date: "2026-10-08T17:27:44Z"
category: "economy"
location: "Geneva"
sources:
  - name: "Dawn"
    url: "https://www.dawn.com/news/2035725"
    country: "PK"
  - name: "Reuters"
    url: "https://www.reuters.com/x"
---

Geneva — Body.
`
const story = (over = {}) => ({
  suggestedSlug: '2026-10-08-wto',
  concepts: [{ label: 'World Trade Organization', uri: 'http://w/WTO' }, 'Pakistan'],
  eventCoverage: 41,
  sentimentDivergence: 0.3,
  sources: [
    { name: 'Dawn', url: 'https://www.dawn.com/news/2035725', sentiment: 0.3, image: 'https://i.dawn.com/a.webp' },
    { name: 'Reuters', url: 'https://www.reuters.com/x', sentiment: -0.125 },
  ],
  ...over,
})
const meta = (raw) => parseFrontmatter(raw ?? '').meta

test('what the selection knows is added, and what the writer wrote is left as it is', () => {
  const out = scaffoldArticle(WRITTEN, story())
  assert.ok(out)
  const m = meta(out)
  assert.deepEqual(m.concepts, ['World Trade Organization', 'Pakistan'])
  assert.equal(m.eventCoverage, 41)
  assert.equal(m.sentimentDivergence, 0.3)
  assert.deepEqual(m.sources, [
    { name: 'Dawn', url: 'https://www.dawn.com/news/2035725', country: 'PK', sentiment: 0.3, image: 'https://i.dawn.com/a.webp' },
    { name: 'Reuters', url: 'https://www.reuters.com/x', sentiment: -0.13 },
  ])
  assert.equal(m.title, 'Trade Body Doubles Growth Forecast')
  assert.ok(out.endsWith('\n---\n\nGeneva — Body.\n'), 'the prose is untouched')
})

// Three cycles in a row published nothing off this label.
test('a label that carries quotes is still YAML afterwards', () => {
  const out = scaffoldArticle(WRITTEN, story({ concepts: [{ label: 'Ecologist Party "The Greens"' }, 'Back\\slash'] }))
  assert.deepEqual(meta(out).concepts, ['Ecologist Party "The Greens"', 'Back\\slash'])
})

test('concepts the writer supplied are not replaced, and five is the most that are added', () => {
  const withOwn = WRITTEN.replace('sources:', 'concepts:\n  - "The writer\'s own"\nsources:')
  assert.deepEqual(meta(scaffoldArticle(withOwn, story())).concepts, ["The writer's own"])
  const many = scaffoldArticle(WRITTEN, story({ concepts: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }))
  assert.deepEqual(meta(many).concepts, ['a', 'b', 'c', 'd', 'e'])
})

test('an empty source list is filled from the selection', () => {
  const empty = WRITTEN.replace(/sources:\n[\s\S]*?\n---/, 'sources: []\n---')
  const out = scaffoldArticle(empty, story({ sources: [{ name: 'Dawn', url: 'https://d.pk/1', country: 'PK' }, { name: 'Reuters', url: 'https://r.com/2' }] }))
  assert.deepEqual(meta(out).sources, [{ name: 'Dawn', url: 'https://d.pk/1', country: 'PK' }, { name: 'Reuters', url: 'https://r.com/2' }])
})

test('a second pass adds nothing', () => {
  const once = scaffoldArticle(WRITTEN, story())
  assert.equal(scaffoldArticle(once ?? '', story()), null)
})

test('with nothing to add, or no frontmatter to add it to, the file is left alone', () => {
  assert.equal(scaffoldArticle(WRITTEN, { suggestedSlug: '2026-10-08-wto' }), null)
  assert.equal(scaffoldArticle('Just prose.\n', story()), null)
})

// No test starts the stage script: its lists are the cycle's own, in /tmp. So
// this much is asked of its text: the article it fills is written back through
// `writeText`, whole or not at all.
test('the stage writes a filled article back whole', () => {
  const stage = readFileSync(new URL('../scaffold-articles.js', import.meta.url), 'utf8')
  assert.match(stage, /\bwriteText\(/)
  assert.doesNotMatch(stage, /\bwriteFileSync\b/)
})
