import { spawn, spawnSync } from 'node:child_process'
import { modelFor } from './models.js'

// Parse the `claude --output-format json` envelope.
//
// The CLI returns `{type:"result", result:"<stringified payload>", usage,
// total_cost_usd, duration_ms, ...}`. The `usage` object carries cache token
// counts (cache_creation_input_tokens, cache_read_input_tokens) which let us
// see whether prompt caching is actually firing. The two helpers below split
// that interest:
//
//   parseClaudeEnvelope           — legacy: returns just the inner payload
//   parseClaudeEnvelopeWithUsage  — returns { result, usage, total_cost_usd,
//                                  duration_ms } so callers can log cache
//                                  observability without re-parsing.
//
// Occasionally the inner `result` is raw text with JSON embedded somewhere;
// we substring between the outer braces as a fallback, and as a last resort
// read a number written with a leading plus. When the CLI runs
// without `--output-format json` (older versions, or direct JSON output) the
// stdout is the payload itself — usage will be undefined in that case.
//
// Throws on unrecoverable failure.

export function parseClaudeEnvelopeWithUsage(stdout) {
  const raw = (stdout || '').trim()
  if (!raw) throw new Error('empty claude stdout')

  const outer = JSON.parse(raw)

  if (outer?.type !== 'result') {
    return { result: outer }
  }

  if (outer.result == null) {
    throw new Error('claude returned no text result (tool use may have exhausted max-turns)')
  }

  const text = String(outer.result)
  let result
  try {
    result = JSON.parse(text)
  } catch {
    const s = text.indexOf('{')
    const e = text.lastIndexOf('}')
    if (s === -1 || e === -1) throw new Error('no JSON object found in claude result text')
    const object = text.slice(s, e + 1)
    try {
      result = JSON.parse(object)
    } catch (err) {
      // A number written with its sign, `"sentiment": +0.15`, which JSON does
      // not allow. A prompt that says "+1 = sharply favorable" is answered
      // that way now and then, and one such token cost the 18:01 cycle of
      // 2026-10-05 all 27 of its source angles, across 15 articles. Only an
      // answer that has already failed to parse gets here, so a sound one is
      // never rewritten; in one that has, a `: +1` inside a string loses its
      // plus too, which is the price.
      const unsigned = object.replace(/(:\s*)\+(?=\d)/g, '$1')
      if (unsigned === object) throw err
      try {
        result = JSON.parse(unsigned)
      } catch {
        throw err
      }
    }
  }

  return {
    result,
    usage: outer.usage,
    total_cost_usd: outer.total_cost_usd,
    duration_ms: outer.duration_ms,
  }
}

export function parseClaudeEnvelope(stdout) {
  return parseClaudeEnvelopeWithUsage(stdout).result
}

const HAIKU_MODEL = modelFor('haiku')

/**
 * What keeps a headless call to what it was handed: the project's settings and
 * not `~/.claude/settings.json`, no skills, and no MCP server.
 *
 * A call without them inherits whatever the account on this machine has. On
 * 2026-10-09 that was 105 MCP tools (Gmail, Notion, Docs among them, from the
 * claude.ai connectors), 33 skills and `permissionMode: auto`: 135,093 input
 * tokens for a one-word prompt against 12,269 with these, on every call since
 * the connectors began loading in headless runs on 2026-10-02. `--tools ''`
 * does not cover it. It removes the built-in tools only, and a requested MCP
 * call ran to completion before `--max-turns 1` ended the turn. Several of
 * these calls read fetched pages and feed text.
 *
 * The cycle's sessions have passed these since they were written
 * (`CLAUDE_FLAGS`, `lib/cycle-steps.js`); the micro-tasks had not.
 */
export const ISOLATION_FLAGS = Object.freeze(['--setting-sources', 'project', '--disable-slash-commands', '--strict-mcp-config'])

