// What the two dispatch stages share.
//
// `narrate-indicators.js` and `narrate-events.js` are one program with two
// item lists: the same cache, the same checks on what the model hands back,
// the same prune. Neither can be imported without running, so nothing in
// either had a test. What is the same in both lives here, where one can reach
// it.
//
// What is *not* here is what makes a cache key: each script's item list, its
// bundle, and its two fingerprint functions. A key is sha1 over the JSON of a
// literal, key order included, and a literal moved is a literal one edit from
// being rewritten: every cached paragraph, asked for again.

import { readFileSync } from 'node:fs'
import { CC_TO_TOPOJSON_NAME } from '../../shared/countries/iso.ts'
import { callClaudeJson, cleanProse } from './claude-envelope.js'
import { runWithConcurrency } from './concurrency.js'
import { matchesAnyTag } from './entity-registry.js'
import { promptEcho, promptExamples, seriesEchoes, validateNumbers, validateProperNouns } from './grounding.js'
import { readJson, writeJson } from './json-file.js'
import { modelFor } from './models.js'

/** The window everything recent is measured over. Two weeks is long enough that
 *  a weekly-published series has moved at least once, and short enough that
 *  "recently" is still an honest word for it. */
export const WINDOW_DAYS = 14
/** Offered to the model, not shown to the reader — `citations` is what the
 *  reader sees, and it is capped at 6 by the prompt. */
export const MAX_COVERAGE = 12
export const MAX_FEED = 12
const MAX_CITATIONS = 6
const STANDING_CAP = 240
export const RECENT_CAP = 360
/** A sentence is refused past this many times its cap, not at the cap: the
 *  cap is what the prompt asks for. */
const CAP_SLACK = 1.4
const CONCURRENCY = 3
/**
 * Above this share of an example's 5-grams, the output *is* the example.
 *
 * Calibrated on the 2026-09-05 dispatch, where the live Brent definition scored
 * 1.0 against the indicator prompt's own sample sentence and the three FOMC
 * events scored 0.49–0.63 against a shared one. Nothing genuine came near it:
 * the exchange standings written the same day against Warsaw and Doha examples
 * peaked at 0.2.
 */
const PROMPT_ECHO_REJECT = 0.5
/**
 * **Checkpointed, because a run that is killed must not cost what it spent.**
 * The cache used to be written once, after the loop, and the daily indicator
 * pass — serial behind a synchronous spawn until 2026-09-25 — hit
 * `timeout 1500` on six of eight days and threw away ~100 finished Opus calls
 * each time. Every `CHECKPOINT_EVERY` new items and on SIGTERM the finished
 * entries go to disk; the prune and `generatedAt` still belong to the end of a
 * complete run.
 */
const CHECKPOINT_EVERY = 10

// ── The prompt ────────────────────────────────────────────────────────────

/**
 * A stage's prompt file, and the worked examples in it: derived from the file
 * this run is sending, so `promptEcho` cannot measure against a list that has
 * fallen out of step. A missing file throws, with its path.
 *
 * @param {string} path
 * @returns {{ text: string, examples: string[] }}
 */
export function loadPrompt(path) {
  const text = readFileSync(path, 'utf8')
  return { text, examples: promptExamples(text) }
}

/**
 * A prompt with its INPUT block and the line that says what to hand back.
 *
 * Not in any cache key (a key hashes the prompt *file*), so an edit here
 * reaches no paragraph already written. The defaults are the dispatch
 * stages'; the disaster narrator passes its own two phrases.
 *
 * @param {string} base the prompt file's text
 * @param {unknown} bundle
 * @param {{ note?: string, shape?: string }} [opts]
 */
export const promptWithInput = (
  base,
  bundle,
  { note = 'this is the only material `recent` may draw from', shape = '{ "standing": "...", "recent": "...", "citations": [...] }' } = {},
) => `${base}

## INPUT (${note})

\`\`\`json
${JSON.stringify(bundle, null, 2)}
\`\`\`

Output ONLY the JSON object \`${shape}\`. No markdown, no fences.`

/**
 * One call to the model a stage writes with. Async on purpose: the stages run
 * these through a pool of three, and a synchronous spawn made that pool serial
 * (see `spawnClaude`).
 *
 * @param {'dispatch' | 'events'} use the model, by its use (`lib/models.js`)
 * @param {string} effortVar the environment variable that overrides the effort
 * @returns {(prompt: string) => ReturnType<typeof callClaudeJson>}
 */
export const askModel = (use, effortVar) => (prompt) =>
  callClaudeJson(prompt, { model: modelFor(use), effort: process.env[effortVar] || 'medium' })

