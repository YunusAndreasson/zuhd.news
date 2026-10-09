import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runWithConcurrency } from './concurrency.js'
import { ISOLATION_FLAGS, claudeArgs, claudeFailure, parseClaudeText, spawnClaude } from './claude-envelope.js'

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

// The flags whose loss costs money without failing: a copy that dropped any of
// these still ran. Pinned so the builder cannot quietly lose one either.
test('claudeArgs defaults to the micro-task shape', () => {
  const a = claudeArgs('hi', { model: 'm' })
  const flag = (f) => a[a.indexOf(f) + 1]
  assert.equal(flag('--model'), 'm')
  assert.equal(flag('--effort'), 'medium')
  assert.equal(flag('--tools'), '')
  assert.equal(flag('--max-turns'), '1')
  assert.equal(flag('--output-format'), 'json')
  assert.ok(a.includes('--no-session-persistence'))
  assert.ok(a.includes('--exclude-dynamic-system-prompt-sections'))
  assert.deepEqual(a.slice(-2), ['-p', 'hi'])
})

// Without these a call loads the account's settings, skills and MCP servers:
// measured on this box, 105 tools and 135,093 input tokens for a one-word
// prompt, against none and 12,269. No option switches them off.
test('claudeArgs always isolates the call, whatever the caller asks for', () => {
  assert.deepEqual([...ISOLATION_FLAGS], ['--setting-sources', 'project', '--disable-slash-commands', '--strict-mcp-config'])
  for (const opts of [{ model: 'm' }, { model: 'm', effort: null, tools: null, json: false, maxTurns: 3 }, { model: 'm', allowedTools: 'Read,Write' }]) {
    const a = claudeArgs('hi', opts)
    assert.equal(a[a.indexOf('--setting-sources') + 1], 'project')
    assert.ok(a.includes('--disable-slash-commands'))
    assert.ok(a.includes('--strict-mcp-config'))
    assert.ok(a.indexOf('--strict-mcp-config') < a.indexOf('-p'), 'before the prompt')
  }
})

test('claudeArgs omits what the caller switches off', () => {
  const a = claudeArgs('hi', { model: 'm', effort: null, tools: null, json: false, maxTurns: 3 })
  assert.ok(!a.includes('--effort'))
  assert.ok(!a.includes('--tools'))
  assert.ok(!a.includes('--output-format'))
  assert.equal(a[a.indexOf('--max-turns') + 1], '3')
})

test('claudeArgs: allowedTools replaces the empty tool list', () => {
  const a = claudeArgs('hi', { model: 'm', allowedTools: 'Read,Write' })
  assert.equal(a[a.indexOf('--allowedTools') + 1], 'Read,Write')
  assert.ok(!a.includes('--tools'))
})

test('claudeFailure reads stdout when stderr is empty, and names a timeout', () => {
  assert.equal(claudeFailure({ status: 1, stdout: 'auth expired', stderr: '' }), 'claude exit 1: auth expired')
  assert.equal(claudeFailure({ status: 2, stdout: '', stderr: '' }), 'claude exit 2: (no output)')
  const timedOut = { status: null, error: Object.assign(new Error('x'), { code: 'ETIMEDOUT' }) }
  assert.equal(claudeFailure(timedOut, 120_000), 'claude timed out after 120s')
})

test('parseClaudeText unwraps a prose result and rejects anything else', () => {
  const env = parseClaudeText(JSON.stringify({ type: 'result', result: 'Good morning.', total_cost_usd: 0.5 }))
  assert.equal(env.text, 'Good morning.')
  assert.equal(env.total_cost_usd, 0.5)
  assert.throws(() => parseClaudeText(JSON.stringify({ type: 'error' })))
})
