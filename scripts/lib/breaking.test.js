// Run: node --test scripts/lib/breaking.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { breakingCandidates } from './breaking.js'

/** @param {Record<string, any>} over */
const story = (over) => ({ label: 'A label from the ledger', category: 'politics', arc: 'breaking', coverageCount: 1, importance: 6, articles: [], ...over })
/** @type {Record<string, { meta: Record<string, any>, body: string }>} */
const ARTICLES = {
  wide: { meta: { title: 'Covered Widely', category: 'tech', eventCoverage: 224 }, body: 'Seattle — One.' },
  some: { meta: { title: 'Covered By Some', category: 'economy', eventCoverage: '163' }, body: 'Geneva — Two.' },
  tied: { meta: { title: 'As Widely As Some', category: 'science', eventCoverage: 163 }, body: 'Paris — Three.' },
  niche: { meta: { title: 'One Outlet Only', category: 'science' }, body: 'Lyon — Four.' },
  zero: { meta: { title: 'Counted As None', eventCoverage: 'n/a' }, body: 'Oslo — Five.' },
  bare: { meta: { eventCoverage: 3 }, body: 'Lima — Six.' },
}
const articleOf = (/** @type {string} */ slug) => ARTICLES[slug] ?? null
const cycle = { articles: Object.keys(ARTICLES).map((slug) => ({ slug })).concat({ slug: 'unwritten' }) }

test('the cycle\'s new stories with a second source behind them, the most covered first', () => {
  const ledger = { stories: [story({ articles: ['some'] }), story({ articles: ['niche'] }), story({ articles: ['wide'] }), story({ articles: ['zero'] }), story({ articles: ['tied'] })] }
  assert.deepEqual(breakingCandidates(/** @type {any} */ (ledger), cycle, articleOf), [
    { slug: 'wide', title: 'Covered Widely', category: 'tech', body: 'Seattle — One.', importance: 6, eventCoverage: 224 },
    { slug: 'some', title: 'Covered By Some', category: 'economy', body: 'Geneva — Two.', importance: 6, eventCoverage: 163 },
    { slug: 'tied', title: 'As Widely As Some', category: 'science', body: 'Paris — Three.', importance: 6, eventCoverage: 163 },
  ], 'a tie keeps the ledger\'s order; no coverage figure, or one that is not a number, counts as none')
})

test('a story the ledger has seen before, or does not call breaking, is not a candidate', () => {
  const ledger = { stories: [story({ articles: ['wide'], coverageCount: 2 }), story({ articles: ['some'], arc: 'developing' })] }
  assert.deepEqual(breakingCandidates(/** @type {any} */ (ledger), cycle, articleOf), [])
})

test('only the last cycle\'s articles count, and only the ones that were written', () => {
  const ledger = { stories: [story({ articles: ['older', 'wide', 'unwritten'] })] }
  assert.deepEqual(breakingCandidates(/** @type {any} */ (ledger), cycle, articleOf).map((c) => c.slug), ['wide'])
  assert.deepEqual(breakingCandidates(/** @type {any} */ (ledger), { articles: [{ slug: 'some' }] }, articleOf), [])
})

test('what the article leaves out comes from the ledger', () => {
  const ledger = { stories: [story({ articles: ['bare'], importance: undefined }), story({ articles: ['bare'], label: '', category: '' })] }
  assert.deepEqual(breakingCandidates(/** @type {any} */ (ledger), cycle, articleOf).map(({ title, category, importance }) => ({ title, category, importance })), [
    { title: 'A label from the ledger', category: 'politics', importance: 0 },
    { title: '', category: 'news', importance: 6 },
  ])
})

test('an empty ledger or cycle record gives no candidates', () => {
  assert.deepEqual(breakingCandidates({}, cycle, articleOf), [])
  assert.deepEqual(breakingCandidates(/** @type {any} */ ({ stories: [story({ articles: ['wide'] })] }), {}, articleOf), [])
})
