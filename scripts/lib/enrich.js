// What the writer is handed: the selector's picks, with the source text put
// back, and without the picks that have none worth writing from.
//
// The selector reads a feed with the bodies taken out (`lib/merge-feeds.js`),
// so each pick comes back as a title and a few addresses. This was the body of
// `scripts/enrich-selection.js`, in four steps the script ran top to bottom;
// they are the four functions here, and the script still runs them in that
// order and says what each did.
//
// Every one of them changes the selection's entries in place, as the script
// did: a later step reads what an earlier one left on the entry.

import { runWithConcurrency } from './concurrency.js'
import { THIN_BODY, isThin, titleWords } from './dedup.js'
import { selectionProblems } from './schema.js'
import { createMatcher } from './selection-match.js'

/** @typedef {import('./schema.js').FeedItem} FeedItem */
/** @typedef {import('./schema.js').FeedSource} FeedSource */

/** @param {unknown} v */
const isObject = (v) => Boolean(v) && typeof v === 'object'

/**
 * Before step 1. What the selector's file holds, as picks the steps can read.
 *
 * The selector is a model writing JSON, and every stage after it took the
 * shape on trust. A `sources` that was an object and not a list threw in
 * `unionSources`; an entry that was `null` threw in the matcher; a pick with
 * no `suggestedSlug` threw in `dedup-selection.js` (`slugWords`), and then
 * nothing in the selection was deduped. The cycle prints a stage's exit
 * status and goes on, so each of those handed the writer picks with no source
 * text. `selectionProblems` (`lib/schema.js`) already said what was wrong with
 * a selection, and nothing called it.
 *
 * Everything it reports is returned, for the stage to print. Three of those
 * problems are acted on, and nothing else about an entry is changed:
 * - an entry that is not an object is dropped;
 * - so is one with no `suggestedSlug` or no `title`: every later stage joins
 *   on the first, and the second is what the writer is given to go on;
 * - `sources` becomes a list: of the one source, where the selector wrote a
 *   source and not a list of them, and otherwise of what in it is a source.
 *
 * A selection with nothing wrong comes back as the same entries, untouched.
 *
 * @param {unknown} selection what the file held
 * @returns {{ picks: any[], problems: string[], dropped: { slug: string, reason: string }[], flagged: { slug: string, reason: string }[] }}
 *   `problems` is every phrase, as `selectionProblems` gives them; `dropped`
 *   the entries taken out and `flagged` what is wrong with the ones that stay,
 *   each named as `selectionProblems` names it: by its slug, or `#3` for the
 *   third when it has none
 */
export function readablePicks(selection) {
  const problems = selectionProblems(selection)
  /** @type {any[]} */
  const picks = []
  /** @type {{ slug: string, reason: string }[]} */
  const dropped = []
  for (const [i, entry] of (Array.isArray(selection) ? selection : []).entries()) {
    if (!isObject(entry)) {
      dropped.push({ slug: `#${i + 1}`, reason: 'not an object' })
      continue
    }
    const missing = ['suggestedSlug', 'title'].filter((k) => typeof entry[k] !== 'string' || entry[k] === '')
    if (missing.length > 0) {
      dropped.push({ slug: String(entry.suggestedSlug || `#${i + 1}`), reason: `no ${missing.join(', no ')}` })
      continue
    }
    if (!Array.isArray(entry.sources)) entry.sources = isObject(entry.sources) ? [entry.sources] : []
    else if (!entry.sources.every(isObject)) entry.sources = entry.sources.filter(isObject)
    picks.push(entry)
  }
  const gone = new Set(dropped.map((d) => d.slug))
  const flagged = problems
    .map((p) => {
      const cut = p.indexOf(': ')
      return cut < 0 ? { slug: 'selection', reason: p } : { slug: p.slice(0, cut), reason: p.slice(cut + 2) }
    })
    .filter((f) => !gone.has(f.slug))
  return { picks, problems, dropped, flagged }
}

/**
 * The matched story's sources, **plus** any the selector added.
 *
 * This used to be `entry.sources = hit.story.sources`, which threw away every
 * source the selector merged in — and `select-prompt.md` tells it to merge a
 * regional outlet into OIC-region stories from elsewhere in the feed. The
 * added source keeps whatever the feed holds for its URL (body, image); one
 * the feed has no copy of is dropped, since the writer cannot cite text it
 * was never given.
 *
 * @param {FeedSource[]} feedSources
 * @param {any[] | undefined} selectorSources
 * @param {Map<string, FeedSource>} byUrl the feed's copy of each source, by address
 */
export function unionSources(feedSources, selectorSources, byUrl) {
  const out = [...feedSources]
  const seen = new Set(out.map((s) => s.url).filter(Boolean))
  for (const s of selectorSources || []) {
    if (!s?.url || seen.has(s.url)) continue
    const fromFeed = byUrl.get(s.url)
    if (!fromFeed?.body) continue
    out.push({ ...s, ...fromFeed })
    seen.add(s.url)
  }
  return out
}

/**
 * Step 1. Find each pick's story in the feed and give the pick that story's
 * sources, text included. The matching is `lib/selection-match.js`: its five
 * layers, and why the last is deliberately hard to satisfy, are written there.
 *
 * A pick with no story keeps whatever `sources` the selector gave it.
 *
 * @param {any[]} selection
 * @param {{ multiSourceStories?: FeedItem[], nicheStories?: FeedItem[] }} feed the full feed
 * @returns {{ enriched: number, layers: Record<string, number>, missing: string[], notes: string[] }}
 *   `layers` counts the matches by the layer that made them; `missing` names
 *   each pick with no story, by slug or else by title; `notes` are the lines
 *   the stage puts on stderr, in order
 */
