import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { XMLParser } from 'fast-xml-parser'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')

// ── Source Configuration ──────────────────────────────────────────────
// Priority order matters: higher = preferred when deduplicating
const SOURCES = [
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    format: 'rss2',
    enabled: true,
    stripParams: ['traffic_source'],
  },
  {
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'BBC Business',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    format: 'rss2',
    defaultCategory: 'economy',
    enabled: true,
  },
  {
    name: 'France 24',
    url: 'https://www.france24.com/en/rss',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Deutsche Welle',
    url: 'https://rss.dw.com/rdf/rss-en-all',
    format: 'rdf',
    enabled: true,
  },
  {
    name: 'AllAfrica',
    url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
    format: 'rss2', // URL says .rdf but feed is actually RSS 2.0
    enabled: true,
  },
  {
    name: 'Al Monitor',
    url: 'https://www.al-monitor.com/rss',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage?points=100',
    format: 'rss2',
    defaultCategory: 'tech',
    enabled: true,
  },
  {
    name: 'The Hindu',
    url: 'https://www.thehindu.com/news/international/feeder/default.rss',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Yonhap',
    url: 'https://en.yna.co.kr/RSS/news.xml',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'TRT World',
    url: 'https://www.trtworld.com/feed/rss.xml',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Nature',
    url: 'https://www.nature.com/nature.rss',
    format: 'rdf',
    defaultCategory: 'science',
    enabled: true,
  },
  {
    name: 'Quanta Magazine',
    url: 'https://api.quantamagazine.org/feed/',
    format: 'rss2',
    defaultCategory: 'science',
    enabled: true,
  },
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    format: 'rss2',
    defaultCategory: 'economy',
    enabled: true,
  },
  {
    name: 'Bellingcat',
    url: 'https://www.bellingcat.com/feed/',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Haaretz',
    url: 'https://www.haaretz.com/srv/haaretz-latest-headlines',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Moscow Times',
    url: 'https://www.themoscowtimes.com/rss/news',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Rest of World',
    url: 'https://restofworld.org/feed/',
    format: 'rss2',
    defaultCategory: 'tech',
    enabled: true,
    stripParams: ['utm_source', 'utm_medium', 'utm_campaign'],
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    format: 'rss2',
    defaultCategory: 'tech',
    enabled: true,
  },
  {
    name: '404 Media',
    url: 'https://404media.co/rss/',
    format: 'rss2',
    defaultCategory: 'tech',
    enabled: true,
  },
  {
    name: 'Carbon Brief',
    url: 'https://www.carbonbrief.org/feed/',
    format: 'rss2',
    defaultCategory: 'science',
    enabled: true,
  },
  {
    name: 'Malay Mail',
    url: 'https://www.malaymail.com/feed/rss',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Antara News',
    url: 'https://en.antaranews.com/rss/news',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Premium Times',
    url: 'https://www.premiumtimesng.com/feed',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Dawn',
    url: 'https://www.dawn.com/feeds/home',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Daily Star',
    url: 'https://www.thedailystar.net/news/rss.xml',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'South China Morning Post',
    url: 'https://www.scmp.com/rss/91/feed',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Middle East Eye',
    url: 'https://www.middleeasteye.net/rss',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Sveriges Radio',
    url: 'https://api.sr.se/api/rss/channel/83',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Daily Maverick',
    url: 'https://www.dailymaverick.co.za/rss',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'The East African',
    url: 'https://www.theeastafrican.co.ke/rss.xml',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Buenos Aires Times',
    url: 'https://www.batimes.com.ar/feed',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'MercoPress',
    url: 'https://en.mercopress.com/rss',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'CBC News',
    url: 'https://www.cbc.ca/webfeed/rss/rss-world',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Politico',
    url: 'https://rss.politico.com/politics-news.xml',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Fox News',
    url: 'https://moxie.foxnews.com/google-publisher/world.xml',
    format: 'rss2',
    enabled: true,
  },
]

// Categories we cover (global hard news + tech)
const EXCLUDE_TERMS = [
  'opinion', 'features', 'gallery', 'photos', 'video', 'sport',
  'entertainment', 'culture', 'food', 'travel', 'lifestyle', 'podcast'
]

// ── Helpers ───────────────────────────────────────────────────────────

const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&rsquo;': '\u2019', '&lsquo;': '\u2018', '&rdquo;': '\u201D', '&ldquo;': '\u201C', '&ndash;': '\u2013', '&mdash;': '\u2014', '&nbsp;': ' ' }

function decodeEntities(str) {
  return str
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec))
      if (hex) return String.fromCodePoint(parseInt(hex, 16))
      return HTML_ENTITIES[`&${name};`] || m
    })
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '')
}

function slugify(title, date) {
  const d = new Date(date)
  const datePrefix = d.toISOString().slice(0, 10)
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '')
  return `${datePrefix}-${slug}`
}

function getExistingArticles() {
  if (!existsSync(CONTENT_DIR)) return { slugs: new Set(), titles: [] }
  const files = readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md') && f !== 'example.md')

  const slugs = new Set(files.map(f => basename(f, '.md')))
  const titles = []

  for (const file of files) {
    const content = readFileSync(join(CONTENT_DIR, file), 'utf-8')
    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch) titles.push(titleMatch[1])
  }

  return { slugs, titles }
}

