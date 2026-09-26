import { parseClaudeEnvelopeWithUsage, spawnClaude } from './claude-envelope.js'

/**
 * One Opus call. Async on purpose: the dispatch runs these through a pool of
 * three, and a synchronous spawn made that pool serial (see `spawnClaude`).
 */
export async function callIndicatorModel(fullPrompt) {
  const MODEL = process.env.ZUHD_DISPATCH_MODEL || 'claude-opus-5-5'
  const EFFORT = process.env.ZUHD_DISPATCH_EFFORT || 'medium'
  const t0 = Date.now()
  const result = await spawnClaude(
    [
      '--model', MODEL,
      '--effort', EFFORT,
      '--no-session-persistence',
      '--max-turns', '1',
      '--output-format', 'json',
      '--exclude-dynamic-system-prompt-sections',
      '-p', fullPrompt,
    ],
    { timeout: 120_000, maxBuffer: 1024 * 1024 },
  )
  const elapsedMs = Date.now() - t0

  if (result.status !== 0) {
    if (result.error?.code === 'ETIMEDOUT') return { elapsedMs, error: 'claude timed out after 120s' }
    // Both streams: a non-zero `claude` exit often reports on stdout and leaves
    // stderr empty, which read as "exit 1: " and said nothing at all.
    const why =
      String(result.stderr || '').trim() || String(result.stdout || '').trim() || '(no output)'
    return { elapsedMs, error: `claude exit ${result.status}: ${why.slice(0, 300)}` }
  }
  try {
    const envelope = parseClaudeEnvelopeWithUsage(result.stdout)
    const r = envelope.result
    if (!r || typeof r !== 'object') return { elapsedMs, error: 'no object in result' }
    return { elapsedMs, out: r, costUsd: envelope.total_cost_usd, usage: envelope.usage }
  } catch (err) {
    return { elapsedMs, error: `parse: ${err.message}` }
  }
}
