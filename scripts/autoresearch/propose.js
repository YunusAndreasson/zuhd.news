#!/usr/bin/env node
// Proposer: invokes Claude with the proposer prompt + prior runs.jsonl + the
// current contents of every file in the variable surface, returns ONE diff as
// JSON to stdout. Driver consumes it.
//
// Usage:
//   node scripts/autoresearch/propose.js --session <id> --runs <runs.jsonl-path>

import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : null
}
const sessionId = flag('session')
const runsPath = flag('runs')
if (!sessionId || !runsPath) {
  console.error('Usage: propose.js --session <id> --runs <path>')
  process.exit(2)
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROPOSER_PROMPT = readFileSync(
  join(REPO_ROOT, 'scripts/autoresearch/proposer-prompt.md'),
  'utf-8',
)

// Variable surface for offline-replay autoresearch. Knobs that govern the
// production fetch (scripts/fetch-news-api.js) are NOT here — replays use
// frozen feed snapshots, so any diff there is a no-op for our scoring loop.
const VARIABLE_SURFACE = [
  'scripts/select-prompt.md',
  'scripts/write-prompt.md',
  'scripts/check-prompt.md',
  'scripts/edu-context-prompt.md',
  'scripts/lib/dedup.js',
]

const runs = existsSync(runsPath)
  ? readFileSync(runsPath, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []

// Compact prior-iteration log for the proposer (drop verbose fields)
const priorLog = runs.map((r) => ({
  iter: r.iter,
  kind: r.kind,
  decision: r.decision,
  rvs: r.rvs,
  delta: r.delta,
  clusters: r.clusters,
  guardrailFailures: r.guardrailFailures,
  diff: r.diff
    ? {
        file: r.diff.file,
        targetCluster: r.diff.targetCluster,
        rationale: r.diff.rationale,
        oldString: r.diff.oldString?.slice(0, 200),
        newString: r.diff.newString?.slice(0, 200),
      }
    : null,
}))

// Provide the current file contents for each surface file
const surfaceContents = {}
for (const f of VARIABLE_SURFACE) {
  const p = join(REPO_ROOT, f)
  if (existsSync(p)) surfaceContents[f] = readFileSync(p, 'utf-8')
}

const fullPrompt = `${PROPOSER_PROMPT}

## Prior iteration log (this session)

${JSON.stringify(priorLog, null, 2)}

## Current contents of variable-surface files

${Object.entries(surfaceContents)
  .map(([f, body]) => `### ${f}\n\n\`\`\`\n${body}\n\`\`\``)
  .join('\n\n')}

Return ONE diff as JSON. No prose, no fences.`

const env = { ...process.env }
delete env.CLAUDECODE

const res = spawnSync(
  'claude',
  [
    '--no-session-persistence',
    '--effort', 'medium',
    '--model', 'claude-opus-4-8',
    '--max-turns', '1',
    '--tools', '',
    '-p', fullPrompt,
  ],
  { encoding: 'utf-8', env, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
)

if (res.status !== 0) {
  console.error(`proposer claude exit ${res.status}: ${(res.stderr || '').slice(0, 500)}`)
  process.exit(res.status || 1)
}

process.stdout.write(res.stdout || '')
