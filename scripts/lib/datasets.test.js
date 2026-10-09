// Run: node --test scripts/lib/datasets.test.js
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { DATASETS, pathOf } from './datasets.js'
import { ROOT } from './paths.js'

const entries = Object.entries(DATASETS)
const paths = new Set(entries.map(([, d]) => d.path))

test('a name resolves under the repository root, or stays where /tmp put it', () => {
  assert.equal(pathOf('storyLedger'), join(ROOT, 'content/.story-ledger.json'))
  assert.equal(pathOf('articles'), join(ROOT, 'content/articles'))
  assert.equal(pathOf('selection'), '/tmp/zuhd-selection.json')
  assert.throws(() => pathOf('selections'), /no dataset named "selections"/, 'a typo is an error, not an empty read')
})

test('every location has one name and one of the five classes', () => {
  assert.equal(paths.size, entries.length, 'two names for one path')
  for (const [name, d] of entries) {
    assert.ok(['record', 'history', 'snapshot', 'cache', 'scratch'].includes(d.class), `${name}: class "${d.class}"`)
    assert.equal(d.path.startsWith('/tmp/'), d.path.startsWith('/'), `${name}: absolute only in /tmp`)
  }
})

// A stage that starts keeping a new file in content/ has to say what it is.
// `.tmp` is writeJson's sibling, left only by a write killed half way.
test('every dotfile under content/ is in the catalog', () => {
  const dots = (dir) =>
    readdirSync(join(ROOT, dir))
      .filter((n) => n.startsWith('.') && !n.endsWith('.tmp'))
      .map((n) => `${dir}/${n}`)
  const unnamed = [...dots('content'), ...dots('content/trends')].filter((p) => !paths.has(p))
  assert.deepEqual(unnamed, [], `state with no name:\n  ${unnamed.join('\n  ')}`)
})

// The four sessions are told where to read and write in prose, and a prompt
// cannot import a constant. This is what keeps the two from parting.
test('every path a prompt names is in the catalog', () => {
  const unknown = []
  for (const f of readdirSync(join(ROOT, 'scripts')).filter((n) => n.endsWith('-prompt.md'))) {
    const text = readFileSync(join(ROOT, 'scripts', f), 'utf8')
    const named = text.match(/\/tmp\/zuhd-[A-Za-z0-9_-]+(?:\.[a-z]+)?|content\/\.[a-z0-9-]+\.(?:json|md)|content\/articles/g) ?? []
    for (const p of new Set(named)) if (!paths.has(p)) unknown.push(`${f}: ${p}`)
  }
  assert.deepEqual(unknown, [], `a prompt names a path the catalog does not:\n  ${unknown.join('\n  ')}`)
})

// The files that still spell a state path themselves, as of 2026-10-08: the
// backlog of the move onto `pathOf`. The list is exact in both directions. A
// file that newly spells a path fails here, and so does a file that has
// stopped and is still listed, so the list can only get shorter.
//
// Comment lines do not count: a path in prose is not a path that is opened.
const STILL_SPELLING = [
  'scripts/build.js',
  'scripts/extract-entities.js',
  'scripts/extract-source-angles.js',
  'scripts/fetch-ai-models.js',
  'scripts/fetch-analytics.js',
  'scripts/fetch-chokepoints.js',
  'scripts/fetch-companies.js',
  'scripts/fetch-conflict.js',
  'scripts/fetch-firms.js',
  'scripts/fetch-gdacs.js',
  'scripts/fetch-ioda.js',
  'scripts/fetch-ipc.js',
  'scripts/fetch-markets.js',
  'scripts/fetch-news-api.js',
  'scripts/fetch-news.js',
  'scripts/fetch-trends.js',
  'scripts/flag-title-echo.js',
  'scripts/generate-briefing.js',
  'scripts/lib/company-gaps.js',
  'scripts/lib/coverage-window.js',
  'scripts/lib/published-at.js',
  'scripts/lib/trends-snapshot.js',
  'scripts/lib/trends-sources/stocks.js',
  'scripts/lib/trends-sources/wikipedia.js',
  'scripts/narrate-events.js',
  'scripts/narrate-gdacs.js',
  'scripts/narrate-indicators.js',
  'scripts/narrate-market-signals.js',
  'scripts/post-to-instagram.js',
  'scripts/post-to-twitter.js',
  'scripts/run-cycle.legacy.sh',
  'scripts/test-voice.js',
  'scripts/translate-swedish.js',
  'scripts/trending-gaps.js',
  'scripts/watch.js',
]

test('no new file spells a state path, and a converted one leaves the list', () => {
  const tokens = ['/tmp/zuhd-']
  for (const [, d] of entries) {
    const base = d.path.split('/').pop() ?? ''
    if (d.path.startsWith('content/') && base.startsWith('.')) tokens.push(base)
  }
  for (const dir of ['articles', 'trends', 'audio']) tokens.push(`content/${dir}`, `'content', '${dir}'`, `"content", "${dir}"`)

  // Not stages. The catalog is where the paths are; the harness builds the
  // sandbox `run-cycle.sh` runs in, and the paths it spells are the script's
  // own, inside that sandbox.
  // `run-cycle.sh`, the wrapper, names the lock file it takes: bash cannot ask
  // the catalog.
  const exempt = /\.test\.js$|lib\/datasets\.js$|lib\/cycle-(harness|scenarios)\.js$|scripts\/run-cycle\.sh$/
  const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
  const code = (file) => readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|#)/.test(l)).join('\n')
  const spelling = walk(join(ROOT, 'scripts'))
    .filter((f) => /\.(js|mjs|sh)$/.test(f) && !exempt.test(f))
    .filter((f) => tokens.some((t) => code(f).includes(t)))
    .map((f) => relative(ROOT, f))
    .sort()

  const fresh = spelling.filter((f) => !STILL_SPELLING.includes(f))
  const done = STILL_SPELLING.filter((f) => !spelling.includes(f))
  assert.deepEqual(fresh, [], `spells a state path instead of asking pathOf:\n  ${fresh.join('\n  ')}`)
  assert.deepEqual(done, [], `no longer spells one, so take it off the list:\n  ${done.join('\n  ')}`)
})
