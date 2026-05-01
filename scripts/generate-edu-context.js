#!/usr/bin/env node
// Educational context generator for zuhd.news
// Reads this cycle's new articles, identifies candidates for educational context,
// calls Opus to select 2-4 and generate explainer briefs, saves to .context-briefs.json.

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs'
import { join, basename, dirname } from 'path'
import { spawnSync } from 'child_process'
import { parseFrontmatter } from './lib/frontmatter.js'
import { buildTimelineWithCharts, loadTrendsSnapshot, buildTrendsPromptSection, selectOfferedIndicators } from './lib/trends-expand.js'
import { parseClaudeEnvelopeWithUsage } from './lib/claude-envelope.js'

const ROOT = new URL('..', import.meta.url).pathname
const BRIEFS_PATH = join(ROOT, 'content', '.context-briefs.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'edu-context-prompt.md')
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'
const TRENDS_DIGEST_PATH = '/tmp/zuhd-trends-digest.json'
const TRENDS_PICKS_LOG = join(ROOT, 'logs', 'trends-picks.jsonl')
const MAX_BRIEFS_PER_CYCLE = Infinity

// --- Read this cycle's new articles ---
if (!existsSync(NEW_ARTICLES_PATH)) {
  console.log('No new articles list found — skipping edu context generation.')
  process.exit(0)
}

const newFiles = readFileSync(NEW_ARTICLES_PATH, 'utf8').trim().split('\n').filter(Boolean)
if (newFiles.length === 0) {
  console.log('No new articles — skipping edu context generation.')
  process.exit(0)
}

const briefs = existsSync(BRIEFS_PATH) ? JSON.parse(readFileSync(BRIEFS_PATH, 'utf8')) : {}
const basePrompt = readFileSync(PROMPT_PATH, 'utf8')

// Ensure the audit log directory exists up-front so a broken path surfaces
// before we spend tokens calling Claude. Fail loud — silent logging gaps are
// the single biggest observability hole for iteration on this stage.
try {
  mkdirSync(dirname(TRENDS_PICKS_LOG), { recursive: true })
} catch (err) {
  console.error(`✗ cannot create trends-picks log dir (${dirname(TRENDS_PICKS_LOG)}): ${err.message}`)
  process.exit(1)
}

// --- Build candidate list ---
const candidates = []
for (const file of newFiles) {
  const filename = basename(file)
  if (!filename.endsWith('.md')) continue
  const slug = basename(filename, '.md')

  // Skip if already has a context brief
  if (briefs[slug]) continue

  const fullPath = join(ROOT, file)
  if (!existsSync(fullPath)) continue

  const raw = readFileSync(fullPath, 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const concepts = Array.isArray(meta.concepts)
    ? meta.concepts.map(c => typeof c === 'object' ? c.label : c)
    : []

  candidates.push({
    slug,
    title: meta.title || slug,
    category: meta.category || 'politics',
    concepts,
    body: body.trim(),
  })
}

if (candidates.length === 0) {
  console.log('No candidates for edu context — all articles already have briefs.')
  process.exit(0)
}

console.log(`=== Edu context: ${candidates.length} candidate(s) ===`)

// --- Build concept library from existing briefs ---
// Extract unique (heading, body) entries keyed by concept, so Claude can
// build on vetted explanations rather than re-explaining from scratch.
function buildConceptLibrary(briefs, candidateConcepts) {
  // Collect all concepts the candidates mention
  const needed = new Set(candidateConcepts)
  if (needed.size === 0) return ''

  // Index: concept → [{heading, body, label}] from existing briefs
  const conceptEntries = {}
  for (const brief of Object.values(briefs)) {
    if (!brief.timeline?.length) continue
    // Match candidate concepts against entry label / heading / body (fuzzy)
    for (const entry of brief.timeline) {
      if (!entry.heading || !entry.body) continue
      for (const concept of needed) {
        const cLower = concept.toLowerCase()
        const inLabel = brief.label?.toLowerCase().includes(cLower)
        const inBody = entry.body?.toLowerCase().includes(cLower)
        const inHeading = entry.heading?.toLowerCase().includes(cLower)
        if (inLabel || inBody || inHeading) {
          if (!conceptEntries[concept]) conceptEntries[concept] = []
          // Avoid duplicates
          if (!conceptEntries[concept].some(e => e.heading === entry.heading && e.body === entry.body)) {
            conceptEntries[concept].push({
              heading: entry.heading,
              body: entry.body,
              fromLabel: brief.label,
            })
          }
        }
      }
    }
  }

  // Build the library string — keep it compact, max ~30 entries
  const entries = []
  for (const [concept, items] of Object.entries(conceptEntries)) {
    for (const item of items.slice(0, 3)) { // max 3 per concept
      entries.push({ concept, ...item })
      if (entries.length >= 30) break
    }
    if (entries.length >= 30) break
  }

  if (entries.length === 0) return ''

  const lines = entries.map(e =>
    `  "${e.concept}" (from "${e.fromLabel}"): [${e.heading}] ${e.body}`
  ).join('\n')

  return `\n## Concept library

Previously vetted explanations for concepts that appear in today's candidates. You may reuse, adapt, or build on these — but only if they fit the article's specific angle. Do not force a reuse; write fresh when the angle demands it.

${lines}
`
}

const allCandidateConcepts = [...new Set(candidates.flatMap(c => c.concepts))]
const conceptLibrary = buildConceptLibrary(briefs, allCandidateConcepts)
if (conceptLibrary) {
  console.log(`  Concept library: ${allCandidateConcepts.length} concepts, ${(conceptLibrary.match(/\n  "/g) || []).length} matching entries from existing briefs`)
}

// --- Load trends digest + snapshot (optional — graceful if missing) ---
const trendsDigest = existsSync(TRENDS_DIGEST_PATH)
  ? JSON.parse(readFileSync(TRENDS_DIGEST_PATH, 'utf8'))
  : null
const trendsSnapshot = loadTrendsSnapshot(ROOT)
const trendsSection = buildTrendsPromptSection(trendsDigest)
const offeredIndicators = selectOfferedIndicators(trendsDigest)
if (offeredIndicators.length) {
  console.log(`  Trends: offered ${offeredIndicators.length} indicators to editor (capped from ${trendsDigest.indicators.length})`)
}

// --- Per-article generation ---
// Moved from one-batched-call to one-Claude-call-per-article so each brief
// gets the model's full attention budget. Batched mode diluted each brief's
// "default on when substrate matches" scan — dry-run vs production density
// was ~2x, consistently. Cost: ~Nx input tokens (base prompt repeats), ~Nx
// wall-clock (sequential). Upside: per-brief quality climbs toward dry-run.

const env = { ...process.env }
delete env.CLAUDECODE
const offeredIds = offeredIndicators.map((i) => i.id)

/** Run one Claude call for one candidate. Returns the parsed brief envelope
 *  + timing + any parse/transport error. Failures are per-article; the
 *  caller logs and moves on to the next candidate. */
function generateOneBrief(candidate) {
  const singleBlock = `### ${candidate.slug}
title: ${candidate.title}
category: ${candidate.category}
concepts: ${candidate.concepts.join(', ') || 'none'}

Body:
"""
${candidate.body}
"""`

  const fullPrompt = `${basePrompt}
${conceptLibrary}${trendsSection}
## Candidate article

${singleBlock}

Generate the educational context brief for this article. Output ONLY the JSON object keyed by slug — no markdown fences, no commentary.`

  const t0 = Date.now()
  const result = spawnSync('claude', [
    '--model', 'claude-opus-4-7',
    '--effort', 'medium',
    '--no-session-persistence',
    '--max-turns', '3',
    '--output-format', 'json',
    '-p', fullPrompt,
  ], { encoding: 'utf-8', timeout: 300_000, maxBuffer: 2 * 1024 * 1024, env })
  const elapsedMs = Date.now() - t0

  if (result.status !== 0) {
    return { elapsedMs, error: `claude exit ${result.status}: ${result.stderr?.slice(0, 200)}` }
  }
  try {
    const env = parseClaudeEnvelopeWithUsage(result.stdout)
    return { elapsedMs, parsed: env.result, usage: env.usage, costUsd: env.total_cost_usd, durationMs: env.duration_ms }
  } catch (err) {
    return { elapsedMs, error: `parse: ${err.message}` }
  }
}

console.log(`  Calling Opus per-article (${candidates.length} briefs, sequential)…`)
const stageT0 = Date.now()

let generated = 0
let totalPicks = 0
const usageTotals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, costUsd: 0 }

for (const candidate of candidates) {
  if (generated >= MAX_BRIEFS_PER_CYCLE) break
  const { elapsedMs, parsed, usage, costUsd, error } = generateOneBrief(candidate)
  const secs = (elapsedMs / 1000).toFixed(1)
  if (usage) {
    usageTotals.input += usage.input_tokens || 0
    usageTotals.output += usage.output_tokens || 0
    usageTotals.cacheCreate += usage.cache_creation_input_tokens || 0
    usageTotals.cacheRead += usage.cache_read_input_tokens || 0
  }
  if (typeof costUsd === 'number') usageTotals.costUsd += costUsd

  if (error) {
    console.log(`  ✗ ${candidate.slug}: ${error} (${secs}s)`)
    continue
  }

  const data = parsed[candidate.slug]
  if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
    const slugs = Object.keys(parsed)
    console.log(`  ✗ ${candidate.slug}: no valid entries (got keys: ${slugs.join(', ') || 'none'}) (${secs}s)`)
    continue
  }

  const validEntries = data.entries.filter(e => e.body && typeof e.body === 'string')
  if (validEntries.length === 0) {
    console.log(`  ✗ ${candidate.slug}: no entries with body (${secs}s)`)
    continue
  }

  const { timeline, sources, picked, literals, dropped } = buildTimelineWithCharts(
    validEntries,
    trendsSnapshot,
    (msg) => console.log(`    ⚠ ${candidate.slug}: ${msg}`),
  )

  briefs[candidate.slug] = {
    type: 'edu',
    timeline,
    ...(sources.length ? { sources } : {}),
    generatedAt: new Date().toISOString(),
    label: data.label || candidate.slug,
    category: candidate.category,
    articleCount: 1,
  }
  generated++
  totalPicks += picked.length

  const headings = validEntries.filter(e => e.heading).length
  const chartNote = picked.length ? ` + ${picked.length} chart(s): ${picked.map((p) => p.id).join(', ')}` : ''
  const literalNote = literals.length ? ` + ${literals.length} literal (${literals.map((l) => l.type).join(', ')})` : ''
  const dropNote = dropped.length ? ` · ${dropped.length} dropped` : ''
  console.log(`  ✓ ${candidate.slug} [${secs}s] (${validEntries.length} entries, ${headings} headings${chartNote}${literalNote}${dropNote})`)

  try {
    appendFileSync(TRENDS_PICKS_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      slug: candidate.slug,
      category: candidate.category,
      concepts: candidate.concepts,
      offered: offeredIds,
      entries: validEntries.length,
      headings,
      elapsedMs,
      picked,
      literals,
      dropped,
    }) + '\n')
  } catch (err) {
    console.error(`  ✗ trends-picks log append failed for ${candidate.slug}: ${err.message}`)
  }
}

