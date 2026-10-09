// Shared dedup logic — used by prefilter-feed.js and dedup-selection.js.
// Single source of truth for matching rules and category floors.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { articleFilesSince } from './article-files.js'
import { pathOf } from './datasets.js'
import { readJson } from './json-file.js'

// Must mirror the category-floor lines in select-prompt.md (tech raised 2→3 by
// experiment 2026-04-12-tech-floor-3; this constant lagged until 2026-07-03).
export const CATEGORY_FLOORS = { politics: 3, economy: 3, science: 2, tech: 3 }

// Floors a cycle may miss rather than fill (user decision 2026-09-26). A thin
// science feed was filled with disasters — Bangkok flooding and an Athens gas
// blast shipped as science at 10:01. Read by dedup-selection's warning and the
// autoresearch scorer; nothing refills any floor since backfill was removed
// the same day.
export const FLOORS_MAY_GO_UNMET = new Set(['science'])

// A story is thin when no source carries this much text — an RSS teaser, not
// an article. prefilter flags it for the selector, and enrich-selection fetches
// the page once and drops the pick if it is still thin.
export const THIN_BODY = 400

/** @param {{ sources?: Array<{ body?: string }> }} story */
export function isThin(story) {
  return !(story.sources || []).some(src => (src?.body || '').length >= THIN_BODY)
}

const ARTICLES_DIR = pathOf('articles')
const LEDGER_PATH = pathOf('storyLedger')

// Niche RSS sources — must mirror SOURCES in scripts/fetch-news.js.
// A story whose every source is in this set is treated as niche-only and
// gets the extra recap check (see wouldDedup → reason: 'recap').
export const NICHE_SOURCES = new Set([
  '404 Media', 'Bellingcat', 'Mada Masr', 'Salaam Gateway', 'InSight Crime',
  'Declassified UK', 'Responsible Statecraft', 'Drop Site News', 'SMEX',
  'SciDev.Net', 'The Record', 'Phys.org', 'Quanta Magazine', 'Carbon Brief',
  'New Lines Magazine', 'The War Zone', 'CODA Story', 'European Spaceflight',
  'Undark', 'Inkstick', 'Noema', 'Rest of World', 'The Diplomat',
  'Lowy Interpreter', 'Dialogue Earth', 'Global Voices', 'Hacker News',
])

/**
 * Canonical form of a source URL, for identity comparison only.
 *
 * The slug, title and eventUri layers all compare *descriptions* of a story, so
 * two desks writing the same wire copy under different headlines slipped every
 * one of them: same URL, different slug, different title, no eventUri, both
 * published. The daily audit logged two such pairs on 2026-08-28 and its
 * duplicate check passed them because it compares slugs.
 *
 * The query string is KEPT, minus a tracking denylist. Dropping it wholesale
 * looks conservative and is the opposite: for any publisher that puts the
 * article id in the query, every article collapses to one key and distinct
 * stories start suppressing each other. Measured on the live corpus, path-only
 * matching produced 19 false-positive pairs — every Hacker News item shares
 * `news.ycombinator.com/item`, and 5 of the 6 HN-sourced articles would have
 * been dropped as duplicates of one another. Same for `bernama.com/en/news.php?id=`,
 * Haaretz's `?liveBlogItemId=`, and KBS's `?Seq_Code=`.
 *
 * Losing identity from a comparison key does not make the key miss; it makes
 * unlike things compare equal. Remaining params are sorted so ordering is not
 * mistaken for difference.
 */
export function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return ''
  try {
    const u = new URL(raw.trim())
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(k.toLowerCase()) || k.toLowerCase().startsWith('utm_')) {
        u.searchParams.delete(k)
      }
    }
    u.searchParams.sort()
    const query = u.searchParams.toString()
    // A URL with no article path AND no identifying query names a *site*, not a
    // story, and must never key this layer: two unrelated pieces were both filed
    // against `bankingnews.gr/index.php`. Found by running this layer over the
    // live corpus before shipping it.
    if ((!path || GENERIC_PATHS.has(path)) && !query) return ''
    return query ? `${host}${path}?${query}` : `${host}${path}`
  } catch {
    return ''
  }
}

