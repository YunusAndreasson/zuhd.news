// Run: node --test scripts/lib/stage-replay.test.js
//
// Needs root and `unshare`, as the sandbox does; skipped where they are not.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './paths.js'
import { OUTPUT, canReplay, outputProblem, outsideTheSeal, replayStage } from './stage-replay.js'

const skip = !canReplay() && 'needs root, unshare and an overlay mount'

/** Write `body` as a stage script somewhere the sandbox can see, run it, clean up. */
async function replay(body, rest = {}) {
  // Under the tree, not the OS temp dir: inside the sandbox /tmp is the scratch one.
  mkdirSync(join(ROOT, '.cache'), { recursive: true })
  const dir = mkdtempSync(join(ROOT, '.cache', 'stage-replay-test-'))
  try {
    const script = join(dir, 'probe.mjs')
    writeFileSync(script, body)
    return await replayStage({ script, now: '2026-10-08T18:05:10.000Z', ...rest })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// The probe made its four directories with `mktemp -d` and left them: one
// more `/tmp/tmp.XXXXXXXXXX` for every run of the tests.
test('asking whether the sandbox can be made leaves nothing behind', () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true })
  const tmp = mkdtempSync(join(ROOT, '.cache', 'stage-replay-test-'))
  const was = process.env.TMPDIR
  process.env.TMPDIR = tmp
  try {
    canReplay()
    assert.deepEqual(readdirSync(tmp), [], 'nothing where `mktemp` puts a directory')
  } finally {
    if (was === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = was
    rmSync(tmp, { recursive: true, force: true })
  }
  const left = readdirSync(join(ROOT, '.cache', 'stage-replay')).filter((name) => name.startsWith('probe-'))
  assert.deepEqual(left, [], 'and nothing of its own')
})

test('the clock is held, and both streams and the status come back', { skip }, async () => {
  const r = await replay(`
    console.log(new Date().toISOString(), Date.now() === Date.parse('2026-10-08T18:05:10.000Z'))
    console.log(new Date('2026-01-02T03:04:05Z').toISOString())
    console.error('to stderr')
    process.exit(3)
  `)
  assert.equal(r.status, 3)
  assert.equal(r.stdout, '2026-10-08T18:05:10.000Z true\n2026-01-02T03:04:05.000Z\n', 'now is fixed; a date built from a value is not')
  assert.equal(r.stderr, 'to stderr\n')
  assert.deepEqual(r.written, {})
})

test('what the stage writes comes back, and the real tree never sees it', { skip }, async () => {
  const about = readFileSync(join(ROOT, 'content', 'about.md'), 'utf-8')
  const r = await replay(
    `
    import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
    const input = JSON.parse(readFileSync('/tmp/zuhd-in.json', 'utf8'))
    writeFileSync('/tmp/zuhd-out.json', JSON.stringify({ doubled: input.n * 2 }))
    writeFileSync('content/.probe.json', '{"made":"here"}')
    appendFileSync('content/about.md', 'APPENDED')
    rmSync('content/privacy.md')
    rmSync('/tmp/zuhd-gone.txt')
  `,
    { tmp: { 'zuhd-in.json': '{"n":21}', 'zuhd-gone.txt': 'x' } },
  )
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(r.written, {
    '/tmp/zuhd-gone.txt': null,
    '/tmp/zuhd-out.json': '{"doubled":42}',
    'content/.probe.json': '{"made":"here"}',
    'content/about.md': `${about}APPENDED`,
    'content/privacy.md': null,
  })
  assert.ok(!existsSync(join(ROOT, 'content', '.probe.json')), 'the write stayed in the scratch layer')
  assert.equal(readFileSync(join(ROOT, 'content', 'about.md'), 'utf-8'), about)
  assert.ok(existsSync(join(ROOT, 'content', 'privacy.md')))
  assert.ok(!existsSync('/tmp/zuhd-out.json') || !readFileSync('/tmp/zuhd-out.json', 'utf-8').includes('doubled'), 'the real /tmp is another one')
})

