// Shared dedup logic — used by prefilter-feed.js, dedup-selection.js, and backfill-selection.js.
// Single source of truth for matching rules and category floors.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter.js'

// Must mirror the category-floor lines in select-prompt.md (tech raised 2→3 by
// experiment 2026-04-12-tech-floor-3; this constant lagged until 2026-07-03).
export const CATEGORY_FLOORS = { politics: 3, economy: 3, science: 2, tech: 3 }

const ARTICLES_DIR = 'content/articles'
const LEDGER_PATH = 'content/.story-ledger.json'

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
 * Normalisation is deliberately shallow — host and path only. Query strings are
 * dropped because the observed collisions differed only in tracking parameters,
 * and a publisher that encodes the article id in the query (some wires do) still
 * matches on path, which is the conservative direction: this layer should miss a
 * duplicate rather than suppress a distinct story.
 */
export function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return ''
  try {
    const u = new URL(raw.trim())
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    // A URL with no article path identifies a *site*, not a story, and must
    // never key this layer: two unrelated pieces were both filed against
    // `bankingnews.gr/index.php`, and treating that as identity would have
    // suppressed the second one. Found by running this layer over the live
    // corpus before shipping it.
    if (!path || GENERIC_PATHS.has(path)) return ''
    return `${host}${path}`
  } catch {
    return ''
  }
}

// Paths that name a section or a front page rather than an article.
const GENERIC_PATHS = new Set([
  '/index.php', '/index.html', '/index.htm', '/index',
  '/news', '/en', '/home', '/feed', '/rss', '/articles',
])

/** Load slug+title+date+source URLs for articles published within `cutoffMs` (default 48h). */
export function loadRecentArticles(cutoffMs = 48 * 3600 * 1000) {
  const cutoff = Date.now() - cutoffMs
  try {
    return readdirSync(ARTICLES_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        try {
          const content = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
          const { meta } = parseFrontmatter(content)
          const date = meta.date ? new Date(meta.date).getTime() : 0
          if (date < cutoff) return null
          const urls = (Array.isArray(meta.sources) ? meta.sources : [])
            .map(s => normalizeUrl(s?.url))
            .filter(Boolean)
          return { slug: f.replace('.md', ''), title: meta.title || '', date, urls }
        } catch { return null }
      })
      .filter(Boolean)
  } catch { return [] }
}

/** Load eventUri → article slug arrays from the story ledger. */
export function loadLedgerEventUris() {
  const map = new Map()
  try {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf-8'))
    for (const story of ledger.stories || []) {
      if (story.eventUri && story.articles?.length > 0) {
        map.set(story.eventUri, story.articles)
      }
    }
  } catch {}
  return map
}

/** Load ledger labels with first-seen timestamps for recap matching. */
export function loadLedgerLabels(cutoffMs = 10 * 24 * 3600 * 1000) {
  const cutoff = Date.now() - cutoffMs
  try {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf-8'))
    return (ledger.stories || [])
      .map(s => ({ slug: s.id, label: s.label || '', firstSeen: s.firstSeen ? new Date(s.firstSeen).getTime() : 0 }))
      .filter(s => s.label && s.firstSeen >= cutoff)
  } catch { return [] }
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
  return items.map(it => ({ slug: it.slug, title: it.title || it.label || '', words: titleWords(it.title || it.label || '') }))
}

/** Check if candidateSlug fuzzy-matches any recent slug (≥55% overlap, ≥3 words). */
export function fuzzyMatch(candidateSlug, recentWordSets) {
  const candidateWords = slugWords(candidateSlug)
  if (candidateWords.size === 0) return null
  for (const { slug, words } of recentWordSets) {
    const overlap = [...candidateWords].filter(w => words.has(w)).length
    const ratio = overlap / Math.min(candidateWords.size, words.size)
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
export function wouldDedup(story, ctx) {
  const { recentSlugs, ledgerEventUris, recentWordSets, recentTitleSets, ledgerLabelSets, recentUrls } = ctx
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
  if (story.eventUri && ledgerEventUris.has(story.eventUri)) {
    const existing = ledgerEventUris.get(story.eventUri)
    const hasRecent = existing.some(a => recentSlugs.some(r => r === a || r.endsWith(a)))
    if (hasRecent) {
      return { deduped: true, reason: 'eventUri', match: existing[existing.length - 1] }
    }
  }
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
  const recentArticles = loadRecentArticles(cutoffMs)
  const recentSlugs = recentArticles.map(a => a.slug)
  const ledgerEventUris = loadLedgerEventUris()
  const recentWordSets = buildWordSets(recentSlugs)
  // Recap layer reads titles independently with a wider lookback.
  const recapArticles = loadRecentArticles(Math.max(cutoffMs, RECAP_LOOKBACK_MS))
  const recentTitleSets = buildTitleSets(recapArticles)
  const ledgerLabelSets = buildTitleSets(loadLedgerLabels(Math.max(cutoffMs, RECAP_LOOKBACK_MS)))
  // URL → slug over the recap window, not the 48h one. A same-URL republish is
  // the same failure a recap is, so it gets the same lookback; the tighter
  // window is only right for slug-fuzzy, where a rewrite happens within a cycle.
  const recentUrls = new Map()
  for (const a of recapArticles) {
    for (const u of a.urls || []) if (!recentUrls.has(u)) recentUrls.set(u, a.slug)
  }
  return { recentSlugs, ledgerEventUris, recentWordSets, recentTitleSets, ledgerLabelSets, recentUrls }
}
