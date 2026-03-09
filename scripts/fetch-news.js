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
    name: 'Mada Masr',
    url: 'https://www.madamasr.com/en/feed/',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'Medyascope',
    url: 'https://medyascope.tv/feed/',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'TSA',
    url: 'https://www.tsa-algerie.com/feed/',
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
  {
    name: 'ABC News Australia',
    url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    format: 'rss2',
    enabled: true,
  },
  {
    name: 'RNZ Pacific',
    url: 'https://www.rnz.co.nz/rss/pacific.xml',
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

// Map stories to zuhd's 5 categories using source defaults, RSS tags, and keyword heuristics
// This is a rough classifier for feed balancing — the selector Claude does final assignment
function zuhdCategory(item) {
  const cat = (item.category || '').toLowerCase()
  if (['science', 'tech', 'economy'].includes(cat)) return cat

  // Use all RSS category tags for signal (Carbon Brief has 8, CoinDesk 5, etc.)
  const tagText = (item.tags || []).join(' ').toLowerCase()

  const title = (item.title || '').toLowerCase()
  const desc = (item.description || '').toLowerCase()
  const text = title + ' ' + desc + ' ' + tagText

  // Science signals
  if (/\b(study finds|researchers|breakthrough|clinical trial|species|fossil|genome|telescope|exoplanet|neutrino|quantum|crispr|vaccine|pandemic|epidemic|biodiversity|ecology|neuroscience|astrophysics)\b/.test(text)) return 'science'

  // Tech signals
  if (/\b(ai model|artificial intelligence|machine learning|cybersecurity|data breach|hack|startup|app|platform|crypto|bitcoin|blockchain|open.?source|software|chip|semiconductor|surveillance|algorithm|llm|chatbot|autonomous)\b/.test(text)) return 'tech'

  // Economy signals
  if (/\b(gdp|inflation|interest rate|central bank|stock|market|trade deal|tariff|recession|unemployment|imf|world bank|oil price|energy price|debt|bond|fiscal|austerity|subsid|remittance|currency)\b/.test(text)) return 'economy'

  // Conflict signals
  if (/\b(killed|dead|troops|airstrike|missile|bomb|attack|war|ceasefire|displaced|refugees|humanitarian|famine|flood|earthquake|cyclone|casualt|siege|shelling|militia|insurgent)\b/.test(text)) return 'conflict'

  // Default: politics (elections, diplomacy, governance are the most common general news)
  return 'politics'
}

// Combined fingerprint using title + description for cross-source dedup
// "Oil surges past $110" (BBC) and "Crude prices hit record" (CoinDesk) have
// different titles but similar descriptions — combining catches these
function storyFingerprint(story) {
  const titleFp = fingerprint(story.title)
  const descFp = story.description ? fingerprint(story.description).slice(0, 8) : []
  // Title keywords dominate; description adds signal without overwhelming
  return [...new Set([...titleFp, ...descFp])]
}

function deduplicateStories(stories) {
  const kept = []
  const fingerprints = []
  const seenUrls = new Set()
  for (const story of stories) {
    // URL-based dedup: reject stories whose link matches a previously kept story
    if (story.link && seenUrls.has(story.link)) continue
    const fp = storyFingerprint(story)
    const isDupe = fingerprints.some(kfp => similarity(fp, kfp) >= SIMILARITY_THRESHOLD)
    if (!isDupe) {
      kept.push(story)
      fingerprints.push(fp)
      if (story.link) seenUrls.add(story.link)
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

  const description = decodeEntities(stripHtml(extractText(raw.description || raw['dc:description'] || '').trim()))
  const pubDate = raw.pubDate || raw['dc:date'] || raw.date || ''

  let category = source.defaultCategory || ''
  // Extract all category tags for richer classification
  const allTags = []
  if (!category) {
    const rawCats = Array.isArray(raw.category) ? raw.category : (raw.category ? [raw.category] : [])
    for (const rc of rawCats) {
      const tag = typeof rc === 'object' ? (rc['#text'] || '') : rc
      if (tag) allTags.push(tag)
    }
    category = allTags[0] || ''
  }

  // Extract content:encoded — full article HTML available in some feeds
  // (Carbon Brief, MIT Tech Review, Bellingcat, 404 Media, Quanta, etc.)
  const rawContent = extractText(raw['content:encoded'] || '')
  const contentText = rawContent ? decodeEntities(stripHtml(rawContent)).trim() : ''

  // HN: extract comments URL
  const comments = raw.comments || ''

  // Author from dc:creator or author field
  const author = extractText(raw['dc:creator'] || raw.author || '').trim() || undefined

  return {
    title,
    description,
    link,
    pubDate,
    category,
    tags: allTags.length > 0 ? allTags : undefined,
    contentText: contentText || undefined,
    author,
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
  const toMs = d => { const t = new Date(d).getTime(); return isNaN(t) ? 0 : t }
  fresh.sort((a, b) => toMs(b.pubDate || 0) - toMs(a.pubDate || 0))

  console.error(`Fresh stories: ${fresh.length}`)

  // Category-aware selection: guarantee at least MIN_PER_CAT stories per zuhd category
  // so the selector always has real choices, not just whatever is most recent
  const ZUHD_CATS = ['politics', 'conflict', 'economy', 'science', 'tech']
  const MIN_PER_CAT = 3
  const MAX_STORIES = 25

  // Score stories by information density — descriptions with specific facts
  // (numbers, names, places) signal hard news over vague summaries
  function infoScore(item) {
    const text = (item.title || '') + ' ' + (item.description || '')
    let score = 0
    // Specific numbers signal hard facts ("42 killed", "$110 billion", "3rd quarter")
    score += (text.match(/\d[\d,.]*/g) || []).length * 2
    // Quoted speech signals primary sources
    if (/["'\u201C\u201D]/.test(text)) score += 1
    // Proper nouns (capitalized words mid-sentence) signal named actors
    score += (text.match(/(?<=\s)[A-Z][a-z]{2,}/g) || []).length * 0.5
    // Has content:encoded = writer can skip HTTP fetch (reliability bonus)
    if (item.contentText) score += 3
    return score
  }

  // Pre-score and sort within each time bucket
  const scored = fresh.map((item, i) => ({ item, i, score: infoScore(item) }))

  const selected = []
  const usedIdx = new Set()

  // First pass: fill each category to its minimum, picking highest-scored per category
  for (const cat of ZUHD_CATS) {
    const candidates = scored
      .filter(s => !usedIdx.has(s.i) && zuhdCategory(s.item) === cat)
      .sort((a, b) => b.score - a.score)
    for (let j = 0; j < Math.min(MIN_PER_CAT, candidates.length); j++) {
      selected.push(candidates[j].item)
      usedIdx.add(candidates[j].i)
    }
  }

  // Second pass: fill remaining slots by recency (any category)
  for (let i = 0; i < fresh.length && selected.length < MAX_STORIES; i++) {
    if (!usedIdx.has(i)) {
      selected.push(fresh[i])
      usedIdx.add(i)
    }
  }

  // Log category distribution
  const catCounts = {}
  for (const s of selected) {
    const c = zuhdCategory(s)
    catCounts[c] = (catCounts[c] || 0) + 1
  }
  console.error(`Selected ${selected.length} stories for selector: ${JSON.stringify(catCounts)}`)

  const output = {
    fetchedAt: new Date().toISOString(),
    sources: SOURCES.filter(s => s.enabled).map(s => s.name),
    totalItems: allStories.length,
    dedupedItems: deduped.length,
    freshItems: fresh.length,
    existingArticles: [...existingSlugs],
    stories: selected.map(item => {
      const story = {
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: item.pubDate,
        category: item.category,
        source: item.source,
        suggestedSlug: slugify(item.title, item.pubDate || new Date().toISOString()),
      }
      // Pass through content:encoded text (truncated to 2000 chars) so the writer
      // can use it directly instead of fetching the full article via HTTP
      if (item.contentText) story.contentText = item.contentText.slice(0, 2000)
      if (item.author) story.author = item.author
      if (item.comments) story.comments = item.comments
      if (item.tags && item.tags.length > 0) story.tags = item.tags
      return story
    }),
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(err => {
  console.error('Fetch failed:', err.message)
  process.exit(1)
})
