#!/usr/bin/env node
// Auto-post the breaking story to Instagram.
//
// The cycle already sends a breaking-news push once per cycle (the single top
// validated breaking story, see run-cycle.sh) and mirrors it to X. This mirrors
// the same story to the zuhd.news Instagram account as a single 4:5 image card —
// the breaking-alert text over a delicate orthographic globe (see lib/ig-image.js)
// — plus a Story cross-post and a first-comment link to the article.
//
// Design decisions (mirror post-to-twitter.js):
//   - Breaking pushes only. run-cycle.sh calls this with the pushed slug.
//   - The published image is the PUBLIC build artifact at
//     https://zuhd.news/api/ig/{slug}.jpg (Instagram's Graph API needs a public
//     JPEG URL). The card is rendered at build time from the article headline —
//     the same "headline over the globe" pattern as the OG share card — and is
//     deployed before this step runs. (The post-time wire alert can't drive the
//     image: it's crafted after deploy, and there's no public URL for it.)
//   - Caption is written by the `claude` CLI (ambient OAuth, no API key, free)
//     and carries the fuller facts beneath the headline card.
//   - Publishing uses the Instagram Graph API (container -> publish) with a
//     long-lived / system-user access token — plain fetch, no SDK.
//   - Reach: keyword-rich caption, the article URL as the first comment, and a
//     Story cross-post. The app link lives in the IG bio (zuhd.news/get).
//   - Non-fatal: any operational failure logs a warning and exits 0 so the cycle
//     is never aborted. Deduped via content/.instagram-log.json.
//
// Usage: node scripts/post-to-instagram.js --slug <slug> [--dry-run]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseFrontmatter } from './lib/frontmatter.js'
import { buildIgJpeg, IG_FEED, IG_STORY } from './lib/ig-image.js'

const ROOT = new URL('..', import.meta.url).pathname
const IG_LOG = join(ROOT, 'content/.instagram-log.json')
const PROMPT_PATH = join(ROOT, 'scripts/instagram-prompt.md')
const SITE = 'https://zuhd.news'
const GRAPH = 'https://graph.facebook.com/v21.0'
const MAX_CAPTION = 2000 // Instagram hard limit is 2200; leave headroom.

// --- args ---
const argAt = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)
const slug = argAt('slug')
const dryRun = hasFlag('dry-run')

if (!slug) {
  console.error('post-to-instagram: --slug <slug> is required')
  process.exit(2)
}

// --- credentials ---
const creds = {
  userId: process.env.IG_USER_ID,
  token: process.env.IG_ACCESS_TOKEN,
}
const haveCreds = Boolean(creds.userId && creds.token)
if (!haveCreds && !dryRun) {
  console.log('post-to-instagram: IG_USER_ID / IG_ACCESS_TOKEN not set — skipping.')
  process.exit(0)
}

// --- dedup log ---
const readLog = () => {
  try {
    return JSON.parse(readFileSync(IG_LOG, 'utf8'))
  } catch {
    return []
  }
}
const writeLog = (log) => {
  const trimmed = log.length > 100 ? log.slice(-100) : log
  writeFileSync(IG_LOG, `${JSON.stringify(trimmed, null, 2)}\n`)
}
const log = readLog()
if (log.some((e) => e.slug === slug && e.sent)) {
  console.log(`post-to-instagram: ${slug} already posted — skipping.`)
  process.exit(0)
}

// --- load article ---
const articlePath = join(ROOT, 'content/articles', `${slug}.md`)
if (!existsSync(articlePath)) {
  console.error(`post-to-instagram: article not found (${articlePath}) — skipping.`)
  process.exit(0)
}
const { meta, body } = parseFrontmatter(readFileSync(articlePath, 'utf8'))

// The card headline is the social-optimized socialTitle when present (written
// pre-build by pick-breaking-social.js), else the article title — the same
// source the OG share card uses. The published image is the build artifact
// rendered from this same value, so the dry-run preview below matches exactly.
const headline = meta.socialTitle || meta.title || 'Breaking News'

