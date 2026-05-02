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
