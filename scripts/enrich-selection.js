#!/usr/bin/env node
// Post-selector: merges full article bodies from /tmp/zuhd-feed.json back into
// /tmp/zuhd-selection.json. The selector reads a slim feed (no bodies) to reduce
// token count; this script restores the bodies so the writer has full source text.
//
// The matching itself lives in scripts/lib/selection-match.js — its five layers,
// and why the last one is deliberately hard to satisfy, are documented there.
import { readFileSync, writeFileSync } from 'node:fs'
import { createMatcher } from './lib/selection-match.js'

const feed = JSON.parse(readFileSync('/tmp/zuhd-feed.json', 'utf-8'))
const selection = JSON.parse(readFileSync('/tmp/zuhd-selection.json', 'utf-8'))
const allStories = [...(feed.multiSourceStories || []), ...(feed.nicheStories || [])]

const match = createMatcher(allStories)

let enriched = 0
let missing = 0
const missingEntries = []
const matchLayers = { link: 0, slug: 0, sourceUrl: 0, fingerprint: 0, keyword: 0 }

for (const entry of selection) {
  const hit = match(entry)

  if (hit?.rejected) {
    console.error(`  ⚠ keyword candidate rejected (${hit.rejected}): "${entry.title}" → "${hit.candidate.title}"`)
  }

  if (hit?.story?.sources) {
    entry.sources = hit.story.sources
    enriched++
    matchLayers[hit.layer]++
    if (hit.layer === 'keyword') {
      console.error(`  ⚠ KEYWORD fallback: "${entry.title}" → "${hit.story.title}" (${hit.detail})`)
    }
  } else {
    missing++
    missingEntries.push(entry.suggestedSlug || entry.title)
  }
}

writeFileSync('/tmp/zuhd-selection.json', JSON.stringify(selection, null, 2))
const layerSummary = Object.entries(matchLayers).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(' ')
console.log(`Enriched ${enriched}/${selection.length} stories [${layerSummary}]` +
  (missing ? ` (${missing} not found: ${missingEntries.join(', ')})` : ''))
