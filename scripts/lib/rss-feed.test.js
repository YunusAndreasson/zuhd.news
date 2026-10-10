// Run: node --test scripts/lib/rss-feed.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { XMLParser } from 'fast-xml-parser'
import { bestStoryIds, bodiesFirst, documentHolds, hackerNewsStories, worthRetrying } from './rss-feed.js'

// --- a feed that failed: asked again, or not --------------------------------
test('a refusal is not asked again; a timeout, a dead connection and a 5xx are', () => {
  for (const status of [400, 401, 403, 404, 410, 451]) assert.equal(worthRetrying(new Error(`HTTP ${status}`)), false, `HTTP ${status}`)
  for (const status of [408, 425, 429, 500, 502, 503, 504]) assert.equal(worthRetrying(new Error(`HTTP ${status}`)), true, `HTTP ${status}`)
  assert.equal(worthRetrying(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), true)
  assert.equal(worthRetrying(new TypeError('fetch failed')), true)
  assert.equal(worthRetrying(undefined), true, 'what it cannot read it treats as the network')
})

// --- a document with no items says what it holds ----------------------------
// Same options as fetch-news.js's parser.
const parse = (xml) => new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true, htmlEntities: true }).parse(xml)

test('an answer with no items is described by what it does hold', () => {
  // An RSS feed read as Atom, which is what a source whose `format` is wrong gives.
  assert.equal(documentHolds(parse('<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>a</title></item></channel></rss>')), '<rss> with channel')
  // An address that now serves a page.
  assert.equal(documentHolds(parse('<html lang="en"><head><title>Moved</title></head><body><p>We have moved.</p></body></html>')), '<html> with head, body')
  assert.equal(documentHolds(parse('<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><updated>2026-10-09</updated></feed>')), '<feed> with title, updated')
  // An item none of whose fields is a title.
  assert.equal(documentHolds({ item: { headline: 'a', link: 'https://example.org/a', '@_id': '1' } }), '<item> with headline, link')
  assert.equal(documentHolds(parse('')), 'no element')
  assert.equal(documentHolds(null), 'a null')
  assert.equal(documentHolds('Too many requests'), 'a string')
  assert.equal(documentHolds({ message: 'rate limited', status: 429 }), '<message> and <status>')
})

// --- Hacker News: what the two lists answered -------------------------------
const hit = (id, over = {}) => ({ objectID: String(id), title: `Story ${id}`, url: `https://example.org/${id}`, points: 300, num_comments: 80, created_at_i: 1791500000, ...over })
const best = (id, over = {}) => ({ id, title: `Story ${id}`, url: `https://example.org/${id}`, score: 300, descendants: 80, time: 1791500000, ...over })

test('a best-stories answer that is not a list holds no ids', () => {
  // Firebase answers `null`, with a 200, for a path it does not hold.
  assert.deepEqual(bestStoryIds(null), [])
  assert.deepEqual(bestStoryIds({ error: 'Permission denied' }), [])
  assert.equal(bestStoryIds(Array.from({ length: 200 }, (_, i) => i)).length, 15)
})

test('each story once, with an address and a headline', () => {
  const stories = hackerNewsStories(
    { hits: [hit(1), hit(2, { url: null }), hit(3, { title: undefined }), hit(4, { num_comments: undefined })] },
    [best(1), null, best(5), best(6, { score: 99 }), best(7, { title: null }), best(8, { url: '' })],
  )
  assert.deepEqual(stories.map((s) => s.title), ['Story 1', 'Story 4', 'Story 5'])
  assert.deepEqual(stories[1], { title: 'Story 4', url: 'https://example.org/4', score: 300, comments: 0, time: 1791500000 })
})

test('an answer without hits is a list with none, and the best stories still count', () => {
  for (const answer of [null, undefined, {}, { message: 'rate limited' }, { hits: 'x' }]) {
    assert.deepEqual(hackerNewsStories(answer, [best(5)]).map((s) => s.title), ['Story 5'])
  }
  assert.deepEqual(hackerNewsStories({ hits: [] }, []), [])
})

// --- Hacker News: five pages fetched for three stories ----------------------
const hn = (title, bodyText = null) => ({ title, bodyText })

test('the three stories used are the ones whose page gave a body', () => {
  // The 10:00 fetch of 2026-10-09: 3 of 5 pages gave a body, and the first and
  // third by comments were not among them.
  const byComments = [hn('green card'), hn('deepseek', 'I have been using…'), hn('math 2.0'), hn('fourth', 'text'), hn('fifth', 'text'), hn('sixth'), hn('seventh')]
  const taken = bodiesFirst(byComments, 5)
  assert.deepEqual(taken.slice(0, 3).map((s) => s.title), ['deepseek', 'fourth', 'fifth'])
  assert.deepEqual(taken.map((s) => s.title), ['deepseek', 'fourth', 'fifth', 'green card', 'math 2.0', 'sixth', 'seventh'], 'no story is lost, and the rest keep their order')
})

test('with every page fetched, or none, the order is by comments as it was', () => {
  const all = [hn('a', 'x'), hn('b', 'x'), hn('c', 'x'), hn('d', 'x'), hn('e', 'x'), hn('f')]
  assert.deepEqual(bodiesFirst(all, 5), all)
  const none = [hn('a'), hn('b'), hn('c'), hn('d')]
  assert.deepEqual(bodiesFirst(none, 5), none)
  assert.deepEqual(bodiesFirst([], 5), [])
})
