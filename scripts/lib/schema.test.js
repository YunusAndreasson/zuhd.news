// Run: node --test scripts/lib/schema.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CATEGORIES, selectionProblems } from './schema.js'

const entry = (over = {}) => ({
  title: 'Trade Body Doubles Growth Forecast',
  link: 'https://www.dawn.com/news/2035725',
  source: 'Dawn',
  pubDate: '2026-10-08T17:27:44Z',
  category: 'economy',
  angle: 'Who gains from the diverted freight.',
  suggestedSlug: '2026-10-08-wto-doubles-forecast',
  sources: [{ name: 'Dawn', url: 'https://www.dawn.com/news/2035725', country: 'PK' }],
  eventUri: null,
  eventCoverage: null,
  concepts: [],
  ...over,
})

test('a selection as the selector is asked to write it has no problems', () => {
  assert.deepEqual(selectionProblems([entry(), entry({ suggestedSlug: '2026-10-08-gold-edges-higher', category: 'tech' })]), [])
  assert.deepEqual(selectionProblems([]), [], 'an empty selection is a quiet cycle, not a malformed one')
})

// 2026-05-10 to 05-17: about one cycle in twelve, the selector answered in
// prose and wrote no file, or wrote something that was not the array.
test('what is not a selection is said to be one thing, not thirteen', () => {
  assert.deepEqual(selectionProblems({ stories: [entry()] }), ['not an array'])
  assert.deepEqual(selectionProblems(null), ['not an array'])
  assert.deepEqual(selectionProblems(['a headline']), ['#1: not an object'])
})

test('each field a later stage joins or routes on is named when it is missing or wrong', () => {
  const of = (over) => selectionProblems([entry(over)])
  assert.deepEqual(of({ suggestedSlug: undefined }), ['#1: missing suggestedSlug'])
  assert.deepEqual(of({ title: '' }), ['2026-10-08-wto-doubles-forecast: missing title'])
  assert.deepEqual(of({ sources: undefined }), ['2026-10-08-wto-doubles-forecast: missing sources'])
  assert.deepEqual(of({ sources: 'Dawn' }), ['2026-10-08-wto-doubles-forecast: sources is not a list'])
  assert.deepEqual(of({ category: 'sport' }), ['2026-10-08-wto-doubles-forecast: invalid category sport'])
  assert.deepEqual(of({ suggestedSlug: 'WTO Doubles Forecast' }), ['WTO Doubles Forecast: slug is not YYYY-MM-DD-words'])
  assert.deepEqual(of({ suggestedSlug: '2026-10-08-wto-doubles-forecast.md' }), ['2026-10-08-wto-doubles-forecast.md: slug is not YYYY-MM-DD-words'])
})

test('one slug picked twice is one article written twice', () => {
  assert.deepEqual(selectionProblems([entry(), entry()]), ['2026-10-08-wto-doubles-forecast: slug picked twice'])
})

test('the desks cannot be edited by a reader', () => {
  assert.ok(Object.isFrozen(CATEGORIES))
  assert.deepEqual([...CATEGORIES], ['politics', 'economy', 'science', 'tech'])
})
