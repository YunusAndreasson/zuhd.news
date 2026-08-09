#!/usr/bin/env node
// Autoresearch loop. Run baseline, then propose-apply-replay-score iteratively
// until budget or plateau. Each iteration is fully sandboxed; the production
// repo and its content/ tree are never touched. Accepted diffs are surfaced
// in the end-of-session summary for human review and merge.
//
// Usage:
//   node scripts/autoresearch/driver.js \
//     --session <id> [--max-iters 8] [--max-wall 180] [--cycle <id>] \
//     [--eval scripts/autoresearch/eval-set.json]
//
// Exit codes:
//   0  session completed cleanly
//   1  fatal error before baseline
//   2  baseline failed (cannot continue)

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { REPO_ROOT } from './replay-utils.js'

const argv = process.argv.slice(2)
function flag(name, def) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : def
}

const sessionId = flag('session', `s-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`)
const maxIters = parseInt(flag('max-iters', '8'), 10)
const maxWallMin = parseInt(flag('max-wall', '180'), 10)
const cycleFilter = flag('cycle', null)
const maxCycles = flag('max-cycles', null)
const evalPath = flag('eval', join(REPO_ROOT, 'scripts/autoresearch/eval-set.json'))
const noJudges = argv.includes('--no-judges')
const force = argv.includes('--force')

// Production cycle fires at 04, 08, 12, 17, 22 UTC. Refuse to start within
// 25 min of any of those unless --force; the systemd timer would race us
// over /tmp/zuhd-* state.
const PRODUCTION_HOURS = [4, 8, 12, 17, 22]
const now = new Date()
const utcH = now.getUTCHours()
const utcM = now.getUTCMinutes()
const minsToFire = Math.min(...PRODUCTION_HOURS.flatMap((h) => {
  const delta = (h - utcH) * 60 - utcM
  return [delta, delta + 24 * 60]
}).filter((d) => d >= 0))
if (minsToFire <= 25 && !force) {
  console.error(`Production cycle fires in ${minsToFire} min — refusing to start (use --force to override).`)
  process.exit(2)
}

const SESSION_DIR = join('/tmp/zuhd-autoresearch', sessionId)
mkdirSync(SESSION_DIR, { recursive: true })
const RUNS_LOG = join(SESSION_DIR, 'runs.jsonl')

const startTime = Date.now()
const wallBudgetMs = maxWallMin * 60_000

console.log(`=== Autoresearch session ${sessionId} ===`)
console.log(`Eval: ${evalPath}${cycleFilter ? `  (cycle filter: ${cycleFilter})` : ''}`)
console.log(`Budget: ${maxIters} iters, ${maxWallMin} min wall`)
console.log(`Logs: ${RUNS_LOG}`)

// --- Iter 0: baseline (no diff) ---

console.log(`\n--- Iter 0: baseline ---`)
const baselineRes = runReplay(0, null)
if (!baselineRes?.aggregate) {
  console.error('Baseline failed — cannot continue')
  process.exit(2)
}
let bestRvs = baselineRes.aggregate.rvs
const baselineGuardrails = new Set(baselineRes.aggregate.guardrailFailures || [])
if (baselineGuardrails.size > 0) {
  console.log(`Baseline RVS: ${bestRvs.toFixed(2)}  (note: ${baselineGuardrails.size} pre-existing guardrail failure(s) — will not penalize iters for these)`)
} else {
  console.log(`Baseline RVS: ${bestRvs.toFixed(2)}`)
}
appendRun({
  iter: 0,
  kind: 'baseline',
  rvs: bestRvs,
  clusters: baselineRes.aggregate.clusters,
  guardrailFailures: [...baselineGuardrails],
  decision: 'baseline',
  diff: null,
})

// --- Loop ---

const acceptedDiffs = []
let consecutiveRejects = 0
const MAX_CONSEC_REJECTS = 3

