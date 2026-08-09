#!/usr/bin/env node
// Removes entries from /tmp/zuhd-selection.json whose article already exists.
// Runs between selector and writer to avoid wasting LLM turns on duplicates.
//
// Four dedup layers (via shared lib/dedup.js):
// 1. Exact slug match — article file already exists
// 2. eventUri match — same event already covered by a published article
// 3. Fuzzy slug match — word overlap ≥ 55% against a recently *published* article
// 4. Intra-batch fuzzy match — the same, against other stories in *this* selection
//
// Layer 4 exists because layers 1-3 only ever check against
// content/articles/*.md, which is empty for anything still in this selection —
// so two picks describing the same event (corpus.test.js's same-day ratchet:
// skyroot-vikram-1-india-first-private-orbital-launch /
// skyroot-vikram-1-india-private-orbital-rocket, both 2026-07-18, 83% overlap)
// sailed through as two "new" stories and both got written.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { CATEGORY_FLOORS, buildWordSets, fuzzyMatch, loadDedupContext, wouldDedup } from './lib/dedup.js'

const SELECTION = '/tmp/zuhd-selection.json'
if (!existsSync(SELECTION)) process.exit(0)

const selection = JSON.parse(readFileSync(SELECTION, 'utf-8'))
const before = selection.length

const ctx = loadDedupContext()
const batchWordSets = []

const filtered = selection.filter(s => {
  const result = wouldDedup(s, ctx)
  if (result.deduped) {
    console.log(`Removed (${result.reason}): ${s.suggestedSlug} — matches ${result.match}`)
    return false
  }
  const batchMatch = fuzzyMatch(s.suggestedSlug, batchWordSets)
  if (batchMatch) {
    console.log(`Removed (intra-batch): ${s.suggestedSlug} — matches ${batchMatch}`)
    return false
  }
  batchWordSets.push(...buildWordSets([s.suggestedSlug]))
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
