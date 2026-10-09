#!/usr/bin/env node
// Pre-filter: removes feed stories that match already-published articles.
// Runs after merge-feeds.js, before the selector, so the LLM never wastes
// picks on stories that would be deduped downstream. What is removed and what
// is marked thin is `lib/prefilter.js`.
import { existsSync, readFileSync } from 'node:fs'
import { pathOf } from './lib/datasets.js'
import { PREFILTER_WINDOW_MS, THIN_BODY, loadDedupContext } from './lib/dedup.js'
import { writeJson } from './lib/json-file.js'
import { prefilterFeed, reasonCounts } from './lib/prefilter.js'
import { runStage } from './lib/stage.js'

export function main() {
  const FEED = pathOf('feed')
  const SLIM = pathOf('feedSlim')
  if (!existsSync(FEED)) return { skipped: 'no feed' }

  // Seven days, where the selection's own dedup has 48 hours
  // (`PREFILTER_WINDOW_MS`, with the experiment that set it). That is the reach
  // of the slug layer. The event layer sees an event for the six cycles its
  // ledger entry lives, about 28 hours, whatever window it is given.
  const ctx = loadDedupContext(PREFILTER_WINDOW_MS)

  const { feed, slim, removed, thin } = prefilterFeed(
    JSON.parse(readFileSync(FEED, 'utf-8')),
    existsSync(SLIM) ? JSON.parse(readFileSync(SLIM, 'utf-8')) : null,
    ctx,
  )
  for (const r of removed) console.log(`Pre-filtered (${r.reason}): ${r.slug} — matches ${r.match}`)
  writeJson(FEED, feed)
  if (slim) {
    if (thin > 0) console.log(`Marked ${thin} thin-body stories (<${THIN_BODY} chars of source text)`)
    writeJson(SLIM, slim)
  }

  const counts = reasonCounts(removed)
  if (removed.length > 0) {
    // Rendered from the tally itself, and the tally counts a reason it was not
    // told of (`reasonCounts`): a layer added to `wouldDedup` is in the
    // breakdown without this file being edited.
    const breakdown = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(', ')
    console.log(`Pre-filtered: removed ${removed.length} stories (${breakdown})`)
  } else {
    console.log('Pre-filter: all feed stories are new')
  }
  return {
    counts: { ...counts, removed: removed.length, thin, kept: feed.multiSourceStories.length + feed.nicheStories.length },
    dropped: removed.map((r) => ({ slug: r.slug, reason: `${r.reason}: ${r.match}` })),
  }
}

await runStage(import.meta, 'prefilter-feed', main)
