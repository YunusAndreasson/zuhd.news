// Shared dedup logic — used by prefilter-feed.js, dedup-selection.js, and backfill-selection.js.
// Single source of truth for matching rules and category floors.
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from './frontmatter.js'

export const CATEGORY_FLOORS = { politics: 3, economy: 3, science: 2, tech: 2 }

const ARTICLES_DIR = 'content/articles'

/** Load slugs of articles published within the last `cutoffMs` (default 48h). */
export function loadRecentSlugs(cutoffMs = 48 * 3600 * 1000) {
  const cutoff = Date.now() - cutoffMs
  try {
    return readdirSync(ARTICLES_DIR)
      .filter(f => {
        if (!f.endsWith('.md')) return false
        try {
          const content = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
          const { meta } = parseFrontmatter(content)
          const date = meta.date ? new Date(meta.date).getTime() : 0
          return date >= cutoff
        } catch { return false }
      })
      .map(f => f.replace('.md', ''))
  } catch { return [] }
}

/** Load eventUri → article slug arrays from the story ledger. */
export function loadLedgerEventUris() {
  const map = new Map()
  try {
    const ledger = JSON.parse(readFileSync('content/.story-ledger.json', 'utf-8'))
    for (const story of ledger.stories || []) {
      if (story.eventUri && story.articles?.length > 0) {
        map.set(story.eventUri, story.articles)
      }
    }
  } catch {}
  return map
}

/** Strip YYYY-MM-DD- prefix from a slug, return word set (words > 2 chars). */
export function slugWords(slug) {
  return new Set(slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').split('-').filter(w => w.length > 2))
}

/** Build {slug, words} arrays for fuzzy matching. */
export function buildWordSets(slugs) {
  return slugs.map(s => ({ slug: s, words: slugWords(s) }))
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
 * Check whether a story would be removed by deterministic dedup.
 * Returns { deduped: false } or { deduped: true, reason: string, match: string }.
 */
export function wouldDedup(story, { recentSlugs, ledgerEventUris, recentWordSets }) {
  const slug = story.suggestedSlug
  // Layer 1: exact slug match
  if (existsSync(join(ARTICLES_DIR, slug + '.md'))) {
    return { deduped: true, reason: 'exact', match: slug }
  }
  // Layer 2: eventUri match — same event covered by a recent article
  if (story.eventUri && ledgerEventUris.has(story.eventUri)) {
    const existing = ledgerEventUris.get(story.eventUri)
    const hasRecent = existing.some(a => recentSlugs.some(r => r === a || r.endsWith(a)))
    if (hasRecent) {
      return { deduped: true, reason: 'eventUri', match: existing[existing.length - 1] }
    }
  }
  // Layer 3: fuzzy title/slug match
  const match = fuzzyMatch(slug, recentWordSets)
  if (match) {
    return { deduped: true, reason: 'fuzzy', match }
  }
  return { deduped: false }
}

/** Load all dedup context in one call. */
export function loadDedupContext(cutoffMs = 48 * 3600 * 1000) {
  const recentSlugs = loadRecentSlugs(cutoffMs)
  const ledgerEventUris = loadLedgerEventUris()
  const recentWordSets = buildWordSets(recentSlugs)
  return { recentSlugs, ledgerEventUris, recentWordSets }
}
