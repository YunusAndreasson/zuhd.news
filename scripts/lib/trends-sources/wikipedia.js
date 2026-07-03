// Wikipedia Pageviews fetcher — dynamic source.
// Docs: https://wikimedia.org/api/rest_v1/#/Pageviews%20data
// Free, public-domain data. No auth, no key. Rate-limited informally — be
// polite with User-Agent + sensible request spacing.
//
// The "narrative attention" signal: when a story breaks, relevant Wiki
// articles spike in daily pageviews. A chart of those spikes under a brief
// entry shows the topic going mainstream — editorial substrate you can't
// get any other way.
//
// Dynamic by design: a static slug list would go stale in a week. Instead,
// each cycle scans the published articles from the last ARTICLE_WINDOW_DAYS
// days, ranks concepts by frequency, maps the top-N to Wikipedia slugs,
// fetches pageviews for each, and emits them as indicators. Our corpus
// drives which topics are charted.

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../frontmatter.js'

const WIKI_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news; editorial@zuhd.news)'
const ARTICLE_WINDOW_DAYS = 10 // concepts from last 10 days of published articles
const TOP_N_CONCEPTS = 15      // max Wikipedia series per cycle
const MIN_FREQUENCY = 2        // skip concepts that only appeared once (noise)

// Concepts too generic to chart — they exist in almost every brief and the
// pageviews don't tell a story ("Politics" averaging 5k views/day tells us
// nothing about the news cycle).
const GENERIC_DENYLIST = new Set([
  'Politics', 'Government', 'Economy', 'Currency', 'Nation-state',
  'Ceasefire', 'War', 'Diplomacy', 'Peace', 'Security',
  'International relations', 'Foreign policy', 'Democracy',
  'Law', 'Court', 'Justice', 'Judiciary',
  'Election', 'Parliament', 'Congress', 'Senate',
  'Company', 'Business', 'Market (economics)', 'Bank', 'Banking',
  'Technology', 'Science', 'Research',
  'United Nations', // too broad — UN agencies are more useful
])

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function formatPeriod(stamp) {
  const y = stamp.slice(0, 4)
  const m = stamp.slice(4, 6)
  const d = stamp.slice(6, 8)
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`)
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${date.getUTCDate()}`
}

/** Map a concept label to a Wikipedia slug. Mostly a space-to-underscore
 *  transform; trims punctuation that doesn't appear in Wiki article titles. */
function toWikiSlug(label) {
  return label
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\s+/g, '_')
    .replace(/[()]/g, '')
}

/** Stable id from a Wiki slug — lowercased, dashes, no unicode. */
function toIndicatorId(slug) {
  return 'wiki-' + slug
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

/** Scan recent articles, count concept frequency, return top N. */
function rankConceptsFromArticles(rootDir, windowDays) {
  const articlesDir = join(rootDir, 'content', 'articles')
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays)
  const cutoffPrefix = cutoff.toISOString().slice(0, 10) // YYYY-MM-DD

  const counts = {}
  let scanned = 0
  try {
    const files = readdirSync(articlesDir)
    for (const f of files) {
      if (!f.endsWith('.md')) continue
      // Article slugs are "YYYY-MM-DD-..." — cheap prefix filter.
      const datePart = f.slice(0, 10)
      if (datePart < cutoffPrefix) continue
      try {
        const { meta } = parseFrontmatter(readFileSync(join(articlesDir, f), 'utf8'))
        if (!Array.isArray(meta.concepts)) continue
        scanned++
        for (const c of meta.concepts) {
          const label = (typeof c === 'object' ? c.label : c)
          if (!label || typeof label !== 'string') continue
          if (GENERIC_DENYLIST.has(label)) continue
          counts[label] = (counts[label] || 0) + 1
        }
      } catch {
        // per-file parse error — skip silently
      }
    }
  } catch (err) {
    console.error(`  ✗ wikipedia concept scan: ${err.message}`)
    return []
  }

  const ranked = Object.entries(counts)
    .filter(([, n]) => n >= MIN_FREQUENCY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N_CONCEPTS)

  console.log(`  · wikipedia: ranked ${ranked.length} concepts from ${scanned} recent articles (≥${MIN_FREQUENCY} occurrences)`)
  return ranked.map(([label, count]) => ({ label, count }))
}

/** Resolve a title through Wikipedia's summary endpoint to its canonical
 *  form. Pageviews count redirect titles separately — "Recep_Erdogan" 404s
 *  or undercounts while "Recep_Tayyip_Erdoğan" carries the real series.
 *  Returns null when the page doesn't exist at all. */
async function resolveCanonicalTitle(title) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.titles?.canonical || null
  } catch {
    return null
  }
}

/** Fetch 30 days of daily pageviews for one Wikipedia article.
 *  Returns null on 404 or any error; the orchestrator skips nulls. */
async function fetchOnePageview(title) {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)
  const url = `${WIKI_BASE}/${encodeURIComponent(title)}/daily/${ymd(start)}/${ymd(end)}`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const items = Array.isArray(data.items) ? data.items : []
    if (items.length < 5) return null
    const values = items.map((i) => Number(i.views) || 0)
    const periods = items.map((i) => formatPeriod(i.timestamp))
    const asOf = `${items[items.length - 1].timestamp.slice(0, 4)}-${items[items.length - 1].timestamp.slice(4, 6)}-${items[items.length - 1].timestamp.slice(6, 8)}`
    return { values, periods, asOf }
  } catch {
    return null
  }
}

/**
 * Dynamic-mode fetcher. Invoked by fetch-trends.js with no arguments for
 * `dynamic` sources (mirroring the Polymarket shape). Returns an array of
 * IndicatorDef-shaped objects with values/periods/asOf filled in, ready to
 * be written to the snapshot.
 *
 * @returns {Promise<Array<object>>}
 */
export async function fetchWikipediaTrendingConcepts() {
  const rootDir = new URL('../../..', import.meta.url).pathname
  const concepts = rankConceptsFromArticles(rootDir, ARTICLE_WINDOW_DAYS)
  if (concepts.length === 0) {
    console.log('  · wikipedia: no concepts found in recent articles')
    return []
  }

  const results = []
  for (const { label, count } of concepts) {
    let slug = toWikiSlug(label)
    let pv = await fetchOnePageview(slug)
    if (!pv) {
      // The naive slug may be a redirect (pageviews tracks redirects as
      // separate, near-empty titles) — resolve to canonical and retry once.
      const canonical = await resolveCanonicalTitle(slug)
      if (canonical && canonical !== slug) {
        pv = await fetchOnePageview(canonical)
        if (pv) slug = canonical
      }
    }
    if (!pv) continue // page genuinely absent — common for proper names that lack Wiki articles
    results.push({
      id: toIndicatorId(slug),
      label: `${label} — Wikipedia views`,
      unit: 'views/day',
      source: 'wikipedia',
      seriesId: slug,
      cadence: 'daily',
      // Tag the concept label itself plus common variants — Claude matches
      // articles against these to pick charts.
      topicTags: [label.toLowerCase()],
      defaultHighlight: 'max',
      sourceLabel: 'Wikipedia pageviews',
      values: pv.values,
      periods: pv.periods,
      asOf: pv.asOf,
      _corpusCount: count, // informational — how often we covered this in the window
    })
  }

  console.log(`  · wikipedia: ${results.length}/${concepts.length} concepts resolved to live pageviews`)
  return results
}

// Backward-compat re-export (nothing imports the old name anymore, but keep
// the module surface minimal and predictable).
export { fetchWikipediaTrendingConcepts as fetchWikipediaPageviews }
