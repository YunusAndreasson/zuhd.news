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
//   - Non-fatal: the cycle goes on whatever this exits with. A post that did
//     not go out is logged and ends on 1, so the cycle says the step failed.
//     Deduped via content/.instagram-log.json.
//
// Usage: node scripts/post-to-instagram.js --slug <slug> [--dry-run]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIgJpeg, IG_FEED, IG_STORY } from './lib/ig-image.js'
import { ROOT } from './lib/paths.js'
import { runPoster, writeCopy } from './lib/social-post.js'

const SITE = 'https://zuhd.news'
const GRAPH = 'https://graph.facebook.com/v21.0'
const MAX_CAPTION = 2000 // Instagram hard limit is 2200; leave headroom.

// --- credentials ---
const creds = {
  userId: process.env.IG_USER_ID,
  token: process.env.IG_ACCESS_TOKEN,
}
const haveCreds = Boolean(creds.userId && creds.token)

// --- caption ---
/** @param {import('./lib/social-post.js').Story} story */
async function captionFor(story) {
  // Multi-line caption (unlike the tweet): keep the whole thing, just tidy it.
  const text = (await writeCopy('instagram-prompt.md', story, { who: 'post-to-instagram' }))?.replace(/^\s*["'“”]+|["'“”]+\s*$/g, '').trim()
  return (text || `${story.card.headline}.\n\nFull story in the app — link in bio.`).slice(0, MAX_CAPTION)
}

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
/**
 * @param {import('./lib/social-post.js').PostContext} ctx
 * @returns {Promise<Record<string, any> | void>} the entry it logged, when it got as far as posting
 */
async function post({ slug, dryRun, story, log }) {
  // The card headline is the social-optimized socialTitle when present (written
  // pre-build by pick-breaking-social.js), else the article title — the same
  // source the OG share card uses. The published image is the build artifact
  // rendered from this same value, so the dry-run preview below matches exactly.
  const { headline } = story.card
  const caption = await captionFor(story)

  // --- public image URLs (built at build time, deployed before this runs) ---
  const feedUrl = `${SITE}/api/ig/${slug}.jpg`
  const storyUrl = `${SITE}/api/ig/${slug}.story.jpg`
  const articleUrl = `${SITE}/a/${slug}`

  if (dryRun || !haveCreds) {
    // The card with the story lead as its dek, as build.js renders it. Only
    // this preview is drawn here; the published card is the build artifact.
    const outDir = join(ROOT, '.cache', 'ig-preview')
    mkdirSync(outDir, { recursive: true })
    const feedPath = join(outDir, `${slug}.jpg`)
    const storyPath = join(outDir, `${slug}.story.jpg`)
    writeFileSync(feedPath, buildIgJpeg(story.card, IG_FEED))
    writeFileSync(storyPath, buildIgJpeg(story.card, IG_STORY))
    console.log(`[dry-run] headline: ${headline}`)
    console.log(`[dry-run] caption:\n${caption}`)
    console.log(`[dry-run] feed image  → ${feedPath}  (would publish ${feedUrl})`)
    console.log(`[dry-run] story image → ${storyPath}  (would publish ${storyUrl})`)
    console.log(`[dry-run] first comment → ${articleUrl}`)
    if (!haveCreds) console.log('[dry-run] IG creds not set — publish skipped.')
    return
  }

  try {
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

    return log.add({
      timestamp: new Date().toISOString(),
      slug,
      headline,
      caption,
      mediaId,
      commentId,
      storyMediaId,
      sent: true,
    })
  } catch (e) {
    // Record the failure so we can see it in the log; the runner says it and
    // ends the step on 1.
    try {
      log.add({ timestamp: new Date().toISOString(), slug, headline, caption, sent: false, error: String(e.message) })
    } catch {
      /* ignore */
    }
    throw e
  }
}

await runPoster(import.meta, 'post-to-instagram', {
  log: 'instagramLog',
  haveCreds,
  noCreds: 'IG_USER_ID / IG_ACCESS_TOKEN not set — skipping.',
  done: 'already posted',
  post,
})
