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

// The widening, for a thin cycle. The first 12 h cycle (2026-09-26 18:00, a
// Saturday evening) held 39 usable stories for a target of 15; the selector
// found 11, and backfill filled the gaps with county cricket and shinty. So
// when fewer than `MIN_POOL_ITEMS` survive the 12 h cut, the cut reaches back
// exactly as far as it takes to hold that many, and never past 24 h: a story
// older than a day arrives outside the app's river, which is the thing the
// cut exists to prevent. Replayed on that cycle's feed, 24 h gives 54 (48 h
// gave 84), so on a thin evening the widening runs to its limit and stops.
export const MIN_POOL_ITEMS = 60
export const MAX_WIDENED_AGE_MS = 24 * 60 * 60 * 1000

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
export function isFreshFeedItem(pubDate, now = Date.now(), maxAgeMs = MAX_FEED_AGE_MS) {
  const age = feedItemAgeMs(pubDate, now)
  return !Number.isNaN(age) && age < maxAgeMs
}

/**
 * The age cut for this cycle's pool: 12 h, or on a thin cycle as far back as
 * holds `min` items, at most 24 h.
 * @param {number[]} ages  feed-item ages in ms; NaN for an undated item
 * @param {number} [min]
 */
export function poolAgeCapMs(ages, min = MIN_POOL_ITEMS) {
  const sorted = ages.filter((a) => !Number.isNaN(a)).sort((a, b) => a - b)
  if (sorted.filter((a) => a < MAX_FEED_AGE_MS).length >= min) return MAX_FEED_AGE_MS
  if (sorted.length < min) return MAX_WIDENED_AGE_MS
  // Just past the min-th youngest, so exactly that many fall under it.
  return Math.min(MAX_WIDENED_AGE_MS, Math.max(MAX_FEED_AGE_MS, sorted[min - 1] + 1))
}
