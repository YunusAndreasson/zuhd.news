// Grounding sources shared by the LLM narration stages: our own published
// articles and the wider (mostly-unpublished) wire feed, both windowed back
// from a caller-supplied instant. Extracted out of `narrate-indicators.js`
// when `narrate-events.js` needed the identical join — see
// `.claude/rules/shared-modules.md` for why a second copy of this is the
// failure mode.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { canonicalIndicatorId } from './entity-registry.js'
import { ROOT } from './paths.js'

const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const FEED_SNAP_DIR = join(ROOT, 'content', '.feed-snapshots-merged')

const iso = (t) => new Date(t).toISOString().slice(0, 10)

/**
 * Our published articles since `windowStart` (a `Date.now()`-style ms
 * timestamp).
 *
 * Filename-prefixed by date, so the window is a string comparison over
 * `readdirSync` rather than a parse of thousands of files.
 *
 * @param {number} windowStart
 * @param {string} [dir] the articles' directory; a parameter for the tests
 */
export const loadArticles = (windowStart, dir = ARTICLES_DIR) => {
  if (!existsSync(dir)) return []
  const cutoff = iso(windowStart)
  const out = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || f.slice(0, 10) < cutoff) continue
    try {
      const { meta, body } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
      if (!meta?.title) continue
      const concepts = (Array.isArray(meta.concepts) ? meta.concepts : [])
        .map((c) => (c && typeof c === 'object' ? c.label : c))
        .filter((s) => typeof s === 'string')
      out.push({
        slug: f.replace(/\.md$/, ''),
        title: meta.title,
        date: meta.date || f.slice(0, 10),
        location: meta.location || '',
        // The lead sentence carries the fact; the rest of a 450-character
        // article is the why-it-matters the model would only paraphrase.
        lead: String(body || '')
          .trim()
          .split('\n')[0]
          .replace(/\[([^\]]+)\]\((?:country|https?):[^)]*\)/g, '$1')
          .slice(0, 260),
        // Canonicalised so a caller matching against a registry id (as
        // `narrate-indicators.js` does) can compare directly; a caller
        // matching on `topicTags` instead (as `narrate-events.js` does)
        // simply never reads this field.
        entityIds: (Array.isArray(meta.entities) ? meta.entities : [])
          .map((e) => e?.indicatorId)
          .filter(Boolean)
          .map(canonicalIndicatorId),
        // As the frontmatter carries them, for a join that reads more than an
        // id: which words a ticker was tied to, and which instruments the
        // entity stage judged the story to be *about* (`lib/companies.js`).
        // `subjects` is absent on a story that stage never read.
        concepts,
        entities: Array.isArray(meta.entities) ? meta.entities : [],
        ...(Array.isArray(meta.subjects) ? { subjects: meta.subjects } : {}),
        // The exchanges and straits the same reading judged it to be about
        // (`mkt:lse`, `cp:hormuz`); absent, like `subjects`, on a story it
        // never read.
        ...(Array.isArray(meta.venues) ? { venues: meta.venues } : {}),
        hay: [meta.title, meta.location, ...concepts].join(' ').toLowerCase(),
        // The ISO-2 codes the body links, which is the one place an article
        // states which countries it is *about* — `hay` carries a dateline and a
        // headline, and neither says that a story filed from Brussels is about
        // Turkey.
        //
        // **Partial, and a caller must treat it that way: 5,035 of 9,276
        // articles carry at least one link.** The writer adds them where the
        // prose names a country, so a story that says "a UK-resident son"
        // rather than "[the UK](country:GB)" has none. Good enough to be a
        // supplementary arm of a join, not good enough to be the only one.
        //
        // A field of its own rather than more words in `hay`, deliberately:
        // `hay` is substring-matched against editorial tag lists, and folding
        // two-letter codes into it would have `us`, `in` and `it` matching
        // ordinary prose. `build.js` keeps the same split for the same reason.
        countries: [...new Set(String(body || '').match(/\(country:([A-Z]{2})\)/g)?.map((m) => m.slice(9, 11)) || [])],
      })
    } catch {
      /* A malformed article is the corpus test's problem, not a narration stage's. */
    }
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

