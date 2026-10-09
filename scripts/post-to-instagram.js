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
import { unquote } from './lib/claude-envelope.js'
import { buildIgJpeg, IG_FEED, IG_STORY } from './lib/ig-image.js'
import { graphClient, publishStory } from './lib/instagram.js'
import { ROOT } from './lib/paths.js'
import { runPoster, writeCopy } from './lib/social-post.js'

const SITE = 'https://zuhd.news'
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
  const text = unquote(await writeCopy('instagram-prompt.md', story, { who: 'post-to-instagram' }))
  return (text || `${story.card.headline}.\n\nFull story in the app — link in bio.`).slice(0, MAX_CAPTION)
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

  // --- public image URLs (built at build time, deployed before this runs) ---
  const feedUrl = `${SITE}/api/ig/${slug}.jpg`
  const storyUrl = `${SITE}/api/ig/${slug}.story.jpg`
  const articleUrl = `${SITE}/a/${slug}`

  if (dryRun || !haveCreds) {
    // The card with the story lead as its dek, as build.js renders it. Only
    // this preview is drawn here; the published card is the build artifact.
    const caption = await captionFor(story)
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

  const api = graphClient({ userId: /** @type {string} */ (creds.userId), token: /** @type {string} */ (creds.token) })
  return publishStory(api, log, { slug, headline, writeCaption: () => captionFor(story), feedUrl, storyUrl, articleUrl })
}

await runPoster(import.meta, 'post-to-instagram', {
  log: 'instagramLog',
  haveCreds,
  noCreds: 'IG_USER_ID / IG_ACCESS_TOKEN not set — skipping.',
  done: 'already posted',
  post,
})
