import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathOf } from './datasets.js'
import { parseFrontmatter, removeFrontmatterKey } from './frontmatter.js'
import { rebuildStarters } from './starter-articles.js'
import { classifyRevision, starterDecision } from './starter-eligibility.js'
import { reviewAfterChartRemoval, stampReview } from './starter-topics.js'

const raw = slug => readFileSync(join(pathOf('articles'), `${slug}.md`), 'utf8')
const gold = raw('2026-11-22-karachi-gold-bar-shortage-investors-price-fall')
const parsed = () => parseFrontmatter(gold)
const charts = new Map([['paxg', { unit: 'USD', values: [3999, 4000], dates: ['2026-11-21', '2026-11-22'], asOf: '2026-11-22' }]])
const evidence = { domain: 'markets', actors: 'nonpartisan', exclusions: [], measurement: 'Rs30,000 extra per tola', sourceIndex: 0, subjectChart: null }
function reviewed(article, changes = {}) {
  article.meta.starterReview = stampReview(article, { ...evidence, ...changes })
  return article
}

test('both 16 November counterexamples stay out, including when the evidence is a dated chart', () => {
  for (const [slug, flags, actor] of [
    ['2026-11-16-hormuz-two-tankers-hit-mines-southern-route-irgc', ['war', 'violence'], 'unknown'],
    ['2026-11-16-trump-backs-huang-return-nvidia-ceo', ['partisan-figure'], 'partisan'],
  ]) {
    const article = parseFrontmatter(raw(slug))
    assert.notEqual(article.meta.starterEligible, true)
    const review = { domain: 'shipping', exclusions: flags, actors: actor, subjectChart: article.meta.chart ?? null }
    assert.equal(starterDecision(reviewed(article, review), new Map([[article.meta.chart, charts.get('paxg')]])).eligible, false)
  }
})

test('broad domains qualify with a dated sourced hook, regardless of category or a venue chart', () => {
  assert.equal(starterDecision(parsed()).eligible, true)
  const article = parsed()
  article.meta.category = 'politics'
  article.body = 'Karachi — The port recorded 35 arrivals.'
  for (const domain of ['shipping', 'consumer-prices', 'science', 'culture', 'sport', 'health-research', 'products', 'space', 'climate-data']) {
    assert.equal(starterDecision(reviewed(article, { domain, measurement: '35 arrivals' })).eligible, true)
  }
})

test('every deny label overrides evidence; opaque actors and malformed classification fail closed', () => {
  for (const flag of ['violence', 'war', 'crime', 'casualties', 'disaster', 'partisan-figure']) {
    assert.equal(starterDecision(reviewed(parsed(), { subjectChart: 'paxg', exclusions: [flag] }), charts).reason, flag)
  }
  for (const changes of [{ actors: 'unknown' }, { actors: 'partisan' }, { domain: 'unknown' }, { actors: null },
    { exclusions: {} }, { exclusions: ['unspecified'] }, { sourceIndex: 999 }]) {
    assert.equal(starterDecision(reviewed(parsed(), changes)).eligible, false)
  }
  for (const change of [a => { a.meta.entities = null }, a => { delete a.meta.thermal },
    a => { a.meta.venues = 'bse' }, a => { a.meta.sources = [null] }, a => { a.meta.concepts = ['Donald Trump'] },
    a => { a.meta.category = 'unknown' }, a => { a.meta.lat = 92 }, a => { a.meta.date = '2026-02-30' }]) {
    const article = parsed()
    change(article)
    assert.equal(starterDecision(reviewed(article), charts).eligible, false)
  }
})

test('a revised body, source angle, concept or correction invalidates an earlier review', () => {
  for (const change of [a => { a.body += '\n\nFloods stopped deliveries.' },
    a => { a.meta.sources[0].angle += ' following the attack' }, a => { a.meta.concepts.push('Evacuation') },
    a => { a.meta.corrections = [{ note: 'The strikes hit the port.' }] },
    a => { delete a.meta.starterReview }]) {
    const article = parsed()
    change(article)
    assert.equal(starterDecision(article, charts).eligible, false)
  }
})

