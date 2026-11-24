import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Cycle } from './cycle-run.js'
import { validate } from './cycle-steps.js'
import { ROOT } from './paths.js'
import { parseFrontmatter, removeFrontmatterKey } from './frontmatter.js'
import { reviewAfterChartRemoval } from './starter-topics.js'
import { starterDecision } from './starter-eligibility.js'

const karachi = readFileSync(join(ROOT, 'content/articles/2026-11-22-karachi-gold-bar-shortage-investors-price-fall.md'), 'utf8')
const slug = `${new Date().toISOString().slice(0, 10)}-review-story`

function edition(t, text) {
  const root = mkdtempSync(join(tmpdir(), 'editorial-edition-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const articles = join(root, 'content/articles')
  mkdirSync(articles, { recursive: true })
  const file = join(articles, `${slug}.md`)
  writeFileSync(file, text)
  for (const name of ['scripts', 'public']) cpSync(join(ROOT, name), join(root, name), { recursive: true })
  for (const name of ['node_modules', 'templates', 'shared', 'package.json', 'package-lock.json', 'tsconfig.islands.json']) {
    symlinkSync(join(ROOT, name), join(root, name))
  }
  // Give this disposable cycle private batch and selection files.
  const datasets = join(root, 'scripts/lib/datasets.js')
  writeFileSync(datasets, readFileSync(datasets, 'utf8').replaceAll('/tmp/zuhd-', `${root}/scratch-`))
  writeFileSync(join(root, 'scratch-new-articles.txt'), file)
  writeFileSync(join(root, 'scratch-selection.json'), JSON.stringify([{ suggestedSlug: slug, eventCoverage: 47 }]))
  function run(...args) {
    return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8',
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, SKIP_OG: '1', ZUHD_EXTRA_ARTICLES: '', ZUHD_STAGE_RESULT: '' } })
  }
  function publish() {
    const result = run('scripts/publish-edition.js', '--preview')
    assert.equal(result.status, 0, result.stderr)
    return ['feed.json', 'feed-lite.json'].map(name => {
      const { categories } = JSON.parse(readFileSync(join(root, 'dist/api', name), 'utf8'))
      return Object.values(categories).flat().map(row => row.slug)
    })
  }
  return { root, file, run, publish }
}

test('a rejected Paris/Karachi report is quarantined with its writer open and excluded from both feeds', t => {
  const rejected = karachi.replace('location: "Karachi"', 'location: "Paris"')
  const { root, file, run, publish } = edition(t, rejected)
  const fd = openSync(file, 'a')
  try {
    const result = run('scripts/validate-articles.js')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /SKIP \(.*dateline/i)
    assert.equal(existsSync(file), false)
    assert.equal(readFileSync(`${file}.bad`, 'utf8'), rejected)
    // Repeat on a filesystem that consistently refuses hard links.
    const denied = join(root, 'deny-links.mjs')
    writeFileSync(denied, `
      import fs from 'node:fs'
      import { syncBuiltinESMExports } from 'node:module'
      fs.linkSync = () => { throw Object.assign(new Error('hard links unavailable'), { code: 'EPERM' }) }
      syncBuiltinESMExports()
    `)
    writeFileSync(file, rejected)
    const second = run('--import', denied, 'scripts/validate-articles.js')
    assert.equal(second.status, 0, second.stderr)
    assert.equal(existsSync(file), false)
    assert.equal(readFileSync(`${file}.bad`, 'utf8'), rejected)
    for (const feed of publish()) assert.ok(!feed.includes(slug))
  } finally {
    closeSync(fd)
  }
})

test('a failed quarantine cannot count an article or advance to publication', async t => {
  const { file, run } = edition(t, karachi.replace('location: "Karachi"', 'location: "Paris"'))
  mkdirSync(`${file}.bad`)
  const result = run('scripts/validate-articles.js')
  assert.notEqual(result.status, 0)
  assert.ok(existsSync(file))
  const output = result.stdout + result.stderr
  const cycle = Object.assign(new Cycle(), { state: { newCount: 1 }, funnel: {}, logOnly() {}, say() {},
    readBoth: async () => ({ status: result.status, raw: output, out: output }) })
  await assert.rejects(validate(cycle), { status: result.status })
  assert.equal(cycle.funnel.validated, undefined)
})

test('killing a scaffold write immediately after rename leaves both next editions buildable', t => {
  const { root, file, run, publish } = edition(t, karachi.replace(/^eventCoverage:.*\n/m, ''))
  const probe = join(root, 'interrupt.mjs')
  writeFileSync(probe, `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const rename = fs.renameSync
    fs.renameSync = (src, dst) => {
      rename(src, dst)
      if ([src, dst].includes(${JSON.stringify(file)})) process.kill(process.pid, 'SIGKILL')
    }
    syncBuiltinESMExports()
  `)
  const writer = run('--import', probe, 'scripts/scaffold-articles.js')
  assert.equal(writer.signal, 'SIGKILL', writer.stderr)
  // Neither preview can call a Python lock or recovery helper.
  mkdirSync(join(root, 'bin'))
  writeFileSync(join(root, 'bin/python3'), '#!/bin/sh\nexit 127\n', { mode: 0o755 })
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const feed of publish()) assert.ok(feed.includes(slug))
  }
  assert.match(readFileSync(file, 'utf8'), /^eventCoverage: 47$/m)
})

