#!/usr/bin/env node
// RSS fetcher — niche sources not in the NewsAPI.ai index.
// These provide editorial taste: specialist tech, investigative, Muslim world.
// Output: /tmp/zuhd-feed-rss.json (merged with API feed by merge-feeds.js)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { slugify, fingerprint, zuhdCategory } from './lib/utils.js'
import { shouldSkip, recordResult } from './lib/block-cache.js'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')

// Shared parser — reused across all sources (same options for RSS/Atom/RDF)
const rssParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  htmlEntities: true,
})

// ── Source → country code (where the outlet is legally based / editorial HQ) ─
// Fills the country field so RSS-sourced articles don't land with country:null.
const SOURCE_COUNTRY = {
  '404 Media': 'US',
  'Bellingcat': 'NL',
  'Mada Masr': 'EG',
  'Salaam Gateway': 'AE',
  'InSight Crime': 'US',
  'Declassified UK': 'GB',
  'Responsible Statecraft': 'US',
  'Drop Site News': 'US',
  'SMEX': 'LB',
  'SciDev.Net': 'GB',
  'The Record': 'US',
  'Phys.org': 'GB',
  'Quanta Magazine': 'US',
  'Carbon Brief': 'GB',
  'New Lines Magazine': 'US',
  'The War Zone': 'US',
  'CODA Story': 'US',
  'European Spaceflight': 'FR',
  'Undark': 'US',
  'Inkstick': 'US',
  'Noema': 'US',
  'Rest of World': 'US',
  'The Diplomat': 'US',
  'Lowy Interpreter': 'AU',
  'Dialogue Earth': 'GB',
  'Global Voices': 'NL',
  'Hacker News': 'US',
}

// ── Sources — only those NOT reliably indexed by NewsAPI.ai ─────────

// Only sources NOT reliably indexed by NewsAPI.ai.
// Nature, OCCRP, Wamda moved to API curated list (they return articles there).
const SOURCES = [
  // Hacker News fetched via Algolia API — see fetchHackerNews() below
  { name: '404 Media',      url: 'https://404media.co/rss/',                   format: 'rss2', defaultCategory: 'tech' },
  { name: 'Bellingcat',     url: 'https://www.bellingcat.com/feed/',            format: 'rss2' },
  { name: 'Mada Masr',      url: 'https://www.madamasr.com/en/feed/',          format: 'rss2' },
  { name: 'Salaam Gateway', url: 'https://salaamgateway.com/feed',             format: 'atom', defaultCategory: 'economy' },
  { name: 'InSight Crime',  url: 'https://insightcrime.org/feed/',              format: 'rss2' },
  { name: 'Declassified UK', url: 'https://declassifieduk.org/feed/',          format: 'rss2' },
  { name: 'Responsible Statecraft', url: 'https://responsiblestatecraft.org/feed/', format: 'rss2' },
  { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed',          format: 'rss2' },
  { name: 'SMEX',           url: 'https://smex.org/feed/',                     format: 'rss2', defaultCategory: 'tech' },
  { name: 'SciDev.Net',     url: 'https://www.scidev.net/global/global_rss.xml', format: 'rss2', defaultCategory: 'science' },
  { name: 'The Record',     url: 'https://therecord.media/feed',                format: 'rss2', defaultCategory: 'tech' },
  { name: 'Phys.org',       url: 'https://phys.org/rss-feed/',                  format: 'rss2', defaultCategory: 'science' },
  { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/',       format: 'rss2', defaultCategory: 'science' },
  { name: 'Carbon Brief',   url: 'https://www.carbonbrief.org/feed/',           format: 'rss2', defaultCategory: 'science' },
  { name: 'New Lines Magazine', url: 'https://newlinesmag.com/feed/',            format: 'rss2' },
  { name: 'The War Zone',  url: 'https://www.twz.com/feed',                     format: 'rss2' },
  { name: 'CODA Story',    url: 'https://www.codastory.com/feed/',              format: 'rss2' },
  { name: 'European Spaceflight', url: 'https://europeanspaceflight.com/feed/',  format: 'rss2', defaultCategory: 'science' },
  { name: 'Undark',        url: 'https://undark.org/feed/',                      format: 'rss2', defaultCategory: 'science' },
  { name: 'Inkstick',      url: 'https://inkstickmedia.com/feed/',              format: 'rss2' },
  { name: 'Noema',        url: 'https://www.noemamag.com/feed/',               format: 'rss2' },
  { name: 'Rest of World', url: 'https://restofworld.org/feed/latest/',        format: 'rss2', defaultCategory: 'tech' },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/',                format: 'rss2' },
  { name: 'Lowy Interpreter', url: 'https://www.lowyinstitute.org/the-interpreter/rss.xml', format: 'rss2' },
  { name: 'Dialogue Earth', url: 'https://thethirdpole.net/feed/',             format: 'rss2', defaultCategory: 'science' },
  { name: 'Global Voices', url: 'https://globalvoices.org/feed/',              format: 'rss2' },
]

const EXCLUDE_RE = /\b(opinion|features|gallery|photos|video|sport|entertainment|culture|food|travel|lifestyle|podcast)\b/i

// ── Helpers ─────────────────────────────────────────────────────────

const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&rsquo;': '\u2019', '&lsquo;': '\u2018', '&rdquo;': '\u201D', '&ldquo;': '\u201C', '&ndash;': '\u2013', '&mdash;': '\u2014', '&nbsp;': ' ' }

function decodeEntities(str) {
  return str.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec))
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return HTML_ENTITIES[`&${name};`] || m
  })
}

