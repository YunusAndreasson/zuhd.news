// Run: node --test scripts/lib/mcp-rate-limit.test.js
//
// KV answers a busy key with a 429 and refuses a key over 512 bytes, and either
// became an uncaught 500 on the worker's only endpoint.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRateLimit } from '../../workers/mcp/src/rate-limit.js'

function kv(failing = false) {
  const store = new Map()
  const keys = []
  const touch = (key) => {
    keys.push(key)
    if (new TextEncoder().encode(key).length > 512) throw new Error('KV key too long')
    if (failing) throw new Error('KV 429')
  }
  return {
    keys,
    store,
    get: async (key, type) => {
      touch(key)
      const value = store.get(key)
      return value && type === 'json' ? JSON.parse(value) : (value ?? null)
    },
    put: async (key, value) => {
      touch(key)
      store.set(key, value)
    },
  }
}

const request = (authorization) => new Request('https://mcp.example/mcp', {
  headers: { 'cf-connecting-ip': '192.0.2.1', ...(authorization && { authorization }) },
})

test('a limiter whose KV fails lets the request through', async (t) => {
  t.mock.method(console, 'error', () => {})
  const rl = await checkRateLimit(request(), { RATE_LIMIT: kv(true) })
  assert.equal(rl.allowed, true)
})

test('a KV write that fails after a good read still lets the request through', async (t) => {
  t.mock.method(console, 'error', () => {})
  const store = kv()
  store.put = async () => { throw new Error('KV 429') }
  assert.equal((await checkRateLimit(request(), { RATE_LIMIT: store })).allowed, true)
})

test('an over-long Bearer is not looked up, and is limited by address', async () => {
  const store = kv()
  const rl = await checkRateLimit(request(`Bearer ${'k'.repeat(600)}`), { RATE_LIMIT: store })
  assert.equal(rl.allowed, true)
  assert.ok(rl.headers, 'the limiter ran, rather than failing open')
  assert.deepEqual(store.keys, ['rl:192.0.2.1', 'rl:192.0.2.1'])
})

test('a stored key of the longest allowed length gets its own bucket', async () => {
  const apiKey = 'k'.repeat(505)
  const store = kv()
  store.store.set(`key:${apiKey}`, 'owner')
  const rl = await checkRateLimit(request(`Bearer ${apiKey}`), { RATE_LIMIT: store })
  assert.ok(rl.headers, 'no key over the limit was tried')
  assert.equal(rl.remaining, 119)
})

test('an empty bucket still refuses', async () => {
  const store = kv()
  store.store.set('rl:192.0.2.1', JSON.stringify({ tokens: 0, ts: Date.now() }))
  assert.equal((await checkRateLimit(request(), { RATE_LIMIT: store })).allowed, false)
})
