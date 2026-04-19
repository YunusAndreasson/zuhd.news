// Run: node --test scripts/lib/block-cache.test.js
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { shouldSkip, _resetForTest } from './block-cache.js'

const URL1 = 'https://reuters.com/article/x'
const URL2 = 'https://theguardian.com/article/y'
const noReprobe = () => 0.99 // above REPROBE_PROBABILITY; disables spontaneous retry
const alwaysReprobe = () => 0.01 // below REPROBE_PROBABILITY; forces retry

test('unknown domain is never skipped', () => {
  _resetForTest({})
  assert.equal(shouldSkip(URL1, noReprobe), false)
})

test('under threshold is not skipped', () => {
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 4, lastBlockedAt: new Date().toISOString() } })
  assert.equal(shouldSkip(URL1, noReprobe), false)
})

test('at threshold with recent block is skipped', () => {
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 5, lastBlockedAt: new Date().toISOString() } })
  assert.equal(shouldSkip(URL1, noReprobe), true)
})

test('expired block (>7d) is not skipped — natural re-probe', () => {
  const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 20, lastBlockedAt: old } })
  assert.equal(shouldSkip(URL1, noReprobe), false)
})

test('spontaneous re-probe bypasses skip', () => {
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 99, lastBlockedAt: new Date().toISOString() } })
  assert.equal(shouldSkip(URL1, alwaysReprobe), false)
})

test('block state is per-domain', () => {
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 99, lastBlockedAt: new Date().toISOString() } })
  assert.equal(shouldSkip(URL1, noReprobe), true)
  assert.equal(shouldSkip(URL2, noReprobe), false)
})

test('malformed URL returns false (do not accidentally skip)', () => {
  _resetForTest({})
  assert.equal(shouldSkip('not a url', noReprobe), false)
})

test('www. prefix is normalized', () => {
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 5, lastBlockedAt: new Date().toISOString() } })
  assert.equal(shouldSkip('https://www.reuters.com/x', noReprobe), true)
})
