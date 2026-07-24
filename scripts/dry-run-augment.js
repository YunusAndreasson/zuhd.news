#!/usr/bin/env node
// Dry-run the trends-augmented edu-context stage against ONE existing article,
// writing the resulting brief to mobile/lib/dev-context-demo.json so the
// __DEV__ build of the mobile app shows it on every context tap.
//
// Runs fully locally on the dev machine — no Hetzner cycle, no deploy.
// Prereqs:
//   - /usr/bin/claude  (present on dev machine)
//   - .env with FRED_API_KEY / OER_APP_ID (optional — fetcher skips missing)
//   - an article markdown file at content/articles/<slug>.md

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { spawnSync } from 'child_process'
import { parseFrontmatter } from './lib/frontmatter.js'
import { buildTimelineWithCharts, loadTrendsSnapshot, loadTrendsDigest, buildTrendsPromptSection } from './lib/trends-expand.js'
import { parseClaudeEnvelope } from './lib/claude-envelope.js'

const ROOT = new URL('..', import.meta.url).pathname
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const PROMPT_PATH = join(ROOT, 'scripts', 'edu-context-prompt.md')
const DIGEST_PATH = '/tmp/zuhd-trends-digest.json'
const DEV_DEMO_JSON = join(ROOT, 'mobile', 'lib', 'dev-context-demo.json')
const PICKS_LOG = join(ROOT, 'logs', 'trends-picks.jsonl')

// ── CLI args ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? (argv[i + 1] || true) : null
}

const slug = flag('article')
const skipFetch = !!flag('skip-fetch')
const model = flag('model') || 'claude-opus-5'

if (!slug) {
  console.error('Usage: node scripts/dry-run-augment.js --article <slug> [--skip-fetch] [--model <id>]')
  process.exit(2)
}

const articlePath = join(ARTICLES_DIR, `${slug}.md`)
if (!existsSync(articlePath)) {
  console.error(`Article not found: ${articlePath}`)
  process.exit(2)
}

// ── Step 1: fetch trends (unless --skip-fetch with today's snapshot present) ─

const today = new Date().toISOString().slice(0, 10)
const snapPath = join(ROOT, 'content', 'trends', `${today}.json`)
if (skipFetch && existsSync(snapPath)) {
  console.log(`Reusing existing snapshot: ${snapPath}`)
} else {
  console.log('Fetching trends…')
  const fetchRes = spawnSync('node', [join(ROOT, 'scripts', 'fetch-trends.js')], {
    stdio: 'inherit',
    env: process.env,
  })
  if (fetchRes.status !== 0) {
    console.error('fetch-trends.js failed — continuing with whatever was already on disk')
  }
}

// ── Step 2: assemble prompt ─────────────────────────────────────────────────

const digest = loadTrendsDigest(DIGEST_PATH)
const snapshot = loadTrendsSnapshot(ROOT)
const trendsSection = buildTrendsPromptSection(digest)

const articleRaw = readFileSync(articlePath, 'utf8')
const { meta, body } = parseFrontmatter(articleRaw)
const concepts = Array.isArray(meta.concepts)
  ? meta.concepts.map((c) => (typeof c === 'object' ? c.label : c))
  : []

const basePrompt = readFileSync(PROMPT_PATH, 'utf8')

const candidateLine = `- slug: ${slug}\n  title: ${meta.title || slug}\n  category: ${meta.category || 'politics'}\n  concepts: ${concepts.join(', ') || 'none'}`

// Include the full article body so the editor has the actual substrate to
// reach beneath, not just metadata. This differs from the production generator
// which reads only frontmatter — acceptable in dry-run since we're iterating.
const fullPrompt = `${basePrompt}
${trendsSection}
## Candidate article (body included for dry-run inspection)

${candidateLine}

Article body:
"""
${body.trim()}
"""

Generate an educational context brief for this article. Output ONLY the JSON object — no markdown fences, no commentary.`

// ── Step 3: invoke Claude CLI ───────────────────────────────────────────────

console.log(`Calling ${model} (dry-run, single article)…`)
const env = { ...process.env }
delete env.CLAUDECODE
const result = spawnSync('claude', [
  '--model', model,
  '--effort', 'medium',
  '--no-session-persistence',
  '--max-turns', '3',
  '--output-format', 'json',
  '-p', fullPrompt,
], { encoding: 'utf-8', timeout: 300_000, maxBuffer: 2 * 1024 * 1024, env })

if (result.status !== 0) {
  console.error('Claude CLI error:', result.stderr?.slice(0, 500))
  process.exit(1)
}

let parsed
try {
  parsed = parseClaudeEnvelope(result.stdout)
} catch (err) {
  console.error(`Failed to parse Claude output: ${err.message}`)
  console.error(`Raw (first 300): ${(result.stdout || '').slice(0, 300)}`)
  process.exit(1)
}

const briefOut = parsed[slug]
if (!briefOut || !Array.isArray(briefOut.entries) || briefOut.entries.length === 0) {
  console.error('No entries in response')
  console.error(JSON.stringify(parsed, null, 2).slice(0, 500))
  process.exit(1)
}

// ── Step 4: expand chart refs → trend blocks ────────────────────────────────

const { timeline, sources, picked } = buildTimelineWithCharts(
  briefOut.entries,
  snapshot,
  (msg) => console.warn(`  ⚠ ${msg}`),
)

// ── Step 5: write the augmented brief as ContextBrief shape (mobile's type) ─

const brief = {
  id: `dev-demo-${slug}`,
  type: 'edu',
  label: briefOut.label || slug,
  category: meta.category || 'politics',
  articleCount: 1,
  generatedAt: new Date().toISOString(),
  timeline,
  ...(sources.length ? { sources } : {}),
}

mkdirSync(dirname(DEV_DEMO_JSON), { recursive: true })
writeFileSync(DEV_DEMO_JSON, JSON.stringify(brief, null, 2))

// Append to the picks log so multiple dry-runs accumulate for analysis.
try {
  mkdirSync(dirname(PICKS_LOG), { recursive: true })
  appendFileSync(PICKS_LOG, JSON.stringify({
    ts: new Date().toISOString(),
    kind: 'dry-run',
    slug,
    offered: digest?.indicators?.map((i) => i.id) || [],
    picked,
  }) + '\n')
} catch (err) {
  console.warn(`  ⚠ picks log: ${err.message}`)
}

// ── Step 6: summary ─────────────────────────────────────────────────────────

console.log('')
console.log(`Dry-run brief written: ${DEV_DEMO_JSON}`)
console.log(`  label: ${brief.label}`)
console.log(`  entries: ${timeline.length}`)
console.log(`  charts picked: ${picked.length}${picked.length ? ' — ' + picked.map((p) => p.id).join(', ') : ''}`)
console.log(`  sources: ${brief.sources?.length || 0}`)
console.log('')
console.log('Reload the mobile dev app and tap any article → ContextSheet renders this brief.')
