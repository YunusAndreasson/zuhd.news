// Run: node --test scripts/lib/breaking.test.js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { breakingCandidates, choosePush, markPushSent, pushCandidates, pushDecision, pushFields } from './breaking.js'
import { ROOT } from './paths.js'

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

// ── The push after the deploy ────────────────────────────────────────

const md = (/** @type {string} */ front, body = 'Washington — The Federal Reserve raised rates by a quarter point on Wednesday, the first move since March.\n\nSecond block.') => `---\n${front}\n---\n\n${body}\n`

test('the push reads an article by its lines, and takes a lead of its own', () => {
  assert.deepEqual(pushFields(md('title: "Fed Raises Rates"\ncategory: "economy"\neventCoverage: 40\nsources:\n  - name: "Dawn"')), {
    title: 'Fed Raises Rates',
    category: 'economy',
    eventCoverage: '40',
    // 80 characters end exactly on "move"; the cut still goes back to the space before it.
    lead: 'The Federal Reserve raised rates by a quarter point on Wednesday, the first',
  })
  assert.deepEqual(pushFields('Just prose.\n'), {})
  assert.deepEqual(pushFields(''), {})
})

// As it stands: the patterns are the push's own, and what it shows a reader
// when the model's line is missing comes out of them.
test('the line reader at its edges', () => {
  assert.equal(pushFields(md('title: "He Said "No" Twice"')).title, 'He Said', 'a value stops at its first inner quote')
  assert.equal(pushFields(md("category: 'tech'")).category, "'tech'", 'single quotes are part of the value')
  assert.equal(pushFields(md('title: "T"', 'Lima, Peru — A magnitude 7.1 earthquake struck.')).lead, 'A magnitude 7.1 earthquake struck.')
  assert.equal(pushFields(md('title: "T"', 'São Paulo — The dateline stays.')).lead, 'São Paulo — The dateline stays.', 'a city with an accent is not taken for a dateline')
  assert.equal(pushFields(md('title: "T"', `Paris — ${'x'.repeat(120)}`)).lead, 'x'.repeat(80), 'with no space to cut at, it is cut at 80')
  assert.equal(pushFields(md('lead: "written by hand"')).lead.startsWith('The Federal Reserve'), true, 'a key named lead is overwritten')
})

/** @param {Record<string, any>} over */
const pushStory = (over) => ({ label: 'A Label From The Ledger', category: 'politics', arc: 'breaking', coverageCount: 1, importance: 6, articles: [], ...over })
/** @type {Record<string, Record<string, string>>} */
const FIELDS = {
  wide: { title: 'Fed Raises Rates', category: 'economy', eventCoverage: '40', lead: 'The Fed raised rates' },
  wider: { title: 'Quake Strikes Coast', category: 'science', eventCoverage: '90', lead: 'A quake struck' },
  niche: { title: 'One Outlet Only', category: 'tech', lead: 'One outlet says' },
  hex: { eventCoverage: '0x10', lead: '' },
}
const fieldsOf = (/** @type {string} */ slug) => FIELDS[slug] ?? {}
const pushCycle = { articles: ['wide', 'wider', 'niche', 'hex', 'absent'].map((slug) => ({ slug })) }

test('every new story of the cycle is a push candidate, the most covered first', () => {
  const ledger = { stories: [pushStory({ articles: ['wide'] }), pushStory({ articles: ['niche', 'older'] }), pushStory({ articles: ['wider'] }), pushStory({ articles: ['absent'], importance: undefined }), pushStory({ articles: ['wide'], arc: 'developing' }), pushStory({ articles: ['hex'], label: undefined, category: '' })] }
  assert.deepEqual(pushCandidates(/** @type {any} */ (ledger), pushCycle, fieldsOf), [
    { slug: 'wider', title: 'Quake Strikes Coast', category: 'science', body: 'A quake struck', eventCoverage: 90, importance: 6 },
    { slug: 'wide', title: 'Fed Raises Rates', category: 'economy', body: 'The Fed raised rates', eventCoverage: 40, importance: 6 },
    // Read without a radix, as it always was.
    { slug: 'hex', title: undefined, category: 'news', body: '', eventCoverage: 16, importance: 6 },
    { slug: 'niche', title: 'One Outlet Only', category: 'tech', body: 'One outlet says', eventCoverage: 0, importance: 6 },
    // Not on disk, and a candidate all the same: the ledger's label, no coverage.
    { slug: 'absent', title: 'A Label From The Ledger', category: 'politics', body: '', eventCoverage: 0, importance: 0 },
  ])
  assert.throws(() => pushCandidates(/** @type {any} */ ({}), pushCycle, fieldsOf), TypeError, 'a ledger with no stories is not read as an empty one')
})

