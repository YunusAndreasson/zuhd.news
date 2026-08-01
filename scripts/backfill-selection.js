#!/usr/bin/env node
// Post-dedup backfill: when dedup drops stories below category floors,
// picks the best available replacement from the feed.
// Runs after dedup-selection.js, before update-ledger.js.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { CATEGORY_FLOORS, loadDedupContext, wouldDedup } from './lib/dedup.js'
import { fingerprint } from './lib/utils.js'

const SELECTION = '/tmp/zuhd-selection.json'
const FEED = '/tmp/zuhd-feed.json'

if (!existsSync(SELECTION) || !existsSync(FEED)) process.exit(0)

const selection = JSON.parse(readFileSync(SELECTION, 'utf-8'))
const feed = JSON.parse(readFileSync(FEED, 'utf-8'))
const ctx = loadDedupContext()

// Count current categories
const catCounts = {}
for (const s of selection) catCounts[s.category] = (catCounts[s.category] || 0) + 1

// Find deficit categories
const deficits = {}
for (const [cat, floor] of Object.entries(CATEGORY_FLOORS)) {
  const deficit = floor - (catCounts[cat] || 0)
  if (deficit > 0) deficits[cat] = deficit
}

if (Object.keys(deficits).length === 0) {
  console.log('Backfill: all category floors met')
  process.exit(0)
}

// Build set of already-selected fingerprints to avoid duplicates
const selectedFps = new Set(selection.map(s => fingerprint(s.title)))
const selectedSlugs = new Set(selection.map(s => s.suggestedSlug))

// Pool all feed stories, prefer multi-source
const candidates = [
  ...(feed.multiSourceStories || []).map(s => ({ ...s, _rank: 2 })),
  ...(feed.nicheStories || []).map(s => ({ ...s, _rank: 1 })),
]

const added = []
for (const [cat, needed] of Object.entries(deficits)) {
  // Filter to this category, not already selected, not dedup-match, has body content
  const viable = candidates
    .filter(s => s.category === cat)
    .filter(s => !selectedFps.has(fingerprint(s.title)))
    .filter(s => !selectedSlugs.has(s.suggestedSlug))
    .filter(s => !wouldDedup(s, ctx).deduped)
    .filter(s => {
      // Must have usable body content in at least one source
      const bodies = (s.sources || []).map(src => src.body || '').filter(b => b.length > 100)
      return bodies.length > 0
    })
    .sort((a, b) => {
      // Prefer multi-source, then higher coverage
      if (a._rank !== b._rank) return b._rank - a._rank
      return (b.eventCoverage || 0) - (a.eventCoverage || 0)
    })

  for (let i = 0; i < needed && i < viable.length; i++) {
    const pick = viable[i]
    delete pick._rank
    pick.angle = `[Auto-backfill for ${cat} floor] ${pick.description || pick.title}`
    selection.push(pick)
    selectedFps.add(fingerprint(pick.title))
    selectedSlugs.add(pick.suggestedSlug)
    added.push(`${cat}: ${pick.suggestedSlug || pick.title}`)
  }
}

if (added.length > 0) {
  writeFileSync(SELECTION, JSON.stringify(selection, null, 2))
  console.log(`Backfill: added ${added.length} stories to meet category floors`)
  for (const a of added) console.log(`  + ${a}`)
} else {
  console.log('Backfill: no viable candidates found for deficit categories')
}
