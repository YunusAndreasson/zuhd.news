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
 *
 * @param {string | number | Date} pubDate
 * @param {number} [now]
 */
export function feedItemAgeMs(pubDate, now = Date.now()) {
  const t = new Date(pubDate).getTime()
  if (Number.isNaN(t)) return NaN
  const dateOnly = t % DAY_MS === 0
  return now - (dateOnly ? Math.min(t + DAY_MS, now) : t)
}

// A time of day and the offset after it: `00:00:00 +1100`, `10:00:00 GMT+0200`,
// `T00:00:00+11:00`. Only a numeric offset: a named zone is left to the parser.
const TIME_AND_OFFSET = /\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:GMT|UTC?)?\s*([+-])(\d{2}):?(\d{2})\s*$/i

/** @param {number} ms */
const isoSecond = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

/**
 * An RSS item's date as the feed carries it: ISO, in UTC, never later than
 * `now`. `ahead` is how far past `now` the publisher's own date was, in ms.
 *
 * The date went into the story as the publisher printed it: RFC 822 with the
 * publisher's offset on 74 of the 77 items of 2026-10-09 10:00, left to the
 * selector to convert, and bounded by nothing.
 *
 * - **A date that has not happened yet** is taken as now. The Record stamped
 *   an item `Sat, 10 Oct 2026 00:55:00 GMT` on the 9th; the article went out at
 *   10:12 dated nearly fifteen hours ahead, first on every surface until then.
 * - **Local midnight is a date with no time**, as midnight UTC is
 *   (`feedItemAgeMs`), and becomes that date at `T00:00:00Z`. Lowy Interpreter
 *   stamps `00:00:00 +1100`: read as 13:00 the day before, none of its three
 *   items survived that cycle's 15.6 h cut on the day they are dated. East of
 *   Greenwich the date begins before UTC's does, and for those hours the
 *   instant stands, since the date alone would be ahead of now.
 * - **No date at all** is the fetch time, as it always was.
 * - **A date that does not parse** is left as it came: nothing downstream
 *   takes it for fresh.
 *
 * @param {unknown} raw
 * @param {number} [now]
 * @returns {{ pubDate: string, ahead: number }}
 */
export function feedPubDate(raw, now = Date.now()) {
  if (raw === undefined || raw === null || raw === '') return { pubDate: isoSecond(now), ahead: 0 }
  const t = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw).getTime() : NaN
  if (Number.isNaN(t)) return { pubDate: String(raw), ahead: 0 }
  if (t > now) return { pubDate: isoSecond(now), ahead: t - now }
  const offset = typeof raw === 'string' ? TIME_AND_OFFSET.exec(raw) : null
  const local = offset ? t + (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60_000 : t
  return { pubDate: isoSecond(local % DAY_MS === 0 && local <= now ? local : t), ahead: 0 }
}

/**
 * Young enough for the selector's pool. A pubDate that does not parse never
 * is. An RSS item with no date at all does not arrive here undated: it has the
 * fetch time (`feedPubDate`), so it is as young as an item can be.
 *
 * @param {string | number | Date} pubDate
 * @param {number} [now]
 * @param {number} [maxAgeMs]
 */
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
