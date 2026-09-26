import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runWithConcurrency } from './concurrency.js'
import { spawnClaude } from './claude-envelope.js'

// `command: 'node'` stands in for the CLI: the helper's job is the spawn, not
// the flags, and a real `claude` call would cost money on every test run.
const sleeper = (ms, out) => ['-e', `setTimeout(() => process.stdout.write(${JSON.stringify(out)}), ${ms})`]

test('spawnClaude returns spawnSync-shaped output', async () => {
  const r = await spawnClaude(sleeper(0, '{"ok":1}'), { command: 'node' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '{"ok":1}')
  assert.equal(r.error, undefined)
})

test('three calls in a pool of three overlap — the bug was that they did not', async () => {
  const t0 = Date.now()
  await runWithConcurrency([1, 2, 3], 3, () => spawnClaude(sleeper(600, 'x'), { command: 'node' }))
  const elapsed = Date.now() - t0
  // Serial would be ≥1800ms; overlapping is one sleep plus spawn overhead.
  assert.ok(elapsed < 1500, `expected overlap, took ${elapsed}ms`)
})

test('timeout kills the child and reports ETIMEDOUT with a null status', async () => {
  const r = await spawnClaude(sleeper(5000, 'late'), { command: 'node', timeout: 200 })
  assert.equal(r.status, null)
  assert.equal(r.error?.code, 'ETIMEDOUT')
})

test('drops CLAUDECODE from the child env', async () => {
  const r = await spawnClaude(['-e', 'process.stdout.write(String(process.env.CLAUDECODE))'], {
    command: 'node',
    env: { ...process.env, CLAUDECODE: '1' },
  })
  assert.equal(r.stdout, 'undefined')
})
