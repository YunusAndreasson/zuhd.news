#!/usr/bin/env node
// Score the just-completed production cycle's articles + briefs against the
// autoresearch RVS rubric, deterministic clusters only (no Claude judges →
// zero token cost). Appends a record to content/.rvs-trend.json.
//
// Hooked into run-cycle.sh after deploy succeeds. Fail-soft: any error here
// must not break the cycle. The trend file is the only output.
//
// Reads /tmp/zuhd-new-articles.txt (set earlier in the cycle) for the list
// of paths. Slugs map to entries in content/.context-briefs.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreReplay } from './autoresearch/score.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'
const TREND_PATH = join(ROOT, 'content', '.rvs-trend.json')

async function main() {
  if (!existsSync(NEW_ARTICLES_PATH)) {
    console.log('No new articles list — skipping production RVS scoring')
    return
  }
  const newArticles = readFileSync(NEW_ARTICLES_PATH, 'utf-8')
    .trim().split('\n').filter(Boolean)
  if (newArticles.length === 0) {
    console.log('Empty article list — skipping production RVS scoring')
    return
  }

  // cycleId derived from current UTC: YYYY-MM-DDTHH-MM
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const min = String(now.getUTCMinutes()).padStart(2, '0')
  const cycleId = `${yyyy}-${mm}-${dd}T${hh}-${min}`

  // No feed snapshot needed when skipJudges=true — the picking-judge path
  // is the only consumer and it's gated.
  const cycle = { id: cycleId, feedSnapshot: null }

  const score = await scoreReplay({
    worktree: ROOT,
    newArticles,
    cycle,
    cycleDir: '/tmp',
    skipJudges: true,
  })

  // Picking is excluded from production RVS because skipJudges:true makes
  // scorePicking() return a constant 60 (50-pt fallback × 0.8 + 100 × 0.2).
  // Including it added 12% of dead weight to every cycle's score.
  // Briefing is excluded since 2026-07-03 (schema 2): edu-context generation
  // was removed from the cycle on 2026-06-19, so briefCount is always 0 —
  // keeping the cluster dragged every RVS to ~50 and flagged every cycle
  // degenerate. The three remaining clusters carry signal; renormalize.
  const rvs = rvsProduction(score.clusters)

  // Pipeline-degenerate cycles produce malformed RVS records that distort
  // distribution stats — e.g., 2026-04-30T22-14 shipped 1 article
  // (writer stage degraded mid-batch) and shifted std by 24% over 55 cycles.
  // Flag prospectively so downstream analysis can filter without recomputing.
  const degenerate = score.articleCount < 4

  const record = {
    ts: now.toISOString(),
    cycleId,
    cycleHour: hh,
    schema: 2, // schema 2 = no briefing cluster; not comparable to earlier records
    rvs: round2(rvs),
    clusters: {
      picking: null,
      writing: round2(score.clusters.writing),
      briefing: null,
      sourcing: round2(score.clusters.sourcing),
      coverage: round2(score.clusters.coverage),
    },
    articleCount: score.articleCount,
    briefCount: score.briefCount,
    guardrailFailures: score.guardrailFailures,
    degenerate,
  }

  let trend = []
  if (existsSync(TREND_PATH)) {
    try { trend = JSON.parse(readFileSync(TREND_PATH, 'utf-8')) } catch {}
  }
  trend.push(record)
  // Keep last 365 records (~73 days at 5 cycles/day)
  if (trend.length > 365) trend = trend.slice(-365)
  writeFileSync(TREND_PATH, JSON.stringify(trend, null, 2))

  console.log(`Production RVS: ${record.rvs.toFixed(2)}  (writing=${record.clusters.writing.toFixed(0)}  sourcing=${record.clusters.sourcing.toFixed(0)}  coverage=${record.clusters.coverage.toFixed(0)})`)
}

// Renormalized weights: writing 0.20, sourcing 0.15, coverage 0.15.
// Sum = 0.50 → divide each by 0.50 so the three sum to 1.
function rvsProduction(c) {
  return (
    c.writing  * (0.20 / 0.50) +
    c.sourcing * (0.15 / 0.50) +
    c.coverage * (0.15 / 0.50)
  )
}

function round2(x) { return Math.round(x * 100) / 100 }

main().catch((err) => {
  console.error(`RVS scoring failed (fail-soft): ${err.message}`)
  process.exit(0) // fail-soft — never break the cycle
})
