// What the two dispatch stages share.
//
// `narrate-indicators.js` and `narrate-events.js` are one program with two
// item lists: the same cache, the same checks on what the model hands back,
// the same prune. Neither can be imported without running, so nothing in
// either had a test. What is the same in both lives here, where one can reach
// it.

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