test('a validator crash with a diagnostic cannot certify the batch', async () => {
  const output = 'TypeError: Cannot read properties of undefined\n'
  const cycle = Object.assign(new Cycle(), { state: { newCount: 2 }, funnel: {}, logOnly() {}, say() {},
    readBoth: async () => ({ status: 1, raw: output, out: output }) })
  await assert.rejects(validate(cycle), { status: 1 })
  assert.equal(cycle.funnel.validated, undefined)
})

test('a validator that exits silently leaves the batch uncounted', async () => {
  const cycle = Object.assign(new Cycle(), { state: { newCount: 1 }, logOnly() {}, say() {},
    readBoth: async () => ({ status: 1, raw: '', out: '' }) })
  await assert.rejects(validate(cycle), { status: 1 })
  assert.equal(cycle.funnel.validated, undefined)
})

const unreviewed = karachi.replace(/^starterReview:.*\n/m, '')
const wrongCity = karachi.replace('location: "Karachi"', 'location: "Paris"')

function twoReports(t, first) {
  const fixture = edition(t, first)
  const rejected = join(fixture.root, 'content/articles', `${slug}-wrong-location.md`)
  writeFileSync(rejected, wrongCity)
  writeFileSync(join(fixture.root, 'scratch-new-articles.txt'), [fixture.file, rejected].join('\n'))
  writeFileSync(join(fixture.root, 'validate-cycle.mjs'), `
    import { Cycle } from './scripts/lib/cycle-run.js'
    import { validate } from './scripts/lib/cycle-steps.js'
    const cycle = new Cycle()
    const { readFileSync } = await import('node:fs')
    cycle.state.newCount = readFileSync('scratch-new-articles.txt', 'utf8').trim().split('\\n').length
    cycle.logOnly = text => process.stdout.write(text)
    await validate(cycle)
    console.log('accepted', cycle.funnel.validated)
  `)
  return { ...fixture, rejected }
}

for (const [description, first] of [
  ['explicit starter key', unreviewed.replace(/^starterEligible: true$/m, '? starterEligible\n: true')],
  ['YAML document end', unreviewed.replace(/^starterEligible: true\n/m, '').replace('\n---\n', '\n...\n---\n')],
]) {
  test(`${description} does not bypass quarantine of the next report`, t => {
    const { run, publish, rejected } = twoReports(t, first)
    const result = run('validate-cycle.mjs')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /validated 2 articles, 1 removed/i)
    assert.match(result.stdout, /accepted 1\b/)
    assert.equal(readFileSync(`${rejected}.bad`, 'utf8'), wrongCity)
    for (const feed of publish()) assert.deepEqual(feed, [slug])
  })
}

