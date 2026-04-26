#!/usr/bin/env node
// Single-iteration replay: prep sandbox → selector → writer → editor →
// edu-context → score. Writes a score.json into the sandbox iter directory.
//
// Usage:
//   node scripts/autoresearch/run-replay.js \
//     --session <id> --iter <n> \
//     --eval scripts/autoresearch/eval-set.json \
//     [--cycle <id>] [--diff <path-to-diff.json>] [--skip-stages selector,writer]
//
// Sandboxed: writes to /tmp/zuhd-autoresearch/<session>/<iter>/. Never touches
// the production repo's content/.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, appendFileSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import {
  REPO_ROOT,
  MODELS,
  makeSandbox,
  createWorktree,
  removeWorktree,
  applyDiff,
  clearTmpStaging,
  stageFeed,
  stageTrendsDigest,
  runClaude,
  findNewArticles,
} from './replay-utils.js'
import { scoreReplay } from './score.js'

const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : null
}

const sessionId = flag('session') || `s-${Date.now()}`
const iterId = flag('iter') || '0'
const evalPath = flag('eval') || join(REPO_ROOT, 'scripts/autoresearch/eval-set.json')
const cycleFilter = flag('cycle') // run only one cycle from the eval set
const diffPath = flag('diff')
const skipStages = (flag('skip-stages') || '').split(',').filter(Boolean)
const keepWorktree = argv.includes('--keep-worktree')
const noJudges = argv.includes('--no-judges')

const evalSet = JSON.parse(readFileSync(evalPath, 'utf-8'))
const cycles = cycleFilter
  ? evalSet.cycles.filter((c) => c.id === cycleFilter)
  : evalSet.cycles
if (cycles.length === 0) {
  console.error(`No cycles matched ${cycleFilter || '(all)'}`)
  process.exit(2)
}

const diff = diffPath ? JSON.parse(readFileSync(diffPath, 'utf-8')) : null

const sandboxRoot = makeSandbox(sessionId, iterId)
const progressPath = join('/tmp/zuhd-autoresearch', sessionId, 'progress.json')
function writeProgress(extra = {}) {
  try {
    writeFileSync(progressPath, JSON.stringify({
      sessionId, iterId, ts: new Date().toISOString(), ...extra,
    }, null, 2))
  } catch {}
}

console.log(`Sandbox: ${sandboxRoot}`)
console.log(`Cycles: ${cycles.map((c) => c.id).join(', ')}`)
if (diff) console.log(`Diff: ${diff.file} — ${diff.rationale?.slice(0, 80)}`)
if (noJudges) console.log(`(judges disabled — deterministic clusters only)`)
writeProgress({ stage: 'starting', cyclesPlanned: cycles.map((c) => c.id) })

const cycleResults = []

