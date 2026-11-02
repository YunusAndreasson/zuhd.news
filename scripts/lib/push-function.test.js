// Run: node --test scripts/lib/push-function.test.js

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { onRequestPost as push } from '../../functions/api/push.js'
import { onRequestDelete, onRequestPost as register } from '../../functions/api/tokens.js'

const SECRET = 'sekret'
const OURS = 'ExponentPushToken[ours]'
const THEIRS = 'ExponentPushToken[theirs]'

const kv = (keys = []) => {
  const store = new Map(keys.map((k) => [k, '1']))
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
    delete: async (k) => void store.delete(k),
    list: async ({ prefix }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  }
}

const request = (body, auth = `Bearer ${SECRET}`) =>
  new Request('https://zuhd.news/api/push', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
    body: JSON.stringify(body),
  })

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

/** Stand in for Expo with a queue of answers, keeping what each call was sent. */
const expo = (...answers) => {
  const sent = []
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body))
    const a = answers.shift()
    if (a instanceof Error) throw a
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 })
  }
  return sent
}

const ARTICLES = { articles: [{ slug: 'a-story', title: 'T' }] }
const OK = { body: { data: [{ status: 'ok', id: '1' }] } }

test('an unset secret refuses `Bearer undefined`', async () => {
  const res = await push({ request: request(ARTICLES, 'Bearer undefined'), env: { PUSH_DATA: kv() } })
  assert.equal(res.status, 401)
})

test('a story Expo took is marked, with the answer the cycle log reads', async () => {
  const env = { PUSH_SECRET: SECRET, PUSH_DATA: kv([`token:${OURS}`]) }
  const sent = expo(OK)
  const res = await push({ request: request(ARTICLES), env })
  assert.deepEqual(await res.json(), { pushed: 1, skipped: 0, tokens: 1 })
  assert.ok(env.PUSH_DATA.store.has('pushed:a-story'))
  assert.equal(sent[0][0].data.url, 'https://zuhd.news/a/a-story')
})

test('a refused or failed send leaves the story unmarked, so it can go again', async () => {
  for (const answer of [{ status: 429, body: { errors: [{ code: 'TOO_MANY_REQUESTS' }] } }, new Error('network')]) {
    const env = { PUSH_SECRET: SECRET, PUSH_DATA: kv([`token:${OURS}`]) }
    expo(answer)
    const res = await push({ request: request(ARTICLES), env })
    assert.deepEqual(await res.json(), { pushed: 0, skipped: 0, tokens: 1, failedBatches: 1 })
    assert.ok(!env.PUSH_DATA.store.has('pushed:a-story'))
  }
})

test('a token from another project is dropped and ours sent again', async () => {
  const env = { PUSH_SECRET: SECRET, PUSH_DATA: kv([`token:${OURS}`, `token:${THEIRS}`]) }
  const sent = expo(
    { status: 400, body: { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', details: { '@edenmind/zuhd-news': [OURS], '@someone/else': [THEIRS] } }] } },
    OK,
  )
  const res = await push({ request: request(ARTICLES), env })
  assert.equal((await res.json()).pushed, 1)
  assert.equal(env.PUSH_DATA.store.has(`token:${THEIRS}`), false)
  assert.equal(env.PUSH_DATA.store.has(`token:${OURS}`), true)
  assert.deepEqual(sent[1].map((m) => m.to), [OURS])
})

test('an error that does not name our project deletes nothing', async () => {
  const env = { PUSH_SECRET: SECRET, PUSH_DATA: kv([`token:${OURS}`, `token:${THEIRS}`]) }
  expo({ status: 400, body: { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', details: { '@a/b': [OURS], '@c/d': [THEIRS] } }] } })
  const res = await push({ request: request(ARTICLES), env })
  assert.equal((await res.json()).pushed, 0)
  assert.equal(env.PUSH_DATA.store.size, 2)
})

test('a device that is gone loses its token', async () => {
  const env = { PUSH_SECRET: SECRET, PUSH_DATA: kv([`token:${OURS}`]) }
  expo({ body: { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] } })
  await push({ request: request(ARTICLES), env })
  assert.equal(env.PUSH_DATA.store.has(`token:${OURS}`), false)
})

test('an article with no slug is refused before anything is sent', async () => {
  const env = { PUSH_SECRET: SECRET, PUSH_DATA: kv([`token:${OURS}`]) }
  const sent = expo()
  for (const articles of [[null], [{ title: 'T' }]]) {
    assert.equal((await push({ request: request({ articles }), env })).status, 400)
  }
  assert.equal(sent.length, 0)
})

test('registration takes a token of the real shape and nothing else', async () => {
  const post = (token) =>
    register({ request: new Request('https://zuhd.news/api/tokens', { method: 'POST', body: JSON.stringify({ token }) }), env: { PUSH_DATA: kv() } })
  assert.equal((await post('ExponentPushToken[pPMlLRHmvZ4pHuqkZ-zHjC]')).status, 201)
  for (const bad of ['ExponentPushToken[]', 'ExponentPushToken[a]b]', `ExponentPushToken[${'x'.repeat(200)}]`, 'ExponentPushToken[<script>]', 42]) {
    assert.equal((await post(bad)).status, 400, String(bad))
  }
  const env = { PUSH_DATA: kv(['token:ExponentPushToken[abc]']) }
  const del = await onRequestDelete({ request: new Request('https://zuhd.news/api/tokens', { method: 'DELETE', body: JSON.stringify({ token: 'ExponentPushToken[abc]' }) }), env })
  assert.equal(del.status, 204)
  assert.equal(env.PUSH_DATA.store.size, 0)
})