// Paths that name a section or a front page rather than an article.
const GENERIC_PATHS = new Set([
  '/index.php', '/index.html', '/index.htm', '/index',
  '/news', '/en', '/home', '/feed', '/rss', '/articles',
])

// Campaign/referrer noise only. Anything not listed here is treated as
// potentially identifying — the safe default, per the note above.
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'msclkid', 'dclid', 'igshid', 'mc_cid', 'mc_eid',
  'ref', 'referrer', 'source', 'src', 'cmpid', 'ncid', 'sh', 'at_medium',
  'at_campaign', 'smid', 'partner', '__twitter_impression', 'guccounter',
])

/**
 * Load slug+title+date+source URLs for articles published within `cutoffMs` (default 48h).
 *
 * A directory that cannot be read throws. It used to give an empty list, and
 * with no recent articles every layer but the first has nothing to match
 * against: the prefilter printed "all feed stories are new" and each duplicate
 * went through to the selector. That is how the layers behaved whenever a
 * stage was started outside the repository root, until the path came from the
 * catalog, and nothing said so. One article that cannot be read is said and
 * left out; the rest still count.
 *
 * @param {number} [cutoffMs]
 * @param {string} [dir]
 */
export function loadRecentArticles(cutoffMs = 48 * 3600 * 1000, dir = ARTICLES_DIR) {
  const cutoff = Date.now() - cutoffMs
  let files
  try {
    files = articleFilesSince(dir, cutoff)
  } catch (err) {
    console.error(`dedup: ${dir} cannot be read (${err.message}), so nothing published can be matched`)
    throw err
  }
  return files
    .map(f => {
      try {
        const content = readFileSync(join(dir, f), 'utf-8')
        const { meta } = parseFrontmatter(content)
        const date = meta.date ? new Date(meta.date).getTime() : 0
        if (date < cutoff) return null
        const urls = (Array.isArray(meta.sources) ? meta.sources : [])
          .map(s => normalizeUrl(s?.url))
          .filter(Boolean)
        return { slug: f.replace('.md', ''), title: meta.title || '', date, urls }
      } catch (err) {
        console.error(`dedup: ${f} cannot be read (${err.message}) and is left out of the match`)
        return null
      }
    })
    .filter(Boolean)
}

/** Load eventUri → article slug arrays from the story ledger. */
export function loadLedgerEventUris() {
  const map = new Map()
  for (const story of readJson(LEDGER_PATH)?.stories || []) {
    if (story.eventUri && story.articles?.length > 0) {
      map.set(story.eventUri, story.articles)
    }
  }
  return map
}

/**
 * The ledger labels that stand for coverage: each story first seen since
 * `cutoff` that has an article among `published`.
 *
 * `update-ledger.js` runs before the writer, so the ledger also holds picks
 * that never became an article, and a label alone blocked the story for as
 * long as the ledger kept it. Two in nine days (2026-09-30 → 10-09), 5 of the
 * 6 label removals in those 41 cycles:
 * - 10-03 14:02, a 404 Media piece on the solar system's instability: the
 *   writer skipped it (the text the feed carried stopped before the study),
 *   and the same item was removed from the next four feeds as a recap of
 *   itself.
 * - 10-07 05:00, OpenAI's "Sharing AI progress in mathematics": written, moved
 *   aside by the validator for a missing field, removed from the 10:04 feed.
 * The sixth, a second report of Microsoft's green-card suspension, matched a
 * story that had been published, and still does.
 *
 * It is the rule `.last-cycle.json` is written by (`lib/last-cycle.js`): the
 * next cycle skips what was published, not everything that was selected. The
 * event layer always had it (`eventCoveredRecently`).
 *
 * @param {{ id: string, label?: string, firstSeen?: string, articles?: string[] }[]} stories the ledger's
 * @param {Set<string>} published the slugs of the articles on disk
 * @param {number} cutoff ms
 */
export function coveredLabels(stories, published, cutoff) {
  return stories
    .filter(s => (s.articles || []).some(a => published.has(a)))
    .map(s => ({ slug: s.id, label: s.label || '', firstSeen: s.firstSeen ? new Date(s.firstSeen).getTime() : 0 }))
    .filter(s => s.label && s.firstSeen >= cutoff)
}

/** Load the ledger labels that stand for coverage (`coveredLabels`), for recap matching. */
export function loadLedgerLabels(cutoffMs, published) {
  return coveredLabels(readJson(LEDGER_PATH)?.stories || [], published, Date.now() - cutoffMs)
}

