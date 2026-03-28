#!/usr/bin/env node
// Post-selector: updates content/.story-ledger.json deterministically.
// Replaces the LLM-driven ledger update that was previously part of the selector session.
//
// Rules (matching the original selector prompt):
// - Match selection entries to existing ledger stories by eventUri, then by slug prefix
// - Advance arc: breaking→developing (2+ cycles), developing→ongoing (5+ cycles)
// - Decay importance by 1 for uncovered stories each cycle
// - Remove entries at importance 0
// - Add new entries for selected stories not in ledger
// - Keep 15-30 active entries
// - Collect conceptUris from selection concepts
import { readFileSync, writeFileSync, existsSync } from 'fs'

const LEDGER_PATH = 'content/.story-ledger.json'
const SELECTION_PATH = '/tmp/zuhd-selection.json'

// Load existing ledger
let ledger = { version: 1, stories: [] }
if (existsSync(LEDGER_PATH)) {
  try { ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf-8')) } catch {}
}

// Load selection
let selection = []
try { selection = JSON.parse(readFileSync(SELECTION_PATH, 'utf-8')) } catch { process.exit(0) }
if (!Array.isArray(selection) || selection.length === 0) process.exit(0)

const now = new Date().toISOString()
const coveredIds = new Set()
const changes = []

// Build eventUri→story index for matching
const byEventUri = new Map()
const bySlugPrefix = new Map()
for (const story of ledger.stories) {
  if (story.eventUri) byEventUri.set(story.eventUri, story)
  bySlugPrefix.set(story.id, story)
}

for (const entry of selection) {
  const slug = entry.suggestedSlug || ''
  // Try to match to existing ledger entry
  let match = null
  if (entry.eventUri && byEventUri.has(entry.eventUri)) {
    match = byEventUri.get(entry.eventUri)
  }
  if (!match) {
    // Try slug-prefix matching (first few words)
    for (const [id, story] of bySlugPrefix) {
      // Match if the slug shares significant overlap with an existing entry
      const entryWords = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').split('-')
      const idWords = id.split('-')
      const overlap = entryWords.filter(w => idWords.includes(w)).length
      if (overlap >= 3 && overlap >= idWords.length * 0.5) {
        match = story
        break
      }
    }
  }

  if (match) {
    // Update existing entry
    match.lastCovered = now
    match.coverageCount = (match.coverageCount || 0) + 1
    if (!match.articles) match.articles = []
    if (slug && !match.articles.includes(slug)) match.articles.push(slug)
    // Advance arc based on coverage count
    if (match.coverageCount >= 5 && match.arc !== 'ongoing') {
      match.arc = 'ongoing'
    } else if (match.coverageCount >= 2 && match.arc === 'breaking') {
      match.arc = 'developing'
    }
    // Collect conceptUris
    const concepts = entry.concepts || []
    const uris = concepts
      .filter(c => typeof c === 'object' && c.uri)
      .map(c => c.uri)
    if (uris.length > 0) {
      if (!match.conceptUris) match.conceptUris = []
      for (const uri of uris) {
        if (!match.conceptUris.includes(uri)) match.conceptUris.push(uri)
      }
      match.conceptUris = match.conceptUris.slice(0, 10)
    }
    coveredIds.add(match.id)
    changes.push(`Updated: ${match.id} → coverage ${match.coverageCount}, arc ${match.arc}`)
  } else {
    // New entry
    const id = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '')
    const concepts = entry.concepts || []
    const uris = concepts
      .filter(c => typeof c === 'object' && c.uri)
      .map(c => c.uri)
      .slice(0, 10)
    const newStory = {
      id,
      label: entry.title || '',
      firstSeen: now,
      lastCovered: now,
      coverageCount: 1,
      category: entry.category || 'politics',
      importance: 6,
      arc: 'breaking',
      articles: slug ? [slug] : [],
      eventUri: entry.eventUri || null,
      summary: entry.angle || '',
      conceptUris: uris,
    }
    ledger.stories.push(newStory)
    coveredIds.add(id)
    bySlugPrefix.set(id, newStory)
    changes.push(`New: ${id}`)
  }
}

// Decay importance for uncovered stories
let decayed = 0
for (const story of ledger.stories) {
  if (!coveredIds.has(story.id)) {
    story.importance = Math.max(0, (story.importance || 1) - 1)
    decayed++
  }
}
if (decayed > 0) changes.push(`Decayed importance for ${decayed} uncovered stories`)

// Remove entries at importance 0
const before = ledger.stories.length
ledger.stories = ledger.stories.filter(s => s.importance > 0)
const removed = before - ledger.stories.length
if (removed > 0) changes.push(`Removed ${removed} entries at importance 0`)

// Sort by importance desc, then lastCovered desc
ledger.stories.sort((a, b) => (b.importance - a.importance) || (b.lastCovered || '').localeCompare(a.lastCovered || ''))

writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n')
console.log(`Story ledger: ${ledger.stories.length} entries`)
for (const c of changes) console.log(`  ${c}`)
