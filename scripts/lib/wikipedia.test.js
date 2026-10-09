// Run: node --test scripts/lib/wikipedia.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ZUHD_UA } from './http.js'
import { WIKIMEDIA_UA, wikiSummary } from './wikipedia.js'

/** A Wikimedia that answers with `reply`, and remembers what it was asked. */
const wikimedia = (reply) => {
  const asked = []
  const get = async (url, init) => {
    asked.push({ url: String(url), init })
    return reply()
  }
  return { asked, get: /** @type {typeof fetch} */ (/** @type {unknown} */ (get)) }
}
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('the user agent is the one both clients sent, with an address to write to', () => {
  // To the character: Wikimedia keys its limits and its blocks on this string.
  assert.equal(WIKIMEDIA_UA, 'zuhd-news/1.0 (+https://zuhd.news; editorial@zuhd.news)')
  assert.ok(WIKIMEDIA_UA.startsWith(ZUHD_UA.slice(0, -1)), 'the site’s own, and an address after it')
})

test('a summary is the page’s JSON, asked for by its encoded title with our user agent', async () => {
  const page = { titles: { canonical: 'Recep_Tayyip_Erdoğan' }, description: 'President of Turkey since 2014' }
  const { asked, get } = wikimedia(() => json(page))
  assert.deepEqual(await wikiSummary('Recep_Tayyip_Erdoğan', { fetch: get }), page)
  assert.equal(asked[0].url, 'https://en.wikipedia.org/api/rest_v1/page/summary/Recep_Tayyip_Erdo%C4%9Fan')
  assert.deepEqual(asked[0].init.headers, { 'User-Agent': WIKIMEDIA_UA, accept: 'application/json' })
  assert.ok(asked[0].init.signal instanceof AbortSignal)
  // A page with nothing in it is still a page.
  assert.deepEqual(await wikiSummary('Empty', { fetch: wikimedia(() => json(null)).get }), {})
})

test('a summary that cannot be had is null, and never a throw', async () => {
  assert.equal(await wikiSummary('No_such_page', { fetch: wikimedia(() => json({}, 404)).get }), null)
  assert.equal(await wikiSummary('Refused', { fetch: wikimedia(() => json({}, 403)).get }), null)
  const down = wikimedia(() => {
    throw new TypeError('fetch failed')
  })
  assert.equal(await wikiSummary('Anything', { fetch: down.get }), null)
})

test('a caller’s own deadline is kept alongside the call’s', async () => {
  const run = new AbortController()
  const { asked, get } = wikimedia(() => json({ description: 'x' }))
  await wikiSummary('A', { fetch: get, signal: run.signal, timeoutMs: 8000 })
  const { signal } = asked[0].init
  assert.equal(signal.aborted, false)
  run.abort()
  assert.equal(signal.aborted, true, 'the run’s deadline ends this request too')
})
