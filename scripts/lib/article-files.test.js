import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { articleFilesSince, FILENAME_DATE_MARGIN_MS } from './article-files.js'

test('keeps the window plus the margin, every undated name, and only .md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'article-files-'))
  const since = Date.parse('2026-10-01T00:00:00Z')
  const day = (ms) => new Date(ms).toISOString().slice(0, 10)
  const names = [
    `${day(since)}-today.md`,
    `${day(since - FILENAME_DATE_MARGIN_MS)}-edge.md`,
    `${day(since - FILENAME_DATE_MARGIN_MS - 86_400_000)}-old.md`,
    'example.md',
    `${day(since)}-notes.txt`,
  ]
  for (const n of names) writeFileSync(join(dir, n), '')
  assert.deepEqual(articleFilesSince(dir, since).sort(), [names[1], names[0], 'example.md'].sort())
})