/**
 * A feed concept's label, in either shape the feed carries.
 *
 * The API's stories tag a concept as `{ label, uri }`; the RSS stories carry
 * the bare label. Only the first was read, so a bare one vanished: 7,053 of
 * the 16,955 concept entries in the window of 2026-10-09, all of them on RSS
 * stories, which then matched a tag on their title alone and could never
 * join a `wiki-*` row. `loadArticles` has always read both.
 */
const labelOf = (concept) => (typeof concept === 'string' ? concept : concept?.label || '')

/**
 * The Wikipedia title a feed concept names, lowercased and spaced as a
 * `wiki-*` row's is. From the URI where there is one; a bare label is the
 * title already.
 *
 * The decode is guarded. The URIs arrive unencoded (none of the 37,618 in the
 * snapshots kept on 2026-10-09 holds a `%`), so it changes nothing today, and
 * a title with a literal percent sign ("100% renewable energy") is a
 * `URIError` that would end both dispatch stages on every run until the
 * snapshot left the window, fourteen days on.
 */
const wikiTitleOf = (concept) => {
  if (typeof concept === 'string') return concept.trim().toLowerCase()
  const segment = String(concept?.uri || '').split('/wiki/')[1] || ''
  let title = segment
  try {
    title = decodeURIComponent(segment)
  } catch {
    /* a literal `%`: the segment is the title as it stands */
  }
  return title.replace(/_/g, ' ').toLowerCase()
}

/**
 * Every distinct story the feed carried since `windowStart`, published or
 * not.
 *
 * This is the half of the grounding our own corpus cannot supply: we publish
 * a fraction of what the feed fetches, and "why is this being read about" is
 * very often answered by a story we never ran.
 *
 * Deduped on `link` because consecutive snapshots re-carry the same story —
 * five times a day for as long as it stays in the feed.
 *
 * Ordered by how widely a story was carried, then newest first. **The second
 * key is most of the order**: two stories in three have no coverage count (the
 * RSS ones; 2,170 of 3,218 in the window of 2026-10-09), and while the sort
 * had only the first key they tied in the order they were first read, oldest
 * snapshot first. A caller that takes the top twelve was then handed the
 * thirteen-day-old headlines and never yesterday's, and the six a fingerprint
 * hashes changed whenever the oldest snapshot left the window.
 *
 * @param {number} windowStart
 * @param {string} [dir] the snapshots' directory; a parameter for the tests
 */
export const loadFeedWindow = (windowStart, dir = FEED_SNAP_DIR) => {
  if (!existsSync(dir)) return []
  const cutoff = iso(windowStart)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.slice(0, 10) >= cutoff)
    .sort()
  const byLink = new Map()
  for (const f of files) {
    let snap
    try {
      snap = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    } catch {
      continue
    }
    for (const key of ['multiSourceStories', 'nicheStories']) {
      for (const s of Array.isArray(snap[key]) ? snap[key] : []) {
        const link = s?.link || s?.title
        if (!link) continue
        const outlets = Number(s.eventCoverage) || 0
        const seen = byLink.get(link)
        if (seen) {
          // The count grows while a story is carried (one went from 1,647 to
          // 4,531 across snapshots), so the first sighting is where it is
          // smallest. A story is ranked by how far it went.
          if (outlets > seen.outlets) seen.outlets = outlets
          continue
        }
        const concepts = Array.isArray(s.concepts) ? s.concepts : []
        byLink.set(link, {
          title: s.title || '',
          date: String(s.pubDate || '').slice(0, 10),
          source: s.source || '',
          outlets,
          // Wikipedia article titles, which is what `wiki-*` ids are minted
          // from — the join that makes the attention block explicable.
          conceptTitles: concepts.map(wikiTitleOf).filter(Boolean),
          hay: [s.title, ...concepts.map(labelOf)].join(' ').toLowerCase(),
        })
      }
    }
  }
  return [...byLink.values()].sort((a, b) => b.outlets - a.outlets || b.date.localeCompare(a.date))
}
