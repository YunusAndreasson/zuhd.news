#!/usr/bin/env node
// RSS fetcher — niche sources not in the NewsAPI.ai index.
// These provide editorial taste: specialist tech, investigative, Muslim world.
// Output: /tmp/zuhd-feed-rss.json (merged with API feed by merge-feeds.js)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { XMLParser } from 'fast-xml-parser'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')

// ── Sources — only those NOT reliably indexed by NewsAPI.ai ─────────

const SOURCES = [
  { name: 'Hacker News',    url: 'https://hnrss.org/frontpage?points=100',     format: 'rss2', defaultCategory: 'tech' },
  { name: '404 Media',      url: 'https://404media.co/rss/',                   format: 'rss2', defaultCategory: 'tech' },
  { name: 'Bellingcat',     url: 'https://www.bellingcat.com/feed/',            format: 'rss2' },
  { name: 'Mada Masr',      url: 'https://www.madamasr.com/en/feed/',          format: 'rss2' },
  { name: 'Wamda',          url: 'https://www.wamda.com/feed',                 format: 'rss2', defaultCategory: 'tech' },
  { name: 'Salaam Gateway', url: 'https://salaamgateway.com/feed',             format: 'atom', defaultCategory: 'economy' },
  { name: '+972 Magazine',  url: 'https://www.972mag.com/feed/',               format: 'rss2' },
  { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed',          format: 'rss2' },
  { name: 'OCCRP',          url: 'https://www.occrp.org/en/feed',              format: 'rss2' },
  { name: 'SMEX',           url: 'https://smex.org/feed/',                     format: 'rss2', defaultCategory: 'tech' },
  { name: 'SciDev.Net',     url: 'https://www.scidev.net/global/global_rss.xml', format: 'rss2', defaultCategory: 'science' },
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

function slugify(title, date) {
  const d = new Date(date)
  const prefix = isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10)
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '')
  return `${prefix}-${slug}`
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

// Map to zuhd's 4 categories
function zuhdCategory(item) {
  const cat = (item.category || '').toLowerCase()
  if (['science', 'tech', 'economy'].includes(cat)) return cat
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase()
  if (/\b(study|research|climate|vaccine|species|quantum|genome|crispr)\b/.test(text)) return 'science'
  if (/\b(ai|startup|crypto|bitcoin|software|hack|data breach|algorithm|llm|chatbot)\b/.test(text)) return 'tech'
  if (/\b(gdp|inflation|market|trade|tariff|oil price|currency|imf)\b/.test(text)) return 'economy'
  return 'politics'
}

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

function fingerprint(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
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
  const text = (item.category || '') + ' ' + (item.title || '')
  if (EXCLUDE_RE.test(text)) return false
  if (/^live:/i.test(item.title || '')) return false
  return true
}

async function fetchSource(source) {
  try {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const feed = parser.parse(xml)

    const rawItems = source.format === 'rdf' ? parseRdfItems(feed)
      : source.format === 'atom' ? parseAtomItems(feed)
      : parseRss2Items(feed)

    return rawItems.map(raw => normalizeItem(raw, source)).filter(Boolean).filter(isRelevant)
  } catch (err) {
    console.error(`  ✗ ${source.name}: ${err.message}`)
    return []
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.error(`Fetching ${SOURCES.length} RSS niche sources...`)

  const results = await Promise.all(SOURCES.map(fetchSource))
  const allItems = results.flat()
  console.error(`Raw items: ${allItems.length}`)

  // Dedup against existing articles
  const existingTitles = getExistingTitles()
  const existingFps = new Set(existingTitles.map(fingerprint))
  const seenFps = new Set()

  const stories = []
  for (const item of allItems) {
    const fp = fingerprint(item.title)
    if (existingFps.has(fp) || seenFps.has(fp)) continue
    seenFps.add(fp)

    const category = zuhdCategory(item)
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
      sources: [{ name: item.source, url: item.link, country: null, body: (item.contentText || item.description || '').slice(0, 3000) }],
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
