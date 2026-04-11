#!/usr/bin/env node
// Removes entries from /tmp/zuhd-selection.json whose article already exists.
// Runs between selector and writer to avoid wasting LLM turns on duplicates.
//
// Three dedup layers (via shared lib/dedup.js):
// 1. Exact slug match — article file already exists
// 2. eventUri match — same event already covered by a published article
// 3. Fuzzy title match — title word overlap ≥ 60% with a recent article's slug
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { CATEGORY_FLOORS, loadDedupContext, wouldDedup } from './lib/dedup.js'

const SELECTION = '/tmp/zuhd-selection.json'
if (!existsSync(SELECTION)) process.exit(0)

const selection = JSON.parse(readFileSync(SELECTION, 'utf-8'))
const before = selection.length

const ctx = loadDedupContext()

const filtered = selection.filter(s => {
  const result = wouldDedup(s, ctx)
  if (result.deduped) {
    console.log(`Removed (${result.reason}): ${s.suggestedSlug} — matches ${result.match}`)
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

// Post-dedup category floor check — warn if dedup broke a minimum
const catCounts = {}
for (const s of filtered) catCounts[s.category] = (catCounts[s.category] || 0) + 1
for (const [cat, min] of Object.entries(CATEGORY_FLOORS)) {
  if ((catCounts[cat] || 0) < min) {
    console.log(`WARNING: post-dedup floor violation — ${cat}: ${catCounts[cat] || 0} < ${min}`)
  }
}
