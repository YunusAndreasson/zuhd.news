#!/usr/bin/env node
// prefetch-articles.js — pre-fetches article content for selected stories
// Runs between selector and writer; eliminates writer's WebFetch tool calls
// Stories that already have contentText (from content:encoded) are skipped.

import { readFileSync, writeFileSync } from 'fs'

const SELECTION_PATH = '/tmp/zuhd-selection.json'
const MAX_CONTENT_CHARS = 3000
const TIMEOUT_MS = 10000

function extractMainText(html) {
  // Try to isolate article body before stripping
  const bodyPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*\b(?:article-body|story-body|post-content|entry-content|article-content|content-body)\b[^>]*>([\s\S]*?)<\/div>/i,
  ]
  let content = html
  for (const pat of bodyPatterns) {
    const m = html.match(pat)
    if (m && m[1].length > 300) { content = m[1]; break }
  }

  // Strip noise elements
  content = content
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')

  // Strip remaining tags, decode entities, clean whitespace
  content = content.replace(/<[^>]+>/g, ' ')
  content = content
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ')
  content = content.replace(/\s+/g, ' ').trim()

  return content
}

const PAYWALL_RE = /subscribe to (read|continue)|sign.{0,10}in to (read|access)|this article is (for|available to) (subscribers|members)|create.{0,20}(free )?account to (read|continue)|paywall/i

// Sources where the title prefix reliably indicates paywalled content — skip fetch entirely
const PAYWALL_TITLE_PREFIXES = ['STAT+:']

async function fetchArticle(story) {
  const url = story.link || story.sourceUrl
  if (!url) return null

  // Pre-detect known paywall patterns from title (saves a fetch round-trip)
  const title = story.title || ''
  if (PAYWALL_TITLE_PREFIXES.some(p => title.startsWith(p))) return { status: 'paywall' }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })
    if (!res.ok) return { status: 'http-' + res.status }

    const html = await res.text()

    if (PAYWALL_RE.test(html.slice(0, 8000))) return { status: 'paywall' }

    const text = extractMainText(html)
    if (text.length < 150) return { status: 'too-short' }

    return { status: 'ok', text: text.slice(0, MAX_CONTENT_CHARS) }
  } catch (e) {
    return { status: 'error', err: e.message.slice(0, 40) }
  }
}

// --- Main ---

let stories
try {
  stories = JSON.parse(readFileSync(SELECTION_PATH, 'utf-8'))
} catch (e) {
  console.error('Could not read selection:', e.message)
  process.exit(1)
}

const needsFetch = stories.filter(s => !s.contentText)
const alreadyHave = stories.length - needsFetch.length

console.log(`Selection: ${stories.length} stories — ${alreadyHave} already have content, fetching ${needsFetch.length}`)

if (needsFetch.length === 0) {
  console.log('Nothing to fetch.')
  process.exit(0)
}

const t0 = Date.now()

const fetchResults = await Promise.all(
  needsFetch.map(async (story) => {
    const result = await fetchArticle(story)
    return { story, result }
  })
)

let fetched = 0, paywalled = 0, failed = 0
for (const { story, result } of fetchResults) {
  const label = `${story.source}: ${(story.title || '').slice(0, 50)}`
  if (!result) { failed++; console.log(`  ❌ no-url  — ${label}`); continue }
  if (result.status === 'ok') {
    story.contentText = result.text
    fetched++
    console.log(`  ✅ ${result.text.length}c  — ${label}`)
  } else if (result.status === 'paywall') {
    paywalled++
    console.log(`  🔒 paywall — ${label}`)
  } else {
    failed++
    console.log(`  ❌ ${result.status.padEnd(8)} — ${label}`)
  }
}

writeFileSync(SELECTION_PATH, JSON.stringify(stories, null, 2))

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\nDone in ${elapsed}s — fetched ${fetched}, paywalled ${paywalled}, failed ${failed}`)
console.log(`Writer will skip ~${fetched} WebFetch tool calls`)
