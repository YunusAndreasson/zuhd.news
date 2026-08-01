#!/usr/bin/env node
// Backtest the layer-4 recap dedup rule (added 2026-05-02) against the
// published-article corpus. For each niche-only article published in the
// window, build an as-of context using the article's pubDate, run wouldDedup
// against synthetic candidate, and record whether the recap layer would
// have fired against earlier corpus + ledger state.
//
// Two modes:
//   --mode published (default): walk content/articles/*.md
//   --mode snapshot          : walk content/.feed-snapshots-merged/*.json
//                              (pre-prefilter merged feed; only useful once
//                              the merge-feeds.js snapshot has accumulated)
//
// For published mode:
//   Pre-2026-05-02 niche-only articles flagged → "would have caught"
//                                                (recap was off in prod)
//   Post-2026-05-02 niche-only articles flagged → "false negative"
//                                                (recap was on, slipped through)
//
// Read-only: never touches content/ or git. No LLM calls.
//
// Usage:
//   node scripts/autoresearch/replay-recap-dedup.js \
//     [--mode published|snapshot] [--from 2026-05-02] [--to 2026-05-09] \
//     [--out /tmp/zuhd-replay-recap-dedup.json]

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NICHE_SOURCES,
  buildWordSets,
  buildTitleSets,
  wouldDedup,
  fuzzyMatch,
  recapMatch,
} from '../lib/dedup.js'
import { parseFrontmatter } from '../lib/frontmatter.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const SNAP_DIR_API = join(ROOT, 'content', '.feed-snapshots')
const SNAP_DIR_MERGED = join(ROOT, 'content', '.feed-snapshots-merged')

const PREFILTER_SLUG_WINDOW_MS = 7 * 24 * 3600 * 1000
const RECAP_TITLE_WINDOW_MS = 14 * 24 * 3600 * 1000

// Recap layer landed at this commit timestamp (532fb63).
const RECAP_LANDED_MS = new Date('2026-05-02T19:34:57Z').getTime()

function flag(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

const mode = flag('mode', 'published')
const fromDate = flag('from', '2026-05-02')
const toDate = flag('to', '2026-05-09')
const outPath = flag('out', '/tmp/zuhd-replay-recap-dedup.json')

// ── Corpus + ledger (loaded once) ──────────────────────────────────────────

function loadAllArticles() {
  const out = []
  for (const f of readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith('.md')) continue
    try {
      const { meta } = parseFrontmatter(readFileSync(join(ARTICLES_DIR, f), 'utf-8'))
      const dateMs = meta.date ? new Date(meta.date).getTime() : 0
      if (!dateMs) continue
      const sources = (meta.sources || []).map(s => ({ name: s?.name }))
      out.push({
        slug: f.replace('.md', ''),
        title: meta.title || '',
        category: meta.category || '',
        dateMs,
        sources,
      })
    } catch {}
  }
  return out.sort((a, b) => a.dateMs - b.dateMs)
}

function loadLedger() {
  if (!existsSync(LEDGER_PATH)) return []
  try {
    const j = JSON.parse(readFileSync(LEDGER_PATH, 'utf-8'))
    return (j.stories || []).map(s => ({
      slug: s.id,
      label: s.label || '',
      firstSeen: s.firstSeen ? new Date(s.firstSeen).getTime() : 0,
      eventUri: s.eventUri || null,
      articles: s.articles || [],
    }))
  } catch { return [] }
}

const ALL_ARTICLES = loadAllArticles()
const LEDGER_STORIES = loadLedger()

function isNicheOnly(sources) {
  if (!sources?.length) return false
  return sources.every(s => NICHE_SOURCES.has(s?.name))
}

// ── As-of context (excludes itself: strict dateMs < asOfMs) ────────────────

function buildAsOfContext(asOfMs, excludeSlug = null) {
  const slugLookback = asOfMs - PREFILTER_SLUG_WINDOW_MS
  const titleLookback = asOfMs - RECAP_TITLE_WINDOW_MS

  const slugArticles = ALL_ARTICLES.filter(a =>
    a.dateMs >= slugLookback && a.dateMs < asOfMs && a.slug !== excludeSlug)
  const titleArticles = ALL_ARTICLES.filter(a =>
    a.dateMs >= titleLookback && a.dateMs < asOfMs && a.slug !== excludeSlug)

  const recentSlugs = slugArticles.map(a => a.slug)
  const ledgerEventUris = new Map()
  for (const s of LEDGER_STORIES) {
    if (!s.eventUri || !s.articles.length) continue
    if (s.firstSeen && s.firstSeen >= asOfMs) continue
    ledgerEventUris.set(s.eventUri, s.articles.filter(a => a !== excludeSlug))
  }
  const recentWordSets = buildWordSets(recentSlugs)
  const recentTitleSets = buildTitleSets(titleArticles.map(a => ({ slug: a.slug, title: a.title })))
  const ledgerLabelSets = buildTitleSets(
    LEDGER_STORIES
      .filter(s => s.firstSeen >= titleLookback && s.firstSeen < asOfMs && s.label && s.slug !== excludeSlug)
      .map(s => ({ slug: s.slug, title: s.label })),
  )

  return { recentSlugs, ledgerEventUris, recentWordSets, recentTitleSets, ledgerLabelSets }
}

// ── Mode: published ────────────────────────────────────────────────────────