/**
 * The argv for one non-interactive `claude -p` call.
 *
 * Fifteen call sites spelled this out by hand — the narrators, the posters,
 * the briefing, the edu brief, the autoresearch harness — and they had drifted
 * in exactly the ways that cost money without failing: some lost `--tools ''`
 * (~17k input tokens of tool definitions a call), some lost
 * `--exclude-dynamic-system-prompt-sections` (the per-run sections that keep
 * the system prompt from caching). The defaults are the micro-task shape:
 *
 * - `--no-session-persistence` and `--max-turns 1` are what make a call a
 *   micro-task rather than a session; a copy that lost either would still
 *   work, cost more, and leave state behind. Always on.
 * - `tools: ''` keeps tool definitions out of the request. Pass `null` to let
 *   the CLI load its defaults (a multi-turn call that may use them), or
 *   `allowedTools` to name the ones it may use.
 * - `effort: null` omits the flag, for a model that does not take one (Haiku
 *   4.5 and older).
 * - `json: false` returns the model's text on stdout instead of the envelope.
 * - `ISOLATION_FLAGS` are always on. Without them a call is not the call that
 *   was written.
 *
 * @param {string} prompt
 * @param {{ model: string, effort?: string | null, maxTurns?: number, tools?: string | null,
 *   allowedTools?: string, json?: boolean, excludeDynamic?: boolean }} opts
 * @returns {string[]}
 */
export function claudeArgs(
  prompt,
  { model, effort = 'medium', maxTurns = 1, tools = '', allowedTools, json = true, excludeDynamic = true },
) {
  const args = ['--model', model]
  if (effort) args.push('--effort', effort)
  args.push('--no-session-persistence', ...ISOLATION_FLAGS)
  if (allowedTools) args.push('--allowedTools', allowedTools)
  else if (tools != null) args.push('--tools', tools)
  args.push('--max-turns', String(maxTurns))
  if (json) args.push('--output-format', 'json')
  if (excludeDynamic) args.push('--exclude-dynamic-system-prompt-sections')
  args.push('-p', prompt)
  return args
}

/** `env` without `CLAUDECODE`, so a child never inherits the parent session marker. */
const childEnv = (env) => {
  const out = { ...env }
  delete out.CLAUDECODE
  return out
}

/**
 * Synchronous `claude` call — for a script that makes one call and has nothing
 * to overlap it with. **Never inside a `runWithConcurrency` worker**: use
 * `spawnClaude`, or the pool runs one at a time.
 *
 * Returns the raw `spawnSync` result; `claudeFailure` renders a non-zero one.
 *
 * @param {string[]} args
 * @param {{ timeout?: number, maxBuffer?: number, cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function runClaudeSync(args, { timeout = 120_000, maxBuffer = 1024 * 1024, cwd, env = process.env } = {}) {
  return spawnSync('claude', args, { encoding: 'utf-8', timeout, maxBuffer, cwd, env: childEnv(env) })
}

/**
 * One batched Haiku call with JSON output. Returns the raw `spawnSync` result
 * — the callers each log their own stage name on a non-zero exit, and
 * swallowing that here would cost the one line that says which one failed.
 */
export function runHaiku(prompt, { timeout, maxBuffer }) {
  return runClaudeSync(claudeArgs(prompt, { model: HAIKU_MODEL }), { timeout, maxBuffer })
}

/**
 * The one-line reason a `claude` child did not exit 0.
 *
 * Both streams: a non-zero exit often reports on stdout and leaves stderr
 * empty, which read as "exit 1: " and said nothing at all — three callers had
 * learnt that separately and the rest still printed the empty line.
 *
 * @param {{ status: number | null, stdout?: string, stderr?: string, error?: Error & { code?: string } }} res
 * @param {number} [timeoutMs] named in the message when the child was killed for it
 */
export function claudeFailure(res, timeoutMs) {
  if (res.error?.code === 'ETIMEDOUT') {
    return timeoutMs ? `claude timed out after ${Math.round(timeoutMs / 1000)}s` : 'claude timed out'
  }
  const why = String(res.stderr || '').trim() || String(res.stdout || '').trim() || res.error?.message || '(no output)'
  return `claude exit ${res.status}: ${why.slice(0, 300)}`
}

/**
 * Unwrap a `--output-format json` envelope whose `result` is prose rather
 * than JSON (the briefing script). Throws on anything that is not a result.
 *
 * @param {string} stdout
 * @returns {{ text: string, usage?: Record<string, number>, total_cost_usd?: number, duration_ms?: number }}
 */
export function parseClaudeText(stdout) {
  const outer = JSON.parse(String(stdout || '').trim())
  if (outer?.type !== 'result' || outer.result == null) {
    throw new Error(`unexpected claude envelope: ${String(stdout).slice(0, 200)}`)
  }
  return {
    text: String(outer.result),
    usage: outer.usage,
    total_cost_usd: outer.total_cost_usd,
    duration_ms: outer.duration_ms,
  }
}

