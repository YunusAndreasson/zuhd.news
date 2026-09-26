#!/usr/bin/env node
// Merges API feed (/tmp/zuhd-feed-api.json) and RSS feed (/tmp/zuhd-feed-rss.json)
// into a single /tmp/zuhd-feed.json. Deduplicates by title fingerprint.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { MAX_FEED_AGE_MS, isFreshFeedItem } from './lib/feed-age.js'
import { fingerprint } from './lib/utils.js'

function loadFeed(path) {
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return data.stories || []
  } catch { return [] }
}

const api = loadFeed('/tmp/zuhd-feed-api.json')
const rss = loadFeed('/tmp/zuhd-feed-rss.json')

// Deduplicate: API stories take priority (multi-source)
const seen = new Set()
const stories = []

for (const s of api) {
  const fp = fingerprint(s.title)
  if (!seen.has(fp)) {
    seen.add(fp)
    stories.push(s)
  }
}

for (const s of rss) {
  const fp = fingerprint(s.title)
  if (!seen.has(fp)) {
    seen.add(fp)
    stories.push(s)
  }
}

// Drop stories past the age cap (lib/feed-age.js, 12 h). It was 48 h, and a
// story's pubDate is its dateline time on every surface: what the selector
// picked up a day late went out reading a day old, under `new`.
const now = Date.now()
const fresh = stories.filter(s => isFreshFeedItem(s.pubDate, now))
const stale = stories.length - fresh.length

// Split into multi-source and niche — no flat list, forces selector to use both sections
const multiSourceStories = fresh.filter(s => (s.sources || []).length > 1)
const nicheStories = fresh.filter(s => (s.sources || []).length === 1)
// Drop stories with empty sources — headline-only, writer can't use them
const dropped = fresh.filter(s => (s.sources || []).length === 0).length

const output = {
  fetchedAt: new Date().toISOString(),
  apiStories: api.length,
  rssStories: rss.length,
  multiSourceStories,
  nicheStories,
}

writeFileSync('/tmp/zuhd-feed.json', JSON.stringify(output, null, 2))

// Slim feed for selector: strip article bodies to reduce token count (~75K → ~18K tokens)
// Selector only needs title/description/metadata for editorial decisions; writer gets full feed
function stripBodies(stories) {
  return stories.map(s => ({
    ...s,
    sources: (s.sources || []).map(({ body, ...rest }) => rest),
  }))
}
const slimOutput = {
  ...output,
  multiSourceStories: stripBodies(multiSourceStories),
  nicheStories: stripBodies(nicheStories),
}
writeFileSync('/tmp/zuhd-feed-slim.json', JSON.stringify(slimOutput, null, 2))

// Archive merged (post-RSS-merge, pre-prefilter) snapshot for replay/backtest.
// fetch-news-api.js already snapshots its output, but that one is API-only —
// the niche-RSS sources that the layer-4 recap rule targets only enter here.
try {
  const SNAP_DIR = 'content/.feed-snapshots-merged'
  mkdirSync(SNAP_DIR, { recursive: true })
  const ts = output.fetchedAt.replace(/:/g, '-').replace(/\..+/, '').replace('T', 'T').slice(0, 16)
  writeFileSync(`${SNAP_DIR}/${ts}.json`, JSON.stringify(slimOutput, null, 2))
  // Rotation: this directory had none and reached 700 files / 86 MB by
  // 2026-09-25, five a day. The narrators read a 14-day window
  // (lib/coverage-window.js); 45 days leaves replay-recap-dedup a backtest
  // month on top. Older snapshots up to 2026-08-09 remain in git history.
  const KEEP_DAYS = 45
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10)
  for (const f of readdirSync(SNAP_DIR)) {
    if (f.endsWith('.json') && f.slice(0, 10) < cutoff) unlinkSync(`${SNAP_DIR}/${f}`)
  }
} catch (err) {
  console.error(`merged-snapshot write failed: ${err.message}`)
}

console.log(`${multiSourceStories.length} multi + ${nicheStories.length} niche (${dropped} headline-only, ${stale} stale >${MAX_FEED_AGE_MS / 3_600_000}h dropped)`)