function runPublished() {
  const fromMs = new Date(`${fromDate}T00:00:00Z`).getTime()
  const toMs = new Date(`${toDate}T23:59:59Z`).getTime()
  const inWindow = ALL_ARTICLES.filter(a => a.dateMs >= fromMs && a.dateMs <= toMs)

  const totals = {
    articlesScanned: inWindow.length,
    nicheOnlyArticles: 0,
    recapWouldHaveCaught: 0,        // pre-2026-05-02 publishes
    recapFalseNegative: 0,          // post-2026-05-02 publishes (recap was on but didn't fire)
    recapTotalMatches: 0,
    matchedByOtherLayer: 0,         // exact/eventUri/fuzzy fired before recap (not a recap-only catch)
  }

  const catches = []

  for (const a of inWindow) {
    if (!isNicheOnly(a.sources)) continue
    totals.nicheOnlyArticles++

    const ctx = buildAsOfContext(a.dateMs, a.slug)
    // wouldDedup's layer 1 reads disk and would self-match the article being
    // replayed. Inline layers 3 (fuzzy slug) + 4 (recap title) only — layers
    // 1 (exact) and 2 (eventUri) can't fire on a published-article candidate
    // because the article exists on disk and we have no eventUri to test.
    const fuzzy = fuzzyMatch(a.slug, ctx.recentWordSets)
    if (fuzzy) {
      totals.matchedByOtherLayer++
      catches.push({
        slug: a.slug, title: a.title,
        pubDate: new Date(a.dateMs).toISOString(),
        category: a.category, sources: a.sources.map(s => s.name),
        matchedAgainst: fuzzy, matchReason: 'fuzzy', regime: 'other-layer',
      })
      continue
    }
    const titleHit = recapMatch(a.title, ctx.recentTitleSets)
    const labelHit = titleHit ? null : recapMatch(a.title, ctx.ledgerLabelSets)
    const match = titleHit || labelHit
    if (!match) continue

    totals.recapTotalMatches++
    const regime = a.dateMs < RECAP_LANDED_MS ? 'would-have-caught' : 'false-negative'
    if (regime === 'would-have-caught') totals.recapWouldHaveCaught++
    else totals.recapFalseNegative++

    catches.push({
      slug: a.slug, title: a.title,
      pubDate: new Date(a.dateMs).toISOString(),
      category: a.category, sources: a.sources.map(s => s.name),
      matchedAgainst: match, matchReason: titleHit ? 'recap-title' : 'recap-label', regime,
    })
  }

  return { totals, catches }
}

// ── Mode: snapshot (post-merge feed, once data exists) ─────────────────────

function runSnapshot() {
  const dir = existsSync(SNAP_DIR_MERGED) ? SNAP_DIR_MERGED : SNAP_DIR_API
  const usingMerged = dir === SNAP_DIR_MERGED
  if (!usingMerged) {
    console.error(`note: ${SNAP_DIR_MERGED} not found — falling back to ${SNAP_DIR_API} (API-only, no niche RSS sources)`)
  }
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .filter(f => f.slice(0, 10) >= fromDate && f.slice(0, 10) <= toDate)
    .sort()

  const totals = {
    snapshotsScanned: files.length,
    storiesScanned: 0,
    nicheOnlyStories: 0,
    recapNetCatches: 0,
    matchedByOtherLayer: 0,
  }
  const catches = []

  for (const f of files) {
    let raw
    try { raw = JSON.parse(readFileSync(join(dir, f), 'utf-8')) }
    catch (e) { console.error(`skip ${f}: ${e.message}`); continue }

    const stories = raw.stories
      || [...(raw.multiSourceStories || []), ...(raw.nicheStories || [])]
    const asOfMs = new Date(raw.fetchedAt).getTime()
    const ctx = buildAsOfContext(asOfMs)

    for (const s of stories) {
      totals.storiesScanned++
      if (isNicheOnly(s.sources)) totals.nicheOnlyStories++
      const r = wouldDedup(s, ctx)
      if (!r.deduped) continue
      if (r.reason === 'recap') {
        totals.recapNetCatches++
        catches.push({
          snapshot: f.replace('.json', ''),
          title: s.title,
          slug: s.suggestedSlug,
          category: s.category,
          sources: (s.sources || []).map(x => x.name),
          matchedAgainst: r.match,
        })
      } else {
        totals.matchedByOtherLayer++
      }
    }
  }
  return { totals, catches, source: usingMerged ? 'merged' : 'api-only' }
}

// ── Drive ──────────────────────────────────────────────────────────────────

const result = mode === 'snapshot' ? runSnapshot() : runPublished()
const report = {
  version: 1,
  mode,
  ranAt: new Date().toISOString(),
  window: { from: fromDate, to: toDate },
  recapLandedAt: new Date(RECAP_LANDED_MS).toISOString(),
  ...result,
}
writeFileSync(outPath, JSON.stringify(report, null, 2))

console.log(`\nReplay (${mode}) complete`)
if (mode === 'published') {
  const t = result.totals
  console.log(`  articles in window:       ${t.articlesScanned}`)
  console.log(`  niche-only articles:      ${t.nicheOnlyArticles}`)
  console.log(`  recap matches (total):    ${t.recapTotalMatches}`)
  console.log(`    pre-2026-05-02 (would have caught):  ${t.recapWouldHaveCaught}`)
  console.log(`    post-2026-05-02 (false negatives):   ${t.recapFalseNegative}`)
  console.log(`  matched by earlier layer: ${t.matchedByOtherLayer}`)
} else {
  const t = result.totals
  console.log(`  source:                ${result.source}`)
  console.log(`  snapshots:             ${t.snapshotsScanned}`)
  console.log(`  stories scanned:       ${t.storiesScanned}`)
  console.log(`  niche-only stories:    ${t.nicheOnlyStories}`)
  console.log(`  recap net catches:     ${t.recapNetCatches}`)
}
console.log(`\nReport: ${outPath}`)
