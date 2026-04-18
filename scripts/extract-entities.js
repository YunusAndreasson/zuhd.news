#!/usr/bin/env node
// Entity extraction stage.
//
// Scans each new article's body for known rich-noun mentions (commodities,
// currencies, chokepoints, crypto, indices) and writes their positions into
// the article's frontmatter. Mobile renders these as tappable runs that
// open an EntitySheet with the matching indicator chart + back-references.
//
// v1: deterministic static-rule matching only. Zero LLM calls. Fast, cheap,
// predictable. Ambiguous mentions (rupee, peso, pound) are skipped; a Haiku
// disambiguation pass lands in a later revision.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { parseFrontmatter } from './lib/frontmatter.js'
import { ENTITY_RULES_SORTED, mentionToRegex } from './lib/entity-registry.js'

const ROOT = new URL('..', import.meta.url).pathname
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'

if (!existsSync(NEW_ARTICLES_PATH)) {
  console.log('No new articles list found — skipping entity extraction.')
  process.exit(0)
}

const newFiles = readFileSync(NEW_ARTICLES_PATH, 'utf8').trim().split('\n').filter(Boolean)
if (newFiles.length === 0) {
  console.log('No new articles — skipping entity extraction.')
  process.exit(0)
}

/**
 * Scan one article's body for entity mentions. Returns an array of
 * { mention, indicatorId, kind } — no character spans for v1; mobile will
 * regex-match the mention string against the plain body at render time
 * (robust against whitespace or minor body edits post-extraction).
 */
function extractEntities(body) {
  if (!body || typeof body !== 'string') return []
  const found = new Map() // key: indicatorId, value: { mention, indicatorId, kind }

  for (const rule of ENTITY_RULES_SORTED) {
    if (rule.ambiguous) continue // skip — needs Haiku pass (not yet implemented)
    const re = mentionToRegex(rule.mention)
    const match = re.exec(body)
    if (!match) continue
    // Dedupe by indicatorId — keep the first rule that fires for a given
    // indicator. Multiple aliases ("BTC" + "Bitcoin") collapse to one entry.
    if (!found.has(rule.indicatorId)) {
      found.set(rule.indicatorId, {
        mention: match[0],  // the actual matched form in the body (preserves case)
        indicatorId: rule.indicatorId,
        kind: rule.kind,
      })
    }
  }
  return [...found.values()]
}

/**
 * Insert/replace the `entities:` block in a YAML frontmatter string.
 * Line-based pass: drop any existing `entities:` + its indented children,
 * then append the fresh block. Robust to whether entities was the last key
 * in the frontmatter (where regex lookaheads misbehave).
 */
function writeEntitiesToFrontmatter(raw, entities) {
  const yamlBlock = entities.length > 0
    ? 'entities:\n' + entities.map(e =>
        `  - mention: "${e.mention.replace(/"/g, '\\"')}"\n    indicatorId: "${e.indicatorId}"\n    kind: "${e.kind}"`
      ).join('\n')
    : 'entities: []'

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return raw
  const fm = fmMatch[1]
  const rest = raw.slice(fmMatch[0].length)

  // Strip any existing entities block: drop "entities:" line + all following
  // lines that start with whitespace (its children) until a non-indented
  // line (next top-level key) or EOF.
  const lines = fm.split('\n')
  const stripped = []
  let skipping = false
  for (const line of lines) {
    if (skipping) {
      if (line.length === 0 || /^\s/.test(line)) continue // still inside block
      skipping = false
    }
    if (/^entities:/.test(line)) {
      skipping = true
      continue
    }
    stripped.push(line)
  }

  const updatedFm = stripped.join('\n').trimEnd() + '\n' + yamlBlock
  return `---\n${updatedFm}\n---\n${rest}`
}

// --- Main loop ---
const t0 = Date.now()
let processed = 0
let totalEntities = 0
const kindCounts = {}

for (const rel of newFiles) {
  const filename = basename(rel)
  if (!filename.endsWith('.md')) continue
  const fullPath = join(ROOT, rel)
  if (!existsSync(fullPath)) continue

  const raw = readFileSync(fullPath, 'utf8')
  const { body } = parseFrontmatter(raw)
  const entities = extractEntities(body)

  // Always write, even if empty — ensures the frontmatter shape is stable
  // and mobile's validator can count on the field being present.
  const updated = writeEntitiesToFrontmatter(raw, entities)
  if (updated !== raw) {
    writeFileSync(fullPath, updated)
  }

  processed++
  totalEntities += entities.length
  for (const e of entities) {
    kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1
  }

  if (entities.length > 0) {
    const summary = entities.map(e => `${e.mention}→${e.indicatorId}`).join(', ')
    console.log(`  ${basename(rel, '.md').slice(0, 60)}: ${entities.length} (${summary})`)
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const kindSummary = Object.entries(kindCounts).map(([k, n]) => `${k}=${n}`).join(' ')
console.log(`Entities: ${totalEntities} extracted across ${processed} articles in ${elapsed}s [${kindSummary || 'none'}]`)
