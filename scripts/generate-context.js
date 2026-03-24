#!/usr/bin/env node
// Context brief generator for zuhd.news story threads
// Reads the story ledger, identifies qualifying threads, fetches Wikipedia extracts,
// calls Opus to generate context briefs, and stores them in a separate briefs file.
// Briefs are stored in content/.context-briefs.json (keyed by thread ID) so they
// survive selector ledger rewrites.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { fetchSummary, fetchSummaries, uriToTitle } from './fetch-wikipedia.js'

const ROOT = new URL('..', import.meta.url).pathname
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const BRIEFS_PATH = join(ROOT, 'content', '.context-briefs.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'context-prompt.md')
const MAX_BRIEFS_PER_CYCLE = 3
const STALE_DAYS = 7

if (!existsSync(LEDGER_PATH)) {
  console.log('No story ledger found — skipping context generation.')
  process.exit(0)
}

const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
const briefs = existsSync(BRIEFS_PATH) ? JSON.parse(readFileSync(BRIEFS_PATH, 'utf8')) : {}
const basePrompt = readFileSync(PROMPT_PATH, 'utf8')

// --- Qualification ---
// Check the separate briefs file for existing context, not the ledger
const now = Date.now()
const staleCutoff = now - STALE_DAYS * 24 * 60 * 60 * 1000

const qualifying = ledger.stories
  .filter(s => {
    if ((s.articles || []).length < 3) return false
    if (!['politics', 'economy'].includes(s.category)) return false
    if (!['ongoing', 'developing'].includes(s.arc)) return false
    const existing = briefs[s.id]
    if (existing?.context && existing?.generatedAt && new Date(existing.generatedAt).getTime() > staleCutoff) return false
    return true
  })
  .sort((a, b) => (b.importance || 0) * (b.coverageCount || 0) - (a.importance || 0) * (a.coverageCount || 0))
  .slice(0, MAX_BRIEFS_PER_CYCLE)

if (qualifying.length === 0) {
  console.log('No threads need context briefs this cycle.')
  process.exit(0)
}

console.log(`=== Context generation: ${qualifying.length} thread(s) qualifying ===`)

// --- Helper: call Claude CLI ---
function callClaude(prompt, { maxTurns = 1, effort = 'high', model = 'opus', allowedTools = null } = {}) {
  const env = { ...process.env }
  delete env.CLAUDECODE
  const args = [
    '--model', model,
    '--effort', effort,
    '--no-session-persistence',
    '--max-turns', String(maxTurns),
  ]
  if (allowedTools) args.push('--allowedTools', allowedTools)
  args.push('-p', prompt)
  const result = spawnSync('claude', args, { encoding: 'utf-8', timeout: 300_000, maxBuffer: 2 * 1024 * 1024, env })

  if (result.status !== 0) {
    console.error('Claude CLI error:', result.stderr?.slice(0, 500))
    return null
  }
  return result.stdout?.trim() || null
}

// --- Helper: gather Wikipedia titles for a thread ---
async function gatherWikiTitles(thread) {
  const titles = new Set()

  // From conceptUris if available
  for (const uri of (thread.conceptUris || [])) {
    const title = uriToTitle(uri)
    if (title) titles.add(title)
  }

  // If no conceptUris, derive from thread label and id
  if (titles.size === 0) {
    // Ask Opus to propose initial Wikipedia titles based on thread metadata
    const metaPrompt = `Given this news thread:
- ID: ${thread.id}
- Label: ${thread.label}
- Category: ${thread.category}
- Summary: ${thread.summary || 'N/A'}
- Article count: ${(thread.articles || []).length}

List 5-8 Wikipedia page titles (exact titles as they appear on Wikipedia) that would provide essential background for understanding this story thread. Focus on:
1. Key entities (countries, organizations, people)
2. Key geographic features (straits, regions)
3. Key historical events or conflicts

Output ONLY the titles, one per line, nothing else. Use exact Wikipedia page titles with underscores for spaces.`

    const response = callClaude(metaPrompt, { effort: 'medium', model: 'sonnet' })
    if (response) {
      for (const line of response.split('\n')) {
        const cleaned = line.trim().replace(/^[-•*\d.]+\s*/, '').replace(/\[.*?\]/g, '').trim()
        if (cleaned && cleaned.length > 2 && cleaned.length < 200) {
          titles.add(cleaned.replace(/ /g, '_'))
        }
      }
    }
  }

  return [...titles]
}

// --- Main loop ---
let generated = 0

for (const thread of qualifying) {
  console.log(`\n--- Thread: ${thread.id} (${(thread.articles || []).length} articles, ${thread.arc}) ---`)

  // Step 1: Gather initial Wikipedia titles
  const initialTitles = await gatherWikiTitles(thread)
  console.log(`  Initial titles: ${initialTitles.length}`)

  if (initialTitles.length === 0) {
    console.log('  No Wikipedia titles found — skipping.')
    continue
  }

  // Step 2: Fetch initial Wikipedia summaries
  const initialExtracts = await fetchSummaries(initialTitles)
  console.log(`  Initial extracts: ${initialExtracts.length}`)

  if (initialExtracts.length === 0) {
    console.log('  No Wikipedia content found — skipping.')
    continue
  }

  // Step 3: Ask Opus for additional historical/relationship titles
  const extractsSummary = initialExtracts
    .map(e => `**${e.title}**: ${e.extract}`)
    .join('\n\n')

  const proposalPrompt = `You have these Wikipedia extracts about the news thread "${thread.label}":

${extractsSummary}

Based on these extracts, propose 2-5 additional Wikipedia page titles that would add HISTORICAL DEPTH to a context brief. Focus on:
- Historical events that shaped the current situation (wars, treaties, coups, mandates)
- Proxy conflicts and their history
- Colonial-era agreements that drew borders or created states
- Key massacres, occupations, or resistance movements referenced in the extracts

Output ONLY the Wikipedia page titles, one per line. Use exact Wikipedia titles.`

  const additionalResponse = callClaude(proposalPrompt, { effort: 'medium', model: 'sonnet' })
  let additionalTitles = []
  if (additionalResponse) {
    additionalTitles = additionalResponse.split('\n')
      .map(l => l.trim().replace(/^[-•*\d.]+\s*/, '').replace(/\[.*?\]/g, '').trim())
      .filter(t => t.length > 2 && t.length < 200)
      .map(t => t.replace(/ /g, '_'))
  }
  console.log(`  Additional titles proposed: ${additionalTitles.length}`)

  // Step 4: Fetch additional Wikipedia summaries
  const additionalExtracts = additionalTitles.length > 0
    ? await fetchSummaries(additionalTitles)
    : []
  console.log(`  Additional extracts: ${additionalExtracts.length}`)

  // Step 5: Generate the context brief
  const allExtracts = [...initialExtracts, ...additionalExtracts]
  const allExtractText = allExtracts
    .map(e => `**${e.title}** (${e.description || 'no description'}): ${e.extract}`)
    .join('\n\n')

  const briefPrompt = `${basePrompt}

## Thread metadata

- ID: ${thread.id}
- Label: ${thread.label}
- Category: ${thread.category}
- Arc: ${thread.arc}
- Article count: ${(thread.articles || []).length}
- Summary: ${thread.summary || 'N/A'}

## Wikipedia extracts

${allExtractText}

Now generate the context brief. Output ONLY the brief text, starting with "CONTEXT:" — no commentary, no explanation. If you include a Quranic verse, validate it using the Tarteel MCP tools (ayah_translation and ayah_tafsir) before including it.`

  console.log(`  Generating brief (${allExtracts.length} extracts, ${allExtractText.length} chars)...`)
  const brief = callClaude(briefPrompt, {
    effort: 'high',
    model: 'opus',
    maxTurns: 8,
    allowedTools: 'mcp__tarteel-mcp__ayah_translation,mcp__tarteel-mcp__ayah_tafsir,mcp__tarteel-mcp__list_tafsirs'
  })

  if (!brief) {
    console.log('  Brief generation failed — skipping.')
    continue
  }

  // Clean the output — extract just the CONTEXT block
  const contextStart = brief.indexOf('CONTEXT:')
  const cleanBrief = contextStart >= 0 ? brief.slice(contextStart).trim() : brief.trim()

  // Step 6: Write to briefs file (keyed by thread ID)
  briefs[thread.id] = {
    context: cleanBrief,
    generatedAt: new Date().toISOString(),
    label: thread.label,
    category: thread.category,
    articleCount: (thread.articles || []).length,
  }
  generated++
  console.log(`  Brief generated (${cleanBrief.length} chars)`)
  console.log(`  Preview: ${cleanBrief.slice(0, 150)}...`)
}

// Save briefs file
if (generated > 0) {
  writeFileSync(BRIEFS_PATH, JSON.stringify(briefs, null, 2) + '\n')
  console.log(`\n=== Saved ${generated} new brief(s) — ${Object.keys(briefs).length} total in briefs file ===`)
} else {
  console.log('\n=== No briefs generated this cycle ===')
}
