// Run: node --test scripts/lib/published-at.test.js
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { parseAddLog, publishedTimes } from './published-at.js'

test('reads each article to the author time of the commit that added it', () => {
  const log = [
    '@1790000100',
    '',
    'content/articles/2026-09-26-b.md',
    'content/articles/2026-09-26-c.md',
    '@1790000000',
    '',
    'content/articles/2026-09-25-a.md',
    '',
  ].join('\n')
  assert.deepEqual(
    [...parseAddLog(log)],
    [
      ['2026-09-26-b', 1790000100000],
      ['2026-09-26-c', 1790000100000],
      ['2026-09-25-a', 1790000000000],
    ],
  )
})

test('an article added twice keeps its newest add: the log runs newest first', () => {
  const log = '@200\n\ncontent/articles/x.md\n@100\n\ncontent/articles/x.md\n'
  assert.equal(parseAddLog(log).get('x'), 200_000)
})

test('ignores anything that is not an article, and names before a time', () => {
  const log = 'content/articles/orphan.md\n@100\n\ncontent/articles/.last-cycle.json\n'
  assert.equal(parseAddLog(log).size, 0)
})

test('outside a git checkout there is nothing to read, and nothing throws', () => {
  assert.equal(publishedTimes('/', 14).size, 0)
})