function cleanUrl(url, stripParams = []) {
  if (!url || !stripParams.length) return url
  try {
    const u = new URL(url)
    for (const p of stripParams) u.searchParams.delete(p)
    return u.toString()
  } catch { return url }
}

// ── Deduplication ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had',
  'it', 'its', 'this', 'that', 'with', 'from', 'by', 'as', 'but', 'not',
  'will', 'would', 'could', 'should', 'may', 'can', 'do', 'does', 'did',
  'says', 'said', 'after', 'over', 'new', 'about'
])

function fingerprint(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .sort()
}

function similarity(fpA, fpB) {
  if (!fpA.length || !fpB.length) return 0
  const setA = new Set(fpA)
  const setB = new Set(fpB)
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}

const SIMILARITY_THRESHOLD = 0.55

function deduplicateStories(stories) {
  const kept = []
  const fingerprints = []
  for (const story of stories) {
    const fp = fingerprint(story.title)
    const isDupe = fingerprints.some(kfp => similarity(fp, kfp) >= SIMILARITY_THRESHOLD)
    if (!isDupe) {
      kept.push(story)
      fingerprints.push(fp)
    }
  }
  return kept
}

// ── Source Fetching ───────────────────────────────────────────────────

function toArray(items) {
  return Array.isArray(items) ? items : [items]
}

function parseRss2Items(feed) {
  return toArray(feed?.rss?.channel?.item || [])
}

function parseRdfItems(feed) {
  // RDF feeds use rdf:RDF > item (fast-xml-parser strips namespace prefix)
  const root = feed?.['rdf:RDF'] || feed?.RDF || feed
  return toArray(root?.item || [])
}

function extractText(val) {
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) return val['#text'] || val?.a?.['#text'] || ''
  return ''
}

function normalizeItem(raw, source) {
  const title = decodeEntities(extractText(raw.title).trim())
  if (!title) return null

  let link = raw.link || ''
  // Some feeds have link as an object with @_href
  if (typeof link === 'object') link = link['@_href'] || link['#text'] || ''
  link = cleanUrl(link, source.stripParams || [])

  const description = decodeEntities(stripHtml((raw.description || raw['dc:description'] || '').trim()))
  const pubDate = raw.pubDate || raw['dc:date'] || raw.date || ''

  let category = source.defaultCategory || ''
  if (!category) {
    const rawCat = Array.isArray(raw.category) ? raw.category[0] : (raw.category || '')
    category = typeof rawCat === 'object' ? (rawCat['#text'] || '') : rawCat
  }

  // HN: extract comments URL
  const comments = raw.comments || ''

  return {
    title,
    description,
    link,
    pubDate,
    category,
    source: source.name,
    comments: comments || undefined,
  }
}

function isRelevant(item) {
  const cat = (item.category || '').toLowerCase()
  const title = (item.title || '').toLowerCase()
  for (const e of EXCLUDE_TERMS) {
    if (cat.includes(e) || title.includes(e)) return false
  }
  // Skip liveblog entries
  if (title.startsWith('live:')) return false
  return true
}

async function fetchSource(source) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(source.url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    })
    const feed = parser.parse(xml)

    const rawItems = source.format === 'rdf'
      ? parseRdfItems(feed)
      : parseRss2Items(feed)

    const items = rawItems
      .map(raw => normalizeItem(raw, source))
      .filter(Boolean)
      .filter(isRelevant)

    console.error(`  ✓ ${source.name}: ${items.length} items`)
    return items
  } catch (err) {
    console.error(`  ✗ ${source.name}: ${err.message}`)
    return []
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchAllSources() {
  const enabled = SOURCES.filter(s => s.enabled)
  console.error(`Fetching from ${enabled.length} sources...`)

  const results = await Promise.allSettled(enabled.map(fetchSource))

  // Flatten, preserving source priority order
  const allStories = []
  for (const result of results) {
    if (result.status === 'fulfilled') allStories.push(...result.value)
  }
  return allStories
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const { slugs: existingSlugs, titles: existingTitles } = getExistingArticles()
  const allStories = await fetchAllSources()

  // Cross-source deduplication
  const deduped = deduplicateStories(allStories)
  console.error(`After cross-source dedup: ${deduped.length} (from ${allStories.length})`)

  // Deduplicate against existing articles (slug + fuzzy title)
  const fresh = deduped.filter(item => {
    const slug = slugify(item.title, item.pubDate || new Date().toISOString())
    if (existingSlugs.has(slug)) return false

    const fp = fingerprint(item.title)
    return !existingTitles.some(t => similarity(fp, fingerprint(t)) >= SIMILARITY_THRESHOLD)
  })

  // Sort by date (most recent first) so all sources compete equally
  fresh.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))

  console.error(`Fresh stories: ${fresh.length}`)

  const output = {
    fetchedAt: new Date().toISOString(),
    sources: SOURCES.filter(s => s.enabled).map(s => s.name),
    totalItems: allStories.length,
    dedupedItems: deduped.length,
    freshItems: fresh.length,
    existingArticles: [...existingSlugs],
    stories: fresh.slice(0, 15).map(item => ({
      title: item.title,
      description: item.description,
      link: item.link,
      pubDate: item.pubDate,
      category: item.category,
      source: item.source,
      comments: item.comments,
      suggestedSlug: slugify(item.title, item.pubDate || new Date().toISOString()),
    })),
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(err => {
  console.error('Fetch failed:', err.message)
  process.exit(1)
})
