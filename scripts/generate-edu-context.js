#!/usr/bin/env node
// Educational context generator for zuhd.news
// Reads this cycle's new articles, identifies candidates for educational context,
// calls Opus to select 2-4 and generate explainer briefs, saves to .context-briefs.json.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import { parseFrontmatter } from './lib/frontmatter.js'

const ROOT = new URL('..', import.meta.url).pathname
const BRIEFS_PATH = join(ROOT, 'content', '.context-briefs.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'edu-context-prompt.md')
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'
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
  const { meta } = parseFrontmatter(raw)
  const concepts = Array.isArray(meta.concepts)
    ? meta.concepts.map(c => typeof c === 'object' ? c.label : c)
    : []

  candidates.push({
    slug,
    title: meta.title || slug,
    category: meta.category || 'politics',
    concepts,
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
  for (const [slug, brief] of Object.entries(briefs)) {
    if (!brief.timeline?.length) continue
    // Infer concepts from the brief's label and headings
    const briefConcepts = []
    if (brief.label) briefConcepts.push(brief.label.toLowerCase())
    // Also match candidate concepts against entry bodies (fuzzy)
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

// --- Build prompt ---
const candidateList = candidates.map(c =>
  `- slug: ${c.slug}\n  title: ${c.title}\n  category: ${c.category}\n  concepts: ${c.concepts.join(', ') || 'none'}`
).join('\n')

const fullPrompt = `${basePrompt}
${conceptLibrary}
## Candidate articles

${candidateList}

Generate educational context briefs for ALL ${candidates.length} articles. Output ONLY the JSON object — no markdown fences, no commentary.`

// --- Call Claude ---
console.log(`  Calling Opus (${candidates.length} candidates)...`)

const env = { ...process.env }
delete env.CLAUDECODE
const args = [
  '--model', 'claude-opus-4-7',
  '--effort', 'medium',
  '--no-session-persistence',
  '--max-turns', '3',
  '--output-format', 'json',
  '-p', fullPrompt,
]
const result = spawnSync('claude', args, {
  encoding: 'utf-8',
  timeout: 300_000,
  maxBuffer: 2 * 1024 * 1024,
  env,
})

if (result.status !== 0) {
  console.error('Claude CLI error:', result.stderr?.slice(0, 500))
  process.exit(1)
}

const raw = result.stdout?.trim()
if (!raw) {
  console.log('  Empty response — skipping.')
  process.exit(0)
}

// --- Parse JSON (--output-format json returns {type:"result", result:"..."} envelope) ---
let parsed
try {
  const outer = JSON.parse(raw)
  if (outer.type === 'result') {
    // Envelope — extract inner result
    if (outer.result == null) throw new Error('Claude returned no text result (tool use may have exhausted max-turns)')
    const text = String(outer.result)
    try {
      parsed = JSON.parse(text)
    } catch {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No JSON object found in result')
      parsed = JSON.parse(text.slice(start, end + 1))
    }
  } else {
    // No envelope — raw output is the parsed data
    parsed = outer
  }
} catch (e) {
  console.log(`  Failed to parse JSON: ${e.message}`)
  console.log(`  Raw output (first 300 chars): ${raw.slice(0, 300)}`)
  process.exit(1)
}

// --- Validate and save ---
const validSlugs = new Set(candidates.map(c => c.slug))
let generated = 0

for (const [slug, data] of Object.entries(parsed)) {
  if (!validSlugs.has(slug)) {
    console.log(`  Skipping unknown slug: ${slug}`)
    continue
  }
  if (generated >= MAX_BRIEFS_PER_CYCLE) break

  const entries = data.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    console.log(`  Skipping ${slug}: no valid entries`)
    continue
  }

  // Validate entries — each must have body
  const validEntries = entries.filter(e => e.body && typeof e.body === 'string')
  if (validEntries.length === 0) continue

  briefs[slug] = {
    type: 'edu',
    timeline: validEntries.map(e => ({
      ...(e.heading ? { heading: e.heading } : {}),
      body: e.body,
    })),
    generatedAt: new Date().toISOString(),
    label: data.label || slug,
    category: candidates.find(c => c.slug === slug)?.category || 'politics',
    articleCount: 1,
  }
  generated++
  const headings = validEntries.filter(e => e.heading).length
  console.log(`  Brief: ${slug} (${validEntries.length} entries, ${headings} headings)`)
}

if (generated > 0) {
  writeFileSync(BRIEFS_PATH, JSON.stringify(briefs, null, 2) + '\n')
  console.log(`\n=== Saved ${generated} edu brief(s) — ${Object.keys(briefs).length} total in briefs file ===`)
} else {
  console.log('\n=== No edu briefs generated this cycle ===')
}
