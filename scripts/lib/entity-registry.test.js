// Run: node --test scripts/lib/entity-registry.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonicalIndicatorId, extractEntities, matchesAnyTag } from './entity-registry.js'

/** @param {string} text */
const found = (text) => extractEntities(text).resolved.map((e) => [e.indicatorId, e.mention]).sort()

// The rules are tried longest mention first, and an indicator keeps the first
// rule of its own that matched.
test('the mention recorded for a series is its longest form in the text', () => {
  assert.deepEqual(found('Tankers left the Strait of Hormuz as Brent crude rose.'), [['brent', 'Brent crude'], ['cp:hormuz', 'Strait of Hormuz']])
  assert.deepEqual(found('Hormuz reopened and crude fell.'), [['brent', 'crude'], ['cp:hormuz', 'Hormuz']])
})

// As found. The order is all there is: nothing reads where a match stands, so
// a longer rule does not hide a shorter one that names another series.
test('two rules that overlap in the text and name different series both resolve', () => {
  assert.deepEqual(found('The 2-year Treasury yield rose.'), [['us-10y', 'Treasury yield'], ['us-2y', '2-year Treasury']])
})

test('a proper noun that is also a word is matched in its own capitals, and a plural still counts', () => {
  assert.deepEqual(found('The Fed held, and farmers were fed up.'), [['fed-funds', 'Fed']])
  assert.deepEqual(found('The crowd was fed up.'), [])
  assert.deepEqual(found('Traders sold rupiahs.'), [['fx-idr', 'rupiahs']])
})

test('a currency two countries share waits for the article to say which', () => {
  const { resolved, pending } = extractEntities('The rupee fell.')
  assert.deepEqual(resolved, [])
  assert.deepEqual(pending.map((p) => [p.mention, p.candidates.map((c) => c.id)]), [['rupee', ['fx-inr', 'fx-pkr']]])
})

test('a renamed id reads as the one it became, and any other as itself', () => {
  assert.equal(canonicalIndicatorId('portwatch-hormuz-tanker'), 'cp:hormuz')
  assert.equal(canonicalIndicatorId('brent'), 'brent')
})

// `smi`, the Swiss index, matched "transmission" when this was a substring test.
test('a tag matches as a whole tag, phrases included', () => {
  assert.equal(matchesAnyTag(['smi'], 'power transmission lines failed'), false)
  assert.equal(matchesAnyTag(['SMI'], 'the smi closed lower'), true)
  assert.equal(matchesAnyTag(['red sea'], 'ships avoid the red sea, again'), true)
  assert.equal(matchesAnyTag(undefined, 'anything'), false)
})