test('the state a stage starts from can be set, and is not counted as its doing', { skip }, async () => {
  const r = await replay(
    `
    import { existsSync, readFileSync, writeFileSync } from 'node:fs'
    console.log(readFileSync('content/.story-ledger.json', 'utf8'), existsSync('content/about.md'))
    writeFileSync('content/.last-cycle.json', '{"changed":true}')
  `,
    { content: { '.story-ledger.json': '{"stories":[]}', '.last-cycle.json': '{"changed":false}', 'about.md': null } },
  )
  assert.equal(r.stdout, '{"stories":[]} false\n', 'the stage saw the ledger it was given, and no about.md')
  assert.deepEqual(r.written, { 'content/.last-cycle.json': '{"changed":true}' }, 'only what the stage itself changed')
})

test('there is no network to reach', { skip }, async () => {
  const r = await replay(`
    try { await fetch('https://zuhd.news/api/meta.json', { signal: AbortSignal.timeout(4000) }); console.log('reached') }
    catch (err) { console.log('no route') }
  `)
  assert.equal(r.stdout, 'no route\n')
})

// ── What is not sealed ───────────────────────────────────────────────

test('a stage that stays in /tmp and content/ names nothing outside the seal', () => {
  const stays = "import { pathOf } from './lib/datasets.js'\nwriteJson(pathOf('selection'), kept)\nwriteJson(pathOf('lastCycle'), kept)\nreadFileSync(join(pathOf('articles'), name))\n"
  assert.deepEqual(outsideTheSeal('scripts/dedup-selection.js', stays), [])
  assert.deepEqual(outsideTheSeal('scripts/x.js', "// writes dist/ and logs/\n * `.cache/og`, pathOf('cycleSeries')\nconsole.log('ok')\n"), [], 'a comment is not the code')
})

test('what a stage names that would stay real is said: a dataset elsewhere, a directory it spells, the build lock', () => {
  assert.deepEqual(outsideTheSeal('scripts/x.js', "const DIST_DIR = join(ROOT, 'dist')\nconst LOCK_FILE = join(ROOT, '.build.lock')\n"), ['dist/', '.build.lock'])
  assert.deepEqual(outsideTheSeal('scripts/x.js', "const cards = join(ROOT, '.cache', 'og')\n"), ['.cache/'])
  assert.deepEqual(outsideTheSeal('scripts/x.js', "const card = './.cache/og/card.png'\n"), ['.cache/'])
  assert.deepEqual(outsideTheSeal('scripts/x.js', "const SERIES = pathOf('cycleSeries')\nconst STAMPS = pathOf(\"apiStamps\")\n"), ["logs/cycles.jsonl (pathOf('cycleSeries'))", ".cache/api-stamps.json (pathOf('apiStamps'))"])
  assert.deepEqual(outsideTheSeal('scripts/cycle/run.js', "import { runCycle } from '../lib/cycle-run.js'\n"), ['the repository (the runner commits)'])
})

test('logs/ is sealed when the run is given a directory to stand in for it', () => {
  const reads = "const LOGS_DIR = pathOf('cycleLogs')\nconst picks = join(ROOT, 'logs', 'trends-picks.jsonl')\n"
  assert.deepEqual(outsideTheSeal('scripts/x.js', reads), ["logs (pathOf('cycleLogs'))", 'logs/'])
  assert.deepEqual(outsideTheSeal('scripts/x.js', reads, { logs: true }), [])
})

// As they stand: the build writes the live site and takes the cycle's own
// lock, and the record rewrites the one copy of every cycle older than a week.
test('the build and the cycle record are among them, and a stage that merges feeds is not', () => {
  const named = (script, given) => outsideTheSeal(script, readFileSync(join(ROOT, script), 'utf-8'), given)
  assert.ok(named('scripts/build.js').includes('dist/'))
  assert.ok(named('scripts/build.js').includes('.build.lock'))
  assert.ok(named('scripts/cycle/record.js').some((n) => n.startsWith('logs/cycles.jsonl')))
  assert.deepEqual(named('scripts/cycle/record.js', { logs: true }), [], 'with its logs stood in for, it may run')
  assert.deepEqual(named('scripts/merge-feeds.js'), [])
})

test('such a stage is not replayed in the repository itself', async () => {
  await assert.rejects(replay("writeFileSync('dist/index.html', 'replayed')"), /names dist\/, and the tree is the repository itself/)
  assert.ok(!existsSync(join(ROOT, 'dist', 'index.html')) || !readFileSync(join(ROOT, 'dist', 'index.html'), 'utf-8').includes('replayed'))
})