test('one story is pushed: the social pick if it is eligible, or else the most covered', () => {
  const candidates = pushCandidates(/** @type {any} */ ({ stories: [pushStory({ articles: ['wide', 'wider', 'niche'] })] }), pushCycle, fieldsOf)
  const chosen = (/** @type {any} */ pick) => choosePush(candidates, pick).selected.map((c) => c.slug)
  assert.deepEqual(chosen(null), ['wider'])
  assert.deepEqual(chosen({ slug: 'wide' }), ['wide'])
  assert.deepEqual(chosen({ slug: 'wider' }), ['wider'])
  assert.deepEqual(chosen({ slug: 'niche' }), ['wider'], 'a pick with no second source behind it is not honoured')
  assert.deepEqual(chosen({ slug: 'nobody' }), ['wider'])
  assert.deepEqual(chosen('abc'), ['wider'])
  assert.equal(choosePush(candidates, null).skipReason, null)
})

test('when nothing has a second source, nothing is pushed and the log says why', () => {
  const candidates = pushCandidates(/** @type {any} */ ({ stories: [pushStory({ articles: ['niche', 'absent'] })] }), pushCycle, fieldsOf)
  assert.deepEqual(choosePush(candidates, { slug: 'niche' }), { selected: [], skipReason: 'all 2 candidates below coverage threshold 1' })
  assert.deepEqual(choosePush([], null), { selected: [], skipReason: null })
})

test('the decision as the push log holds it: every candidate, the one chosen, and not yet sent', () => {
  const candidates = pushCandidates(/** @type {any} */ ({ stories: [pushStory({ articles: ['wide', 'niche'] })] }), pushCycle, fieldsOf)
  const now = Date.parse('2026-10-09T05:27:00Z')
  assert.deepEqual(pushDecision(candidates, choosePush(candidates, null), now), {
    timestamp: '2026-10-09T05:27:00.000Z',
    candidateCount: 2,
    candidates: [
      { slug: 'wide', title: 'Fed Raises Rates', category: 'economy', eventCoverage: 40, importance: 6 },
      { slug: 'niche', title: 'One Outlet Only', category: 'tech', eventCoverage: 0, importance: 6 },
    ],
    selected: { slug: 'wide', title: 'Fed Raises Rates', category: 'economy', body: 'The Fed raised rates', eventCoverage: 40, importance: 6 },
    skipReason: null,
    sent: false,
  })
  const none = pushDecision([], choosePush([], null), now)
  assert.deepEqual([none.selected, none.candidateCount], [null, 0])
})

test('a push that went out is marked on the last decision, with what the endpoint said', () => {
  const sent = { title: 'Breaking News', body: 'Fed raises interest rates by 25 basis points' }
  const log = () => [{ timestamp: 't0', sent: false }, { timestamp: 't1', sent: false }]
  assert.deepEqual(markPushSent(log(), sent, '{"pushed":412,"skipped":3}'), [
    { timestamp: 't0', sent: false },
    { timestamp: 't1', sent: true, pushTitle: 'Breaking News', pushBody: 'Fed raises interest rates by 25 basis points', response: { pushed: 412, skipped: 3 } },
  ])
  assert.equal(markPushSent(log(), sent, '<html>502</html>')[1].response, '<html>502</html>', 'an answer that is not JSON is kept as text')
  assert.equal(markPushSent(log(), sent, '')[1].response, '')
  assert.deepEqual(markPushSent(log(), {}, undefined)[1], { timestamp: 't1', sent: true, pushTitle: undefined, pushBody: undefined, response: undefined })
  assert.deepEqual(markPushSent([], sent, '{}'), [])
})

// The harness's `node` is a stand-in, so nothing there starts this file. With
// no command it stops before it reads or writes anything.
test('the entry script itself loads, and says how it is called', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/cycle/breaking-push.js')], { encoding: 'utf8' })
  assert.equal(res.status, 2)
  assert.equal(res.stdout, '')
  assert.match(res.stderr, /^usage: breaking-push\.js pick \| sent\n$/)
})
