// Run: node --test scripts/lib/block-cache.test.js
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shouldSkip, recordResult, _resetForTest } from './block-cache.js'

const URL1 = 'https://reuters.com/article/x'
const URL2 = 'https://theguardian.com/article/y'
const noReprobe = () => 0.99 // above REPROBE_PROBABILITY; disables spontaneous retry
const alwaysReprobe = () => 0.01 // below REPROBE_PROBABILITY; forces retry

// Every save in this file goes to a scratch path, never to the tracked cache.
const SCRATCH = mkdtempSync(join(tmpdir(), 'block-cache-'))
const SAVED = join(SCRATCH, 'cache.json')
_resetForTest({}, SAVED)
process.on('exit', () => rmSync(SCRATCH, { recursive: true, force: true }))
const saved = () => JSON.parse(readFileSync(SAVED, 'utf8'))
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString()

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

test('a count from outside the window starts again, it does not pick up where it stopped', () => {
  // content/.block-cache.json, 2026-10-09: 76 domains under the threshold,
  // some last failed in April. Four failures then and one today was five
  // "consecutive blocks within 7 days", and a week of skipping.
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 4, lastBlockedAt: daysAgo(8) } })
  recordResult(URL1, false)
  assert.equal(shouldSkip(URL1, noReprobe), false)
  assert.equal(saved()['reuters.com'].consecutiveBlocks, 1)

  // Inside the window it still adds up.
  _resetForTest({ 'reuters.com': { consecutiveBlocks: 4, lastBlockedAt: daysAgo(1) } })
  recordResult(URL1, false)
  assert.equal(shouldSkip(URL1, noReprobe), true)
})

test('an entry past the window is dropped when the cache is saved', () => {
  // 148 of 156 entries were older than a week, the oldest 172 days: an entry
  // left only when that domain next succeeded, and most were never fetched again.
  _resetForTest({
    'gone.example': { consecutiveBlocks: 9, lastBlockedAt: daysAgo(172) },
    'undated.example': { consecutiveBlocks: 9 },
    'theguardian.com': { consecutiveBlocks: 2, lastBlockedAt: daysAgo(2) },
  })
  recordResult(URL1, false)
  assert.deepEqual(Object.keys(saved()).sort(), ['reuters.com', 'theguardian.com'])
})

test('a success with nothing to forget writes nothing; one that clears a count does', () => {
  rmSync(SAVED, { force: true })
  _resetForTest({ 'theguardian.com': { consecutiveBlocks: 3, lastBlockedAt: daysAgo(1) } })
  recordResult(URL1, true)
  assert.equal(existsSync(SAVED), false, 'the common case: a page fetched from a domain with no history')
  recordResult(URL2, true)
  assert.deepEqual(saved(), {})
})