/** Strip YYYY-MM-DD- prefix from a slug, return word set (words > 2 chars). */
export function slugWords(slug) {
  return new Set(slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').split('-').filter(w => w.length > 2))
}

// Stop-list for title tokenization. Slug words are pre-filtered by URL-safe
// transformation; title words come from natural English and need a small
// stop list to avoid matching on connectives like "with"/"into"/"after".
const TITLE_STOP = new Set([
  'with', 'from', 'this', 'that', 'have', 'been', 'will', 'into', 'over',
  'after', 'before', 'about', 'more', 'than', 'what', 'when', 'then',
  'they', 'them', 'their', 'there', 'which', 'were', 'said', 'says',
  'also', 'your', 'could', 'would', 'should', 'might', 'being', 'these',
  'those', 'only', 'just', 'onto', 'upon', 'amid', 'amid',
])

/** Tokenize a free-form title for fuzzy matching. */
export function titleWords(title) {
  return new Set(
    String(title || '').toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !TITLE_STOP.has(w))
  )
}

/** Build {slug, words} arrays for fuzzy matching. */
export function buildWordSets(slugs) {
  return slugs.map(s => ({ slug: s, words: slugWords(s) }))
}

/** Build {slug, title, words} sets from articles for title-based fuzzy match. */
export function buildTitleSets(items) {
  return items.map(it => ({ slug: it.slug, title: it.title || it.label || '', date: it.date, words: titleWords(it.title || it.label || '') }))
}

// A word in this many recent slugs names a running story, not an event:
// `iran` sat in 7 of the 48h slugs on 2026-09-26, `hormuz` in 15 of them on
// 04-19. Sharing such words is what every follow-up on the arc does, so they
// are set aside before the overlap is counted. Measured over the eleven
// fuzzy removals logged 09-20 → 09-26 plus the corpus.test pins: every
// same-story rewrite keeps ≥3 rarer words in both the 48h and 7d windows,
// and the two false positives, "Trump rejects Iran's 7-day plan" and a Brent
// swing, both matched `iran-7-day-ceasefire-proposal-hormuz` on arc words.
const ARC_WORD_DF = 5

// Keyed by the array and its length: dedup-selection.js grows its batch set
// one pick at a time.
/** @type {WeakMap<object, { size: number, df: Map<string, number> }>} */
const slugWordDf = new WeakMap()

function arcWords(recentWordSets) {
  const cached = slugWordDf.get(recentWordSets)
  if (cached?.size === recentWordSets.length) return cached.df
  const df = new Map()
  for (const { words } of recentWordSets) for (const w of words) df.set(w, (df.get(w) || 0) + 1)
  slugWordDf.set(recentWordSets, { size: recentWordSets.length, df })
  return df
}

/**
 * Check if candidateSlug fuzzy-matches any recent slug (≥55% overlap, ≥3 words),
 * counting only words that are not common across the recent slugs.
 */
export function fuzzyMatch(candidateSlug, recentWordSets) {
  const df = arcWords(recentWordSets)
  const distinctive = (words) => [...words].filter(w => (df.get(w) || 0) < ARC_WORD_DF)
  const candidateWords = distinctive(slugWords(candidateSlug))
  if (candidateWords.length === 0) return null
  for (const { slug, words } of recentWordSets) {
    const recentWords = new Set(distinctive(words))
    if (recentWords.size === 0) continue
    const overlap = candidateWords.filter(w => recentWords.has(w)).length
    const ratio = overlap / Math.min(candidateWords.length, recentWords.size)
    if (ratio >= 0.55 && overlap >= 3) return slug
  }
  return null
}

/**
 * Recap match: niche-only stories often arrive 2-9 days after a major
 * outlet broke the same event. Slug-fuzzy misses them because slugs get
 * truncated and reordered. Title-fuzzy compares the natural-language
 * headline against recent article titles + ledger labels.
 *
 * Same overlap thresholds as fuzzyMatch (≥3 words, ≥0.55 ratio) — this
 * is not a relaxation, just an additional axis. Audit on 2026-05-02
 * showed it would have caught 20 historical recap pairs over 6 weeks
 * with a low rate of borderline calls (all of which were genuine days-
 * late reframings, not breaking news).
 */