for (const cycle of cycles) {
  const cycleStart = Date.now()
  const cycleDir = join(sandboxRoot, cycle.id)
  mkdirSync(cycleDir, { recursive: true })
  console.log(`\n=== ${cycle.id} ===`)
  writeProgress({ stage: 'cycle-start', cycle: cycle.id })

  const worktree = createWorktree(cycleDir)

  if (diff) {
    try {
      applyDiff(worktree, diff)
      console.log(`  ✓ diff applied`)
    } catch (err) {
      console.error(`  ✗ diff apply failed: ${err.message}`)
      cycleResults.push({ cycle: cycle.id, error: `diff apply: ${err.message}` })
      if (!keepWorktree) removeWorktree(worktree)
      continue
    }
  }

  // Stage /tmp/* per cycle (sequential — only one cycle at a time).
  clearTmpStaging()
  stageFeed(join(REPO_ROOT, cycle.feedSnapshot))
  stageTrendsDigest(cycle.trendsSnapshot ? join(REPO_ROOT, cycle.trendsSnapshot) : null)

  const result = { cycle: cycle.id, stages: {} }

  // --- Stage 1: Selector ---
  writeProgress({ stage: 'selector', cycle: cycle.id })
  if (!skipStages.includes('selector')) {
    const tStart = Date.now()
    const promptPath = join(worktree, 'scripts/select-prompt.md')
    let prompt = readFileSync(promptPath, 'utf-8')
    // Inject coverage map (run-cycle.sh does this); skip if it errors — the
    // selector prompt has fallback wording.
    try {
      const cov = spawnSync('node', ['scripts/coverage-map.js'], { cwd: worktree, encoding: 'utf-8' })
      if (cov.status === 0 && cov.stdout?.trim()) {
        prompt += `\n\nDo not re-select stories already covered in the last 24 hours. Recent coverage:\n<recent-coverage>\n${cov.stdout}\n</recent-coverage>`
      }
    } catch {}

    const r = runClaude({
      prompt,
      model: MODELS.selector,
      allowedTools: 'Read,Write,Glob,Grep',
      maxTurns: 35,
      timeoutSec: 1200,
      cwd: worktree,
    })
    result.stages.selector = { exit: r.exitCode, durationSec: Math.round((Date.now() - tStart) / 1000) }
    console.log(`  selector exit=${r.exitCode} ${result.stages.selector.durationSec}s`)
    if (r.exitCode !== 0) {
      result.error = 'selector failed'
      cycleResults.push(result)
      if (!keepWorktree) removeWorktree(worktree)
      continue
    }
    if (!existsSync('/tmp/zuhd-selection.json')) {
      result.error = 'selector produced no selection'
      cycleResults.push(result)
      if (!keepWorktree) removeWorktree(worktree)
      continue
    }
    // Run dedup chain (deterministic, no LLM) — same as run-cycle.sh stages 1.3–1.6
    for (const script of ['enrich-selection.js', 'dedup-selection.js', 'backfill-selection.js']) {
      spawnSync('node', [`scripts/${script}`], { cwd: worktree, stdio: 'inherit' })
    }
    // Skip update-ledger.js: it mutates content/.story-ledger.json which we
    // do not want polluted in the worktree (it would alter dedup behaviour
    // for subsequent iterations sharing the same .git).
    copyFileSync('/tmp/zuhd-selection.json', join(cycleDir, 'selection.json'))
  }

  // --- Stage 2: Writer ---
  writeProgress({ stage: 'writer', cycle: cycle.id })
  if (!skipStages.includes('writer') && existsSync('/tmp/zuhd-selection.json')) {
    const tStart = Date.now()
    const prompt = readFileSync(join(worktree, 'scripts/write-prompt.md'), 'utf-8')
    const r = runClaude({
      prompt,
      model: MODELS.writer,
      allowedTools: 'Read,Write',
      maxTurns: 60,
      timeoutSec: 1800,
      cwd: worktree,
    })
    result.stages.writer = { exit: r.exitCode, durationSec: Math.round((Date.now() - tStart) / 1000) }
    console.log(`  writer exit=${r.exitCode} ${result.stages.writer.durationSec}s`)
  }

  // Capture new articles regardless of editor outcome
  const newArticles = findNewArticles(worktree)
  result.newArticleCount = newArticles.length
  if (newArticles.length > 0) {
    writeFileSync('/tmp/zuhd-new-articles.txt', newArticles.join('\n'))

    // Scaffold (deterministic) — enriches frontmatter from selection
    spawnSync('node', ['scripts/scaffold-articles.js'], { cwd: worktree, stdio: 'inherit' })
  }

  // --- Stage 3: Editor ---
  writeProgress({ stage: 'editor', cycle: cycle.id, newArticles: newArticles.length })
  if (!skipStages.includes('editor') && newArticles.length > 0) {
    const tStart = Date.now()
    const basePrompt = readFileSync(join(worktree, 'scripts/check-prompt.md'), 'utf-8')
    const articleList = newArticles.join('\n')
    const addendum = `\n\nIMPORTANT: Only check the files listed in <files> below.\n\n<files>\n${articleList}\n</files>`
    const r = runClaude({
      prompt: basePrompt + addendum,
      model: MODELS.editor,
      allowedTools: 'Read,Edit,Glob,Grep',
      maxTurns: 50,
      timeoutSec: 1800,
      cwd: worktree,
    })
    result.stages.editor = { exit: r.exitCode, durationSec: Math.round((Date.now() - tStart) / 1000) }
    console.log(`  editor exit=${r.exitCode} ${result.stages.editor.durationSec}s`)
  }

  // --- Stage 3b: Validate (guardrail gate) ---
  const valRes = spawnSync('node', ['scripts/validate-articles.js'], { cwd: worktree, encoding: 'utf-8' })
  result.stages.validate = { exit: valRes.status ?? -1, output: (valRes.stdout || '').slice(-500) }

  // --- Stage 3.5: Edu-context ---
  writeProgress({ stage: 'edu-context', cycle: cycle.id })
  if (!skipStages.includes('edu-context') && newArticles.length > 0) {
    const tStart = Date.now()
    const eduRes = spawnSync('node', ['scripts/generate-edu-context.js'], {
      cwd: worktree,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDECODE: undefined },
      timeout: 1500 * 1000,
    })
    result.stages.eduContext = {
      exit: eduRes.status ?? -1,
      durationSec: Math.round((Date.now() - tStart) / 1000),
      tail: (eduRes.stdout || '').split('\n').slice(-15).join('\n'),
    }
    console.log(`  edu-context exit=${eduRes.status} ${result.stages.eduContext.durationSec}s`)
  }

  // --- Score this cycle ---
  writeProgress({ stage: 'scoring', cycle: cycle.id })
  try {
    const cycleScore = await scoreReplay({ worktree, newArticles, cycle, cycleDir, skipJudges: noJudges })
    result.score = cycleScore
    console.log(`  RVS: ${cycleScore.rvs.toFixed(1)}  picking=${cycleScore.clusters.picking.toFixed(0)}  writing=${cycleScore.clusters.writing.toFixed(0)}  briefing=${cycleScore.clusters.briefing.toFixed(0)}  sourcing=${cycleScore.clusters.sourcing.toFixed(0)}  coverage=${cycleScore.clusters.coverage.toFixed(0)}`)
  } catch (err) {
    result.scoreError = err.message
    console.error(`  ✗ score failed: ${err.message}`)
  }

  result.cycleDurationSec = Math.round((Date.now() - cycleStart) / 1000)
  cycleResults.push(result)

  if (!keepWorktree) removeWorktree(worktree)
  clearTmpStaging()
}

