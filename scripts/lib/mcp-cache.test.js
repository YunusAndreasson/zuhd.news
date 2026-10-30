// Run: node --test scripts/lib/mcp-cache.test.js
//
// A thread_id went into the context path unchecked, so `../map-archive.json?x=1`
// fetched another file, and each new query string stayed in `mem` for good.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { getContext, getFeed } from '../../workers/mcp/src/cache.js'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function countFetches() {
  const fetched = []
  globalThis.fetch = async (url) => {
    fetched.push(String(url))
    return Response.json({ from: String(url) })
  }
  return fetched
}

test('a context id outside [a-z0-9-] is refused before any fetch', async () => {
  const fetched = countFetches()
  for (const id of ['../map-archive.json?x=1', '../feed', 'a/b', 'UPPER', 'a.b', '', 'a-b\n']) {
    await assert.rejects(getContext(id), /Invalid context id/, JSON.stringify(id))
  }
  assert.deepEqual(fetched, [])
})

test('the cache holds 64 entries, dropping the oldest write', async () => {
  const fetched = countFetches()
  await getFeed()
  assert.equal(fetched.length, 1)
  await getFeed()
  assert.equal(fetched.length, 1, 'a second read is a hit')

  for (let i = 0; i < 64; i++) await getContext(`id-${i}`)
  await getContext('id-63')
  assert.equal(fetched.length, 65, 'the newest entries are still held')

  await getFeed()
  assert.equal(fetched.length, 66, 'the first entry was evicted')
})