export function recapMatch(candidateTitle, titleSets) {
  const cw = titleWords(candidateTitle)
  if (cw.size < 3) return null
  for (const { slug, words } of titleSets) {
    if (words.size < 3) continue
    const overlap = [...cw].filter(w => words.has(w)).length
    const ratio = overlap / Math.min(cw.size, words.size)
    if (ratio >= 0.55 && overlap >= 3) return slug
  }
  return null
}

const RECAP_ALL_WINDOW_MS = 72 * 3600 * 1000

function isNicheOnly(story) {
  const sources = story.sources || []
  if (sources.length === 0) return false
  return sources.every(s => NICHE_SOURCES.has(s?.name))
}

/**
 * Check whether a story would be removed by deterministic dedup.
 * Returns { deduped: false } or { deduped: true, reason, match }.
 *
 * Reasons: 'exact', 'url', 'eventUri', 'fuzzy', 'recap'.
 * 'recap' fires only for niche-only stories and uses title-word overlap
 * against recent article titles + ledger labels (catches reframed
 * headlines that slug-fuzzy misses).
 */
/**
 * The slug of a recent article already covering this NewsAPI event, or null.
 *
 * Layer 3 of `wouldDedup`, and also asked by `fetch-news-api.js` *before* it
 * spends a token expanding an event: the per-event budget went to the top 8
 * events by coverage, which are mostly running stories this layer then drops
 * (6 of 8 on 2026-09-25, the same events re-bought every cycle). One function,
 * so the fetcher skips exactly what prefilter would have thrown away.
 * @param {string | null | undefined} eventUri
 * @param {{ ledgerEventUris: Map<string, string[]>, recentSlugs: string[] }} ctx
 */
export function eventCoveredRecently(eventUri, ctx) {
  if (!eventUri || !ctx.ledgerEventUris.has(eventUri)) return null
  const existing = ctx.ledgerEventUris.get(eventUri)
  const hasRecent = existing.some(a => ctx.recentSlugs.some(r => r === a || r.endsWith(a)))
  return hasRecent ? existing[existing.length - 1] : null
}

export function wouldDedup(story, ctx) {
  const { recentWordSets, recentTitleSets, ledgerLabelSets, recentUrls } = ctx
  const slug = story.suggestedSlug
  // Layer 1: exact slug match
  if (existsSync(join(ARTICLES_DIR, `${slug}.md`))) {
    return { deduped: true, reason: 'exact', match: slug }
  }
  // Layer 2: same source URL — the strongest signal there is, and the one the
  // other layers cannot see. Two desks rewriting the same wire piece produce
  // different slugs and different titles off an identical link.
  if (recentUrls?.size) {
    const candidateUrls = [story.link, ...(story.sources || []).map(s => s?.url)]
      .map(normalizeUrl)
      .filter(Boolean)
    for (const u of candidateUrls) {
      const match = recentUrls.get(u)
      if (match) return { deduped: true, reason: 'url', match }
    }
  }
  // Layer 3: eventUri match — same event covered by a recent article
  const eventMatch = eventCoveredRecently(story.eventUri, ctx)
  if (eventMatch) return { deduped: true, reason: 'eventUri', match: eventMatch }
  // Layer 4: fuzzy slug match
  const slugMatch = fuzzyMatch(slug, recentWordSets)
  if (slugMatch) return { deduped: true, reason: 'fuzzy', match: slugMatch }

  // Layer 5: recap (niche-only stories only) — title-word overlap against
  // article titles and ledger labels in the lookback window.
  if (isNicheOnly(story) && story.title) {
    const titleMatch = recapMatch(story.title, recentTitleSets || [])
    if (titleMatch) return { deduped: true, reason: 'recap', match: titleMatch }
    const labelMatch = recapMatch(story.title, ledgerLabelSets || [])
    if (labelMatch) return { deduped: true, reason: 'recap', match: labelMatch }
  } else if (story.title) {
    // Every other story gets the title check too, over a shorter window. It
    // was niche-only, so a multi-source event published at 12:00 came back at
    // 17:00 under a new eventUri and a reworded slug and ran again — "Xi Visits
    // Washington" twice, the OpenAI/Australia breach three times in two days.
    // Measured on three 09-24/25 feeds: 8-10 hits each, every one an event
    // already published. 72h rather than the context's 7d, because a running
    // story's genuine next development does share the words.
    const since = Date.now() - RECAP_ALL_WINDOW_MS
    const recentOnly = (recentTitleSets || []).filter(t => (typeof t.date === 'number' ? t.date : Date.parse(t.date)) >= since)
    const titleMatch = recapMatch(story.title, recentOnly)
    if (titleMatch) return { deduped: true, reason: 'recap', match: titleMatch }
  }
  return { deduped: false }
}

