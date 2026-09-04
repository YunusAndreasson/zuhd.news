import { spawnSync } from 'node:child_process'
import { parseClaudeEnvelopeWithUsage } from './claude-envelope.js'

export function callIndicatorModel(fullPrompt) {
  const MODEL = process.env.ZUHD_DISPATCH_MODEL || 'claude-opus-5'
  const EFFORT = process.env.ZUHD_DISPATCH_EFFORT || 'medium'
  const env = { ...process.env }
  // The child must not inherit the parent session marker — see `cycle.md`.
  delete env.CLAUDECODE

  const t0 = Date.now()
  const result = spawnSync(
    'claude',
    [
      '--model', MODEL,
      '--effort', EFFORT,
      '--no-session-persistence',
      '--max-turns', '1',
      '--output-format', 'json',
      '--exclude-dynamic-system-prompt-sections',
      '-p', fullPrompt,
    ],
    { encoding: 'utf-8', timeout: 120_000, maxBuffer: 1024 * 1024, env },
  )
  const elapsedMs = Date.now() - t0

  if (result.status !== 0) {
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