const stageSecs = ((Date.now() - stageT0) / 1000).toFixed(1)
console.log(`  Stage total: ${stageSecs}s across ${candidates.length} candidates`)

// Cache-hit summary line — parsed by scripts/dashboard/server.js for the
// pipeline tab. cacheHitPct is read tokens / (read + create) so a cold start
// reads as 0% and a fully warm prefix reads as ~100%. Skipped silently when
// the CLI envelope didn't carry usage (older versions or `--output-format`
// not set).
if (usageTotals.input + usageTotals.cacheCreate + usageTotals.cacheRead > 0) {
  const cacheable = usageTotals.cacheCreate + usageTotals.cacheRead
  const hitPct = cacheable > 0 ? (100 * usageTotals.cacheRead / cacheable).toFixed(1) : '0.0'
  console.log(`Edu-context tokens: in=${usageTotals.input} out=${usageTotals.output} cache_create=${usageTotals.cacheCreate} cache_read=${usageTotals.cacheRead} hit=${hitPct}% cost=$${usageTotals.costUsd.toFixed(4)}`)
}

// Cycle-log summary line — parsed by scripts/dashboard/server.js.
if (trendsDigest?.indicators?.length) {
  console.log(`Trends: offered ${offeredIds.length} indicators to editor, picked ${totalPicks} across ${generated} articles`)
}

if (generated > 0) {
  writeFileSync(BRIEFS_PATH, JSON.stringify(briefs, null, 2) + '\n')
  console.log(`\n=== Saved ${generated} edu brief(s) — ${Object.keys(briefs).length} total in briefs file ===`)
} else {
  console.log('\n=== No edu briefs generated this cycle ===')
}