function stripHtml(str) { return str.replace(/<[^>]*>/g, '') }

// Chrome UA unblocks ~half of the outlets that 401/403 our honest bot UA
// (Reuters and similar). We keep the honest UA for RSS feeds below, since
// feed publishers generally whitelist named crawlers and don't bot-wall.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

async function fetchArticleBody(url) {
  if (shouldSkip(url)) return null
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) { recordResult(url, false); return null }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) return null
    const html = await res.text()
    // Readability handles sites without <article>/<main> semantics — 2026-04-19
    // bakeoff showed 76% → 96% extraction rate vs the prior regex approach.
    try {
      const dom = new JSDOM(html, { url })
      const article = new Readability(dom.window.document).parse()
      if (article?.textContent) {
        const text = article.textContent.replace(/\s+/g, ' ').trim()
        if (text.length >= 200) { recordResult(url, true); return text.slice(0, 5000) }
      }
    } catch { /* fall through to regex extractor */ }
    const block = (html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                   html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || [])[1]
    if (!block) return null
    const text = decodeEntities(stripHtml(block)).replace(/\s+/g, ' ').trim()
    if (text.length >= 200) { recordResult(url, true); return text.slice(0, 5000) }
    return null
  } catch { recordResult(url, false); return null }
}

function extractText(val) {
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) return val['#text'] || val?.a?.['#text'] || ''
  return ''
}

function toArray(items) { return Array.isArray(items) ? items : [items] }
function parseRss2Items(feed) { return toArray(feed?.rss?.channel?.item || []) }
function parseRdfItems(feed) { return toArray((feed?.['rdf:RDF'] || feed?.RDF || feed)?.item || []) }
function parseAtomItems(feed) { return toArray((feed?.feed || feed)?.entry || []) }


// ── Dedup against existing articles ─────────────────────────────────

function getExistingTitles(maxDaysOld = 10) {
  if (!existsSync(CONTENT_DIR)) return []
  const cutoff = new Date(Date.now() - maxDaysOld * 86400000).toISOString().slice(0, 10)
  return readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md') && f.slice(0, 10) >= cutoff)
    .map(f => {
      const content = readFileSync(join(CONTENT_DIR, f), 'utf-8')
      const m = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
      return m ? m[1].toLowerCase() : ''
    })
    .filter(Boolean)
}


// ── Fetch + Parse ───────────────────────────────────────────────────

