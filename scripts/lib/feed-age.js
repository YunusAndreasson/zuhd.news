// How old a feed item may be when the selector sees it.
//
// A story's `date` is its source's pubDate (write-prompt.md), and every
// surface orders and dates by it: the app's river is the last 24 hours on
// exactly that time. So an item picked up late is published late. It lands
// deep in the river reading `21h ago · new`, and past 24 hours it is outside
// the river from the moment it arrives. Measured 2026-09-26 over three weeks
// (1,209 stories): median 2.5 h from pubDate to publish, but 18% over 12 h and
// 6% over 24 h, because the pool was cut at 48 h. The selector prompt already
// said "anything from a previous cycle has already had its chance"; the cut
// said otherwise, and the cut is what the selector sees.
//
// 12 h: the cycle runs at 05/10/14/18/22 UTC, and the longest gap between two
// runs is 7 h (overnight), so every item is in front of two cycles before it
// ages out, give or take the minutes a run starts late.

export const MAX_FEED_AGE_MS = 12 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long ago an item was published, NaN when its pubDate does not parse.
 *
 * A pubDate at exactly midnight UTC is a date with no time: RSS date-only
 * fields, and the events API's `${eventDate}T00:00:00Z` fallback (7% of the
 * corpus). It happened at some point that day, so it is aged from the latest
 * moment it could have happened, the end of that day or now, whichever is
 * sooner. Aged from midnight, every date-only item would be dropped by 12:00.
 */
export function feedItemAgeMs(pubDate, now = Date.now()) {
  const t = new Date(pubDate).getTime()
  if (Number.isNaN(t)) return NaN
  const dateOnly = t % DAY_MS === 0
  return now - (dateOnly ? Math.min(t + DAY_MS, now) : t)
}

/** Young enough for the selector's pool. An undated item never is. */
export function isFreshFeedItem(pubDate, now = Date.now()) {
  const age = feedItemAgeMs(pubDate, now)
  return !Number.isNaN(age) && age < MAX_FEED_AGE_MS
}