test('every starter computation can throw and the validated feeds still match the base validator and SSG', t => {
  const baseValidator = spawnSync('git', ['show', '118ff84c:scripts/validate-articles.js'], { cwd: ROOT, encoding: 'utf8' })
  // Shallow CI checkouts still exercise the complete outage and both feeds.
  const approved = reviewAfterChartRemoval(karachi, removeFrontmatterKey(karachi, 'chart'))
  assert.equal(starterDecision(parseFrontmatter(approved)).eligible, true)
  const { root, file, rejected, run } = twoReports(t, approved)
  const later = join(root, 'content/articles', `${slug}-later.md`)
  const last = karachi.replace('Karachi — ', '').replace('Karachi Gold Bars Run Short', 'Karachi Prices Rise')
    .replace('https://www.dawn.com/news/2046185', 'https://example.org/another-report')
  writeFileSync(later, last)
  writeFileSync(join(root, 'scratch-new-articles.txt'), [file, rejected, later].join('\n'))
  function readFeeds() {
    return ['feed.json', 'feed-lite.json'].map(name => {
      const feed = JSON.parse(readFileSync(join(root, 'dist/api', name), 'utf8'))
      delete feed.generated
      for (const row of Object.values(feed.categories).flat()) {
        assert.notEqual(row.starterEligible, true)
        assert.equal(row.starterEvidence, undefined)
        delete row.starterEligible
      }
      return feed
    })
  }
  // Both runs use the same publication time for this freshly created edition.
  const stamp = new Date()
  function build(entry) {
    for (const path of [file, later]) utimesSync(path, stamp, stamp)
    const result = run(entry)
    assert.equal(result.status, 0, result.stderr)
    return readFeeds()
  }
  let expected
  if (baseValidator.status === 0) {
    writeFileSync(join(root, 'scripts/validate-base.js'), baseValidator.stdout)
    const base = run('scripts/validate-base.js')
    assert.equal(base.status, 0, base.stderr)
    assert.match(base.stdout, /Validated 3 articles, 1 removed/)
    expected = build('scripts/build.js')
    assert.equal(readFileSync(`${rejected}.bad`, 'utf8'), wrongCity)
    rmSync(`${rejected}.bad`)
    writeFileSync(rejected, wrongCity)
    writeFileSync(file, approved)
    writeFileSync(later, last)
  }
  // Inject the fault only in the validator. The independently running publisher
  // must respect the withdrawal even if its classifier works again.
  const module = join(root, 'scripts/lib/starter-eligibility.js')
  const original = readFileSync(module, 'utf8')
  writeFileSync(module, original.replace(/export function classifyRevision\([^\n]+\{\n/, "$&  throw new Error('injected starter outage')\n"))
  const checked = run('validate-cycle.mjs')
  assert.equal(checked.status, 0, checked.stderr)
  assert.match(checked.stdout, /accepted 2\b/)
  assert.equal(checked.stdout.match(/injected starter outage/g)?.length, 2)
  assert.equal(readFileSync(`${rejected}.bad`, 'utf8'), wrongCity)
  writeFileSync(module, original)
  const feeds = build('scripts/publish-edition.js')
  for (const feed of feeds) assert.deepEqual(feed.categories.economy.map(row => row.slug).sort(), [slug, `${slug}-later`])
  if (expected) assert.deepEqual(feeds, expected)
})

test('a successful child without a validation tally cannot advance to build', async () => {
  const cycle = Object.assign(new Cycle(), { logOnly() {}, say() {},
    readBoth: async () => ({ status: 0, raw: 'incomplete', out: 'incomplete' }) })
  await assert.rejects(validate(cycle), { status: 1 })
})

test('missing paths do not count as checked articles', t => {
  const { root, file, rejected, run } = twoReports(t, karachi)
  rmSync(rejected)
  writeFileSync(join(root, 'scratch-new-articles.txt'), [file, `${file}.missing`].join('\n'))
  const result = run('validate-cycle.mjs')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Validated 1 articles, 0 removed/)
  assert.match(result.stdout, /accepted 1\b/)
})

for (const fault of ['reviewInput', 'reviewPrompt', 'stampReview']) {
  test(`the source desk keeps both articles' angles when ${fault} fails`, t => {
    const { root, file, rejected, run } = twoReports(t, karachi)
    writeFileSync(rejected, karachi)
    writeFileSync(join(root, 'scratch-selection.json'), JSON.stringify([{ sources: [{
      url: 'https://www.dawn.com/news/2046185', body: 'The reported figures were verified. '.repeat(30),
    }] }]))
    const mock = join(root, 'desk-fault.mjs')
    writeFileSync(mock, `
      import { registerHooks } from 'node:module'
      registerHooks({ load(url, context, next) {
        if (url.endsWith('/claude-envelope.js')) return {format:'module', shortCircuit:true, source:
          'export const callCost=()=>""; export const callClaudeJson=async()=>({elapsedMs:0,out:{1:{angle:"verified first"},2:{angle:"verified second"}}})' }
        const result = next(url, context)
        if (url.endsWith('/starter-topics.js')) result.source = String(result.source)
          .replace(/export function ${fault}\\([^\\n]+\\{\\n/, "$&  throw Error('injected desk outage')\\n")
        return result
      } })
    `)
    const result = run('--import', mock, 'scripts/extract-source-angles.js')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stderr, /injected desk outage/)
    for (const [path, angle] of [[file, 'verified first'], [rejected, 'verified second']]) {
      const { meta } = parseFrontmatter(readFileSync(path, 'utf8'))
      assert.equal(meta.sources[0].angle, angle)
      assert.ok(!meta.starterReview)
    }
  })
}

test('starter catalogue initialization cannot preempt the base validator', t => {
  const { root, run, rejected } = twoReports(t, karachi)
  const module = join(root, 'scripts/lib/starter-articles.js')
  writeFileSync(module, readFileSync(module, 'utf8').replace('export function starterCatalogue() {',
    "export function starterCatalogue() { throw new Error('catalogue setup failed')"))
  const result = run('validate-cycle.mjs')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /catalogue setup failed/)
  assert.match(result.stdout, /accepted 1\b/)
  assert.equal(readFileSync(`${rejected}.bad`, 'utf8'), wrongCity)
})

test('a saved correction survives the metadata pass and requires fresh base validation', t => {
  const { root, file, rejected, run } = twoReports(t, karachi)
  const preload = join(root, 'correction.mjs')
  writeFileSync(preload, `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const read = fs.readFileSync
    let reads = 0
    fs.readFileSync = (path, ...args) => {
      if (path === ${JSON.stringify(file)} && ++reads === 2) fs.appendFileSync(path, '\\nSaved editorial correction.\\n')
      return read(path, ...args)
    }
    syncBuiltinESMExports()
  `)
  const result = run('--import', preload, 'scripts/validate-articles.js')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Article changed after validation/)
  assert.match(readFileSync(file, 'utf8'), /Saved editorial correction\.\n$/)
  assert.equal(readFileSync(`${rejected}.bad`, 'utf8'), wrongCity)
})
