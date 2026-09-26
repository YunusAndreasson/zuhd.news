#!/usr/bin/env node
// Pre-filter: removes feed stories that match already-published articles.
// Runs after merge-feeds.js, before the selector, so the LLM never wastes
// picks on stories that would be deduped downstream.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { THIN_BODY, isThin, loadDedupContext, wouldDedup } from './lib/dedup.js'

const FEED = '/tmp/zuhd-feed.json'
const SLIM = '/tmp/zuhd-feed-slim.json'

if (!existsSync(FEED)) process.exit(0)

// Experiment 2026-04-19-prefilter-7d: widen prefilter slug/fuzzy window from
// 48h to 7d so the selector stops picking stories that match articles
// published 2-3 days ago (causes post-selection dedup cascade + backfill filler).
const ctx = loadDedupContext(7 * 24 * 3600 * 1000)
// Keys must mirror every `reason` wouldDedup can return, or the tally silently
// becomes NaN and the summary undercounts — `url` was added 2026-08-30.
const counts = { exact: 0, url: 0, eventUri: 0, fuzzy: 0, recap: 0 }

function filterSection(stories) {
  return stories.filter(s => {
    const result = wouldDedup(s, ctx)
    if (result.deduped) {
      counts[result.reason]++
      console.log(`Pre-filtered (${result.reason}): ${s.suggestedSlug || s.title} — matches ${result.match}`)
      return false
    }
    return true
  })
}

const feed = JSON.parse(readFileSync(FEED, 'utf-8'))
feed.multiSourceStories = filterSection(feed.multiSourceStories || [])
feed.nicheStories = filterSection(feed.nicheStories || [])

const total = Object.values(counts).reduce((a, b) => a + b, 0)
writeFileSync(FEED, JSON.stringify(feed, null, 2))

// Also update the slim feed so selector sees the same filtered set
if (existsSync(SLIM)) {
  const slim = JSON.parse(readFileSync(SLIM, 'utf-8'))
  // Keep only stories whose suggestedSlug survived the filter
  const feedSlugs = new Set([...(feed.multiSourceStories || []), ...(feed.nicheStories || [])].map(s => s.suggestedSlug))

  slim.multiSourceStories = (slim.multiSourceStories || []).filter(s => feedSlugs.has(s.suggestedSlug))
  slim.nicheStories = (slim.nicheStories || []).filter(s => feedSlugs.has(s.suggestedSlug))

  // `thin`: no source carries THIN_BODY characters of text — usually an RSS
  // item whose feed gave a teaser and no content. The selector reads a
  // body-less feed, so it could not see this, and picked them: 12 of 60 items
  // on 2026-09-25, and the writer then skipped 1-4 picks a cycle for "no
  // summary provided". enrich-selection.js tries one page fetch for a thin
  // pick; the flag lets the selector weigh the risk before spending a slot.
  const thinSlugs = new Set(
    [...(feed.multiSourceStories || []), ...(feed.nicheStories || [])]
      .filter(isThin)
      .map(s => s.suggestedSlug),
  )
  let thin = 0
  for (const s of [...slim.multiSourceStories, ...slim.nicheStories]) {
    if (thinSlugs.has(s.suggestedSlug)) { s.thin = true; thin++ }
  }
  if (thin > 0) console.log(`Marked ${thin} thin-body stories (<${THIN_BODY} chars of source text)`)
  writeFileSync(SLIM, JSON.stringify(slim, null, 2))
}

if (total > 0) {
  // Rendered from the tally itself, so a new reason can never be filtered but
  // left out of the breakdown — which is how `url` would have gone unreported.
  const breakdown = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(', ')
  console.log(`Pre-filtered: removed ${total} stories (${breakdown})`)
} else {
  console.log('Pre-filter: all feed stories are new')
}
