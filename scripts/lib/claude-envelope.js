import { spawn, spawnSync } from 'node:child_process'

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
// we substring between the outer braces as a fallback. When the CLI runs
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
    result = JSON.parse(text.slice(s, e + 1))
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

/**
 * One batched Haiku call: `claude -p <prompt> --output-format json`.
 *
 * Three call sites spelled this out — `extract-entities.js` twice and
 * `extract-source-angles.js` once — with an identical five-flag argv and an
 * identical `delete env.CLAUDECODE`, differing only in the timeout and buffer.
 * The flags are the part worth having once: `--no-session-persistence` and
 * `--max-turns 1` are what make these micro-tasks rather than sessions, and a
 * copy that lost either would still work, cost more, and leave state behind.
 *
 * `CLAUDECODE` is dropped so the subprocess does not inherit the parent
 * session's marker.
 *
 * Returns the raw `spawnSync` result — the callers each log their own stage
 * name on a non-zero exit, and swallowing that here would cost the one line
 * that says which of the three failed.
 */
export function runHaiku(prompt, { timeout, maxBuffer }) {
  const env = { ...process.env }
  delete env.CLAUDECODE
  return spawnSync(
    'claude',
    [
      '--model', 'claude-haiku-4-5-20251001',
      '--no-session-persistence',
      '--max-turns', '1',
      '--output-format', 'json',
      '-p', prompt,
    ],
    { encoding: 'utf-8', timeout, maxBuffer, env },
  )
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
  const childEnv = { ...env }
  delete childEnv.CLAUDECODE
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
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
