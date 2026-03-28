#!/usr/bin/env node
// Post-selector: merges full article bodies from /tmp/zuhd-feed.json back into
// /tmp/zuhd-selection.json. The selector reads a slim feed (no bodies) to reduce
// token count; this script restores the bodies so the writer has full source text.
//
// Matching strategy (in order):
// 1. Exact link match
// 2. suggestedSlug match
// 3. Source URL overlap — the selector sometimes uses a source URL instead of
//    the feed entry's primary link
// 4. Title fingerprint match
import { readFileSync, writeFileSync } from 'fs'

const feed = JSON.parse(readFileSync('/tmp/zuhd-feed.json', 'utf-8'))
const selection = JSON.parse(readFileSync('/tmp/zuhd-selection.json', 'utf-8'))
const allStories = [...(feed.multiSourceStories || []), ...(feed.nicheStories || [])]

// Build lookups
const byLink = new Map()
const bySlug = new Map()
const bySourceUrl = new Map()
const byFingerprint = new Map()

function fingerprint(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)
}

for (const s of allStories) {
  byLink.set(s.link, s)
  if (s.suggestedSlug) bySlug.set(s.suggestedSlug, s)
  byFingerprint.set(fingerprint(s.title), s)
  for (const src of s.sources || []) {
    if (src.url) bySourceUrl.set(src.url, s)
  }
}

let enriched = 0
let missing = 0
const missingEntries = []

for (const entry of selection) {
  let full =
    byLink.get(entry.link) ||
    bySlug.get(entry.suggestedSlug) ||
    bySourceUrl.get(entry.link) ||
    byFingerprint.get(fingerprint(entry.title))

  // Fallback: keyword overlap across title + description + concepts (handles paraphrased titles)
  if (!full) {
    const entryText = [entry.title, entry.suggestedSlug?.replace(/-/g, ' ')].filter(Boolean).join(' ')
    const entryWords = new Set(entryText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3))
    let bestOverlap = 0, bestMatch = null
    for (const s of allStories) {
      const feedText = [s.title, s.description, ...(s.concepts || []).map(c => typeof c === 'string' ? c : c.label)].filter(Boolean).join(' ')
      const feedWords = feedText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
      const overlap = feedWords.filter(w => entryWords.has(w)).length
      if (overlap >= 3 && overlap > bestOverlap) {
        bestOverlap = overlap
        bestMatch = s
      }
    }
    if (bestMatch) full = bestMatch
  }

  if (full && full.sources) {
    entry.sources = full.sources
    enriched++
  } else {
    missing++
    missingEntries.push(entry.suggestedSlug || entry.title)
  }
}

writeFileSync('/tmp/zuhd-selection.json', JSON.stringify(selection, null, 2))
console.log(`Enriched ${enriched}/${selection.length} stories with full bodies` +
  (missing ? ` (${missing} not found in feed: ${missingEntries.join(', ')})` : ''))