function normalizeItem(raw, source) {
  const title = decodeEntities(extractText(raw.title).trim())
  if (!title) return null

  let link = raw.link || ''
  if (Array.isArray(link)) link = (link.find(l => l['@_rel'] === 'alternate') || link[0])?.['@_href'] || ''
  else if (typeof link === 'object') link = link['@_href'] || link['#text'] || ''

  const description = decodeEntities(stripHtml(extractText(raw.description || raw.summary || raw['dc:description'] || '').trim()))
  const pubDate = raw.pubDate || raw.published || raw.updated || raw['dc:date'] || raw.date || ''
  const category = source.defaultCategory || ''

  const rawContent = extractText(raw['content:encoded'] || raw.content || '')
  const contentText = rawContent ? decodeEntities(stripHtml(rawContent)).trim() : ''

  return { title, description, link, pubDate, category, contentText: contentText || undefined, source: source.name }
}

function isRelevant(item) {
  const text = `${item.category || ''} ${item.title || ''}`
  if (EXCLUDE_RE.test(text)) return false
  if (/^live:/i.test(item.title || '')) return false
  return true
}

/**
 * What a feed fetcher returns: the items, or an empty array carrying `_error`.
 *
 * The expando is deliberate and load-bearing — `sourceStats` uses it to tell a
 * source that returned nothing from one that failed, which are different facts
 * about a feed and are reported differently in the cycle log. Declaring it here
 * is what lets both return paths agree on one type.
 *
 * @typedef {any[] & { _error?: string }} FeedResult
 */

/** @returns {Promise<FeedResult>} */
async function fetchSource(source, retries = 1) {
  try {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'zuhd-news/1.0 (+https://zuhd.news)' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    const feed = rssParser.parse(xml)

    const rawItems = source.format === 'rdf' ? parseRdfItems(feed)
      : source.format === 'atom' ? parseAtomItems(feed)
      : parseRss2Items(feed)

    return rawItems.map(raw => normalizeItem(raw, source)).filter(Boolean).filter(isRelevant)
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 10000))
      return fetchSource(source, retries - 1)
    }
    console.error(`  ✗ ${source.name}: ${err.message}`)
    /** @type {any[] & { _error?: string }} */
    const empty = []
    empty._error = err.message
    return empty
  }
}

// ── Hacker News via Algolia ─────────────────────────────────────────

const HN_SKIP_DOMAINS = /^(self|github\.com|gist\.github\.com|old\.reddit\.com|reddit\.com|twitter\.com|x\.com|youtube\.com)$/
const HN_SKIP_TITLE = /^(Show HN|Ask HN|Launch HN|Tell HN):/i

