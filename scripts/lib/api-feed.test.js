// Run: node --test scripts/lib/api-feed.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerHolds, hasHeadline, redact, resultsAt } from './api-feed.js'

// --- an answer with no list is not an answer with an empty one --------------
test('a list that is there is returned, empty or not, with nothing to say', () => {
  assert.deepEqual(resultsAt({ events: { results: [{ uri: 'eng-1' }, { uri: 'eng-2' }], totalResults: 2 } }, ['events', 'results']), { results: [{ uri: 'eng-1' }, { uri: 'eng-2' }] })
  assert.deepEqual(resultsAt({ articles: { results: [] } }, ['articles', 'results']), { results: [] })
  assert.deepEqual(resultsAt({ 'eng-1': { articles: { results: [{ uri: 'a' }] } } }, ['eng-1', 'articles', 'results']), { results: [{ uri: 'a' }] })
})

test('what is in a list and is not an object is not a result', () => {
  assert.deepEqual(resultsAt({ articles: { results: [{ uri: 'a' }, null, 'x', { uri: 'b' }] } }, ['articles', 'results']).results, [{ uri: 'a' }, { uri: 'b' }])
})

test('an answer with no list says what it holds instead', () => {
  assert.deepEqual(resultsAt({ error: 'The user has used all available tokens' }, ['events', 'results']), {
    results: [],
    saw: 'no events; it holds error (error: "The user has used all available tokens")',
  })
  assert.deepEqual(resultsAt({ events: { totalResults: 0, pages: 0 } }, ['events', 'results']), { results: [], saw: 'no events.results; it holds totalResults, pages' })
  // A per-event answer with no articles under the event's id: whatever is there is named.
  // (The shape is made up. The fetcher has never logged what a redirected event answers.)
  assert.deepEqual(resultsAt({ 'eng-1': { newEventUri: 'eng-9' } }, ['eng-1', 'articles', 'results']), { results: [], saw: 'no eng-1.articles; it holds newEventUri' })
  assert.deepEqual(resultsAt({ articles: { results: { 0: 'a' } } }, ['articles', 'results']), { results: [], saw: 'articles.results is not a list; it is 0' })
  assert.deepEqual(resultsAt(null, ['articles', 'results']), { results: [], saw: 'no articles; it holds a null' })
  assert.deepEqual(resultsAt('Too many requests', ['articles', 'results']), { results: [], saw: 'no articles; it holds a string' })
})

test('an answer is described by its keys, and by its error when it has one', () => {
  assert.equal(answerHolds({}), 'no keys')
  assert.equal(answerHolds({ a: 1, b: 2 }), 'a, b')
  assert.equal(answerHolds({ error: 'x'.repeat(500) }).length, 'error (error: "")'.length + 200)
  assert.equal(answerHolds(undefined), 'a undefined')
})

test('the key never reaches a line of the log', () => {
  const key = '00000000-aaaa-bbbb-cccc-000000000000'
  assert.equal(redact(`Supplied API key '${key}' is not recognised (${key})`, key), "Supplied API key '[key]' is not recognised ([key])")
  assert.equal(redact('nothing to hide', key), 'nothing to hide')
  assert.equal(redact('no key set', undefined), 'no key set')
})

test('an article with no headline is not a story of its own', () => {
  assert.equal(hasHeadline({ title: 'Fed raises rates' }), true)
  for (const article of [{}, { title: null }, { title: '' }, { title: '   ' }, { title: 42 }, null, undefined]) assert.equal(hasHeadline(article), false)
})
