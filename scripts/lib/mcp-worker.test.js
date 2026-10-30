// Run: node --test scripts/lib/mcp-worker.test.js
//
// The MCP worker through its real entry point and the SDK's transport, with the
// site's JSON stubbed. Skipped where `workers/mcp` has not had `npm ci`.
//
// What it pins: `z.object({...}).optional()` made the SDK advertise a tool as
// having no parameters, and a plain z.object rejects a tools/call with no
// `arguments`; get_story_context looked up a brief by slug when the briefs are
// frozen, so it answered "No context found" for every story in the feed.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

const worker = await import('../../workers/mcp/src/index.js').catch((err) => {
  if (err.code === 'ERR_MODULE_NOT_FOUND') return null
  throw err
})
const skip = worker ? false : 'workers/mcp has no node_modules'

const article = (slug, date, threadLabel) => ({
  slug,
  title: slug,
  date,
  source: 'Dawn',
  sources: [{ name: 'Dawn', country: 'PK', angle: 'an angle', image: 'https://example.com/i.jpg', sentiment: 0.1 }],
  concepts: [],
  sentences: ['One.', 'Two.', 'Three.', 'Four.'],
  ...(threadLabel && { threadLabel, threadArc: 'developing', threadSummary: null, threadDay: 3, threadArticleCount: 5 }),
})

const FEED = {
  generated: '2026-10-30T18:00:00Z',
  briefing: null,
  contexts: { 'old-thread': { type: 'thread', label: 'An old thread', generatedAt: '2026-03-25T00:00:00Z' } },
  categories: {
    politics: [
      article('later', '2026-10-30T12:00:00Z', 'Talks: both sides return'),
      article('earlier', '2026-10-30T06:00:00Z', 'Talks: both sides return'),
      article('alone', '2026-10-30T07:00:00Z', 'A lone story'),
    ],
    economy: [],
    science: [article('threadless', '2026-10-29T07:00:00Z', null)],
    tech: [article('tech-story', '2026-10-30T08:00:00Z', 'A tech story')],
  },
}

const realFetch = globalThis.fetch
let fetched = []

beforeEach(() => {
  fetched = []
  globalThis.fetch = async (url) => {
    const path = String(url).replace('https://zuhd.news', '')
    fetched.push(path)
    if (path === '/api/feed.json') return Response.json(FEED)
    if (path === '/api/context/brief-thread.json') return Response.json({ id: 'brief-thread', timeline: [{ body: 'Then.' }] })
    return new Response('not found', { status: 404 })
  }
})
afterEach(() => {
  globalThis.fetch = realFetch
})

async function rpc(method, params, id = 1) {
  const res = await worker.default.fetch(new Request('https://mcp.example/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params && { params }) }),
  }), {}, {})
  return { status: res.status, body: await res.json() }
}

const call = (name, args) => rpc('tools/call', { name, ...(args && { arguments: args }) })
const text = ({ body }) => body.result.content[0].text

test('tools/list advertises every optional parameter', { skip }, async () => {
  const { body } = await rpc('tools/list')
  const props = Object.fromEntries(body.result.tools.map(t => [t.name, Object.keys(t.inputSchema.properties ?? {}).sort()]))
  assert.deepEqual(props.get_briefing, ['focus'])
  assert.deepEqual(props.get_articles, ['category', 'full', 'limit'])
  assert.deepEqual(props.get_coverage_map, ['region'])
  assert.deepEqual(props.get_story_context, ['article_slug', 'thread_id'])
})

test('a tools/call with no arguments runs; one with arguments still validates them', { skip }, async () => {
  const all = JSON.parse(text(await call('get_briefing')))
  assert.deepEqual(Object.keys(all.stories).sort(), ['economy', 'politics', 'science', 'tech'])

  const focused = JSON.parse(text(await call('get_briefing', { focus: 'tech' })))
  assert.deepEqual(Object.keys(focused.stories), ['tech'])
  assert.equal(focused.stories.tech[0].slug, 'tech-story')

  const bad = await call('get_briefing', { focus: 'sport' })
  assert.ok(bad.body.error || bad.body.result?.isError, 'an unknown focus is refused')
  const noQuery = await call('search_articles')
  assert.ok(noQuery.body.error || noQuery.body.result?.isError, 'a required parameter stays required')
})

test('a body that is not JSON is still the transport\'s parse error', { skip }, async () => {
  const res = await worker.default.fetch(new Request('https://mcp.example/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: '{nope',
  }), {}, {})
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error.code, -32700)
})

test('a slug answers with its thread and the thread\'s articles, oldest first', { skip }, async () => {
  const ctx = JSON.parse(text(await call('get_story_context', { article_slug: 'later' })))
  assert.deepEqual(ctx.thread, {
    id: 'talks-both-sides-return',
    label: 'Talks: both sides return',
    arc: 'developing',
    day: 3,
    articleCount: 5,
    articlesInFeed: 2,
  })
  assert.deepEqual(ctx.articles.map(a => a.slug), ['earlier', 'later'])
  assert.equal(ctx.articles[0].sentences.length, 4)
  assert.deepEqual(ctx.articles[0].sources, [{ name: 'Dawn', country: 'PK', angle: 'an angle' }])
})

test('a thread id and a thread label find the same thread', { skip }, async () => {
  for (const thread_id of ['talks-both-sides-return', 'Talks: both sides return']) {
    const ctx = JSON.parse(text(await call('get_story_context', { thread_id })))
    assert.equal(ctx.thread.articlesInFeed, 2, thread_id)
  }
})

test('an article with no thread still answers, as itself', { skip }, async () => {
  const ctx = JSON.parse(text(await call('get_story_context', { article_slug: 'threadless' })))
  assert.equal(ctx.thread, null)
  assert.deepEqual(ctx.articles.map(a => a.slug), ['threadless'])
})

test('a thread no longer in the feed falls back to its brief, then the index', { skip }, async () => {
  assert.deepEqual(JSON.parse(text(await call('get_story_context', { thread_id: 'brief-thread' }))).timeline, [{ body: 'Then.' }])
  assert.equal(JSON.parse(text(await call('get_story_context', { thread_id: 'old-thread' }))).label, 'An old thread')
})

test('a thread_id never reaches another file, or a prototype', { skip }, async () => {
  for (const thread_id of ['../map-archive.json?x=1', 'constructor', '__proto__']) {
    assert.match(text(await call('get_story_context', { thread_id })), /^No story found/, thread_id)
  }
  assert.deepEqual(fetched.filter(p => /map-archive/.test(p)), [])
  assert.ok(!fetched.includes('/api/context/__proto__.json'), 'underscores fail the id check')
})

test('an unknown slug says so', { skip }, async () => {
  assert.match(text(await call('get_story_context', { article_slug: 'gone' })), /^No story found/)
  assert.match(text(await call('get_story_context')), /^No story found/)
})