export function attachSources(selection, feed) {
  const allStories = [...(feed.multiSourceStories || []), ...(feed.nicheStories || [])]
  const match = createMatcher(allStories)

  // URL → the feed's copy of a source, bodies included, from every story.
  /** @type {Map<string, FeedSource>} */
  const feedSourceByUrl = new Map()
  for (const story of allStories) {
    for (const src of story.sources || []) {
      if (src?.url && !feedSourceByUrl.has(src.url)) feedSourceByUrl.set(src.url, src)
    }
  }

  let enriched = 0
  /** @type {string[]} */
  const missing = []
  /** @type {string[]} */
  const notes = []
  /** @type {Record<string, number>} */
  const layers = { link: 0, slug: 0, sourceUrl: 0, fingerprint: 0, keyword: 0 }

  for (const entry of selection) {
    const hit = match(entry)

    if (hit?.rejected) {
      notes.push(`  ⚠ keyword candidate rejected (${hit.rejected}): "${entry.title}" → "${hit.candidate.title}"`)
    }

    if (hit?.story?.sources) {
      const added = unionSources(hit.story.sources, entry.sources, feedSourceByUrl)
      if (added.length > hit.story.sources.length) {
        notes.push(`  + kept ${added.length - hit.story.sources.length} selector-merged source(s) on "${entry.title}"`)
      }
      entry.sources = added
      enriched++
      layers[hit.layer]++
      if (hit.layer === 'keyword') {
        notes.push(`  ⚠ KEYWORD fallback: "${entry.title}" → "${hit.story.title}" (${hit.detail})`)
      }
    } else {
      missing.push(entry.suggestedSlug || entry.title)
    }
  }
  return { enriched, layers, missing, notes }
}

/**
 * Step 2. The sources whose text is a feed teaser, across the whole
 * selection: the ones worth one page fetch each.
 *
 * @param {any[]} selection
 * @returns {{ url: string, body?: string }[]}
 */
export const thinSourcesOf = (selection) =>
  selection.flatMap((e) => (e.sources || []).filter((s) => s?.url && (s.body || '').length < THIN_BODY))

/**
 * Step 2, continued. Fetch each thin source's page, four at a time, and keep
 * the text where it is longer than what the feed gave. Free: the same
 * Readability extractor the angles stage uses. Before this the writer was
 * handed "No summary provided" and skipped the story (1-4 a cycle).
 *
 * @param {{ url: string, body?: string }[]} sources
 * @param {(url: string) => Promise<string | null>} fetchText null when the page gave nothing
 * @returns {Promise<number>} how many were filled
 */
export async function fillThinSources(sources, fetchText) {
  let filled = 0
  await runWithConcurrency(sources, 4, async (src) => {
    const text = await fetchText(src.url)
    if (text && text.length > (src.body || '').length) {
      src.body = text
      filled++
    }
  })
  return filled
}

// A pick's source text must hold this many of its title's words, and this
// share of them, to be about the story.
const RELEVANCE_MIN_HITS = 2
const RELEVANCE_MIN_RATIO = 0.3

/**
 * Step 3. Take out every pick the writer could not write, and say why of each
 * that had sources to begin with.
 *
 * - **Still thin after the fetch.** The writer would skip it anyway —
 *   2026-09-26 14:04 handed it a 307-character Undark teaser.
 * - **Source text that is not about the story.** The selector reads a
 *   body-less feed, so it cannot see that an item's only "body" is the wrong
 *   page — on 2026-09-25 22:04 the Dutch-government/NixOS pick carried a
 *   community group's mission blurb that never mentions NixOS, and the writer
 *   spent the slot finding that out. Measured on that selection: the bad pick
 *   matched 1 of 7 title words; every good one matched 57% or more. A title
 *   of fewer than three words is not judged.
 * - **No sources at all**: a pick step 1 found no story for. These are
 *   DROPPED, not passed through sourceless. The old header's claim that "a
 *   miss is honest — the writer skips the slot" was not enforced anywhere:
 *   run-cycle.sh hands this file straight to the writer, write-prompt.md has
 *   no rule for an empty `sources`, and validate-articles.js only checks that
 *   the *output* carries a sources block — an invented one passes. On
 *   2026-08-30 the writer did skip them and said so, but that was its
 *   judgement, not a guarantee, and the tightened matcher deliberately
 *   produces more misses.
 *
 * @param {any[]} selection
 * @returns {{ kept: any[], dropped: { entry: any, why: string }[] }}
 *   `dropped` holds the first two kinds, the thin ones first, each in the
 *   selection's order; `kept` is what goes to the writer
 */
export function dropUnwritable(selection) {
  /** @type {{ entry: any, why: string }[]} */
  const dropped = []
  for (const entry of selection) {
    if (Array.isArray(entry.sources) && entry.sources.length > 0 && isThin(entry)) {
      dropped.push({ entry, why: `still under ${THIN_BODY} characters of source text after the page fetch` })
      entry.sources = []
    }
  }

  for (const entry of selection) {
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) continue
    const words = [...titleWords(entry.title)]
    if (words.length < 3) continue
    const text = entry.sources.map((s) => (s.body || '').toLowerCase()).join(' ')
    const hits = words.filter((w) => text.includes(w)).length
    if (hits < RELEVANCE_MIN_HITS || hits / words.length < RELEVANCE_MIN_RATIO) {
      dropped.push({ entry, why: `its source text matches ${hits}/${words.length} title words — not about this story` })
      entry.sources = []
    }
  }

  return { kept: selection.filter((e) => Array.isArray(e.sources) && e.sources.length > 0), dropped }
}
