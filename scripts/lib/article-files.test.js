import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { articleFilesSince, batchFiles, FILENAME_DATE_MARGIN_MS } from './article-files.js'
import { ROOT } from './paths.js'

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

test('the batch is the list\'s lines, from the root, and an empty list is an empty batch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-'))
  const list = join(dir, 'new-articles.txt')
  writeFileSync(list, 'content/articles/2026-10-09-b.md\ncontent/articles/2026-10-09-a.md\n')
  assert.deepEqual(batchFiles(list), [
    { rel: 'content/articles/2026-10-09-b.md', path: join(ROOT, 'content/articles/2026-10-09-b.md'), name: '2026-10-09-b.md' },
    { rel: 'content/articles/2026-10-09-a.md', path: join(ROOT, 'content/articles/2026-10-09-a.md'), name: '2026-10-09-a.md' },
  ])
  writeFileSync(list, '\n')
  assert.deepEqual(batchFiles(list), [], 'the empty last line is not an article')
  assert.throws(() => batchFiles(join(dir, 'absent.txt')), /ENOENT/)
})
