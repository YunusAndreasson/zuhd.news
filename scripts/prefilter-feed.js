#!/usr/bin/env node
// Pre-filter: removes feed stories that match already-published articles.
// Runs after merge-feeds.js, before the selector, so the LLM never wastes
// picks on stories that would be deduped downstream.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { loadDedupContext, wouldDedup } from './lib/dedup.js'

const FEED = '/tmp/zuhd-feed.json'
const SLIM = '/tmp/zuhd-feed-slim.json'

if (!existsSync(FEED)) process.exit(0)

const ctx = loadDedupContext()
const counts = { exact: 0, eventUri: 0, fuzzy: 0 }

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
const beforeMulti = (feed.multiSourceStories || []).length
const beforeNiche = (feed.nicheStories || []).length

feed.multiSourceStories = filterSection(feed.multiSourceStories || [])
feed.nicheStories = filterSection(feed.nicheStories || [])

const total = counts.exact + counts.eventUri + counts.fuzzy
writeFileSync(FEED, JSON.stringify(feed, null, 2))

// Also update the slim feed so selector sees the same filtered set
if (existsSync(SLIM)) {
  const slim = JSON.parse(readFileSync(SLIM, 'utf-8'))
  const removed = new Set()
  // Collect suggestedSlugs of removed stories
  const feedSlugs = new Set([...(feed.multiSourceStories || []), ...(feed.nicheStories || [])].map(s => s.suggestedSlug))

  slim.multiSourceStories = (slim.multiSourceStories || []).filter(s => feedSlugs.has(s.suggestedSlug))
  slim.nicheStories = (slim.nicheStories || []).filter(s => feedSlugs.has(s.suggestedSlug))
  writeFileSync(SLIM, JSON.stringify(slim, null, 2))
}

if (total > 0) {
  console.log(`Pre-filtered: removed ${total} stories (exact: ${counts.exact}, eventUri: ${counts.eventUri}, fuzzy: ${counts.fuzzy})`)
} else {
  console.log('Pre-filter: all feed stories are new')
}