// Story lead (first 1-2 sentences) rendered as the card's dek — dateline and
// markdown links stripped, cut to ~200 chars. Only used for the --dry-run
// preview; the published card is the build artifact (build.js does the same).
const igLead = (b) => {
  let t = String(b || '')
    .trim()
    .split(/\n\n+/)
    .slice(0, 2)
    .join(' ')
    .replace(/^[A-Z][\w .,'-]{0,28}\s—\s/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > 260) {
    const cut = t.slice(0, 260)
    const end = cut.lastIndexOf('. ')
    t = end > 130 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`
  }
  return t
}

const article = {
  headline,
  summary: igLead(body),
  category: meta.category || null,
  date: meta.date,
  location: meta.location || null,
  lat: meta.lat != null ? Number(meta.lat) : null,
  lng: meta.lng != null ? Number(meta.lng) : null,
}

// --- caption ---
function captionViaClaude() {
  const articleText = `${meta.title || ''}\n\n${body}`.trim()
  const prompt = `${readFileSync(PROMPT_PATH, 'utf8')}\n${articleText}`
  const env = { ...process.env }
  // Drop CLAUDECODE so the subprocess doesn't inherit the parent session marker
  // (same micro-task idiom as post-to-twitter.js / backfill-country-tags.js).
  delete env.CLAUDECODE
  const res = spawnSync(
    'claude',
    [
      '--model',
      process.env.ZUHD_MODEL || 'claude-sonnet-5',
      '--effort',
      'medium',
      '--no-session-persistence',
      '--max-turns',
      '1',
      '--tools',
      '',
      '-p',
      prompt,
    ],
    { encoding: 'utf-8', timeout: 30_000, maxBuffer: 512 * 1024, env },
  )
  if (res.status !== 0) {
    console.error(`post-to-instagram: claude exit ${res.status}: ${(res.stderr || '').slice(0, 200)}`)
    return null
  }
  // Multi-line caption (unlike the tweet): keep the whole thing, just tidy it.
  let text = (res.stdout || '').trim()
  text = text.replace(/^\s*["'“”]+|["'“”]+\s*$/g, '').trim()
  return text || null
}

const caption = (captionViaClaude() || `${headline}.\n\nFull story in the app — link in bio.`).slice(0, MAX_CAPTION)

// --- public image URLs (built at build time, deployed before this runs) ---
const feedUrl = `${SITE}/api/ig/${slug}.jpg`
const storyUrl = `${SITE}/api/ig/${slug}.story.jpg`
const articleUrl = `${SITE}/a/${slug}`

// --- Graph API helpers ---
async function graphPost(path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, access_token: creds.token }).toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.error) {
    const err = json?.error?.message || `HTTP ${res.status}`
    throw new Error(err)
  }
  return json
}

// Image containers finish almost instantly, but poll a few times to be safe.
async function waitForContainer(creationId) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(
      `${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(creds.token)}`,
    )
    const json = await res.json().catch(() => ({}))
    if (json?.status_code === 'FINISHED') return
    if (json?.status_code === 'ERROR') throw new Error('container processing failed')
    await new Promise((r) => setTimeout(r, 1500))
  }
  // Fall through — publish will surface a clear error if it truly isn't ready.
}

// Wait until the deployed image URL is actually live at the CDN edge before
// asking Instagram to fetch it. post-to-instagram runs seconds after `wrangler
// pages deploy`, and IG's fetchers frequently hit the URL before Cloudflare has
// propagated the new file — they get a 404 HTML page and reject the container
// with "Only photo or video can be accepted as media type" (the recurring
// intermittent IG failure). Polling HEAD until we see a real image closes that
// race. Capped well under run-cycle.sh's 90s timeout for this step.
async function waitForPublicImage(url, tries = 6, delayMs = 5000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      const ct = res.headers.get('content-type') || ''
      if (res.ok && ct.startsWith('image/')) return true
    } catch {
      /* transient — deploy still propagating */
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

// Publish a single image (feed or story). Returns the published media id.
/** @param {{ imageUrl: string, mediaType?: string, extra?: Record<string, any> }} opts */
async function publishImage({ imageUrl, mediaType, extra = {} }) {
  const container = await graphPost(`${creds.userId}/media`, {
    image_url: imageUrl,
    ...(mediaType ? { media_type: mediaType } : {}),
    ...extra,
  })
  await waitForContainer(container.id)
  const published = await graphPost(`${creds.userId}/media_publish`, { creation_id: container.id })
  return published.id
}

// --- run ---
async function run() {
  if (dryRun || !haveCreds) {
    const outDir = join(ROOT, '.cache', 'ig-preview')
    mkdirSync(outDir, { recursive: true })
    const feedPath = join(outDir, `${slug}.jpg`)
    const storyPath = join(outDir, `${slug}.story.jpg`)
    writeFileSync(feedPath, buildIgJpeg(article, IG_FEED))
    writeFileSync(storyPath, buildIgJpeg(article, IG_STORY))
    console.log(`[dry-run] headline: ${headline}`)
    console.log(`[dry-run] caption:\n${caption}`)
    console.log(`[dry-run] feed image  → ${feedPath}  (would publish ${feedUrl})`)
    console.log(`[dry-run] story image → ${storyPath}  (would publish ${storyUrl})`)
    console.log(`[dry-run] first comment → ${articleUrl}`)
    if (!haveCreds) console.log('[dry-run] IG creds not set — publish skipped.')
    return
  }

  // 0. Wait out CDN propagation so IG doesn't fetch the URL before it's live.
  if (!(await waitForPublicImage(feedUrl))) {
    console.error(`post-to-instagram: ${feedUrl} not yet a live image after wait — attempting publish anyway.`)
  }

  // 1. Feed post (the caption rides on the container, not media_publish).
  const mediaId = await publishImage({ imageUrl: feedUrl, extra: { caption } })
  console.log(`post-to-instagram: posted feed ${mediaId}`)

  // 2. First comment: the article URL (feed captions can't carry a live link).
  let commentId = null
  try {
    const c = await graphPost(`${mediaId}/comments`, { message: articleUrl })
    commentId = c.id
  } catch (e) {
    console.error(`post-to-instagram: first-comment failed (non-fatal) — ${e.message}`)
  }

  // 3. Story cross-post (image-only). Independent of the feed post's success.
  let storyMediaId = null
  try {
    storyMediaId = await publishImage({ imageUrl: storyUrl, mediaType: 'STORIES' })
    console.log(`post-to-instagram: posted story ${storyMediaId}`)
  } catch (e) {
    console.error(`post-to-instagram: story cross-post failed (non-fatal) — ${e.message}`)
  }

  log.push({
    timestamp: new Date().toISOString(),
    slug,
    headline,
    caption,
    mediaId,
    commentId,
    storyMediaId,
    sent: true,
  })
  writeLog(log)
}

run().catch((e) => {
  console.error(`post-to-instagram: ${e.message} — non-fatal, cycle continues.`)
  // Record the failure so we can see it in the log, but never abort the cycle.
  try {
    log.push({ timestamp: new Date().toISOString(), slug, headline, caption, sent: false, error: String(e.message) })
    writeLog(log)
  } catch {
    /* ignore */
  }
  process.exit(0)
})
