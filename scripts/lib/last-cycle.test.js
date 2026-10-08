// Run: node --test scripts/lib/last-cycle.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lastCycle } from './last-cycle.js'

const NOW = '2026-10-08T18:16:30.704Z'
/** @returns {import('./schema.js').SelectionEntry} */
const pick = (slug, category, source) => ({ suggestedSlug: slug, title: `Title ${slug}`, category, source, link: '', pubDate: '', angle: '', sources: [] })

test('only a pick whose article exists was published', () => {
  const selection = [pick('a', 'tech', 'Dawn'), pick('b', 'economy', 'Reuters'), pick('c', 'tech', 'Dawn')]
  const cycle = lastCycle(selection, (slug) => slug !== 'b', NOW)
  assert.deepEqual(cycle, {
    timestamp: NOW,
    articles: [
      { slug: 'a', title: 'Title a', category: 'tech', source: 'Dawn' },
      { slug: 'c', title: 'Title c', category: 'tech', source: 'Dawn' },
    ],
    categories: ['tech'],
    sources: ['Dawn'],
  })
})

test('a cycle that published nothing still says when', () => {
  assert.deepEqual(lastCycle([pick('a', 'tech', 'Dawn')], () => false, NOW), { timestamp: NOW, articles: [], categories: [], sources: [] })
})
