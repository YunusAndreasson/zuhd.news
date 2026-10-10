// What the selector never needs to see: the feed stories that match something
// already published. This was the body of `scripts/prefilter-feed.js`.

import { isThin, wouldDedup } from './dedup.js'

/** @typedef {import('./schema.js').FeedItem} FeedItem */
/** @typedef {{ multiSourceStories?: FeedItem[], nicheStories?: FeedItem[] } & Record<string, any>} Feed */

/**
 * Take out of the feed every story the deterministic dedup would drop after
 * selection, so the selector does not spend a pick on it, and bring the
 * selector's body-less copy into line.
 *
 * A story that survives but has no source carrying real text is marked `thin`
 * on the selector's copy. The selector reads a feed without bodies and could
 * not see this: it picked them, 12 of 60 on 2026-09-25, and the writer then
 * skipped one to four picks a cycle for "no summary provided".
 * `enrich-selection.js` tries one page fetch for a thin pick; the flag lets
 * the selector weigh the risk before spending a slot.
 *
 * Both feeds are changed in place and returned.
 *
 * @param {Feed} feed
 * @param {Feed | null} slim the selector's copy, when there is one
 * @param {Parameters<typeof wouldDedup>[1]} ctx from `loadDedupContext`
 */
export function prefilterFeed(feed, slim, ctx) {
  /** @type {{ slug: string, reason: string, match: string }[]} */
  const removed = []
  /** @param {FeedItem[]} stories */
  const keep = (stories) =>
    stories.filter((s) => {
      const result = wouldDedup(s, ctx)
      if (result.deduped) removed.push({ slug: s.suggestedSlug || s.title, reason: result.reason, match: result.match })
      return !result.deduped
    })

  feed.multiSourceStories = keep(feed.multiSourceStories || [])
  feed.nicheStories = keep(feed.nicheStories || [])

  let thin = 0
  if (slim) {
    const survivors = [...feed.multiSourceStories, ...feed.nicheStories]
    // Keep only stories whose suggestedSlug survived the filter
    const kept = new Set(survivors.map((s) => s.suggestedSlug))
    slim.multiSourceStories = (slim.multiSourceStories || []).filter((s) => kept.has(s.suggestedSlug))
    slim.nicheStories = (slim.nicheStories || []).filter((s) => kept.has(s.suggestedSlug))

    const thinSlugs = new Set(survivors.filter(isThin).map((s) => s.suggestedSlug))
    for (const s of [...slim.multiSourceStories, ...slim.nicheStories]) {
      if (thinSlugs.has(s.suggestedSlug)) {
        s.thin = true
        thin++
      }
    }
  }
  return { feed, slim, removed, thin }
}

/**
 * How many stories each layer removed. The reasons `wouldDedup` has today come
 * first and in its order, at zero when unused; any other reason is counted
 * as it comes.
 *
 * The stage counted with `counts[reason]++` over those five keys, so a reason
 * it did not list became NaN, and the summary, which prints the counts above
 * zero, then left it out: the stories were removed and the breakdown did not
 * add up. `url` would have gone unreported that way when it was added on
 * 2026-08-30, had the list not been edited with it.
 *
 * @param {{ reason: string }[]} removed
 * @returns {Record<string, number>}
 */
export function reasonCounts(removed) {
  /** @type {Record<string, number>} */
  const counts = { exact: 0, url: 0, eventUri: 0, fuzzy: 0, recap: 0 }
  for (const r of removed) counts[r.reason] = (counts[r.reason] ?? 0) + 1
  return counts
}