/**
 * One async JSON call: the narrators' shape, run inside a pool.
 *
 * Four copies — the indicator dispatch, the events dispatch, the GDACS
 * narrator and the Swedish translation — each timed the call, rendered the
 * failure, unwrapped the envelope and checked for an object, and each had a
 * slightly different idea of what a failure said. Never throws: the result
 * carries `error` instead, because every caller logs and moves to the next
 * item.
 *
 * @param {string} prompt
 * @param {{ model: string, effort?: string, timeout?: number, maxBuffer?: number }} opts
 * @returns {Promise<{ elapsedMs: number, out?: Record<string, any>, costUsd?: number,
 *   usage?: Record<string, number>, error?: string }>}
 */
export async function callClaudeJson(prompt, { model, effort = 'medium', timeout = 120_000, maxBuffer = 1024 * 1024 }) {
  const t0 = Date.now()
  const res = await spawnClaude(claudeArgs(prompt, { model, effort }), { timeout, maxBuffer })
  const elapsedMs = Date.now() - t0
  if (res.status !== 0) return { elapsedMs, error: claudeFailure(res, timeout) }
  try {
    const envelope = parseClaudeEnvelopeWithUsage(res.stdout)
    const out = envelope.result
    if (!out || typeof out !== 'object') return { elapsedMs, error: 'no object in result' }
    return { elapsedMs, out, costUsd: envelope.total_cost_usd, usage: envelope.usage }
  } catch (err) {
    return { elapsedMs, error: `parse: ${err.message}` }
  }
}

/**
 * A model's sentence as it should be stored: one line, trimmed, and without
 * the quotation marks a model sometimes wraps prose in. Anything that is not
 * a string is `''`, so a missing field reads as empty rather than throwing.
 * Three narrators carried this regex.
 *
 * @param {unknown} s
 */
export const cleanProse = (s) =>
  typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '') : ''

/**
 * `Claude usage: $0.1234 in 5678ms (cache read N, create M)` — the line that
 * says whether prompt caching is firing.
 *
 * @param {{ usage?: Record<string, number>, total_cost_usd?: number, duration_ms?: number }} envelope
 */
export function formatUsage(envelope) {
  const read = envelope.usage?.cache_read_input_tokens ?? 0
  const create = envelope.usage?.cache_creation_input_tokens ?? 0
  return `$${(envelope.total_cost_usd ?? 0).toFixed(4)} in ${envelope.duration_ms ?? '?'}ms (cache read ${read}, create ${create})`
}

/**
 * `spawnSync`'s result shape — `{ status, stdout, stderr, error }` — from an
 * asynchronous `claude` child.
 *
 * Every narrator ran its calls through `runWithConcurrency(items, 3, …)` and
 * made them with `spawnSync`, which blocks the event loop for the whole call.
 * The pool therefore ran one call at a time while its comment said three, and
 * the 04:00 indicator dispatch — ~120 serial Opus calls at ~12s — hit its
 * 1500s timeout every day and lost everything. A pool only overlaps what
 * yields, so a caller inside one must use this.
 *
 * `timeout` kills the child (SIGTERM) and resolves with `status: null` and
 * `error.code === 'ETIMEDOUT'`, as `spawnSync` reports it. Output past
 * `maxBuffer` kills the child too (`ENOBUFS`). `CLAUDECODE` is always dropped
 * — the child must not inherit the parent session marker.
 *
 * @param {string[]} args
 * @param {{ timeout?: number, maxBuffer?: number, env?: NodeJS.ProcessEnv, command?: string }} [opts]
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string, error?: Error & { code?: string } }>}
 */
export function spawnClaude(args, { timeout = 120_000, maxBuffer = 1024 * 1024, env = process.env, command = 'claude' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: childEnv(env), stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    /** @type {(Error & { code?: string }) | undefined} */
    let error
    let settled = false
    const finish = (status) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ status, stdout, stderr, ...(error ? { error } : {}) })
    }
    const kill = (code) => {
      if (error) return
      error = Object.assign(new Error(`claude ${code}`), { code })
      child.kill('SIGTERM')
    }
    const timer = setTimeout(() => kill('ETIMEDOUT'), timeout)
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (d) => {
      stdout += d
      if (stdout.length > maxBuffer) kill('ENOBUFS')
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    child.on('error', (err) => {
      error = err
      finish(null)
    })
    child.on('close', (code) => finish(error ? null : code))
  })
}
