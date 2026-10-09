// Run: node --test scripts/lib/prune-cache.test.js
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pruneOlderThan } from './prune-cache.js'

const DAY = 86_400_000

test('a card older than the horizon goes, a newer one and a directory stay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prune-cache-'))
  const now = Date.parse('2026-10-09T12:00:00Z')
  /** @param {string} name @param {number} ageDays */
  const card = (name, ageDays) => {
    writeFileSync(join(dir, name), 'x')
    const at = new Date(now - ageDays * DAY)
    utimesSync(join(dir, name), at, at)
  }
  card('old.png', 31)
  card('edge.png', 29.9)
  card('new.png', 0)
  mkdirSync(join(dir, 'sub'))
  utimesSync(join(dir, 'sub'), new Date(now - 90 * DAY), new Date(now - 90 * DAY))

  assert.deepEqual(pruneOlderThan(dir, 30 * DAY, now), { removed: 1, kept: 2 })
  assert.deepEqual(readdirSync(dir).sort(), ['edge.png', 'new.png', 'sub'])
  assert.deepEqual(pruneOlderThan(dir, 30 * DAY, now), { removed: 0, kept: 2 }, 'a second pass finds nothing')
})

test('a cache that is not there is an empty one', () => {
  assert.deepEqual(pruneOlderThan(join(tmpdir(), 'no-such-cache-dir-zuhd'), DAY), { removed: 0, kept: 0 })
})
