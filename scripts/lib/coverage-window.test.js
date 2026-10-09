// Run: node --test scripts/lib/coverage-window.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadArticles, loadFeedWindow } from './coverage-window.js'

const SINCE = Date.parse('2026-09-25T00:00:00Z')

/** A directory of article files, by name. */
function withArticles(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-window-'))
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const md = (frontmatter, body) => `---\n${frontmatter.join('\n')}\n---\n\n${body}\n`

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

// ── loadFeedWindow: what a concept is ─────────────────────────────────────

test('a concept is read whether it is an object or a bare label', () => {
  // The API's stories carry `{ label, uri }`, the RSS ones the label alone.
  // Dawn, 2026-10-08, as archived: its concepts were dropped, so the story
  // matched a tag on its headline only and no `wiki-*` row at all.
  const [dawn, api] = withSnapshots(
    {
      '2026-10-08T22-04': {
        niche: [{ ...rss('Wheat output targets delayed till finalisation of price', '2026-10-08T20:00:00Z'), concepts: ['Rabi crop', 'Wheat', 'Rana Tanveer Hussain'] }],
        multi: [
          {
            title: 'Tehran reopens talks',
            link: 'https://example.org/tehran',
            pubDate: '2026-10-08T19:00:00Z',
            eventCoverage: 90,
            concepts: [{ label: 'Iran', uri: 'http://en.wikipedia.org/wiki/Iran' }, { label: 'Nuclear program', uri: 'http://en.wikipedia.org/wiki/Nuclear_program_of_Iran' }],
          },
        ],
      },
    },
    (dir) => loadFeedWindow(SINCE, dir).sort((a, b) => a.outlets - b.outlets),
  )
  assert.deepEqual(dawn.conceptTitles, ['rabi crop', 'wheat', 'rana tanveer hussain'])
  assert.ok(dawn.hay.includes('rana tanveer hussain'), 'the label is in the haystack a tag is matched against')
  assert.deepEqual(api.conceptTitles, ['iran', 'nuclear program of iran'])
  assert.ok(api.hay.includes('nuclear program'))
})

test('a title with a literal percent sign is a title, not the end of the stage', () => {
  // The URIs arrive unencoded, so `decodeURIComponent` on this one throws.
  // It was outside the per-file `try`: one such story would have stopped both
  // dispatch stages on every run for the fourteen days it stayed in the window.
  const rows = withSnapshots(
    {
      '2026-10-08T05-00': {
        multi: [
          {
            title: 'Grid operators back the target',
            link: 'https://example.org/grid',
            pubDate: '2026-10-08T04:00:00Z',
            eventCoverage: 5,
            concepts: [{ label: '100% renewable energy', uri: 'http://en.wikipedia.org/wiki/100%_renewable_energy' }, { label: 'São Paulo', uri: 'http://en.wikipedia.org/wiki/S%C3%A3o_Paulo' }],
          },
        ],
      },
    },
    (dir) => loadFeedWindow(SINCE, dir),
  )
  assert.deepEqual(rows[0].conceptTitles, ['100% renewable energy', 'são paulo'])
})

// ── loadArticles ──────────────────────────────────────────────────────────

test('an article is read into the row the joins use', () => {
  const [row] = withArticles(
    {
      '2026-10-01-hormuz-reopens.md': md(
        ['title: "Hormuz Reopens"', 'date: "2026-10-01T10:00:00Z"', 'location: "Muscat"', 'concepts:', '  - "Strait of Hormuz"', '  - label: "Oman"', 'entities:', '  - mention: "Hormuz"', '    indicatorId: "portwatch-hormuz-tanker"'],
        'Muscat — Tankers crossed for [Iran](country:IR) and [Oman](country:OM), and [Iran](country:IR) again.\n\nWhy it matters.',
      ),
      '2026-09-01-too-old.md': md(['title: "Before The Window"', 'date: "2026-09-01T10:00:00Z"'], 'Nowhere — Old.'),
      'notes.txt': 'not an article',
    },
    (dir) => loadArticles(SINCE, dir),
  )
  assert.equal(row.slug, '2026-10-01-hormuz-reopens')
  assert.equal(row.lead, 'Muscat — Tankers crossed for Iran and Oman, and Iran again.', 'the first block, as a reader sees it')
  assert.deepEqual(row.countries, ['IR', 'OM'])
  assert.deepEqual(row.entityIds, ['cp:hormuz'], 'a renamed id is read as its current one')
  assert.equal(row.hay, 'hormuz reopens muscat strait of hormuz oman')
})

test('an unquoted date is still a date: newest first, and a day when cut to ten characters', () => {
  // Two articles carry `date:` unquoted (both 2026-09-09). js-yaml 5 leaves a
  // timestamp a string, so they read like the rest. js-yaml 4 typed it and
  // handed back a `Date`, whose `String()` is "Fri Oct 02 2026 …": first in a
  // descending sort whatever its day, and "Fri Oct 02" where every caller
  // here wants 2026-10-02. This is what a parser that types it again breaks.
  const rows = withArticles(
    {
      '2026-10-03-newest.md': md(['title: "Newest"', 'date: "2026-10-03T08:00:00Z"'], 'Cairo — C.'),
      '2026-10-02-unquoted.md': md(['title: "Unquoted"', 'date: 2026-10-02T11:43:44Z'], 'Lagos — B.'),
      '2026-10-01-oldest.md': md(['title: "Oldest"', 'date: "2026-10-01T10:00:00Z"'], 'Lima — A.'),
      '2026-09-30-undated.md': md(['title: "Undated"'], 'Oslo — D.'),
    },
    (dir) => loadArticles(SINCE, dir),
  )
  assert.deepEqual(rows.map((a) => a.slug), ['2026-10-03-newest', '2026-10-02-unquoted', '2026-10-01-oldest', '2026-09-30-undated'])
  assert.equal(rows[1].date, '2026-10-02T11:43:44Z')
  assert.deepEqual(rows.map((a) => String(a.date).slice(0, 10)), ['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-30'])
})