test('a forecast without an observed quantity, a date, a model and a partial number cannot qualify', () => {
  for (const [body, measurement] of [
    ['Prices may rise by 20% next month.', null], ['The company filed on 23 November.', '23 November'],
    ['GPT-6 is shipping.', 'GPT-6'], ['Prices rose 35%.', '5%'], ['Prices rose 4%.', '35%'],
  ]) {
    const a = parsed()
    a.body = `Karachi — ${body}`
    reviewed(a, { measurement, sourceIndex: measurement ? 0 : null })
    assert.equal(starterDecision(a).eligible, false)
  }
})

test('a subject chart needs two distinct dated observations and cannot be substituted with a venue', () => {
  const a = reviewed(parsed(), { measurement: null, sourceIndex: null, subjectChart: 'paxg' })
  assert.equal(starterDecision(a, charts).eligible, true)
  for (const override of [{ unit: '' }, { values: {} }, { asOf: '2026-11-23' }, { dates: ['2026-11-22', '2026-11-22'] },
    { values: [50, NaN] }, { stale: true }, { dates: ['bad', '2026-11-22'] }]) {
    assert.equal(starterDecision(a, new Map([['paxg', { ...charts.get('paxg'), ...override }]])).eligible, false)
  }
  a.meta.venues = ['paxg']
  reviewed(a, { measurement: null, sourceIndex: null, subjectChart: null })
  assert.equal(starterDecision(a, charts).eligible, false)
})

test('removing an unavailable chart preserves an independently reviewed hook, but editing the hook needs a new review', () => {
  const withoutChart = removeFrontmatterKey(gold, 'chart')
  assert.equal(starterDecision(parseFrontmatter(reviewAfterChartRemoval(gold, withoutChart))).eligible, true)
  const different = `${withoutChart}\nA correction changes the substance.`
  assert.equal(starterDecision(parseFrontmatter(reviewAfterChartRemoval(gold, different))).eligible, false)
})

test('sparse backfill preserves rejected bytes and mtimes; normal publication explicitly revokes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'starter-backfill-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const first = removeFrontmatterKey(gold, 'starterEligible')
  const missing = removeFrontmatterKey(first, 'starterReview')
  const start = Date.parse('2026-10-25'), end = Date.parse('2026-11-24')
  const times = new Map([['before', start - 1], ['first', start], ['last', end - 1], ['next', end], ['old-false', start], ['missing', start]])
  for (const key of times.keys()) {
    const text = key === 'old-false' ? classifyRevision(missing, charts) : key === 'missing' ? missing : first
    writeFileSync(join(dir, `${key}.md`), text)
  }
  const file = name => join(dir, `${name}.md`)
  const read = name => readFileSync(file(name), 'utf8')
  const mtime = statSync(file('missing')).mtimeMs
  const options = { since: start, through: end, publications: times }
  const rows = rebuildStarters(dir, charts, options)
  assert.deepEqual(rows.map(row => [row.file, row.changed, row.eligible]), [
    ['first.md', true, true], ['last.md', true, true], ['missing.md', false, false], ['old-false.md', false, false]])
  assert.equal(read('old-false'), classifyRevision(missing, charts))
  assert.equal(read('missing'), missing)
  assert.equal(statSync(file('missing')).mtimeMs, mtime)
  assert.ok(rebuildStarters(dir, charts, options).every(row => !row.changed))
  const corrected = `${read('first')}\nFloods stopped deliveries.\n`
  writeFileSync(file('first'), corrected)
  const before = statSync(file('first')).mtimeMs
  rebuildStarters(dir, charts)
  assert.equal(read('first'), corrected.replace('starterEligible: true', 'starterEligible: false'))
  assert.ok(Math.abs(statSync(file('first')).mtimeMs - before) < 1)
  assert.equal(classifyRevision(read('first'), charts), read('first'))
})

