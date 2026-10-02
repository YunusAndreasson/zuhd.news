import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { sha1Hex } from './hash.js'

// Every narration cache on disk is keyed by the expression this replaced. A
// different key would re-narrate every item once, at Opus prices.
test('sha1Hex is byte-for-byte the expression the cache keys were made with', () => {
  const old = (s, n) => createHash('sha1').update(s).digest('hex').slice(0, n)
  const value = { prompt: 'abc12345', slugs: ['a', 'b'], move: null }
  assert.equal(sha1Hex(value), old(JSON.stringify(value), 16))
  assert.equal(sha1Hex('a prompt', 8), old('a prompt', 8))
  assert.equal(sha1Hex('x', 12).length, 12)
})
