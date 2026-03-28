#!/usr/bin/env node
// Removes entries from /tmp/zuhd-selection.json whose article already exists.
// Runs between selector and writer to avoid wasting LLM turns on duplicates.
//
// Three dedup layers:
// 1. Exact slug match — article file already exists
// 2. eventUri match — same event already covered by a published article
// 3. Fuzzy title match — title word overlap ≥ 60% with a recent article's slug
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const SELECTION = '/tmp/zuhd-selection.json'
if (!existsSync(SELECTION)) process.exit(0)

const selection = JSON.parse(readFileSync(SELECTION, 'utf-8'))
const before = selection.length

// Load published slugs from last 48 hours (by mtime)
const cutoff = Date.now() - 48 * 60 * 60 * 1000
let recentSlugs = []
try {
  const { statSync } = await import('fs')
  recentSlugs = readdirSync('content/articles')
    .filter(f => f.endsWith('.md') && statSync(join('content/articles', f)).mtimeMs >= cutoff)
    .map(f => f.replace('.md', ''))
} catch {}

// Load eventUris from story ledger for eventUri-based dedup
const ledgerEventUris = new Map() // eventUri → [article slugs]
try {
  const ledger = JSON.parse(readFileSync('content/.story-ledger.json', 'utf-8'))
  for (const story of ledger.stories || []) {
    if (story.eventUri && story.articles?.length > 0) {
      ledgerEventUris.set(story.eventUri, story.articles)
    }
  }
} catch {}

// Word set from a slug (strip date prefix)
function slugWords(slug) {
  return new Set(slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').split('-').filter(w => w.length > 2))
}

// Precompute word sets for recent articles
const recentWordSets = recentSlugs.map(s => ({ slug: s, words: slugWords(s) }))

function fuzzyMatch(candidateSlug) {
  const candidateWords = slugWords(candidateSlug)
  if (candidateWords.size === 0) return null
  for (const { slug, words } of recentWordSets) {
    const overlap = [...candidateWords].filter(w => words.has(w)).length
    const ratio = overlap / Math.min(candidateWords.size, words.size)
    if (ratio >= 0.6 && overlap >= 3) return slug
  }
  return null
}

const filtered = selection.filter(s => {
  // Layer 1: exact slug match
  const path = join('content/articles', s.suggestedSlug + '.md')
  if (existsSync(path)) {
    console.log(`Removed (exact slug): ${s.suggestedSlug}`)
    return false
  }

  // Layer 2: eventUri match — same event already has published articles
  if (s.eventUri && ledgerEventUris.has(s.eventUri)) {
    const existing = ledgerEventUris.get(s.eventUri)
    // Only dedup if one of the existing articles is recent (last 48h)
    const hasRecent = existing.some(a => recentSlugs.some(r => r === a || r.endsWith(a)))
    if (hasRecent) {
      console.log(`Removed (eventUri ${s.eventUri}): ${s.suggestedSlug} — already covered by ${existing[existing.length - 1]}`)
      return false
    }
  }

  // Layer 3: fuzzy title/slug match
  const match = fuzzyMatch(s.suggestedSlug)
  if (match) {
    console.log(`Removed (fuzzy match): ${s.suggestedSlug} ≈ ${match}`)
    return false
  }

  return true
})

if (filtered.length < before) {
  writeFileSync(SELECTION, JSON.stringify(filtered, null, 2))
  console.log(`Deduped selection: ${before} → ${filtered.length} (${before - filtered.length} duplicates removed)`)
} else {
  console.log(`Dedup check: all ${before} stories are new`)
}
