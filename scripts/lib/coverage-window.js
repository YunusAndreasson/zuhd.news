// Grounding sources shared by the LLM narration stages: our own published
// articles and the wider (mostly-unpublished) wire feed, both windowed back
// from a caller-supplied instant. Extracted out of `narrate-indicators.js`
// when `narrate-events.js` needed the identical join — see CLAUDE.md's
// shared-modules table for why a second copy of this is the failure mode.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { canonicalIndicatorId } from './entity-registry.js'

const ROOT = new URL('../..', import.meta.url).pathname
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const FEED_SNAP_DIR = join(ROOT, 'content', '.feed-snapshots-merged')

const iso = (t) => new Date(t).toISOString().slice(0, 10)

/**
 * Our published articles since `windowStart` (a `Date.now()`-style ms
 * timestamp).
 *
 * Filename-prefixed by date, so the window is a string comparison over
 * `readdirSync` rather than a parse of thousands of files.
 */
export const loadArticles = (windowStart) => {
  if (!existsSync(ARTICLES_DIR)) return []
  const cutoff = iso(windowStart)
  const out = []
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith('.md') || f.slice(0, 10) < cutoff) continue
    try {
      const { meta, body } = parseFrontmatter(readFileSync(join(ARTICLES_DIR, f), 'utf8'))
      if (!meta?.title) continue
      const concepts = (Array.isArray(meta.concepts) ? meta.concepts : [])
        .map((c) => (c && typeof c === 'object' ? c.label : c))
        .filter((s) => typeof s === 'string')
      out.push({
        slug: f.replace(/\.md$/, ''),
        title: meta.title,
        date: meta.date || f.slice(0, 10),
        location: meta.location || '',
        // The lead sentence carries the fact; the rest of a 350-character
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
 * Every distinct story the feed carried since `windowStart`, published or
 * not.
 *
 * This is the half of the grounding our own corpus cannot supply: we publish
 * a fraction of what the feed fetches, and "why is this being read about" is
 * very often answered by a story we never ran.
 *
 * Deduped on `link` because consecutive snapshots re-carry the same story —
 * five times a day for as long as it stays in the feed.
 */
export const loadFeedWindow = (windowStart) => {
  if (!existsSync(FEED_SNAP_DIR)) return []
  const cutoff = iso(windowStart)
  const files = readdirSync(FEED_SNAP_DIR)
    .filter((f) => f.endsWith('.json') && f.slice(0, 10) >= cutoff)
    .sort()
  const byLink = new Map()
  for (const f of files) {
    let snap
    try {
      snap = JSON.parse(readFileSync(join(FEED_SNAP_DIR, f), 'utf8'))
    } catch {
      continue
    }
    for (const key of ['multiSourceStories', 'nicheStories']) {
      for (const s of Array.isArray(snap[key]) ? snap[key] : []) {
        const link = s?.link || s?.title
        if (!link || byLink.has(link)) continue
        const concepts = Array.isArray(s.concepts) ? s.concepts : []
        byLink.set(link, {
          title: s.title || '',
          date: String(s.pubDate || '').slice(0, 10),
          source: s.source || '',
          outlets: Number(s.eventCoverage) || 0,
          // Wikipedia article titles, which is what `wiki-*` ids are minted
          // from — the join that makes the attention block explicable.
          conceptTitles: concepts
            .map((c) => String(c?.uri || '').split('/wiki/')[1] || '')
            .filter(Boolean)
            .map((t) => decodeURIComponent(t).replace(/_/g, ' ').toLowerCase()),
          hay: [s.title, ...concepts.map((c) => c?.label || '')].join(' ').toLowerCase(),
        })
      }
    }
  }
  return [...byLink.values()].sort((a, b) => b.outlets - a.outlets)
}
