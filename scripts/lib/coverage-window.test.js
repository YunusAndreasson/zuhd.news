// Run: node --test scripts/lib/coverage-window.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadFeedWindow } from './coverage-window.js'

const SINCE = Date.parse('2026-09-25T00:00:00Z')

/** A directory of feed snapshots, as `merge-feeds.js` archives them. */
function withSnapshots(snapshots, run) {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-window-'))
  try {
    for (const [name, stories] of Object.entries(snapshots)) {
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ multiSourceStories: stories.multi ?? [], nicheStories: stories.niche ?? [] }))
    }
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const rss = (title, pubDate) => ({ title, link: `https://example.org/${title}`, pubDate, eventCoverage: null })

// ── loadFeedWindow: the order ─────────────────────────────────────────────

test('stories with no coverage count come newest first, not first read first', () => {
  // Two feed stories in three have no count. They tied, and a stable sort
  // left them in the order the snapshots were read: oldest first.
  const order = withSnapshots(
    {
      '2026-09-26T05-00': { niche: [rss('oldest', '2026-09-26T04:00:00Z')] },
      '2026-10-03T05-00': { niche: [rss('middle', '2026-10-03T04:00:00Z')] },
      '2026-10-08T22-04': { niche: [rss('newest', '2026-10-08T21:00:00Z')] },
      '2026-10-09T05-01': {
        multi: [{ title: 'covered', link: 'https://example.org/covered', pubDate: '2026-09-27T00:00:00Z', eventCoverage: 40 }],
      },
    },
    (dir) => loadFeedWindow(SINCE, dir).map((s) => s.title),
  )
  assert.deepEqual(order, ['covered', 'newest', 'middle', 'oldest'])
})

test('a story is ranked by the largest coverage any snapshot gave it', () => {
  // The count is taken again in every snapshot and grows with the story; the
  // first sighting was kept, which is the smallest.
  const rows = withSnapshots(
    {
      '2026-10-07T05-00': {
        multi: [
          { title: 'grew', link: 'https://example.org/grew', pubDate: '2026-10-07T04:00:00Z', eventCoverage: 12 },
          { title: 'steady', link: 'https://example.org/steady', pubDate: '2026-10-07T04:00:00Z', eventCoverage: 500 },
        ],
      },
      '2026-10-08T05-00': {
        multi: [{ title: 'grew', link: 'https://example.org/grew', pubDate: '2026-10-07T04:00:00Z', eventCoverage: 800 }],
      },
    },
    (dir) => loadFeedWindow(SINCE, dir),
  )
  assert.deepEqual(rows.map((s) => [s.title, s.outlets]), [['grew', 800], ['steady', 500]])
})

test('a snapshot from before the window is not read, and a missing directory is an empty window', () => {
  const titles = withSnapshots(
    { '2026-09-24T22-00': { niche: [rss('too old', '2026-09-24T21:00:00Z')] }, '2026-09-25T05-00': { niche: [rss('inside', '2026-09-25T04:00:00Z')] } },
    (dir) => loadFeedWindow(SINCE, dir).map((s) => s.title),
  )
  assert.deepEqual(titles, ['inside'])
  assert.deepEqual(loadFeedWindow(SINCE, join(tmpdir(), 'coverage-window-no-such-dir')), [])
})