test('in a checkout it runs, and what it wrote outside the seal stays in the checkout', { skip }, async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true })
  const tree = mkdtempSync(join(ROOT, '.cache', 'stage-replay-test-'))
  try {
    mkdirSync(join(tree, 'content'))
    mkdirSync(join(tree, 'dist'))
    writeFileSync(join(tree, 'probe.mjs'), "import { writeFileSync } from 'node:fs'\nwriteFileSync('dist/index.html', 'replayed')\nwriteFileSync('content/.probe.json', '{}')\n")
    const r = await replayStage({ script: 'probe.mjs', now: '2026-10-08T18:05:10.000Z', tree })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(r.written, { 'content/.probe.json': '{}' }, 'reported: what is sealed')
    assert.equal(readFileSync(join(tree, 'dist', 'index.html'), 'utf-8'), 'replayed', 'written for real: what is not')
  } finally {
    rmSync(tree, { recursive: true, force: true })
  }
})

// ── Paths from the inputs ────────────────────────────────────────────

// `remove.txt` and the names under `<inputs>/content/` went into the shell's
// text between quotes, unchecked: `../scripts/build.js` was `rm -f` of the
// real file.
test('a path that leaves content/ or /tmp is refused before anything runs', async () => {
  await assert.rejects(replay('console.log(1)', { content: { '../scripts/build.js': null } }), /content path "\.\.\/scripts\/build\.js" does not stay under/)
  await assert.rejects(replay('console.log(1)', { content: { '../../etc/passwd': 'x' } }), /does not stay under/)
  await assert.rejects(replay('console.log(1)', { content: { '': 'x' } }), /does not stay under/, 'content/ itself is not a file in it')
  await assert.rejects(replay('console.log(1)', { tmp: { '../zuhd-selection.json': '[]' } }), /\/tmp file "\.\.\/zuhd-selection\.json" does not stay under/)
  assert.ok(existsSync(join(ROOT, 'scripts', 'build.js')))
})

test('a path is an argument to the sandbox, not part of its text', { skip }, async () => {
  const odd = "it's a $(touch /tmp/injected) `file`.txt"
  const r = await replay(
    `
    import { existsSync, readFileSync, readdirSync } from 'node:fs'
    console.log(readFileSync(${JSON.stringify(`content/${odd}`)}, 'utf8'), existsSync('content/about.md'), readdirSync('/tmp').join(','))
  `,
    { content: { [odd]: 'as given', 'about.md': null }, tmp: { "o'dd name.txt": 'x' } },
  )
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, "as given false o'dd name.txt\n", 'the file by its own name, the removal made, and nothing run from a name')
})

// ── Where a replay's output goes ─────────────────────────────────────

// `replay-stage.js` removes `--out` before it writes there, and removed it
// whatever it was.
test('an output directory is one that is not there, is empty, or holds an earlier replay and nothing else', () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true })
  const dir = mkdtempSync(join(ROOT, '.cache', 'stage-replay-test-'))
  try {
    assert.equal(outputProblem(join(dir, 'new')), null)
    assert.equal(outputProblem(dir), null, 'empty')

    for (const name of ['status', 'stdout', 'stderr']) writeFileSync(join(dir, name), '')
    mkdirSync(join(dir, 'written', 'content'), { recursive: true })
    assert.deepEqual(readdirSync(dir).sort(), [...OUTPUT].sort())
    assert.equal(outputProblem(dir), null, 'an earlier replay')

    writeFileSync(join(dir, 'notes.md'), 'mine')
    assert.match(String(outputProblem(dir)), /"notes\.md" no replay wrote/)
    assert.match(String(outputProblem(join(dir, 'status'))), /a file/)
    assert.match(String(outputProblem(join(dir, 'written'))), /"content" no replay wrote/, 'a part of one is not one')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the repository and its content are not output directories', () => {
  for (const real of [ROOT, join(ROOT, 'content'), join(ROOT, 'scripts'), '/tmp']) assert.match(String(outputProblem(real)), /no replay wrote/, real)
})
