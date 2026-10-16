import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_EVENT_VOLUME, PER_STORY, contractsFromSearch, parseQueries, queryPrompt } from './story-contracts.js'
import { storyContractId } from './trends-sources/polymarket.js'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const market = (slug, over = {}) => ({
  slug, question: `${slug}?`, active: true, closed: false, lastTradePrice: '0.3', endDate: '2026-12-31T00:00:00Z', ...over,
})
const event = (slug, markets, over = {}) => ({ slug, title: slug, volume: MIN_EVENT_VOLUME * 2, closed: false, tags: [{ slug: 'politics' }], markets, ...over })

test('the question is asked of every story, and only the stories asked about are read back', () => {
  const prompt = queryPrompt([{ slug: 'a', title: 'Kyiv Pauses Refinery Strikes', body: 'The [pause](country:UA) holds.' }])
  assert.match(prompt, /slug: a\ntitle: Kyiv Pauses Refinery Strikes\nlead: The pause holds\./)
  const q = parseQueries({ a: { q: ' Russia Ukraine ceasefire ' }, b: { q: 'x' }, c: { q: null } }, ['a', 'c'])
  assert.deepEqual([...q], [['a', 'Russia Ukraine ceasefire']])
  assert.equal(parseQueries(['a'], ['a']).size, 0)
  assert.equal(parseQueries({ a: { q: 'x'.repeat(81) } }, ['a']).size, 0)
})

test('a search keeps live questions with money on them, not about to close, a few a story', () => {
  const found = contractsFromSearch(
    [
      event('thin', [market('thin-market')], { volume: MIN_EVENT_VOLUME - 1 }),
      event('sport', [market('sport-market')], { tags: [{ slug: 'sports' }] }),
      event('closing', [market('closing-market', { endDate: '2026-10-18T00:00:00Z' })]),
      event('decided', [market('decided-market', { lastTradePrice: '0.995' })]),
      event('shut', [market('shut-market')], { closed: true }),
      event('ceasefire', [market('ceasefire-by-december', { lastTradePrice: '0.214' })]),
      ...['b', 'c', 'd'].map((s) => event(s, [market(`${s}-market`)])),
    ],
    NOW,
  )
  assert.deepEqual(found.map((f) => f.slug), ['ceasefire-by-december', 'b-market', 'c-market'].slice(0, PER_STORY))
  assert.deepEqual(found[0], { slug: 'ceasefire-by-december', question: 'ceasefire-by-december?', price: 21, endDate: '2026-12-31T00:00:00Z' })
})

test('a story contract takes the id the snapshot would give it, and keeps one it already has', () => {
  assert.equal(storyContractId('russia-x-ukraine-ceasefire-agreement-by-december-31-2026', []), 'poly-russia-x-ukraine-ceasefire-agreement-by-december')
  assert.equal(storyContractId('held-slug', [{ id: 'poly-held-before', seriesId: 'held-slug' }]), 'poly-held-before')
  // Alike for 48 characters as a row the snapshot holds: it parts, and the held row keeps its id.
  const twin = 'russia-x-ukraine-ceasefire-agreement-by-december-31-2027'
  const id = storyContractId(twin, [{ id: 'poly-russia-x-ukraine-ceasefire-agreement-by-december', seriesId: 'russia-x-ukraine-ceasefire-agreement-by-december-31-2026' }])
  assert.notEqual(id, 'poly-russia-x-ukraine-ceasefire-agreement-by-december')
  assert.match(id, /^poly-/)
})
