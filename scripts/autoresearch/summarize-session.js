#!/usr/bin/env node
// Read the session's runs.jsonl + per-iter diffs, write a human-review summary
// at /tmp/zuhd-autoresearch/<session>/session-<id>.md ranked by Δ-RVS.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : null
}
const sessionId = flag('session')
if (!sessionId) {
  console.error('Usage: summarize-session.js --session <id>')
  process.exit(2)
}

const SESSION_DIR = join('/tmp/zuhd-autoresearch', sessionId)
const RUNS_LOG = join(SESSION_DIR, 'runs.jsonl')
if (!existsSync(RUNS_LOG)) {
  console.error(`Runs log missing: ${RUNS_LOG}`)
  process.exit(2)
}

const runs = readFileSync(RUNS_LOG, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const baseline = runs.find((r) => r.kind === 'baseline')
const replays = runs.filter((r) => r.kind === 'replay')
const accepted = replays.filter((r) => r.decision === 'accept').sort((a, b) => b.delta - a.delta)
const rejected = replays.filter((r) => r.decision !== 'accept')

const lines = []
lines.push(`# Autoresearch session ${sessionId}`)
lines.push('')
lines.push(`- Total iterations: ${replays.length}`)
lines.push(`- Accepted: ${accepted.length}`)
lines.push(`- Rejected: ${rejected.length}`)
if (baseline) {
  lines.push(`- Baseline RVS: ${baseline.rvs.toFixed(2)}`)
  if (accepted.length) {
    lines.push(`- Best RVS: ${accepted[0].rvs.toFixed(2)} (Δ +${accepted[0].delta.toFixed(2)})`)
  }
}
lines.push('')

if (baseline) {
  lines.push(`## Baseline cluster scores`)
  lines.push('')
  lines.push('| Cluster | Score |')
  lines.push('|---|---|')
  for (const [k, v] of Object.entries(baseline.clusters || {})) {
    lines.push(`| ${k} | ${v.toFixed(1)} |`)
  }
  lines.push('')
}

lines.push(`## Accepted diffs (ranked by Δ-RVS)`)
lines.push('')
if (accepted.length === 0) {
  lines.push('_No diffs improved the metric this session._')
  lines.push('')
} else {
  for (const r of accepted) {
    lines.push(`### Iter ${r.iter} — Δ +${r.delta.toFixed(2)} (RVS ${r.rvs.toFixed(2)}, target: ${r.diff.targetCluster})`)
    lines.push('')
    lines.push(`**File:** \`${r.diff.file}\``)
    lines.push('')
    lines.push(`**Rationale:** ${r.diff.rationale}`)
    lines.push('')
    lines.push(`**Diff:** see \`/tmp/zuhd-autoresearch/${sessionId}/iter-${r.iter}.diff.json\``)
    lines.push('')
    lines.push('Old:')
    lines.push('```')
    lines.push(r.diff.oldString.slice(0, 500))
    lines.push('```')
    lines.push('')
    lines.push('New:')
    lines.push('```')
    lines.push(r.diff.newString.slice(0, 500))
    lines.push('```')
    lines.push('')
    if (r.clusters) {
      lines.push(`Cluster shifts: ${Object.entries(r.clusters).map(([k, v]) => `${k}=${v.toFixed(1)}`).join('  ')}`)
      lines.push('')
    }
  }
}

if (rejected.length > 0) {
  lines.push(`## Rejected proposals`)
  lines.push('')
  lines.push('| Iter | Decision | RVS | Δ | File | Rationale |')
  lines.push('|---|---|---|---|---|---|')
  for (const r of rejected) {
    const rvs = typeof r.rvs === 'number' ? r.rvs.toFixed(2) : '—'
    const delta = typeof r.delta === 'number' ? `${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2)}` : '—'
    lines.push(`| ${r.iter} | ${r.decision} | ${rvs} | ${delta} | \`${r.diff?.file || '—'}\` | ${(r.diff?.rationale || '').slice(0, 80)} |`)
  }
  lines.push('')
}

lines.push(`## How to merge`)
lines.push('')
lines.push('Each accepted diff is a JSON file with `oldString` and `newString` keys ready for an Edit-tool replace, or apply manually. Read the rationale, sanity-check the change, and merge by hand.')
lines.push('')

const outPath = join(SESSION_DIR, `session-${sessionId}.md`)
writeFileSync(outPath, lines.join('\n'))
console.log(`Summary written: ${outPath}`)

// Persist runs.jsonl + summary into the repo so the dashboard sees session
// history beyond the lifetime of /tmp. Skips if the repo path looks wrong.
try {
  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const HISTORY_DIR = join(REPO_ROOT, 'content', '.autoresearch-history')
  mkdirSync(HISTORY_DIR, { recursive: true })
  writeFileSync(join(HISTORY_DIR, `${sessionId}.jsonl`), readFileSync(RUNS_LOG, 'utf-8'))
  writeFileSync(join(HISTORY_DIR, `${sessionId}.md`), lines.join('\n'))
  console.log(`History persisted: content/.autoresearch-history/${sessionId}.{jsonl,md}`)
} catch (err) {
  console.warn(`History persistence skipped: ${err.message}`)
}
