import { spawnSync } from 'node:child_process'

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