// ── What an item is offered ───────────────────────────────────────────────

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

/** One of our articles as the model sees it. The keys and their order are the
 *  prompt's `coverage[]`; `slug` is also what a fingerprint hashes. */
export const coverageRow = (a) => ({
  slug: a.slug,
  title: a.title,
  date: String(a.date).slice(0, 10),
  dateline: a.location,
  lead: a.lead,
})

/** One feed story as the model sees it; `headline` is what a fingerprint hashes. */
export const feedRow = (s) => ({
  headline: s.title,
  date: s.date,
  source: s.source,
  outlets: s.outlets,
})

/**
 * The ledger's threads an item's tags name, three at most.
 *
 * @param {any[]} ledger the story ledger's `stories`
 * @param {string[]} topicTags
 */
export const threadsFor = (ledger, topicTags) =>
  ledger
    .filter((t) => matchesAnyTag(topicTags, String(t.label || '').toLowerCase()))
    .slice(0, 3)
    .map((t) => ({ label: t.label, arc: t.arc, summary: t.summary }))

// ── What comes back ───────────────────────────────────────────────────────

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
 * What to keep of one answer, and what was noticed on the way.
 *
 * **`standing` is not grounding-checked, and that is the field's definition
 * rather than an oversight.** It is the one place general knowledge is the
 * source — what Brent is, what the VIX measures — so a bundle it was never
 * meant to draw from cannot be the authority on it. Checked anyway at first,
 * and it rejected "The CBOE's index of expected S&P 500 swings" because the
 * 500 in an index's own name was not in the input. Length is the only gate,
 * and a `standing` that fails it rejects the item: there is nothing to show.
 * The caller chooses the sentence (the one already stored, a catalog blurb,
 * the model's); this judges the one it chose.
 *
 * `recent` claims what happened last week, so it gets both checks, and a
 * third: handing back the prompt's illustration is not an answer about this
 * item, and unlike a chart echo there is no reading on which it is partly
 * right, so that one gates rather than only counting. **A refused `recent` is
 * not a refused item**: the paragraph is stored empty, because the standing
 * sentence is still true and still an improvement on no prose at all.
 *
 * An echo in `standing` is **counted, never dropped**, which is the opposite
 * call and rests on what dropping costs. A rejected `standing` drops the whole
 * item, and the app's graph decks gate deck membership on having prose — so
 * gating there would delete the card to avoid a sentence that is at least
 * true. The prompt is the fix; the count is how the log says whether it
 * worked. `chartEchoes` is the same kind of measurement (`seriesEchoes`), for
 * a bundle that carries a `series`.
 *
 * @param {Record<string, any>} out the model's object
 * @param {{ coverage: { slug: string }[], series?: unknown }} bundle what it was given
 * @param {{ examples: string[], standing: string }} how
 * @returns {{ rejected: boolean, standing: string, recent: string, citations: string[], recentRaw: string,
 *   dropped: string | null, standingEcho: number | null, chartEchoes: string[] }} `rejected`: there is no
 *   definition to show, and nothing else in the verdict is to be stored
 */
export function judgeAnswer(out, bundle, { examples, standing }) {
  const recentRaw = cleanProse(out.recent)
  const recentEcho = recentRaw ? promptEcho(recentRaw, examples) : null
  const recentBad = recentRaw
    ? (validateNumbers(recentRaw, bundle) ??
       validateProperNouns(recentRaw, bundle) ??
       (recentEcho && recentEcho.frac >= PROMPT_ECHO_REJECT
         ? `reproduces a prompt example (${(recentEcho.frac * 100).toFixed(0)}%)`
         : null))
    : null

  const overCap = (s, cap) => s.length > cap * CAP_SLACK
  const recent = recentBad || overCap(recentRaw, RECENT_CAP) ? '' : recentRaw
  if (!standing || overCap(standing, STANDING_CAP)) {
    return { rejected: true, standing, recent: '', citations: [], recentRaw, dropped: null, standingEcho: null, chartEchoes: [] }
  }

  const standingEcho = promptEcho(standing, examples)
  const offered = new Set(bundle.coverage.map((c) => c.slug))
  const citations = (Array.isArray(out.citations) ? out.citations : [])
    .filter((s) => typeof s === 'string' && offered.has(s))
    .slice(0, MAX_CITATIONS)

  return {
    rejected: false,
    standing,
    recent,
    // A citation list without the sentence it supports is a related-articles
    // list with no argument behind it, which is what this stage replaced.
    citations: recent ? citations : [],
    recentRaw,
    dropped: recentRaw && !recent ? recentBad || 'over cap' : null,
    standingEcho: standingEcho && standingEcho.frac >= PROMPT_ECHO_REJECT ? standingEcho.frac : null,
    chartEchoes: recent ? seriesEchoes(recent, bundle.series) : [],
  }
}

// ── The cache ─────────────────────────────────────────────────────────────

/**
 * A dispatch cache as it is on disk, or an empty one.
 *
 * @param {string} path
 * @returns {{ items: Record<string, any> } & Record<string, any>}
 */
export function openCache(path) {
  const cache = readJson(path, { items: {} })
  if (!cache.items) cache.items = {}
  return cache
}

/**
 * Stamp a finished pass on its cache, and say whether it is worth writing.
 *
 * `generatedAt` is published: the build copies it onto `api/analysis.json`,
 * which the app fetches by its tag, and an unchanged tag needs unchanged
 * bytes. A `--new-only` pass runs four times a day and in steady state finds
 * nothing to write, and it stamped and wrote all the same: five of the 51
 * commits to the dispatch file from 2026-09-29 to 10-09 changed that one
 * line. Such a pass now leaves the cache as it found it. A pass that
 * wrote an entry stamps as before, and so does the daily one whatever it
 * wrote: it is the day's pass, and its prune may have changed the file.
 *
 * @param {Record<string, any>} cache stamped in place: `generatedAt`, `windowDays`
 * @param {{ newOnly?: boolean, generated: number, windowDays: number, now?: Date }} pass
 * @returns {boolean} false when there is nothing to write
 */
export function stampRun(cache, { newOnly = false, generated, windowDays, now = new Date() }) {
  if (newOnly && generated === 0) return false
  cache.generatedAt = now.toISOString()
  cache.windowDays = windowDays
  return true
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

// ── The run ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} Dispatch what a stage hands the loop
 * @property {string} cachePath
 * @property {{ items: Record<string, any> } & Record<string, any>} cache `openCache(cachePath)`, already read: a stage
 *   chooses its items from it
 * @property {{ key: string }[]} items every item the sources carry: what the prune keeps
 * @property {any[]} selected the items of this pass
 * @property {(item: any) => any} bundleOf what the model is given for one
 * @property {(item: any, bundle: any) => { standing: string, recent: string }} fingerprintsOf the stage's two keys
 * @property {(bundle: any) => Promise<{ out?: Record<string, any>, costUsd?: number, error?: string }>} ask
 * @property {string[]} examples the prompt's worked examples (`loadPrompt`)
 * @property {(item: any, written: string, fingerprint: string) => string} standingOf which definition to keep: the
 *   model's (`written`), the one stored, a catalog's
 * @property {Record<string, unknown>} [entryExtra] keys an entry carries beside the standard ones
 * @property {boolean} [force] ignore the cache
 * @property {boolean} [newOnly] a pass over unseen items only: no prune, and no stamp if it writes nothing
 * @property {(key: string) => string} [sourceOf] the source a key is minted from, for the prune
 * @property {number} [windowDays]
 */

/**
 * What a pass would do, without asking anything: each item's bundle, and
 * whether the cache already answers it. Returned as rows and printed.
 *
 * @param {Pick<Dispatch, 'cache' | 'selected' | 'bundleOf' | 'fingerprintsOf' | 'force'> & { label?: (item: any) => string }} run
 */
export function dryRun({ cache, selected, bundleOf, fingerprintsOf, force = false, label = (item) => item.key.padEnd(30) }) {
  const rows = selected.map((item) => {
    const bundle = bundleOf(item)
    const fp = fingerprintsOf(item, bundle)
    const prev = cache.items[item.key]
    const would = !prev ? 'call (new)'
      : force ? 'call (forced)'
      : prev.standingFingerprint !== fp.standing ? 'call (identity or prompt moved)'
      : prev.recentFingerprint !== fp.recent ? 'call (story moved)'
      : 'cached'
    return { key: item.key, bytes: JSON.stringify(bundle).length, coverage: bundle.coverage.length, feed: bundle.feedWindow.length, threads: bundle.threads.length, would, label: label(item) }
  })
  for (const r of rows) {
    console.log(`  ${r.label} ${String(r.bytes).padStart(6)}B  coverage=${r.coverage} feed=${r.feed} threads=${r.threads}  ${r.would}`)
  }
  const withNothing = rows.filter((r) => r.coverage === 0 && r.feed === 0)
  console.log(`\n${withNothing.length}/${rows.length} items have no coverage and no feed match:`)
  console.log(`  ${withNothing.map((r) => r.key).join(', ') || '(none)'}`)
  console.log(`${rows.filter((r) => r.would !== 'cached').length}/${rows.length} items would be asked for`)
  return rows
}

/**
 * One pass of a dispatch stage: for each selected item, the cache or a call,
 * the answer judged and stored; then the prune, the stamp and the write.
 *
 * The cache is checkpointed (`CHECKPOINT_EVERY`) and flushed on SIGTERM, so a
 * pass killed at its timeout keeps what it had finished. The events stage had
 * neither while this loop was written out twice.
 *
 * @param {Dispatch} run
 * @returns {Promise<{ generated: number, cacheHits: number, rejected: number, failed: number,
 *   recentDropped: number, chartEchoes: number, promptEchoes: number, costUsd: number }>}
 */
export async function runDispatch({
  cachePath, cache, items, selected, bundleOf, fingerprintsOf, ask, examples, standingOf,
  entryExtra = {}, force = false, newOnly = false, sourceOf, windowDays = WINDOW_DAYS,
}) {
  const counts = { generated: 0, cacheHits: 0, rejected: 0, failed: 0, recentDropped: 0, chartEchoes: 0, promptEchoes: 0, costUsd: 0 }
  const save = () => writeJson(cachePath, cache)
  const onTerm = () => {
    save()
    console.log(`  ⚠ SIGTERM — checkpointed ${counts.generated} new items before exit`)
    process.exit(143)
  }
  process.once('SIGTERM', onTerm)

  try {
    await runWithConcurrency(selected, CONCURRENCY, async (item) => {
      const bundle = bundleOf(item)
      const fp = fingerprintsOf(item, bundle)
      const prev = cache.items[item.key]

      if (!force && prev && prev.standingFingerprint === fp.standing && prev.recentFingerprint === fp.recent) {
        counts.cacheHits++
        return
      }

      const result = await ask(bundle)
      if (result.error) {
        counts.failed++
        console.log(`  ✗ ${item.key}: ${result.error}`)
        return
      }
      if (typeof result.costUsd === 'number') counts.costUsd += result.costUsd

      const standing = standingOf(item, cleanProse(result.out.standing), fp.standing)
      const kept = judgeAnswer(result.out, bundle, { examples, standing })
      if (kept.rejected) {
        counts.rejected++
        console.log(`  ✗ ${item.key}: standing missing or over cap — "${standing}"`)
        return
      }
      if (kept.standingEcho !== null) {
        counts.promptEchoes++
        console.log(`  ~ ${item.key}: standing is ${(kept.standingEcho * 100).toFixed(0)}% a prompt example — "${standing}"`)
      }
      if (kept.dropped) {
        counts.recentDropped++
        console.log(`  ~ ${item.key}: recent dropped (${kept.dropped}) — "${kept.recentRaw}"`)
      }
      // Logged and counted, never dropped — see `seriesEchoes`. The prompt
      // forbids repeating the chart; this line is how the log says whether it
      // listened.
      if (kept.chartEchoes.length > 0) {
        counts.chartEchoes++
        console.log(`  ~ ${item.key}: reads the chart (${kept.chartEchoes.join(', ')})`)
      }

      cache.items[item.key] = {
        standingFingerprint: fp.standing,
        recentFingerprint: fp.recent,
        ...entryExtra,
        standing: kept.standing,
        recent: kept.recent,
        citations: kept.citations,
        generatedAt: new Date().toISOString(),
      }
      counts.generated++
      if (counts.generated % CHECKPOINT_EVERY === 0) save()
      console.log(`  ✓ ${item.key}: ${kept.recent || kept.standing}`)
    })
  } finally {
    process.removeListener('SIGTERM', onTerm)
  }

  // Prune keys that have left every source, or the file grows a tail of
  // things the site no longer shows. The full pass only: a `--new-only` pass
  // has nothing to gain from bookkeeping the daily run does anyway.
  if (!newOnly) {
    const { drop, held } = staleKeys(Object.keys(cache.items), items.map((i) => i.key), sourceOf)
    for (const key of drop) delete cache.items[key]
    if (drop.length > 0) console.log(`  pruned ${drop.length} stale entries`)
    for (const [source, n] of Object.entries(held)) {
      console.log(`  ⚠ prune held ${n} stale entries: ${source || 'the source'} gave no items, so it did not load`)
    }
  }

  if (stampRun(cache, { newOnly, generated: counts.generated, windowDays })) save()
  return counts
}
