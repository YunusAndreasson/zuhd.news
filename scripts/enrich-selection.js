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

// Unmatched entries are DROPPED, not passed through sourceless. The header's
// claim that "a miss is honest — the writer skips the slot" was not enforced
// anywhere: run-cycle.sh hands this file straight to the writer, write-prompt.md
// has no rule for an empty `sources`, and validate-articles.js only checks that
// the *output* carries a sources block — an invented one passes. On 2026-08-30
// the writer did skip them and said so, but that was its judgement, not a
// guarantee, and the tightened matcher deliberately produces more misses.
const enrichedSelection = selection.filter(e => Array.isArray(e.sources) && e.sources.length > 0)
const dropped = selection.length - enrichedSelection.length

writeFileSync('/tmp/zuhd-selection.json', JSON.stringify(enrichedSelection, null, 2))
const layerSummary = Object.entries(matchLayers).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(' ')
console.log(`Enriched ${enriched}/${selection.length} stories [${layerSummary}]` +
  (missing ? ` (${missing} not found: ${missingEntries.join(', ')})` : ''))
if (dropped > 0) {
  console.log(`Dropped ${dropped} sourceless entr${dropped === 1 ? 'y' : 'ies'} — the writer is never handed a story with no source text`)
}
