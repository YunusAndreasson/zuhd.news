// Run: node --test scripts/lib/ledger.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { updateLedger } from './ledger.js'

const NOW = '2026-10-08T18:08:56.751Z'
const EARLIER = '2026-10-08T14:07:01.000Z'
const pick = (slug, over = {}) => ({ suggestedSlug: slug, title: `Title of ${slug}`, category: 'economy', angle: 'Why it matters.', eventUri: null, concepts: [], ...over })
/** @returns {import('./schema.js').LedgerStory} */
const followed = (id, over = {}) => ({
  id,
  label: id,
  firstSeen: EARLIER,
  lastCovered: EARLIER,
  coverageCount: 1,
  category: 'politics',
  importance: 6,
  arc: 'breaking',
  articles: [`2026-10-08-${id}`],
  eventUri: null,
  summary: '',
  conceptUris: [],
  ...over,
})

test('a pick the ledger does not follow becomes a story, breaking, at importance 6', () => {
  const ledger = { version: 1, stories: [] }
  const changes = updateLedger(ledger, [pick('2026-10-08-fed-raises-rates', { eventUri: 'eng-1', concepts: [{ label: 'Fed', uri: 'http://w/Fed' }, 'plain string'] })], NOW)
  assert.deepEqual(ledger.stories, [
    {
      id: 'fed-raises-rates',
      label: 'Title of 2026-10-08-fed-raises-rates',
      firstSeen: NOW,
      lastCovered: NOW,
      coverageCount: 1,
      category: 'economy',
      importance: 6,
      arc: 'breaking',
      articles: ['2026-10-08-fed-raises-rates'],
      eventUri: 'eng-1',
      summary: 'Why it matters.',
      conceptUris: ['http://w/Fed'],
    },
  ])
  assert.deepEqual(changes, ['New: fed-raises-rates'])
})

test('the same event again is the same story, and its arc moves on', () => {
  const ledger = { version: 1, stories: [followed('fed-raises-rates', { eventUri: 'eng-1' })] }
  const changes = updateLedger(ledger, [pick('2026-10-08-markets-fall-after-the-fed-decision', { eventUri: 'eng-1' })], NOW)
  const [story] = ledger.stories
  assert.equal(story.coverageCount, 2)
  assert.equal(story.arc, 'developing')
  assert.equal(story.lastCovered, NOW)
  assert.equal(story.firstSeen, EARLIER)
  assert.deepEqual(story.articles, ['2026-10-08-fed-raises-rates', '2026-10-08-markets-fall-after-the-fed-decision'])
  assert.deepEqual(changes, ['Updated: fed-raises-rates → coverage 2, arc developing'])

  const long = { version: 1, stories: [followed('fed-raises-rates', { eventUri: 'eng-1', coverageCount: 4, arc: 'developing' })] }
  updateLedger(long, [pick('2026-10-09-fed-again', { eventUri: 'eng-1' })], NOW)
  assert.equal(long.stories[0].arc, 'ongoing', 'at five cycles')
})

test('with no event id, three shared words and half the story\'s name are a match', () => {
  const ledger = { version: 1, stories: [followed('hormuz-traffic-hits-two-month-low')] }
  updateLedger(ledger, [pick('2026-10-08-hormuz-traffic-two-month-slump')], NOW)
  assert.equal(ledger.stories.length, 1)
  assert.equal(ledger.stories[0].coverageCount, 2)

  const apart = { version: 1, stories: [followed('hormuz-traffic-hits-two-month-low')] }
  updateLedger(apart, [pick('2026-10-08-hormuz-insurers-raise-premiums')], NOW)
  assert.equal(apart.stories.length, 2, 'one shared word is a different story')
})

test('what a cycle does not cover fades, and at nothing it is forgotten', () => {
  const ledger = { version: 1, stories: [followed('kept-warm', { importance: 3 }), followed('last-chance', { importance: 1 })] }
  const changes = updateLedger(ledger, [pick('2026-10-08-zebrafish-quorum-sensing-paradox')], NOW)
  assert.deepEqual(ledger.stories.map((s) => [s.id, s.importance]), [['zebrafish-quorum-sensing-paradox', 6], ['kept-warm', 2]])
  assert.deepEqual(changes, ['New: zebrafish-quorum-sensing-paradox', 'Decayed importance for 2 uncovered stories', 'Removed 1 entries at importance 0'])
})

test('the ledger is kept by importance, then by what was covered last', () => {
  const ledger = {
    version: 1,
    stories: [followed('older', { importance: 5, lastCovered: '2026-10-07T10:00:00.000Z' }), followed('newer', { importance: 5, lastCovered: '2026-10-08T10:00:00.000Z' }), followed('top', { importance: 7 })],
  }
  updateLedger(ledger, [pick('2026-10-08-zebrafish-quorum-sensing-paradox')], NOW)
  // `top` has faded to 6, level with the new story, which was covered more recently.
  assert.deepEqual(ledger.stories.map((s) => s.id), ['zebrafish-quorum-sensing-paradox', 'top', 'newer', 'older'])
})

test('a story remembers at most ten concepts', () => {
  const concepts = Array.from({ length: 14 }, (_, i) => ({ label: `c${i}`, uri: `http://w/${i}` }))
  const ledger = { version: 1, stories: [] }
  updateLedger(ledger, [pick('2026-10-08-zebrafish-quorum-sensing-paradox', { concepts })], NOW)
  assert.equal(ledger.stories[0].conceptUris.length, 10)
})