for (let iter = 1; iter <= maxIters; iter++) {
  if (Date.now() - startTime > wallBudgetMs) {
    console.log(`Wall budget reached — stopping at iter ${iter - 1}`)
    break
  }
  if (consecutiveRejects >= MAX_CONSEC_REJECTS) {
    console.log(`${MAX_CONSEC_REJECTS} consecutive rejects — stopping at iter ${iter - 1}`)
    break
  }

  console.log(`\n--- Iter ${iter} ---`)

  // Propose a diff
  let diff
  try {
    diff = proposeDiff()
  } catch (err) {
    console.error(`Propose failed: ${err.message}`)
    appendRun({ iter, kind: 'propose-error', error: err.message })
    consecutiveRejects++
    continue
  }
  console.log(`  proposed: ${diff.file} — ${diff.targetCluster} — ${diff.rationale.slice(0, 100)}`)

  // Save diff to disk for reproducibility
  const diffPath = join(SESSION_DIR, `iter-${iter}.diff.json`)
  writeFileSync(diffPath, JSON.stringify(diff, null, 2))

  // Run replay with diff
  const res = runReplay(iter, diffPath)
  if (!res?.aggregate) {
    appendRun({ iter, kind: 'replay-error', diff, error: 'no aggregate score' })
    consecutiveRejects++
    continue
  }

  const rvs = res.aggregate.rvs
  // Baseline-relative guardrails: only penalize the iter for failures the
  // diff introduced or worsened. Failures already present at baseline are
  // not the diff's fault.
  const newFailures = (res.aggregate.guardrailFailures || []).filter(
    (f) => !baselineGuardrails.has(f),
  )
  const guardrailFailed = newFailures.length > 0
  let decision
  if (guardrailFailed) {
    decision = 'reject-guardrail'
    consecutiveRejects++
  } else if (rvs > bestRvs) {
    decision = 'accept'
    consecutiveRejects = 0
    bestRvs = rvs
    acceptedDiffs.push({ iter, rvs, delta: rvs - baselineRes.aggregate.rvs, diff })
  } else {
    decision = 'reject-no-improvement'
    consecutiveRejects++
  }
  console.log(`  RVS=${rvs.toFixed(2)}  decision=${decision}${guardrailFailed ? `  newGuardrails=${newFailures.length}: ${newFailures.join('; ')}` : ''}`)

  appendRun({
    iter,
    kind: 'replay',
    diff,
    rvs,
    delta: rvs - baselineRes.aggregate.rvs,
    clusters: res.aggregate.clusters,
    guardrailFailures: res.aggregate.guardrailFailures,
    newGuardrailFailures: newFailures,
    decision,
  })
}

// --- Summarize session ---

console.log(`\n=== Session done ===`)
console.log(`Baseline RVS: ${baselineRes.aggregate.rvs.toFixed(2)}  Best: ${bestRvs.toFixed(2)}  Accepted diffs: ${acceptedDiffs.length}`)

const summaryRes = spawnSync('node', [
  join(REPO_ROOT, 'scripts/autoresearch/summarize-session.js'),
  '--session', sessionId,
], { stdio: 'inherit' })
if (summaryRes.status !== 0) console.error('Summary script failed')

// ──────────────────────────────────────────────────────────────────────────

function runReplay(iter, diffPath) {
  const args = [
    join(REPO_ROOT, 'scripts/autoresearch/run-replay.js'),
    '--session', sessionId,
    '--iter', String(iter),
    '--eval', evalPath,
  ]
  if (cycleFilter) args.push('--cycle', cycleFilter)
  if (maxCycles) args.push('--max-cycles', maxCycles)
  if (diffPath) args.push('--diff', diffPath)
  if (noJudges) args.push('--no-judges')
  const res = spawnSync('node', args, { stdio: 'inherit' })
  if (res.status !== 0) return null
  const scorePath = join(SESSION_DIR, String(iter), 'score.json')
  if (!existsSync(scorePath)) return null
  return JSON.parse(readFileSync(scorePath, 'utf-8'))
}

function proposeDiff() {
  const res = spawnSync('node', [
    join(REPO_ROOT, 'scripts/autoresearch/propose.js'),
    '--session', sessionId,
    '--runs', RUNS_LOG,
  ], { encoding: 'utf-8' })
  if (res.status !== 0) throw new Error(`propose exit ${res.status}: ${(res.stderr || '').slice(0, 300)}`)
  const stdout = res.stdout || ''
  // Tolerate fenced output
  const cleaned = stdout.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`propose output not JSON: ${cleaned.slice(0, 200)}`)
  const diff = JSON.parse(cleaned.slice(start, end + 1))
  // Validate shape
  for (const k of ['rationale', 'targetCluster', 'file', 'oldString', 'newString']) {
    if (typeof diff[k] !== 'string' || diff[k].length === 0) throw new Error(`diff missing field: ${k}`)
  }
  // Validate target file is in the variable surface (must match propose.js)
  const allowed = [
    'scripts/select-prompt.md',
    'scripts/write-prompt.md',
    'scripts/check-prompt.md',
    'scripts/edu-context-prompt.md',
    'scripts/lib/dedup.js',
  ]
  if (!allowed.includes(diff.file)) throw new Error(`diff targets disallowed file: ${diff.file}`)
  return diff
}

function appendRun(rec) {
  appendFileSync(RUNS_LOG, `${JSON.stringify({ ts: new Date().toISOString(), ...rec })}\n`)
}