// Recap-layer lookback: niche outlets were observed reposting events up to
// 10 days after the original break (2026-05-02 audit). Run the title-fuzzy
// recap match against a wider window than slug-fuzzy uses, since recaps
// arrive longer after the fact than selector slug-rewrites do.
const RECAP_LOOKBACK_MS = 14 * 24 * 3600 * 1000

/** Load all dedup context in one call. */
export function loadDedupContext(cutoffMs = 48 * 3600 * 1000) {
  // One read at the wider window; the slug-fuzzy window is a filter of it.
  const recapArticles = loadRecentArticles(Math.max(cutoffMs, RECAP_LOOKBACK_MS))
  const cutoff = Date.now() - cutoffMs
  const recentSlugs = recapArticles.filter(a => a.date >= cutoff).map(a => a.slug)
  const ledgerEventUris = loadLedgerEventUris()
  const recentWordSets = buildWordSets(recentSlugs)
  const recentTitleSets = buildTitleSets(recapArticles)
  const published = new Set(recapArticles.map(a => a.slug))
  const ledgerLabelSets = buildTitleSets(loadLedgerLabels(Math.max(cutoffMs, RECAP_LOOKBACK_MS), published))
  // URL → slug over the recap window, not the 48h one. A same-URL republish is
  // the same failure a recap is, so it gets the same lookback; the tighter
  // window is only right for slug-fuzzy, where a rewrite happens within a cycle.
  const recentUrls = new Map()
  for (const a of recapArticles) {
    for (const u of a.urls || []) if (!recentUrls.has(u)) recentUrls.set(u, a.slug)
  }
  return { recentSlugs, ledgerEventUris, recentWordSets, recentTitleSets, ledgerLabelSets, recentUrls }
}

/**
 * Take out of a selection what is already published, and what it holds twice.
 *
 * The layers of `wouldDedup` only ever compare a pick against
 * `content/articles/`, which holds nothing for a story still in this
 * selection, so two picks describing the same event sailed through as two new
 * stories and both got written (`skyroot-vikram-1-india-first-private-orbital-launch`
 * and `…-india-private-orbital-rocket`, both 2026-07-18, 83% overlap). Each
 * pick that survives is therefore also matched, by slug words, against the
 * picks kept before it.
 *
 * `floors` names each category the result leaves under its minimum. Nothing
 * refills one; `allowed` is whether that floor may go unmet.
 *
 * @param {any[]} selection
 * @param {ReturnType<typeof loadDedupContext>} ctx
 */
export function dedupSelection(selection, ctx) {
  /** @type {{ slug: string, reason: string, match: string }[]} */
  const removed = []
  /** @type {ReturnType<typeof buildWordSets>} */
  const batch = []
  const kept = selection.filter((s) => {
    const result = wouldDedup(s, ctx)
    if (result.deduped) {
      removed.push({ slug: s.suggestedSlug, reason: result.reason, match: result.match })
      return false
    }
    const twin = fuzzyMatch(s.suggestedSlug, batch)
    if (twin) {
      removed.push({ slug: s.suggestedSlug, reason: 'intra-batch', match: twin })
      return false
    }
    batch.push(...buildWordSets([s.suggestedSlug]))
    return true
  })

  /** @type {Record<string, number>} */
  const perCategory = {}
  for (const s of kept) perCategory[s.category] = (perCategory[s.category] || 0) + 1
  const floors = Object.entries(CATEGORY_FLOORS)
    .filter(([category, min]) => (perCategory[category] || 0) < min)
    .map(([category, min]) => ({ category, count: perCategory[category] || 0, min, allowed: FLOORS_MAY_GO_UNMET.has(category) }))
  return { kept, removed, floors }
}
