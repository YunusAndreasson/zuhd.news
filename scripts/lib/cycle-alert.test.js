// Run: node --test scripts/lib/cycle-alert.test.js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { alertLine, nextAlert } from './cycle-alert.js'
import { ROOT } from './paths.js'

const NOW = Date.parse('2026-10-08T18:20:00Z')
const ended = { reason: 'no articles published', log: '/logs/cycle-2026-10-08_1804.log', now: NOW }

test('the first cycle to end without a publish starts the count', () => {
  const alert = nextAlert({}, ended)
  assert.deepEqual(alert, { at: '2026-10-08T18:20:00.000Z', reason: 'no articles published', log: '/logs/cycle-2026-10-08_1804.log', consecutive: 1, since: '2026-10-08T18:20:00.000Z' })
  assert.equal(alertLine(alert), 'ALERT: no articles published (1 cycle(s) in a row since 2026-10-08T18:20:00.000Z)')
})

test('the next one adds to it and keeps when it began', () => {
  const alert = nextAlert({ at: '2026-10-08T14:20:00.000Z', reason: 'something else', consecutive: 2, since: '2026-10-08T10:20:00.000Z' }, ended)
  assert.deepEqual([alert.consecutive, alert.since, alert.reason], [3, '2026-10-08T10:20:00.000Z', 'no articles published'])
  assert.deepEqual([nextAlert({ consecutive: 4 }, ended).since, nextAlert({ since: '2026-10-01T00:00:00.000Z' }, ended).consecutive], ['2026-10-08T18:20:00.000Z', 1])
})

// Started for real, against a file of its own: the harness's `node` is a
// stand-in, and this runs in the exit trap, where a script that cannot load
// would cost the one line that says a cycle published nothing.
test('the entry script writes the record it was pointed at and prints the line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zuhd-alert-test-'))
  const file = join(dir, 'alert.json')
  try {
    const run = () => spawnSync(process.execPath, [join(ROOT, 'scripts/cycle/alert.js')], { encoding: 'utf8', env: { ...process.env, CYCLE_ALERT: file, ALERT_REASON: 'cycle exited 1 before publishing', ALERT_LOG: '/logs/x.log' } })
    const first = run()
    assert.equal(first.status, 0, first.stderr)
    const written = JSON.parse(readFileSync(file, 'utf8'))
    assert.deepEqual([written.reason, written.log, written.consecutive, written.since], ['cycle exited 1 before publishing', '/logs/x.log', 1, written.at])
    assert.equal(first.stdout, `ALERT: cycle exited 1 before publishing (1 cycle(s) in a row since ${written.since})\n`)
    assert.match(run().stdout, new RegExp(`\\(2 cycle\\(s\\) in a row since ${written.since.replace(/\./g, '\\.')}\\)\n$`))
    writeFileSync(file, 'not json')
    assert.match(run().stdout, /\(1 cycle\(s\) in a row since /, 'a record that cannot be read starts over')
    assert.ok(readFileSync(file, 'utf8').endsWith('}\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
