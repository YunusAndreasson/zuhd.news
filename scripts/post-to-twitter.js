#!/usr/bin/env node
// Auto-post the breaking story to X (Twitter).
//
// The cycle already sends a breaking-news push once per cycle (the single top
// validated breaking story, see run-cycle.sh). This mirrors that same story to
// the zuhd.news X account as ONE plain-text tweet, so the X audience gets the
// same alert app users get.
//
// Design decisions (see plan):
//   - Breaking pushes only. run-cycle.sh calls this with the pushed slug.
//   - No link in the tweet — plain text is ~$0.015 on X's pay-per-use API,
//     a tweet with a URL is ~$0.20 (13×). The app link lives in the X bio +
//     a pinned tweet instead.
//   - The tweet text is condensed by the `claude` CLI (ambient OAuth, no API
//     key, so free), unless --text is passed.
//   - Posting uses OAuth 1.0a User Context (4 static keys) — signed by hand
//     with node:crypto, no dependency.
//   - Non-fatal: any operational failure logs a warning and exits 0 so the
//     cycle is never aborted. Deduped via content/.tweet-log.json.
//
// Usage: node scripts/post-to-twitter.js --slug <slug> [--text "..."] [--dry-run]

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { createHmac, randomBytes } from 'crypto'
import { parseFrontmatter } from './lib/frontmatter.js'

const ROOT = new URL('..', import.meta.url).pathname
const TWEET_LOG = join(ROOT, 'content/.tweet-log.json')
const PROMPT_PATH = join(ROOT, 'scripts/tweet-prompt.md')
const API_URL = 'https://api.twitter.com/2/tweets'
// X counts weighted length (URLs=23, emoji/CJK=2). Our tweets are plain English
// with no link, so code-unit length is a safe proxy; 275 leaves headroom < 280.
const MAX_LEN = 275

// --- args ---
const argAt = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)
const slug = argAt('slug')
const explicitText = argAt('text')
const dryRun = hasFlag('dry-run')

if (!slug) {
  console.error('post-to-twitter: --slug <slug> is required')
  process.exit(2)
}

// --- credentials ---
const creds = {
  apiKey: process.env.X_API_KEY,
  apiSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
}
const haveCreds = Object.values(creds).every(Boolean)
if (!haveCreds && !dryRun) {
  console.log('post-to-twitter: X_* credentials not set — skipping tweet.')
  process.exit(0)
}

// --- dedup log ---
const readLog = () => {
  try {
    return JSON.parse(readFileSync(TWEET_LOG, 'utf8'))
  } catch {
    return []
  }
}
const writeLog = (log) => {
  const trimmed = log.length > 100 ? log.slice(-100) : log
  writeFileSync(TWEET_LOG, JSON.stringify(trimmed, null, 2) + '\n')
}
const log = readLog()
if (log.some((e) => e.slug === slug && e.sent)) {
  console.log(`post-to-twitter: ${slug} already tweeted — skipping.`)
  process.exit(0)
}

// --- compose ---
function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  // Prefer ending on the last complete sentence that fits — a clean stop reads
  // far better than a mid-clause ellipsis.
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (sentenceEnd > max * 0.35) return cut.slice(0, sentenceEnd + 1).trim()
  // Otherwise fall back to a word boundary + ellipsis.
  const wordCut = cut.slice(0, max - 1)
  const lastSpace = wordCut.lastIndexOf(' ')
  const base = lastSpace > max * 0.6 ? wordCut.slice(0, lastSpace) : wordCut
  return base.replace(/[\s,;:—–-]+$/, '') + '…'
}

function condenseViaClaude(articleText) {
  const prompt = readFileSync(PROMPT_PATH, 'utf8') + '\n' + articleText
  const env = { ...process.env }
  // The Haiku/Sonnet micro-task callers drop CLAUDECODE so the subprocess
  // doesn't inherit the parent Claude session marker (see backfill-country-tags.js).
  delete env.CLAUDECODE
  const res = spawnSync(
    'claude',
    [
      '--model', process.env.ZUHD_MODEL || 'claude-sonnet-5',
      '--effort', 'medium',
      '--no-session-persistence',
      '--max-turns', '1',
      '--tools', '',
      '-p', prompt,
    ],
    { encoding: 'utf-8', timeout: 30_000, maxBuffer: 512 * 1024, env },
  )
  if (res.status !== 0) {
    console.error(`post-to-twitter: claude exit ${res.status}: ${(res.stderr || '').slice(0, 200)}`)
    return null
  }
  // Plain-text output (no --output-format json): take the first non-empty line.
  const line = (res.stdout || '')
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0]
  return line || null
}

let text = explicitText
if (!text) {
  const path = join(ROOT, 'content/articles', `${slug}.md`)
  if (!existsSync(path)) {
    console.error(`post-to-twitter: article not found (${path}) — skipping.`)
    process.exit(0)
  }
  const { meta, body } = parseFrontmatter(readFileSync(path, 'utf8'))
  const articleText = `${meta.title || ''}\n\n${body}`.trim()
  text = condenseViaClaude(articleText)
  if (!text) {
    console.error('post-to-twitter: could not generate tweet text — skipping.')
    process.exit(0)
  }
}
// Strip any wrapping quotes/fences the model may add despite the prompt rules.
text = text.replace(/^\s*["'“”]+|["'“”]+\s*$/g, '').trim()
text = truncate(text, MAX_LEN)

// --- OAuth 1.0a signing ---
const rfc3986 = (str) =>
  encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function authHeader(method, url) {
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  }
  // JSON-body POST has no query/form params, so the signature base string is
  // just the sorted oauth_* params — the JSON body is NOT signed.
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(oauth[k])}`)
    .join('&')
  const base = [method.toUpperCase(), rfc3986(url), rfc3986(paramString)].join('&')
  const signingKey = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessSecret)}`
  const signature = createHmac('sha1', signingKey).update(base).digest('base64')
  return (
    'OAuth ' +
    Object.entries({ ...oauth, oauth_signature: signature })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
      .join(', ')
  )
}

// --- post ---
async function post() {
  if (dryRun || !haveCreds) {
    console.log(`[dry-run] tweet (${text.length} chars):\n${text}`)
    if (!haveCreds) {
      console.log('[dry-run] X_* creds not set — signing/POST skipped.')
    } else {
      // Exercise the signing path so a broken header surfaces in dry-run.
      const header = authHeader('POST', API_URL)
      console.log(`[dry-run] would POST ${API_URL} — auth header OK (${header.length} chars).`)
    }
    return
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: authHeader('POST', API_URL),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
  const json = await res.json().catch(() => ({}))
  if (res.ok && json?.data?.id) {
    console.log(`post-to-twitter: posted ${json.data.id} — ${text}`)
    log.push({ timestamp: new Date().toISOString(), slug, text, tweetId: json.data.id, sent: true })
    writeLog(log)
  } else {
    const err = json?.detail || json?.title || `HTTP ${res.status}`
    console.error(`post-to-twitter: X API error — ${err}`)
    log.push({ timestamp: new Date().toISOString(), slug, text, sent: false, error: String(err) })
    writeLog(log)
  }
}

post().catch((e) => {
  console.error(`post-to-twitter: ${e.message} — non-fatal, cycle continues.`)
  process.exit(0)
})
