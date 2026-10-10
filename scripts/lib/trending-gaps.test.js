// Run: node --test scripts/lib/trending-gaps.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { main } from '../trending-gaps.js'

// The script's stdout is pasted into the selector's prompt, so what it writes
// is pinned to the character, and what it does when there is no list to be
// had is that it says so and writes nothing.

const NOW = Date.parse('2026-10-09T10:00:00Z')
const TOP = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/10/08'

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

/** A Wikimedia that answers the top list with `articles` and each summary from `descriptions`. */
const wikimedia = (articles, descriptions = {}) => {
  const asked = []
  const get = async (url) => {
    asked.push(String(url))
    if (String(url) === TOP) return json({ items: [{ articles }] })
    const title = decodeURIComponent(String(url).split('/page/summary/')[1] ?? '')
    if (!(title in descriptions)) return json({}, 404)
    return json({ description: descriptions[title] })
  }
  return { asked, get: /** @type {typeof fetch} */ (/** @type {unknown} */ (get)) }
}

const nothingCovered = { concepts: new Set(), slugWordSets: [] }

/** Run it, keeping what it wrote and silencing what it said on stderr. */
const run = async (get, coverage = nothingCovered) => {
  let out = ''
  const said = []
  const error = console.error
  console.error = (line) => {
    said.push(String(line))
  }
  try {
    const outcome = await main({
      fetch: get,
      coverage,
      write: (text) => {
        out += text
      },
      now: NOW,
    })
    return { out, said, outcome }
  } finally {
    console.error = error
  }
}

test('the lines are the uncovered, non-junk titles with their descriptions and views', async () => {
  const { get, asked } = wikimedia(
    [
      { article: 'Main_Page', views: 9_000_000 },
      { article: 'Special:Search', views: 2_000_000 },
      { article: 'Strait_of_Hormuz', views: 1_234_567 },
      { article: 'Erling_Haaland', views: 800_000 },
      { article: 'Storm_Isaias', views: 45_678 },
      { article: 'Navanethem_Pillay', views: 950 },
      { article: 'Some_Film_(film)', views: 700_000 },
    ],
    {
      Strait_of_Hormuz: 'Strait between the Gulf of Oman and the Persian Gulf',
      Erling_Haaland: 'Norwegian footballer (born 2000)',
      Storm_Isaias: '',
      Navanethem_Pillay: 'South African jurist',
    },
  )
  const { out, outcome } = await run(get)
  assert.equal(
    out,
    '- Strait of Hormuz (Strait between the Gulf of Oman and the Persian Gulf) — 1.2M views\n' +
      '- Storm Isaias — 46k views\n' +
      '- Navanethem Pillay (South African jurist) — 950 views\n',
  )
  assert.deepEqual(outcome, { counts: { listed: 7, candidates: 4, unreachable: 0, lines: 3 } })
  // Yesterday's list, and a summary only for a title that got past the patterns.
  assert.equal(asked[0], TOP)
  assert.equal(asked.length, 5)
})

test('what the site ran this week is not a gap', async () => {
  const { get } = wikimedia(
    [
      { article: 'Strait_of_Hormuz', views: 1_000_000 },
      { article: 'Nobel_Peace_Prize', views: 900_000 },
      { article: 'Storm_Isaias', views: 45_000 },
    ],
    { Strait_of_Hormuz: 'Strait', Nobel_Peace_Prize: 'Prize', Storm_Isaias: 'Atlantic storm' },
  )
  const coverage = {
    concepts: new Set(['strait of hormuz']),
    slugWordSets: [new Set(['pillay', 'wins', 'nobel', 'peace', 'prize'])],
  }
  const { out } = await run(get, coverage)
  assert.equal(out, '- Storm Isaias (Atlantic storm) — 45k views\n')
})

test('a summary that cannot be had costs its own row', async () => {
  const { get } = wikimedia(
    [
      { article: 'Storm_Isaias', views: 45_000 },
      { article: 'Navanethem_Pillay', views: 950 },
    ],
    { Navanethem_Pillay: 'South African jurist' },
  )
  const { out, outcome } = await run(get)
  assert.equal(out, '- Navanethem Pillay (South African jurist) — 950 views\n')
  assert.deepEqual(outcome.counts, { listed: 2, candidates: 2, unreachable: 1, lines: 1 })
})

test('no list is said, and nothing is written', async () => {
  const refused = await run(/** @type {any} */ (async () => json({}, 403)))
  assert.equal(refused.out, '')
  assert.match(refused.outcome.skipped, /^HTTP 403 from the pageviews top list for 2026-10-08$/)
  assert.deepEqual(refused.said, [`trending-gaps: ${refused.outcome.skipped}`])

  // A 200 that is not the list is a change of shape: the reason carries what came back.
  const reshaped = await run(/** @type {any} */ (async () => json({ items: [{ pages: [] }] })))
  assert.equal(reshaped.out, '')
  assert.match(reshaped.outcome.skipped, /has no articles: \{"items":\[\{"pages":\[\]\}\]\}/)

  // An empty list is a list: nothing to say, and not a skip.
  const empty = await run(wikimedia([]).get)
  assert.equal(empty.out, '')
  assert.deepEqual(empty.outcome, { counts: { listed: 0, candidates: 0, unreachable: 0, lines: 0 } })
})

test('a failure is thrown, for the stage to report, and not swallowed', async () => {
  await assert.rejects(
    run(
      /** @type {any} */ (
        async () => {
          throw new TypeError('fetch failed')
        }
      ),
    ),
    /fetch failed/,
  )
})