test('archived semantic responses must match the exact revision and only approvals add content', t => {
  const dir = mkdtempSync(join(tmpdir(), 'starter-reviews-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const first = removeFrontmatterKey(removeFrontmatterKey(gold, 'starterReview'), 'starterEligible')
  const yes = parsed().meta.starterReview
  const no = stampReview(parseFrontmatter(first), { ...evidence, actors: 'unknown' })
  const reviews = { 'accepted.md': yes, 'rejected.md': no }
  for (const key of Object.keys(reviews)) writeFileSync(join(dir, key), first)
  const results = rebuildStarters(dir, charts, { all: true, reviews })
  assert.deepEqual(results.map(r => [r.eligible, r.changed]), [[true, true], [false, false]])
  assert.equal(readFileSync(join(dir, 'rejected.md'), 'utf8'), first)
  assert.ok(rebuildStarters(dir, charts, { all: true, reviews }).every(r => !r.changed))
  const amended = `${first}\nUpdated report.\n`
  writeFileSync(join(dir, 'accepted.md'), amended)
  const [stale, next] = rebuildStarters(dir, charts, { all: true, reviews })
  assert.match(stale.skipped, /stale revision/)
  assert.equal(next.file, 'rejected.md')
  assert.equal(readFileSync(join(dir, 'accepted.md'), 'utf8'), amended)
})

test('publication rechecks quoted YAML keys and replaces them without a duplicate', t => {
  const dir = mkdtempSync(join(tmpdir(), 'quoted-starter-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const quote of ['"', "'"]) {
    const file = join(dir, 'quoted.md')
    writeFileSync(file, removeFrontmatterKey(gold, 'starterReview').replace('starterEligible:', `${quote}starterEligible${quote}:`))
    assert.equal(rebuildStarters(dir, charts).length, 1)
    assert.equal(parseFrontmatter(readFileSync(file, 'utf8')).meta.starterEligible, false)
  }
})

test('maintained partisan names veto a mistaken review anywhere in the reviewed prose', () => {
  const actual = parseFrontmatter(raw('2026-11-16-trump-backs-huang-return-nvidia-ceo'))
  assert.match(starterDecision(reviewed(actual, { measurement: '177,000 people' })).reason, /partisan figure/i)
  const changes = [
    article => { article.meta.title += ' with Trump' },
    article => { article.body += ' Trump spoke.' },
    article => { article.meta.sources[0].angle = 'Trump’s view' },
    article => { article.meta.corrections = [{ note: 'Trump was present.' }] },
  ]
  for (const change of changes) {
    const article = parsed()
    change(article)
    assert.match(starterDecision(reviewed(article)).reason, /partisan figure/i)
  }
  const article = parsed()
  article.body += ' Trumpets sounded.'
  assert.equal(starterDecision(reviewed(article)).eligible, true)
})

test('a missing live source excerpt cannot certify a hook but leaves independent chart evidence', () => {
  const article = parsed()
  article.meta.starterReview = stampReview(article, { ...evidence, subjectChart: 'paxg' }, new Set([1]))
  assert.equal(starterDecision(article).eligible, false)
  assert.equal(starterDecision(article, charts).evidence, 'chart')
  article.meta.starterReview = stampReview(article, evidence, new Set([0]))
  assert.equal(starterDecision(article).eligible, true)
})

test('sparse and imported negative reviews retain a bundled opener withdrawal', t => {
  const dir = mkdtempSync(join(tmpdir(), 'withdrawn-opener-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'karachi.md')
  const changed = gold.replace(/angle: /, 'angle: Trump said ')
  writeFileSync(file, changed)
  rebuildStarters(dir, charts)
  rebuildStarters(dir, charts, { all: true })
  assert.equal(parseFrontmatter(readFileSync(file, 'utf8')).meta.starterEligible, false)
  writeFileSync(file, gold)
  const negative = stampReview(parsed(), { ...evidence, actors: 'partisan' })
  rebuildStarters(dir, charts, { all: true, reviews: { 'karachi.md': negative } })
  assert.equal(parseFrontmatter(readFileSync(file, 'utf8')).meta.starterEligible, false)
})

test('an editorial save immediately after a backfill read survives reclassification', t => {
  const dir = mkdtempSync(join(tmpdir(), 'concurrent-revision-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'one.md')
  const old = removeFrontmatterKey(gold, 'starterEligible')
  const corrected = `${old}\nA subsequent editorial correction. Trump addressed the dealers.\n`
  writeFileSync(file, old)
  const withdrawn = join(dir, 'withdrawn.md')
  writeFileSync(withdrawn, gold)
  const read = fs.readFileSync
  let edited = false
  t.mock.method(fs, 'readFileSync', (path, ...args) => {
    const value = read(path, ...args)
    if (path === file && !edited) {
      edited = true
      writeFileSync(file, corrected)
    }
    if (path === withdrawn) fs.rmSync(withdrawn)
    return value
  })
  syncBuiltinESMExports()
  try {
    writeFileSync(join(dir, 'two.md'), old)
    const [skipped, next, removed] = rebuildStarters(dir, charts)
    assert.equal(skipped.skipped, 'revision changed')
    assert.equal(skipped.changed, false)
    assert.equal(next.changed, true)
    assert.equal(removed.skipped, 'revision changed')
    assert.equal(fs.existsSync(withdrawn), false)
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  }
  assert.ok(edited)
  const result = parseFrontmatter(readFileSync(file, 'utf8'))
  assert.equal(readFileSync(file, 'utf8'), corrected)
  assert.equal(starterDecision(result, charts).eligible, false)
  assert.notEqual(result.meta.starterEligible, true)
})

for (const [indent, spelling] of [['  ', '"starterEligible"'], ['', String.raw`"starter\u0045ligible"`]]) {
  test(`withdraws ${spelling} in a mapping indented by ${indent.length} spaces without changing the article`, t => {
    const dir = mkdtempSync(join(tmpdir(), 'quoted-mapping-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, 'one.md')
    const stale = removeFrontmatterKey(gold, 'starterReview').replace('starterEligible:', `${spelling}:`)
      .replace(/^---\n([\s\S]*?)\n---\n/, (_, yaml) => `---\n${yaml.split('\n').map(line => indent + line).join('\n')}\n---\n`)
    const { meta, body } = parseFrontmatter(stale)
    assert.equal(meta.starterEligible, true)
    writeFileSync(file, stale)
    rebuildStarters(dir, charts)
    assert.deepEqual(parseFrontmatter(readFileSync(file, 'utf8')), { body, meta: { ...meta, starterEligible: false } })
  })
}

test('the locked --all CLI skips a correction saved before its installation reread', t => {
  const dir = mkdtempSync(join(tmpdir(), 'starter-cli-race-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const article = join(dir, 'karachi.md')
  const old = removeFrontmatterKey(gold, 'starterEligible')
  const note = '\nCorrection: Trump addressed the gold dealers.\n'
  writeFileSync(article, old)
  // Run the real CLI with disposable data paths. The second process does not
  // participate in the cycle's advisory lock, just like an editor saving a file.
  const preload = join(dir, 'editor.mjs')
  writeFileSync(preload, `
    import fs from 'node:fs'
    import assert from 'node:assert/strict'
    import { spawnSync } from 'node:child_process'
    import { registerHooks, syncBuiltinESMExports } from 'node:module'
    const dir = ${JSON.stringify(dir)}, article = ${JSON.stringify(article)}
    const paths = { articles: dir, cycleLock: dir + '/lock', marketSignalState: dir + '/signals' }
    registerHooks({ resolve(s, c, next) {
      if (!s.endsWith('/datasets.js')) return next(s, c)
      return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export const pathOf=k=>(' + JSON.stringify(paths) + ')[k]') }
    } })
    const read = fs.readFileSync
    let saved = false
    fs.readFileSync = (path, ...args) => {
      const value = read(path, ...args)
      if (!saved && path === article) {
        assert.equal(spawnSync('flock', ['-n', paths.cycleLock, 'true']).status, 1)
        const editor = spawnSync(process.execPath, ['-e', "require('node:fs').appendFileSync(process.argv[1],process.argv[2])", article, ${JSON.stringify(note)}])
        assert.equal(editor.status, 0)
        fs.writeFileSync(dir + '/saved', '')
        saved = true
      }
      return value
    }
    syncBuiltinESMExports()
  `)
  const run = spawnSync(process.execPath, ['--import', preload, 'scripts/backfill-starters.js', '--all'], { encoding: 'utf8' })
  assert.ok(fs.existsSync(join(dir, 'saved')), run.stderr)
  assert.equal(readFileSync(article, 'utf8'), old + note)
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /karachi\.md.*revision changed/i)
})
