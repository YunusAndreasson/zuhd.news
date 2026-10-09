// What the two dispatch stages share.
//
// `narrate-indicators.js` and `narrate-events.js` are one program with two
// item lists: the same cache, the same checks on what the model hands back,
// the same prune. Neither can be imported without running, so nothing in
// either had a test. What is the same in both lives here, where one can reach
// it.

import { CC_TO_TOPOJSON_NAME } from '../../shared/countries/iso.ts'
import { matchesAnyTag } from './entity-registry.js'

/**
 * Our articles offered to the model for one item, the strongest claim first.
 *
 * `direct` is a resolved claim that the story is *about* the item (an
 * `entities[]` id, the company join); a `topicTags` hit is a word appearing
 * near it. Ranking the first above the second is what keeps the citation list
 * from filling with stories that merely say "sanctions".
 *
 * `countryTags` is the last tier and reads its own field: the ISO codes an
 * article's body links (`countries`, `lib/coverage-window.js`). **A code is
 * never matched as a tag.** The exchanges' codes were once folded into
 * `topicTags`, where a tag is lowercased and matched as a whole word, so
 * India's `IN` was the word "in": 833 of the 3,218 feed stories in the window
 * measured, against 195 that say "india", and the Bombay exchange was offered
 * the fortnight's largest stories with "in" in the headline.
 *
 * @param {any[]} articles `loadArticles`' rows, newest first
 * @param {{ direct?: (article: any) => boolean, topicTags?: string[], countryTags?: string[] }} want
 * @returns {any[]} every match, in tier order; the caller cuts it
 */
export function offeredArticles(articles, { direct, topicTags = [], countryTags = [] }) {
  const first = direct ? articles.filter(direct) : []
  const tagged = articles.filter((a) => !first.includes(a) && matchesAnyTag(topicTags, a.hay))
  if (countryTags.length === 0) return [...first, ...tagged]
  const taken = new Set([...first, ...tagged])
  const located = articles.filter((a) => !taken.has(a) && (a.countries || []).some((cc) => countryTags.includes(cc)))
  return [...first, ...tagged, ...located]
}

/**
 * Feed stories offered to the model for one item.
 *
 * For an attention series the join is the **Wikipedia article title**, which
 * is exact: `wiki-iran` is built from the pageviews of `Iran`, and a feed
 * story tagged with `en.wikipedia.org/wiki/Iran` is by construction a story
 * about the thing being read about. That exactness is what lets the attention
 * block explain an event instead of restating the metric.
 *
 * Everything else is whole-tag matching, and then the item's countries by
 * *name* (`CC_TO_TOPOJSON_NAME`): a feed story carries no country field, and a
 * two-letter code against a headline is a preposition (see `offeredArticles`).
 *
 * @param {any[]} feedWindow `loadFeedWindow`'s rows, in its order
 * @param {{ wikiTitle?: string | null, topicTags?: string[], countryTags?: string[] }} want
 * @returns {any[]} every match; the caller cuts it
 */
export function offeredStories(feedWindow, { wikiTitle, topicTags = [], countryTags = [] }) {
  if (wikiTitle) return feedWindow.filter((s) => s.conceptTitles.includes(wikiTitle))
  const tagged = feedWindow.filter((s) => matchesAnyTag(topicTags, s.hay))
  const names = countryTags.map((cc) => CC_TO_TOPOJSON_NAME[cc]).filter(Boolean)
  if (names.length === 0) return tagged
  const taken = new Set(tagged)
  return [...tagged, ...feedWindow.filter((s) => !taken.has(s) && matchesAnyTag(names, s.hay))]
}

/**
 * The definition a cache already holds under a fingerprint, or `''`.
 *
 * `standing` says what a thing is, and `standingFingerprint` is the thing's
 * identity: while one stands, so does the other. Both fields come back from
 * one call, though, and the stages stored whichever `standing` arrived with a
 * refreshed `recent`. So the fingerprint protected nothing. Brent's was
 * `46b7c3b0f3c54c37` on 2026-10-07, 08 and 09 under three different
 * sentences, and a daily pass rewrote about a hundred definitions whose
 * identity had not moved.
 *
 * `shared`: an entry under another key will do, and it is the first in the
 * file for every caller, so the entries that share an identity come to share
 * one sentence. The October and December FOMC meetings carried two
 * definitions of the committee, and the two ECB rows disagreed on how often
 * it meets.
 *
 * `prompt`: the entry must also have been written under this prompt hash
 * (its `prompt` key). For a fingerprint that does not itself carry the
 * prompt, or a rewritten rubric would never reach a definition.
 *
 * @param {Record<string, any>} items the cache's entries, by key
 * @param {string} key the item being written
 * @param {string} fingerprint its `standingFingerprint`
 * @param {{ shared?: boolean, prompt?: string }} [opts]
 * @returns {string}
 */
export function storedStanding(items, key, fingerprint, { shared = false, prompt } = {}) {
  const holds = (entry) =>
    entry?.standingFingerprint === fingerprint && Boolean(entry.standing) && (prompt === undefined || entry.prompt === prompt)
  if (!shared) return holds(items[key]) ? items[key].standing : ''
  for (const entry of Object.values(items)) if (holds(entry)) return entry.standing
  return ''
}

/**
 * The cached keys a prune may drop.
 *
 * A key is stale when no source carries it any more. It is dropped only when
 * the source that mints its kind of key gave at least one item this run: a
 * source that gave none did not load, and its paragraphs are not deleted on
 * that evidence.
 *
 * **Per source, never as a share of the whole cache.** The guard this replaces
 * declined the prune when the live set fell under 60% of the cached one, and a
 * cache only grows while its prune does not run: `--new-only` adds the
 * instruments that rotate in (Polymarket questions, the cycle's stock mentions)
 * four times a day and only the daily pass removes any. Once under the floor
 * it could not get back over it. The last prune ran on 2026-09-21 and left 118
 * entries; on 2026-10-09 the file held 390 against 157 live, and each daily
 * log kept since 2026-10-01 said a source payload looked missing when none was.
 *
 * @param {Iterable<string>} cached every key the cache holds
 * @param {Iterable<string>} live every key the sources carry now
 * @param {(key: string) => string} [sourceOf] the source that mints a key; one source when absent
 * @returns {{ drop: string[], held: Record<string, number> }} `held`: the stale
 *   keys kept, counted under the source that gave nothing
 */
export function staleKeys(cached, live, sourceOf = () => '') {
  const alive = new Set(live)
  const loaded = new Set([...alive].map(sourceOf))
  const drop = []
  /** @type {Record<string, number>} */
  const held = {}
  for (const key of cached) {
    if (alive.has(key)) continue
    const source = sourceOf(key)
    if (loaded.has(source)) drop.push(key)
    else held[source] = (held[source] ?? 0) + 1
  }
  return { drop, held }
}