// --- Aggregate across cycles into iteration-level score ---

const scored = cycleResults.filter((r) => r.score)
const aggregate = scored.length === 0 ? null : {
  rvs: mean(scored.map((r) => r.score.rvs)),
  clusters: {
    picking: mean(scored.map((r) => r.score.clusters.picking)),
    writing: mean(scored.map((r) => r.score.clusters.writing)),
    briefing: mean(scored.map((r) => r.score.clusters.briefing)),
    sourcing: mean(scored.map((r) => r.score.clusters.sourcing)),
    coverage: mean(scored.map((r) => r.score.clusters.coverage)),
  },
  guardrailFailures: scored.flatMap((r) => r.score.guardrailFailures || []),
  cyclesScored: scored.length,
  cyclesTotal: cycleResults.length,
}

const out = {
  sessionId,
  iterId,
  diff: diff ? { file: diff.file, rationale: diff.rationale, targetCluster: diff.targetCluster } : null,
  cycles: cycleResults,
  aggregate,
  generatedAt: new Date().toISOString(),
}

writeFileSync(join(sandboxRoot, 'score.json'), JSON.stringify(out, null, 2))
writeProgress({ stage: 'iter-done', rvs: aggregate?.rvs })

console.log(`\n=== Iteration ${iterId} ===`)
if (aggregate) {
  console.log(`Aggregate RVS: ${aggregate.rvs.toFixed(1)} across ${aggregate.cyclesScored}/${aggregate.cyclesTotal} cycles`)
  if (aggregate.guardrailFailures.length > 0) {
    console.log(`⚠ Guardrail failures: ${aggregate.guardrailFailures.join('; ')}`)
  }
} else {
  console.log('No cycle scored — all replays errored out.')
}
console.log(`Score written: ${join(sandboxRoot, 'score.json')}`)

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 }
