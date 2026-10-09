// What two stages ask of Wikimedia's REST API, and how they both say who is
// asking.
//
// `trends-sources/wikipedia.js` charts the pageviews of the concepts the site
// has been covering; `trending-gaps.js` reads yesterday's most-read pages for
// the ones it has not. They are two clients of one API and shared nothing:
// the same user agent spelled twice, and the same request for a page's
// summary written twice, one reading the canonical title off it and the other
// the short description.

/**
 * Who we are, to Wikimedia. Its user-agent policy asks for a way to reach the
 * operator of a client, so this one carries an address where `ZUHD_UA`
 * (`lib/http.js`) carries only the site.
 */
export const WIKIMEDIA_UA = 'zuhd-news/1.0 (+https://zuhd.news; editorial@zuhd.news)'

/**
 * A page's summary (`/page/summary/{title}`), or null when it could not be
 * had: no such page, a refusal, a timeout.
 *
 * Null and not a throw, because both callers ask for many titles and one that
 * fails costs that title alone: a concept with no article is simply not
 * charted, and a top page with no description to judge is left off the list.
 *
 * @param {string} title as the API spells it, underscores for spaces
 * @param {{ timeoutMs?: number, signal?: AbortSignal, fetch?: typeof fetch }} [opts]
 *   `signal` is a deadline of the caller's own, kept alongside this call's.
 * @returns {Promise<Record<string, any> | null>}
 */
export async function wikiSummary(title, { timeoutMs = 10_000, signal, fetch: get = fetch } = {}) {
  const deadline = AbortSignal.timeout(timeoutMs)
  try {
    const res = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      headers: { 'User-Agent': WIKIMEDIA_UA, accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) ?? {}
  } catch {
    return null
  }
}
