#!/usr/bin/env node
// Merges API feed (/tmp/zuhd-feed-api.json) and RSS feed (/tmp/zuhd-feed-rss.json)
// into a single /tmp/zuhd-feed.json. Deduplicates by title fingerprint.
import { readFileSync, writeFileSync, existsSync } from 'fs'
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

// Split into multi-source and niche for the selector
const multiSource = stories.filter(s => (s.sources || []).length > 1)
const niche = stories.filter(s => (s.sources || []).length <= 1)

const output = {
  fetchedAt: new Date().toISOString(),
  apiStories: api.length,
  rssStories: rss.length,
  multiSourceStories: multiSource,
  nicheStories: niche,
  stories, // flat list for backward compat
}

writeFileSync('/tmp/zuhd-feed.json', JSON.stringify(output, null, 2))
console.log(`${stories.length} stories (${api.length} API, ${rss.length} RSS)`)
