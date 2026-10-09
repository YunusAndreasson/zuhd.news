import { callClaudeJson } from './claude-envelope.js'
import { modelFor } from './models.js'

/**
 * One Opus call. Async on purpose: the dispatch runs these through a pool of
 * three, and a synchronous spawn made that pool serial (see `spawnClaude`).
 */
export function callIndicatorModel(fullPrompt) {
  return callClaudeJson(fullPrompt, {
    model: modelFor('dispatch'),
    effort: process.env.ZUHD_DISPATCH_EFFORT || 'medium',
  })
}
