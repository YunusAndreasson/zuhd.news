#!/usr/bin/env node
// Post-selector: merges full article bodies from /tmp/zuhd-feed.json back into
// /tmp/zuhd-selection.json. The selector reads a slim feed (no bodies) to reduce
// token count; this script restores the bodies so the writer has full source text.
//
// The matching itself lives in scripts/lib/selection-match.js — its five layers,
// and why the last one is deliberately hard to satisfy, are documented there.
import { readFileSync, writeFileSync } from 'node:fs'
import { runWithConcurrency } from './lib/concurrency.js'
import { titleWords } from './lib/dedup.js'
import { fetchSourceText } from './lib/fetch-source-text.js'
import { createMatcher } from './lib/selection-match.js'

const feed = JSON.parse(readFileSync('/tmp/zuhd-feed.json', 'utf-8'))
const selection = JSON.parse(readFileSync('/tmp/zuhd-selection.json', 'utf-8'))
const allStories = [...(feed.multiSourceStories || []), ...(feed.nicheStories || [])]

const match = createMatcher(allStories)

// URL → the feed's copy of a source, bodies included, from every story.
const feedSourceByUrl = new Map()
for (const story of allStories) {
  for (const src of story.sources || []) {
    if (src?.url && !feedSourceByUrl.has(src.url)) feedSourceByUrl.set(src.url, src)
  }
}

/**
 * The matched story's sources, **plus** any the selector added.
 *
 * This used to be `entry.sources = hit.story.sources`, which threw away every
 * source the selector merged in — and `select-prompt.md` tells it to merge a
 * regional outlet into OIC-region stories from elsewhere in the feed. The
 * added source keeps whatever the feed holds for its URL (body, image); one
 * the feed has no copy of is dropped, since the writer cannot cite text it
 * was never given.
 */
function unionSources(feedSources, selectorSources, byUrl) {
  const out = [...feedSources]
  const seen = new Set(out.map((s) => s.url).filter(Boolean))
  for (const s of selectorSources || []) {
    if (!s?.url || seen.has(s.url)) continue
    const fromFeed = byUrl.get(s.url)
    if (!fromFeed?.body) continue
    out.push({ ...s, ...fromFeed })
    seen.add(s.url)
  }
  return out
}

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
    const added = unionSources(hit.story.sources, entry.sources, feedSourceByUrl)
    if (added.length > hit.story.sources.length) {
      console.error(`  + kept ${added.length - hit.story.sources.length} selector-merged source(s) on "${entry.title}"`)
    }
    entry.sources = added
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

// Thin picks: a source whose body is a feed teaser gets one page fetch — free,
// the same Readability extractor the angles stage uses. Before this the writer
// was handed "No summary provided" and skipped the story (1-4 a cycle).
const THIN_BODY = 400
const thinSources = selection.flatMap(e => (e.sources || []).filter(s => s?.url && (s.body || '').length < THIN_BODY))
if (thinSources.length > 0) {
  let filled = 0
  await runWithConcurrency(thinSources, 4, async src => {
    const text = await fetchSourceText(src.url)
    if (text && text.length > (src.body || '').length) {
      src.body = text
      filled++
    }
  })
  console.log(`Thin sources: fetched full text for ${filled}/${thinSources.length}`)
}

// Source text that is not about the story. The selector reads a body-less feed,
// so it cannot see that an item's only "body" is the wrong page — on
// 2026-09-25 22:04 the Dutch-government/NixOS pick carried a community group's
// mission blurb that never mentions NixOS, and the writer spent the slot
// finding that out. Measured on that selection: the bad pick matched 1 of 7
// title words; every good one matched 57% or more. Dropped here, before
// dedup, so backfill can refill the slot.
const RELEVANCE_MIN_HITS = 2
const RELEVANCE_MIN_RATIO = 0.3
for (const entry of selection) {
  if (!Array.isArray(entry.sources) || entry.sources.length === 0) continue
  const words = [...titleWords(entry.title)]
  if (words.length < 3) continue
  const text = entry.sources.map(s => (s.body || '').toLowerCase()).join(' ')
  const hits = words.filter(w => text.includes(w)).length
  if (hits < RELEVANCE_MIN_HITS || hits / words.length < RELEVANCE_MIN_RATIO) {
    console.log(`Dropped "${entry.title}": its source text matches ${hits}/${words.length} title words — not about this story`)
    entry.sources = []
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
