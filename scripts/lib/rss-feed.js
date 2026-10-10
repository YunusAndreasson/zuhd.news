// What the RSS fetcher decides, apart from the fetching.
//
// `scripts/fetch-news.js` is requests from top to bottom, and the few
// decisions it takes between them could only be tried by running a cycle.
// They are here as functions of what a request returned.

/**
 * Whether asking a feed again in ten seconds could go differently.
 *
 * The retries are for a slow resolver and a server having a bad minute
 * (2026-10-08 22:03: 8 of the 26 feeds answered on the first try and 13 only
 * on the fourth), and every failure got them. A 403 or a 404 is the server's
 * answer and will be the same answer after the wait: thethirdpole.net answered
 * 403 in all of 41 cycles. Three more tries ten seconds apart add half a
 * minute to a stage that takes as long as its slowest feed. A timeout, a
 * connection that failed, a 5xx and the statuses that say "later" are worth
 * the wait.
 *
 * @param {unknown} err what the request threw: `HTTP 403` from `lib/http.js`, or the network's own error
 */
export function worthRetrying(err) {
  const status = Number(/^HTTP (\d{3})$/.exec(/** @type {Error} */ (err)?.message ?? '')?.[1])
  return !(status >= 400 && status < 500) || status === 408 || status === 425 || status === 429
}

/**
 * What a parsed feed document holds at its top, for the line that says it
 * gave no items: `<rss> with channel` where an Atom feed was expected,
 * `<html> with head, body` where the address now serves a page.
 *
 * @param {unknown} feed as fast-xml-parser returns it
 */
export function documentHolds(feed) {
  if (!feed || typeof feed !== 'object') return `a ${feed === null ? 'null' : typeof feed}`
  /** @param {object} node */
  const elements = (node) => Object.keys(node).filter((k) => !k.startsWith('?') && !k.startsWith('@_') && k !== '#text')
  const roots = elements(feed)
  if (roots.length === 0) return 'no element'
  return roots
    .map((root) => {
      const node = /** @type {Record<string, unknown>} */ (feed)[root]
      const inside = node && typeof node === 'object' ? elements(node).slice(0, 6) : []
      return inside.length > 0 ? `<${root}> with ${inside.join(', ')}` : `<${root}>`
    })
    .join(' and ')
}

/**
 * The ids to look up from Hacker News's best-stories list: the first fifteen.
 * None when the answer is not a list: Firebase answers `null`, with a 200, for
 * a path it does not hold, and `null.slice` threw away Algolia's stories too.
 *
 * @param {unknown} answer
 * @returns {unknown[]}
 */
export const bestStoryIds = (answer) => (Array.isArray(answer) ? answer.slice(0, 15) : [])

/**
 * One list of stories from Algolia's search and the best-stories items: each
 * story once, by its id, with an address and a headline, and a best-stories
 * item only from 100 points.
 *
 * A story with no headline is left out here. It used to go on, and the
 * fetcher's `main` took the fingerprint of an undefined title: one such item
 * would have cost the cycle its whole RSS feed.
 *
 * @param {any} algolia the search's answer; anything without a list of `hits` holds none
 * @param {any[]} bestItems each an item, or null where its lookup failed
 * @returns {{ title: string, url: string, score: number, comments: number, time: number }[]}
 */
export function hackerNewsStories(algolia, bestItems) {
  const seen = new Set()
  const all = []
  for (const h of Array.isArray(algolia?.hits) ? algolia.hits : []) {
    if (!h?.url || !h.objectID || typeof h.title !== 'string') continue
    seen.add(String(h.objectID))
    all.push({ title: h.title, url: h.url, score: h.points, comments: h.num_comments || 0, time: h.created_at_i })
  }
  for (const b of bestItems) {
    if (!b?.url || typeof b.title !== 'string' || seen.has(String(b.id))) continue
    if ((b.score || 0) < 100) continue
    seen.add(String(b.id))
    all.push({ title: b.title, url: b.url, score: b.score, comments: b.descendants || 0, time: b.time })
  }
  return all
}

/**
 * The Hacker News stories in the order the fetcher takes them: of the ones
 * whose page was fetched, those that gave a body come first.
 *
 * Five pages are fetched and three stories used, "buffer for failures". The
 * three used were the top three by comments whether or not their fetch had
 * worked. On 2026-10-09 10:00, three of the five pages gave a body, and the
 * feed carried two stories whose whole text was "875 points, 1487 comments on
 * Hacker News" while two fetched pages went unused; 25 of the 40 cycles to
 * that date fetched fewer than five of five.
 *
 * @template {{ bodyText?: string | null }} T
 * @param {T[]} stories by comments, most first
 * @param {number} fetched how many of them, from the top, had their page fetched
 * @returns {T[]}
 */
export function bodiesFirst(stories, fetched) {
  const tried = stories.slice(0, fetched)
  return [...tried.filter((s) => s.bodyText), ...tried.filter((s) => !s.bodyText), ...stories.slice(fetched)]
}
