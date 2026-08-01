#!/usr/bin/env node
// Merges API feed (/tmp/zuhd-feed-api.json) and RSS feed (/tmp/zuhd-feed-rss.json)
// into a single /tmp/zuhd-feed.json. Deduplicates by title fingerprint.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
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

// Drop stories older than 48h — with 5 cycles/day, stale stories have had plenty of chances
const MAX_AGE_MS = 48 * 60 * 60 * 1000
const now = Date.now()
const fresh = stories.filter(s => {
  const age = now - new Date(s.pubDate).getTime()
  return !Number.isNaN(age) && age < MAX_AGE_MS
})
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
} catch (err) {
  console.error(`merged-snapshot write failed: ${err.message}`)
}

console.log(`${multiSourceStories.length} multi + ${nicheStories.length} niche (${dropped} headline-only, ${stale} stale >48h dropped)`)
