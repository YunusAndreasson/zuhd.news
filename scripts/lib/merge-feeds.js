// The selector's pool: the two fetched feeds, merged, cut by age and split.
//
// This was the body of `scripts/merge-feeds.js`, which ran on import and could
// only be tried by running a cycle. As a function of the two feeds and a
// moment, it can be tested for what it decides.

import { feedItemAgeMs, isFreshFeedItem, poolAgeCapMs } from './feed-age.js'
import { fingerprint } from './utils.js'

/** @typedef {import('./schema.js').FeedItem} FeedItem */

/**
 * Merge the API feed and the RSS feed into the pool the selector reads.
 *
 * - A story both feeds carry is taken from the API, which has the panel of
 *   sources; the same headline is the same story (`fingerprint`).
 * - Stories past the age cap are dropped (`lib/feed-age.js`: 12 h, widened
 *   toward 24 h on a thin cycle). It was 48 h, and a story's pubDate is its
 *   dateline time on every surface: what the selector picked up a day late
 *   went out reading a day old, under `new`. The cap is sized on the stories
 *   the selector can use; headline-only items are dropped regardless.
 * - What is left is split in two, never handed over as one list, so the
 *   selector has to use both sections. A story with no source at all is a
 *   headline the writer cannot use, and is counted and left out.
 *
 * @param {FeedItem[]} api
 * @param {FeedItem[]} rss
 * @param {number} now
 */
export function mergeFeeds(api, rss, now) {
  const seen = new Set()
  /** @type {FeedItem[]} */
  const stories = []
  for (const s of [...api, ...rss]) {
    const fp = fingerprint(s.title)
    if (seen.has(fp)) continue
    seen.add(fp)
    stories.push(s)
  }

  const capMs = poolAgeCapMs(stories.filter((s) => (s.sources || []).length > 0).map((s) => feedItemAgeMs(s.pubDate, now)))
  const fresh = stories.filter((s) => isFreshFeedItem(s.pubDate, now, capMs))
  const multiSourceStories = fresh.filter((s) => (s.sources || []).length > 1)
  const nicheStories = fresh.filter((s) => (s.sources || []).length === 1)
  const headlineOnly = fresh.length - multiSourceStories.length - nicheStories.length

  return {
    multiSourceStories,
    nicheStories,
    capMs,
    counts: {
      api: api.length,
      rss: rss.length,
      multi: multiSourceStories.length,
      niche: nicheStories.length,
      headlineOnly,
      stale: stories.length - fresh.length,
      usable: fresh.length - headlineOnly,
    },
  }
}

/**
 * The same stories without their source text. The selector decides on title,
 * description and metadata, and the bodies are three quarters of the tokens
 * (about 75k against 18k); the writer gets them back from the full feed.
 *
 * @param {FeedItem[]} stories
 */
export function stripBodies(stories) {
  return stories.map((s) => ({
    ...s,
    sources: (s.sources || []).map(({ body, ...rest }) => rest),
  }))
}
