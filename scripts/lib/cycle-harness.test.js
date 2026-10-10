// Run: node --test scripts/lib/cycle-harness.test.js
//
// The recordings themselves are checked by `npm run test:cycle`
// (`scripts/cycle/golden.test.js`), which takes a minute and needs root. This
// is the part that runs everywhere: it notices when the script has moved on
// from its recordings, and pins how a run is written down.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { RECORDED, renderCycle } from './cycle-harness.js'
import { FULL, SCENARIOS } from './cycle-scenarios.js'
import { ROOT } from './paths.js'

const DIR = join(ROOT, 'scripts', 'lib', 'fixtures', 'cycle')

// A recording describes one exact orchestrator: the wrapper, the runner, the
// two prompts sent whole, and the shell script kept beside them. Any edit to
// one of them fails here until the scenarios have been run again, so an
// orchestrator change cannot land with its record still describing the one
// before.
test('the recordings were made from the orchestrator as it now stands', () => {
  const recorded = readFileSync(join(DIR, 'RECORDED_FROM'), 'utf-8')
  const now = RECORDED.map((f) => `${createHash('sha1').update(readFileSync(join(ROOT, f))).digest('hex')}  ${f}\n`).join('')
  assert.equal(now, recorded, 'one of these has changed: run `npm run test:cycle`, and `UPDATE_GOLDENS=1 npm run test:cycle` once the difference is the one you meant')
})

// A prompt the cycle cannot read is sent as an empty one, as `$(cat …)` of a
// file that is not there was: the model is handed whatever follows it.
test('every prompt the cycle reads is a file that is there', () => {
  const steps = readFileSync(join(ROOT, 'scripts', 'lib', 'cycle-steps.js'), 'utf-8')
  const read = [...steps.matchAll(/prompt\('([a-z-]+\.md)'\)/g)].map((m) => `scripts/${m[1]}`)
  assert.deepEqual(read.toSorted(), [
    'scripts/briefing-push-prompt.md',
    'scripts/check-prompt.md',
    'scripts/push-prompt.md',
    'scripts/select-prompt.md',
    'scripts/tune-prompt.md',
    'scripts/write-prompt.md',
  ])
  for (const f of read) assert.ok(readFileSync(join(ROOT, f), 'utf-8').trim().length > 200, `${f} is all but empty`)
})

// Each ends on the line that names what the script puts after it.
test('the two prompts sent whole end where what follows them begins', () => {
  assert.ok(readFileSync(join(ROOT, 'scripts', 'push-prompt.md'), 'utf-8').endsWith('\nOutput ONLY the line, nothing else.\n\nArticle:\n'))
  assert.ok(readFileSync(join(ROOT, 'scripts', 'briefing-push-prompt.md'), 'utf-8').endsWith("\nOutput ONLY the line, nothing else.\n\nTop stories from today's briefing:\n"))
})

// The wrapper's way back is the same cycle by another road: with the flag
// file in the repository it runs the shell script, and the recording of that
// is the regular cycle's, to the byte.
test('a cycle handed back to the shell script is the regular cycle', () => {
  assert.equal(readFileSync(join(DIR, 'handed-back-by-flag.txt'), 'utf-8'), readFileSync(join(DIR, 'regular.txt'), 'utf-8'))
})

test('every scenario has a recording, and every recording a scenario', () => {
  const recorded = readdirSync(DIR).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, '')).sort()
  assert.deepEqual(recorded, Object.keys(SCENARIOS).sort())
  for (const name of FULL) assert.ok(name in SCENARIOS, `${name} is to be recorded in full and is not a scenario`)
})

test('a scenario names each of its rules once', () => {
  for (const [name, s] of Object.entries(SCENARIOS)) {
    const ids = s.rules.map((r) => r.id)
    assert.equal(new Set(ids).size, ids.length, `${name}: a rule id is used twice`)
  }
})

/** @type {import('./cycle-harness.js').CycleRun} */
const RUN = {
  status: 0,
  out: 'Selector exit: 0 — 188s\n«selector»\n',
  log: 'Selector exit: 0 — 188s\nFinished: Thu Oct  8 06:25:22 PM UTC 2026 — total 1261s\n',
  kept: ['logs/runs/2026-10-08_1804/selection.1-selected.json'],
  trace: [
    { id: 'selector', cmd: 'claude', argv: ['--tools', '', '-p', 'one\ntwo'], cwd: '<repo>', env: { ZUHD_MODEL: 'm' } },
    { id: 'push-slug', cmd: 'node', argv: ['-e', 'const d = 1;\nconsole.log(d)'], cwd: '<repo>', stdin: '{"a":1}\n', env: { ZUHD_MODEL: 'm', NOTIF: 'x' } },
    { id: 'git:push', cmd: 'git', argv: ['push', 'origin', 'master'], cwd: '<repo>', env: { ZUHD_MODEL: 'm' } },
  ],
}

test('a run is written as its commands, what changed around each, and what they were handed', () => {
  assert.equal(
    renderCycle(RUN),
    [
      'exit: 0',
      '',
      'commands',
      "  claude --tools '' -p «text 1»",
      '      + ZUHD_MODEL=m',
      `  node -e «push-slug» sha1:${createHash('sha1').update('const d = 1;\nconsole.log(d)').digest('hex').slice(0, 8)}`,
      '      + NOTIF=x',
      '      < {"a":1}',
      '  git push origin master',
      '      - NOTIF',
      '',
      '«text 1»',
      '  | one',
      '  | two',
      '',
      'kept',
      '  logs/runs/2026-10-08_1804/selection.1-selected.json',
      '',
      'log',
      '  | Selector exit: 0 — Ns',
      '  | Finished: Thu Oct  8 06:25:22 PM UTC 2026 — total Ns',
      '',
      'journal',
      '  | Selector exit: 0 — Ns',
      '  | «selector»',
      '',
    ].join('\n'),
  )
})

test('a failure path is written without the prompts and the journal the healthy cycles already carry', () => {
  const text = renderCycle(RUN, { full: false })
  assert.match(text, /-p «text sha1:[0-9a-f]{8}»/)
  assert.ok(!text.includes('journal'))
  assert.ok(!text.includes('  | one'))
  assert.ok(text.includes('log\n  | Selector exit: 0 — Ns'))
})
