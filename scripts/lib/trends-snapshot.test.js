import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { latestTrendsPath } from './trends-snapshot.js'

test('newest dated snapshot wins; caches and digests are not snapshots', () => {
  const root = mkdtempSync(join(tmpdir(), 'trends-'))
  assert.equal(latestTrendsPath(root), null)
  const dir = join(root, 'content', 'trends')
  mkdirSync(dir, { recursive: true })
  assert.equal(latestTrendsPath(root), null)
  for (const f of ['2026-09-30.json', '2026-10-01.json', '.fx-history.json', 'digest.json']) writeFileSync(join(dir, f), '{}')
  assert.equal(latestTrendsPath(root), join(dir, '2026-10-01.json'))
})
