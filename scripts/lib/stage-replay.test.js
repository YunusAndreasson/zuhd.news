// Run: node --test scripts/lib/stage-replay.test.js
//
// Needs root and `unshare`, as the sandbox does; skipped where they are not.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './paths.js'
import { canReplay, replayStage } from './stage-replay.js'

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
