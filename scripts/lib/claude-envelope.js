// Parse the `claude --output-format json` envelope.
//
// The CLI returns `{type:"result", result:"<stringified payload>"}` on success.
// Occasionally the inner `result` is raw text with JSON embedded somewhere;
// we substring between the outer braces as a fallback. When the CLI runs
// without `--output-format json` (older versions, or direct JSON output) the
// stdout is the payload itself — we handle that too.
//
// Returns the parsed inner object. Throws on unrecoverable failure.

export function parseClaudeEnvelope(stdout) {
  const raw = (stdout || '').trim()
  if (!raw) throw new Error('empty claude stdout')

  const outer = JSON.parse(raw)

  if (outer?.type !== 'result') {
    // No envelope — stdout itself is the payload.
    return outer
  }

  if (outer.result == null) {
    throw new Error('claude returned no text result (tool use may have exhausted max-turns)')
  }

  const text = String(outer.result)
  try {
    return JSON.parse(text)
  } catch {
    const s = text.indexOf('{')
    const e = text.lastIndexOf('}')
    if (s === -1 || e === -1) throw new Error('no JSON object found in claude result text')
    return JSON.parse(text.slice(s, e + 1))
  }
}
