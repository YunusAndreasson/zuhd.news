#!/usr/bin/env node
// prefetch-articles.js — pre-fetches article content for selected stories
// Runs between selector and writer; eliminates writer's WebFetch tool calls
// Stories that already have contentText (from content:encoded) are skipped.
// After fetch, a Haiku LLM pass checks content quality (catches paywalls, newsletters, junk).

import { readFileSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'

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

// LLM quality check — catch paywalls, newsletters, and extraction junk that regex missed
const fetchedStories = stories.filter(s => s.contentText)
if (fetchedStories.length > 0) {
  const t1 = Date.now()
  const lines = fetchedStories.map((s, i) =>
    `${i}. [${s.source}] "${s.title}"\n   CONTENT: ${s.contentText.slice(0, 400)}`
  ).join('\n\n')

  const prompt = `You are a content quality filter for a news site. Each entry below shows the first 400 characters extracted from a fetched article page.

For each, decide if the content is a USABLE standalone news article or NOT USABLE.

NOT USABLE means:
- Paywall/login wall (content is mostly "subscribe" or "sign in" prompts)
- Newsletter roundup (multiple unrelated stories bundled together, not a single article)
- Mostly navigation junk, social sharing buttons, or boilerplate with little article text
- Video/podcast page with no article text
- Error page or redirect content

USABLE means: contains actual article prose about the stated title, even if some nav junk is mixed in.

Respond with ONLY a JSON array of indices that are NOT USABLE. Example: [0, 3]
If all are usable, respond: []

${lines}`

  try {
    const result = spawnSync('claude', [
      '--model', 'claude-haiku-4-5-20251001',
      '--print',
      '--max-turns', '1',
    ], { input: prompt, timeout: 30000, encoding: 'utf-8', env: { ...process.env, CLAUDECODE: undefined } })

    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(result.stderr?.slice(0, 100) || `exit ${result.status}`)

    const text = result.stdout.trim()
    const match = text.match(/\[[\d,\s]*\]/)
    if (match) {
      const junkIndices = new Set(JSON.parse(match[0]))
      let downgraded = 0
      for (const idx of junkIndices) {
        if (idx >= 0 && idx < fetchedStories.length) {
          const s = fetchedStories[idx]
          console.log(`  🗑️ junk    — ${s.source}: ${(s.title || '').slice(0, 50)}`)
          delete s.contentText
          fetched--
          failed++
          downgraded++
        }
      }
      const qcElapsed = ((Date.now() - t1) / 1000).toFixed(1)
      console.log(`Haiku quality: ${fetchedStories.length} checked, ${downgraded} junk, ${qcElapsed}s`)
    }
  } catch (err) {
    console.log(`Haiku quality: error — ${err.message.slice(0, 60)}`)
  }
}

writeFileSync(SELECTION_PATH, JSON.stringify(stories, null, 2))

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\nDone in ${elapsed}s — fetched ${fetched}, paywalled ${paywalled}, failed ${failed}`)
console.log(`Writer will skip ~${fetched} WebFetch tool calls`)