/** @returns {Promise<FeedResult>} */
async function fetchHackerNews() {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600
    const algoliaUrl = `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=points%3E100,num_comments%3E20,created_at_i%3E${cutoff}&hitsPerPage=30`
    const bestUrl = 'https://hacker-news.firebaseio.com/v0/beststories.json'

    const [algolia, bestIds] = await Promise.all([
      fetch(algoliaUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch(bestUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => []),
    ])

    // Fetch metadata for top 15 best stories (catches peaked-and-fallen stories)
    const bestItems = await Promise.all(
      bestIds.slice(0, 15).map(id =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(5000) })
          .then(r => r.json()).catch(() => null)
      )
    )

    // Merge and deduplicate by HN story ID
    const seen = new Set()
    const all = []
    for (const h of algolia.hits || []) {
      if (!h.url || !h.objectID) continue
      seen.add(h.objectID)
      all.push({ title: h.title, url: h.url, score: h.points, comments: h.num_comments || 0, time: h.created_at_i })
    }
    for (const b of bestItems) {
      if (!b || !b.url || seen.has(String(b.id))) continue
      if ((b.score || 0) < 100) continue
      seen.add(String(b.id))
      all.push({ title: b.title, url: b.url, score: b.score, comments: b.descendants || 0, time: b.time })
    }

    // Filter and sort by comment count (discussion = newsworthy)
    const filtered = all
      .filter(s => !HN_SKIP_TITLE.test(s.title))
      .filter(s => {
        try { return !HN_SKIP_DOMAINS.test(new URL(s.url).hostname.replace(/^www\./, '')) } catch { return false }
      })
      .filter(s => isRelevant({ title: s.title, category: '' }))
      .sort((a, b) => b.comments - a.comments)

    console.error(`  HN Algolia: ${filtered.length} stories (${algolia.hits?.length || 0} algolia + ${bestItems.filter(Boolean).length} best, after dedup/filter)`)

    // Fetch article bodies for top HN stories (fetch 5; only 3 used, buffer for failures)
    const toFetch = filtered.slice(0, 5)
    const bodies = await Promise.all(toFetch.map(s => fetchArticleBody(s.url)))
    for (let i = 0; i < toFetch.length; i++) toFetch[i].bodyText = bodies[i]
    const fetched = bodies.filter(Boolean).length
    console.error(`  HN body fetch: ${fetched}/${toFetch.length} articles had extractable content`)

    return filtered.map(s => ({
      title: s.title,
      description: `${s.score} points, ${s.comments} comments on Hacker News`,
      link: s.url,
      pubDate: new Date(s.time * 1000).toISOString(),
      category: 'tech',
      contentText: s.bodyText || undefined,
      source: 'Hacker News',
    }))
  } catch (err) {
    console.error(`  ✗ Hacker News: ${err.message}`)
    /** @type {FeedResult} */
    const empty = []
    empty._error = err.message
    return empty
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.error(`Fetching ${SOURCES.length} RSS niche sources + Hacker News...`)

  const [rssResults, hnItems] = await Promise.all([
    Promise.all(SOURCES.map(fetchSource)),
    fetchHackerNews(),
  ])
  const MAX_PER_SOURCE = 3
  // Per-source override — aggregator-style feeds that flood a single category.
  // Phys.org republishes journal press releases and was landing 29% of science
  // primaries; The Record (cyber) was landing 19% of tech primaries. Lowering
  // their cap rebalances toward Nature/Carbon Brief/SciDev and 404/Ars/CODA.
  const PER_SOURCE_CAP = { 'Phys.org': 1, 'The Record': 1 }
  const capFor = name => PER_SOURCE_CAP[name] ?? MAX_PER_SOURCE

  // Per-source stats for dashboard monitoring
  const sourceStats = SOURCES.map((src, i) => ({
    name: src.name,
    fetched: rssResults[i].length,
    used: Math.min(rssResults[i].length, capFor(src.name)),
    error: rssResults[i].length === 0 && rssResults[i]._error ? rssResults[i]._error : null,
  }))
  sourceStats.push({ name: 'Hacker News', fetched: hnItems.length, used: Math.min(hnItems.length, capFor('Hacker News')), error: hnItems._error || null })
  try { writeFileSync('/tmp/zuhd-feed-source-stats.json', JSON.stringify({ fetchedAt: new Date().toISOString(), sources: sourceStats })) } catch {}

  const allItems = [
    ...rssResults.flatMap((items, i) => items.slice(0, capFor(SOURCES[i].name))),
    ...hnItems.slice(0, capFor('Hacker News')),
  ]
  const hnUsed = Math.min(hnItems.length, capFor('Hacker News'))
  console.error(`Raw items: ${allItems.length} (${allItems.length - hnUsed} RSS + ${hnUsed} HN)`)

  // Dedup against existing articles
  const existingTitles = getExistingTitles()
  const existingFps = new Set(existingTitles.map(fingerprint))
  const seenFps = new Set()

  const stories = []
  for (const item of allItems) {
    const fp = fingerprint(item.title)
    if (existingFps.has(fp) || seenFps.has(fp)) continue
    seenFps.add(fp)

    const category = item.category || zuhdCategory([], item.title, item.description)
    const pubDate = item.pubDate || new Date().toISOString()

    stories.push({
      title: item.title,
      description: item.description || '',
      link: item.link,
      pubDate,
      category,
      source: item.source,
      suggestedSlug: slugify(item.title, pubDate),
      eventUri: null,
      eventCoverage: null,
      sources: [{ name: item.source, url: item.link, country: SOURCE_COUNTRY[item.source] || null, body: (item.contentText || item.description || '').slice(0, 3000) }],
      concepts: [],
      location: null,
      sentiment: null,
      origin: 'rss',
    })
  }

  const output = { fetchedAt: new Date().toISOString(), stories }
  const outPath = '/tmp/zuhd-feed-rss.json'
  writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.error(`Wrote ${stories.length} stories to ${outPath}`)
  console.log(`${stories.length} stories from ${SOURCES.length} sources`)
}

main().catch(e => { console.error(e); process.exit(1) })
