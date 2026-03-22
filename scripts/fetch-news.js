import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { XMLParser } from 'fast-xml-parser'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')
const CACHE_PATH = join(ROOT, 'content', '.source-cache.json')

// ── Source Configuration ──────────────────────────────────────────────
// Tier system — 10 cycles/day (every 2.5h). Each cycle fetches ~18 sources.
//   Tier A  — every cycle   (10 sources, core diverse voices)
//   Tier B0 — even cycles 0,2,4,6,8  (5 sources)
//   Tier B1 — odd cycles  1,3,5,7,9  (5 sources)
//   Tier C  — 2x/day, when cycleIndex % 5 === offset  (14 sources)
//   Tier D  — 1x/day, when cycleIndex === slot  (7 sources)
//
// Perspective balance in Tier A: Al Jazeera (Middle East) + BBC (West)
// — not BBC + France24 (two Western outlets covering same beats).
//
// Self-calibrating: sources with consecutiveEmpty ≥ 5 are demoted to
// their primary slot only (B0→cycle 0, B1→cycle 1, C→first slot).
//
// Regions: ME=Middle East, AS=Asia, AF=Africa, EU=Europe, AM=Americas, OC=Oceania, GL=Global

const SOURCES = [
  // ── Tier A — every cycle ──────────────────────────────────────────
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    format: 'rss2',
    tier: 'A', region: 'ME', core: true,
    stripParams: ['traffic_source'],
  },
  { name: 'BBC World',      url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                          format: 'rss2', tier: 'A', region: 'EU', core: true },
  { name: 'The Hindu',      url: 'https://www.thehindu.com/news/international/feeder/default.rss',       format: 'rss2', tier: 'A', region: 'AS' },
  { name: 'AllAfrica',      url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',       format: 'rss2', tier: 'A', region: 'AF' },
  { name: 'Hacker News',    url: 'https://hnrss.org/frontpage?points=100',                               format: 'rss2', tier: 'A', region: 'GL', defaultCategory: 'tech' },
  { name: 'CoinDesk',       url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',                      format: 'rss2', tier: 'A', region: 'GL', defaultCategory: 'economy' },
  { name: '404 Media',      url: 'https://404media.co/rss/',                                             format: 'rss2', tier: 'A', region: 'GL', defaultCategory: 'tech' },
  { name: 'STAT News',      url: 'https://www.statnews.com/feed/',                                       format: 'rss2', tier: 'A', region: 'GL', defaultCategory: 'science' },
  { name: 'New Scientist',  url: 'https://www.newscientist.com/feed/home/',                              format: 'rss2', tier: 'A', region: 'GL', defaultCategory: 'science' },
  { name: 'Mada Masr',      url: 'https://www.madamasr.com/en/feed/',                                   format: 'rss2', tier: 'A', region: 'ME' },

  // ── Tier B0 — even cycles (0,2,4,6,8) ────────────────────────────
  { name: 'France 24',             url: 'https://www.france24.com/en/rss',                              format: 'rss2', tier: 'B0', region: 'EU' },
  { name: 'Deutsche Welle',        url: 'https://rss.dw.com/rdf/rss-en-all',                            format: 'rdf',  tier: 'B0', region: 'EU' },
  { name: 'Moscow Times',          url: 'https://www.themoscowtimes.com/rss/news',                      format: 'rss2', tier: 'B0', region: 'EU' },
  { name: 'Dawn',                  url: 'https://www.dawn.com/feeds/home',                              format: 'rss2', tier: 'B0', region: 'AS' },
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed',                          format: 'rss2', tier: 'B0', region: 'AS' },

  // ── Tier B1 — odd cycles (1,3,5,7,9) ─────────────────────────────
  { name: 'Al Monitor',     url: 'https://www.al-monitor.com/rss',                                      format: 'rss2', tier: 'B1', region: 'ME' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss',                                  format: 'rss2', tier: 'B1', region: 'ME' },
  { name: 'Yonhap',         url: 'https://en.yna.co.kr/RSS/news.xml',                                   format: 'rss2', tier: 'B1', region: 'AS' },
  { name: 'Malay Mail',     url: 'https://www.malaymail.com/feed/rss',                                  format: 'rss2', tier: 'B1', region: 'AS' },
  { name: 'Antara News',    url: 'https://en.antaranews.com/rss/news',                                  format: 'rss2', tier: 'B1', region: 'AS' },

  // ── Tier C — 2x/day, when cycleIndex % 5 === offset ──────────────
  { name: 'Ars Technica Science', url: 'https://feeds.arstechnica.com/arstechnica/science', format: 'rss2', tier: 'B1', region: 'GL', defaultCategory: 'science' },
  { name: 'Haaretz',              url: 'https://www.haaretz.com/srv/haaretz-latest-headlines', format: 'rss2', tier: 'C', offset: 0, region: 'ME' },
  { name: 'BBC Business',         url: 'https://feeds.bbci.co.uk/news/business/rss.xml',     format: 'rss2', tier: 'C', offset: 1, region: 'EU', defaultCategory: 'economy' },
  { name: 'Daily Star',           url: 'https://www.thedailystar.net/news/rss.xml',          format: 'rss2', tier: 'C', offset: 1, region: 'AS' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/',            format: 'rss2', tier: 'C', offset: 2, region: 'GL', defaultCategory: 'tech' },
  { name: 'Medyascope',           url: 'https://medyascope.tv/feed/',                        format: 'rss2', tier: 'C', offset: 2, region: 'ME' },
  {
    name: 'Rest of World', url: 'https://restofworld.org/feed/',                             format: 'rss2', tier: 'C', offset: 3, region: 'GL', defaultCategory: 'tech',
    stripParams: ['utm_source', 'utm_medium', 'utm_campaign'],
  },
  { name: 'TSA',                  url: 'https://www.tsa-algerie.com/feed/',                  format: 'rss2', tier: 'C', offset: 3, region: 'ME' },
  { name: 'Bellingcat',           url: 'https://www.bellingcat.com/feed/',                   format: 'rss2', tier: 'C', offset: 4, region: 'EU' },
  { name: 'Sveriges Radio',       url: 'https://api.sr.se/api/rss/channel/83',               format: 'rss2', tier: 'C', offset: 4, region: 'EU' },
  { name: 'Premium Times',        url: 'https://www.premiumtimesng.com/feed',                format: 'rss2', tier: 'C', offset: 0, region: 'AF' },

  // ── Tier D — 1x/day, when cycleIndex === slot ─────────────────────
  { name: 'Daily Maverick',      url: 'https://www.dailymaverick.co.za/rss',                     format: 'rss2', tier: 'D', slot: 0, region: 'AF' },
  { name: 'Quanta Magazine',     url: 'https://api.quantamagazine.org/feed/',                    format: 'rss2', tier: 'C', offset: 1, region: 'GL', defaultCategory: 'science' },
  { name: 'Carbon Brief',        url: 'https://www.carbonbrief.org/feed/',                       format: 'rss2', tier: 'C', offset: 2, region: 'GL', defaultCategory: 'science' },
  { name: 'Buenos Aires Times',  url: 'https://www.batimes.com.ar/feed',                         format: 'rss2', tier: 'D', slot: 3, region: 'AM' },
  { name: 'Nature',              url: 'https://www.nature.com/nature.rss',                       format: 'rdf',  tier: 'C', offset: 4, region: 'GL', defaultCategory: 'science' },
  { name: 'MercoPress',          url: 'https://en.mercopress.com/rss',                           format: 'rss2', tier: 'D', slot: 5, region: 'AM' },
  { name: 'CBC News',            url: 'https://www.cbc.ca/webfeed/rss/rss-world',                format: 'rss2', tier: 'D', slot: 6, region: 'AM' },
  { name: 'Fox News',            url: 'https://moxie.foxnews.com/google-publisher/world.xml',    format: 'rss2', tier: 'D', slot: 7, region: 'AM' },
  { name: 'ABC News Australia',  url: 'https://www.abc.net.au/news/feed/51120/rss.xml',          format: 'rss2', tier: 'D', slot: 8, region: 'OC' },
  { name: 'RNZ Pacific',         url: 'https://www.rnz.co.nz/rss/pacific.xml',                  format: 'rss2', tier: 'D', slot: 9, region: 'OC' },
  // ── Muslim world tech + Islamic economy ────────────────────────────
  { name: 'Anadolu Agency',     url: 'https://www.aa.com.tr/en/rss/default?cat=world',          format: 'rss2', tier: 'B1', region: 'ME' },
  { name: 'Wamda',              url: 'https://www.wamda.com/feed',                              format: 'rss2', tier: 'C', offset: 3, region: 'ME', defaultCategory: 'tech' },
  { name: 'TechCabal',          url: 'https://techcabal.com/feed/',                             format: 'rss2', tier: 'C', offset: 1, region: 'AF', defaultCategory: 'tech' },
  { name: 'Salaam Gateway',     url: 'https://salaamgateway.com/feed',                          format: 'atom', tier: 'C', offset: 4, region: 'ME', defaultCategory: 'economy' },
]

const EXCLUDE_RE = /\b(opinion|features|gallery|photos|video|sport|entertainment|culture|food|travel|lifestyle|podcast)\b/i

// ── Cycle Index ───────────────────────────────────────────────────────
// 10 cycles/day at: 00:00, 02:30, 05:00, 07:30, 10:00, 12:30, 15:00, 17:30, 20:00, 22:30 UTC
const CYCLE_HOURS = [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5]

function getCycleIndex() {
  const now = new Date()
  const h = now.getUTCHours() + now.getUTCMinutes() / 60
  let closest = 0
  let minDist = Infinity
  for (let i = 0; i < CYCLE_HOURS.length; i++) {
    // Wrap-around distance (e.g. 23:30 is 1h from 00:00)
    const dist = Math.min(Math.abs(h - CYCLE_HOURS[i]), 24 - Math.abs(h - CYCLE_HOURS[i]))
    if (dist < minDist) { minDist = dist; closest = i }
  }
  return closest
}

// ── Source Cache (self-calibration) ──────────────────────────────────

function loadCache() {
  try { return JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) } catch { return {} }
}

function saveCache(cache) {
  try { writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n') } catch { /* non-fatal */ }
}

function updateCache(cache, sourceName, itemCount) {
  if (!cache[sourceName]) cache[sourceName] = { consecutiveEmpty: 0, lastFetched: null, totalFetches: 0 }
  const entry = cache[sourceName]
  entry.totalFetches = (entry.totalFetches || 0) + 1
  entry.lastFetched = new Date().toISOString()
  if (itemCount === 0) {
    entry.consecutiveEmpty = (entry.consecutiveEmpty || 0) + 1
  } else {
    entry.consecutiveEmpty = 0
  }
}

// ── Source Selection ──────────────────────────────────────────────────

// Tier A sources with core: true are always included; the rest rotate via a sliding window
const TIER_A_POOL = SOURCES.filter(s => s.tier === 'A' && !s.core)

function selectSources(cycleIndex, cache) {
  const active = []
  for (const source of SOURCES) {
    const { tier, offset, slot, name } = source
    const consecutiveEmpty = cache[name]?.consecutiveEmpty || 0
    const isQuiet = consecutiveEmpty >= 5  // demote if 5+ consecutive empty fetches

    if (tier === 'A') {
      if (source.core) {
        // Always include core sources
        active.push(source)
      } else {
        // Rotating window: pick 5 of 8 pool sources based on cycleIndex
        // Window shifts by 1 each cycle, wrapping around. This ensures
        // each source appears in ~5 out of every 8 cycles (~62% coverage).
        const poolIdx = TIER_A_POOL.indexOf(source)
        if (((poolIdx - cycleIndex) % TIER_A_POOL.length + TIER_A_POOL.length) % TIER_A_POOL.length < 5) {
          active.push(source)
        }
      }
    } else if (tier === 'B0') {
      // Even cycles; quiet sources only at cycle 0 (primary)
      if (cycleIndex % 2 === 0 && (!isQuiet || cycleIndex === 0)) active.push(source)
    } else if (tier === 'B1') {
      // Odd cycles; quiet sources only at cycle 1 (primary)
      if (cycleIndex % 2 === 1 && (!isQuiet || cycleIndex === 1)) active.push(source)
    } else if (tier === 'C') {
      // 2x/day; quiet sources only at first matching slot
      if (cycleIndex % 5 === offset && (!isQuiet || cycleIndex === offset)) active.push(source)
    } else if (tier === 'D') {
      if (cycleIndex === slot) active.push(source)
    }
  }
  return active
}

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

function getExistingArticles(maxDaysOld = 4) {
  if (!existsSync(CONTENT_DIR)) return { slugs: new Set(), titles: [], urls: new Set() }
  const cutoff = new Date(Date.now() - maxDaysOld * 86400000).toISOString().slice(0, 10)
  const files = readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md') && f !== 'example.md')
    .filter(f => f.slice(0, 10) >= cutoff)  // date-prefixed filenames: only recent
    .sort().reverse()  // newest first

  const slugs = new Set(files.map(f => basename(f, '.md')))
  const titles = []
  const urls = new Set()

  for (const file of files) {
    const content = readFileSync(join(CONTENT_DIR, file), 'utf-8')
    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch) titles.push(titleMatch[1])
    const urlMatch = content.match(/^sourceUrl:\s*["']?(.+?)["']?\s*$/m)
    if (urlMatch) urls.add(urlMatch[1])
  }

  return { slugs, titles, urls }
}

// LLM-verify borderline cases: each suspect has _suspectMatch (the existing title it partially matched)
async function llmDedup(suspects) {
  if (!suspects.length) return []

  const { spawnSync } = await import('child_process')

  const lines = suspects.map((s, i) =>
    `${i}. CANDIDATE: [${s.source}] ${s.title}\n   EXISTING: ${s._suspectMatch}`
  ).join('\n')

  const prompt = `You are a news deduplication filter. Each entry below pairs a CANDIDATE feed story with an EXISTING published article it partially matched.

For each pair, decide: do they cover the SAME specific news event (same actors, same occurrence)? Or merely the same broad topic?

Respond with ONLY a JSON array of indices that are TRUE duplicates (same event). Example: [0, 3]
If none are duplicates, respond: []

${lines}`

  try {
    const result = spawnSync('claude', [
      '--model', 'claude-haiku-4-5-20251001',
      '--print',
      '--max-turns', '1',
    ], { input: prompt, timeout: 30000, encoding: 'utf-8', env: { ...process.env, CLAUDECODE: undefined } })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(result.stderr || `exit ${result.status}`)

    const text = result.stdout.trim()
    const match = text.match(/\[[\d,\s]*\]/)
    if (!match) {
      console.error(`Haiku dedup error: unparseable response — keeping all suspects`)
      return suspects
    }

    const dupeIndices = new Set(JSON.parse(match[0]))
    const kept = suspects.filter((_, i) => !dupeIndices.has(i))
    const removed = suspects.filter((_, i) => dupeIndices.has(i))
    for (const s of removed) console.error(`  LLM dedup removed: [${s.source}] ${s.title}`)
    return kept
  } catch (err) {
    console.error(`Haiku dedup error: ${err.message} — keeping all suspects`)
    return suspects
  }
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

// Basic suffix stripping so "fractal"/"fractals", "shareholder"/"shareholders" match
function stem(word) {
  if (word.length <= 4) return word
  return word
    .replace(/ies$/, 'y')
    .replace(/sses$/, 'ss')
    .replace(/(.)s$/, '$1')
}

function fingerprint(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem)
    .sort()
}

function similarity(fpA, fpB) {
  if (!fpA.length || !fpB.length) return 0
  const setA = new Set(fpA)
  const setB = new Set(fpB)
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  const jaccard = intersection / union
  // Overlap coefficient: catches short rewritten titles that are subsets of long RSS titles
  const overlap = intersection / Math.min(setA.size, setB.size)
  return Math.max(jaccard, overlap * 0.8)
}

const SIMILARITY_THRESHOLD = 0.55

// Map stories to zuhd's 4 categories using source defaults, RSS tags, and keyword heuristics
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

  // Conflict/violence signals — also politics
  if (/\b(killed|dead|troops|airstrike|missile|bomb|attack|war|ceasefire|displaced|refugees|humanitarian|famine|flood|earthquake|cyclone|casualt|siege|shelling|militia|insurgent)\b/.test(text)) return 'politics'

  // Default: politics (elections, diplomacy, governance, conflict are the most common general news)
  return 'politics'
}

// Combined fingerprint using title + description for cross-source dedup
function storyFingerprint(story) {
  const titleFp = fingerprint(story.title)
  const descFp = story.description ? fingerprint(story.description).slice(0, 8) : []
  return [...new Set([...titleFp, ...descFp])]
}

function deduplicateStories(stories) {
  const kept = []
  const fingerprints = []
  const seenUrls = new Set()
  for (const story of stories) {
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

// ── Helpers (module-level) ────────────────────────────────────────────

function tally(items, keyFn) {
  const counts = {}
  for (const item of items) { const k = keyFn(item); counts[k] = (counts[k] || 0) + 1 }
  return counts
}

// Score stories by information density (used in main() to rank candidates)
function infoScore(item) {
  const text = (item.title || '') + ' ' + (item.description || '')
  let score = 0
  score += (text.match(/\d[\d,.]*/g) || []).length * 2
  if (/["'\u201C\u201D]/.test(text)) score += 1
  score += (text.match(/(?<=\s)[A-Z][a-z]{2,}/g) || []).length * 0.5
  if (item.contentText) score += 3
  return score
}

// ── Source Fetching ───────────────────────────────────────────────────

function toArray(items) {
  return Array.isArray(items) ? items : [items]
}

function parseRss2Items(feed) {
  return toArray(feed?.rss?.channel?.item || [])
}

function parseRdfItems(feed) {
  const root = feed?.['rdf:RDF'] || feed?.RDF || feed
  return toArray(root?.item || [])
}

function parseAtomItems(feed) {
  const root = feed?.feed || feed
  return toArray(root?.entry || [])
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
  if (Array.isArray(link)) link = (link.find(l => l['@_rel'] === 'alternate') || link[0])?.['@_href'] || ''
  else if (typeof link === 'object') link = link['@_href'] || link['#text'] || ''
  link = cleanUrl(link, source.stripParams || [])

  const description = decodeEntities(stripHtml(extractText(raw.description || raw.summary || raw['dc:description'] || '').trim()))
  const pubDate = raw.pubDate || raw.published || raw.updated || raw['dc:date'] || raw.date || ''

  let category = source.defaultCategory || ''
  const allTags = []
  if (!category) {
    const rawCats = Array.isArray(raw.category) ? raw.category : (raw.category ? [raw.category] : [])
    for (const rc of rawCats) {
      const tag = typeof rc === 'object' ? (rc['#text'] || '') : rc
      if (tag) allTags.push(tag)
    }
    category = allTags[0] || ''
  }

  const rawContent = extractText(raw['content:encoded'] || raw.content || '')
  const contentText = rawContent ? decodeEntities(stripHtml(rawContent)).trim() : ''

  const comments = raw.comments || ''
  const authorRaw = raw['dc:creator'] || raw.author || ''
  const author = (typeof authorRaw === 'object' ? extractText(authorRaw.name || authorRaw) : extractText(authorRaw)).trim() || undefined

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
    region: source.region,
    comments: comments || undefined,
  }
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

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    })
    const feed = parser.parse(xml)

    const rawItems = source.format === 'rdf'
      ? parseRdfItems(feed)
      : source.format === 'atom'
      ? parseAtomItems(feed)
      : parseRss2Items(feed)

    const items = rawItems
      .map(raw => normalizeItem(raw, source))
      .filter(Boolean)
      .filter(isRelevant)

    console.error(`  ✓ ${source.name} [${source.tier}]: ${items.length} items`)
    return items
  } catch (err) {
    console.error(`  ✗ ${source.name} [${source.tier}]: ${err.message}`)
    return []
  }
}

async function fetchActiveSources(sources) {
  console.error(`Fetching from ${sources.length} sources...`)
  const results = await Promise.allSettled(sources.map(fetchSource))
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const cycleIndex = getCycleIndex()
  const cache = loadCache()

  const activeSources = selectSources(cycleIndex, cache)
  const tierCounts = tally(activeSources, s => s.tier)
  console.error(`Cycle ${cycleIndex}/9 — fetching ${activeSources.length} sources: ${JSON.stringify(tierCounts)}`)

  const { slugs: existingSlugs, titles: existingTitles, urls: existingUrls } = getExistingArticles()
  const allStories = await fetchActiveSources(activeSources)

  // Update self-calibration cache
  for (const source of activeSources) {
    const count = allStories.filter(s => s.source === source.name).length
    updateCache(cache, source.name, count)
  }
  saveCache(cache)

  // Cross-source deduplication
  const deduped = deduplicateStories(allStories)
  console.error(`After cross-source dedup: ${deduped.length} (from ${allStories.length})`)

  // Deduplicate against existing articles (URL + slug + fuzzy title)
  const MAX_AGE_DAYS = 10
  const SUSPECT_THRESHOLD = 0.4  // borderline: might be same story, needs LLM check
  const existingFingerprints = existingTitles.map(fingerprint)
  const fresh = []
  const suspect = []  // borderline items for LLM verification
  let dedupByAge = 0, dedupByUrl = 0, dedupBySlug = 0, dedupByFp = 0
  for (const item of deduped) {
    // Hard age cutoff — stale stories crowd out fresh ones
    const pubMs = item.pubDate ? new Date(item.pubDate).getTime() : 0
    if (pubMs && (Date.now() - pubMs) > MAX_AGE_DAYS * 86400000) { dedupByAge++; continue }
    // Primary check: exact URL match (most reliable)
    if (item.link && existingUrls.has(item.link)) { dedupByUrl++; continue }
    const slug = slugify(item.title, item.pubDate || new Date().toISOString())
    if (existingSlugs.has(slug)) { dedupBySlug++; continue }
    const fp = fingerprint(item.title)
    const maxSim = Math.max(...existingFingerprints.map(efp => similarity(fp, efp)), 0)
    if (maxSim >= SIMILARITY_THRESHOLD) { dedupByFp++; continue }  // definite dupe
    if (maxSim >= SUSPECT_THRESHOLD) {
      // Find the best-matching existing title for LLM context
      const bestIdx = existingFingerprints.reduce((best, efp, i) =>
        similarity(fp, efp) > similarity(fp, existingFingerprints[best]) ? i : best, 0)
      item._suspectMatch = existingTitles[bestIdx]
      suspect.push(item)
    } else {
      fresh.push(item)
    }
  }

  console.error(`Existing-article dedup: ${dedupByUrl} url, ${dedupByAge} age, ${dedupBySlug} slug, ${dedupByFp} fingerprint`)
  console.error(`Fresh stories: ${fresh.length}, suspects: ${suspect.length}`)
  // Include suspects in the pool — they'll be LLM-verified after selection
  for (const s of suspect) fresh.push(s)

  // Sort by date (most recent first)
  const toMs = d => { const t = new Date(d).getTime(); return isNaN(t) ? 0 : t }
  fresh.sort((a, b) => toMs(b.pubDate || 0) - toMs(a.pubDate || 0))

  const scored = fresh.map((item, i) => ({ item, i, score: infoScore(item) }))

  // ── Two-pass selection: category balance + region balance ──────────
  // Goal: selector always has good candidates from all 4 categories AND
  // from each geographic region represented in this cycle's sources.

  const ZUHD_CATS = ['politics', 'economy', 'science', 'tech']
  const REGIONS = ['ME', 'AS', 'AF', 'EU', 'AM', 'OC', 'GL']
  const MIN_PER_CAT = 5
  const MIN_PER_REGION = 2  // try to give selector at least 2 stories per active region
  const MAX_STORIES = 45

  const selected = []
  const usedIdx = new Set()

  // Pass 1a: category minimums (highest-scored per category)
  for (const cat of ZUHD_CATS) {
    const candidates = scored
      .filter(s => !usedIdx.has(s.i) && zuhdCategory(s.item) === cat)
      .sort((a, b) => b.score - a.score)
    for (let j = 0; j < Math.min(MIN_PER_CAT, candidates.length); j++) {
      selected.push(candidates[j].item)
      usedIdx.add(candidates[j].i)
    }
  }

  // Pass 1b: region minimums (highest-scored per active region, if not already covered)
  const activeRegions = new Set(activeSources.map(s => s.region))
  for (const region of REGIONS) {
    if (!activeRegions.has(region)) continue
    const regionCount = selected.filter(s => s.region === region).length
    if (regionCount >= MIN_PER_REGION) continue
    const needed = MIN_PER_REGION - regionCount
    const candidates = scored
      .filter(s => !usedIdx.has(s.i) && s.item.region === region)
      .sort((a, b) => b.score - a.score)
    for (let j = 0; j < Math.min(needed, candidates.length); j++) {
      selected.push(candidates[j].item)
      usedIdx.add(candidates[j].i)
    }
  }

  // Pass 2: fill remaining slots by recency (any category/region)
  for (let i = 0; i < fresh.length && selected.length < MAX_STORIES; i++) {
    if (!usedIdx.has(i)) {
      selected.push(fresh[i])
      usedIdx.add(i)
    }
  }

  // LLM-verify only selected stories that were borderline suspects
  const selectedSuspects = selected.filter(s => s._suspectMatch)
  let llmRemoved = 0
  if (selectedSuspects.length > 0) {
    const llmT0 = Date.now()
    const cleared = await llmDedup(selectedSuspects)
    const llmMs = Date.now() - llmT0
    const clearedSet = new Set(cleared)
    const removed = selectedSuspects.filter(s => !clearedSet.has(s))
    llmRemoved = removed.length
    const removedSet = new Set(removed)
    // Remove LLM-confirmed dupes from selected
    for (let i = selected.length - 1; i >= 0; i--) {
      if (removedSet.has(selected[i])) selected.splice(i, 1)
    }
    console.error(`Haiku dedup: ${selectedSuspects.length} checked, ${llmRemoved} removed, ${(llmMs/1000).toFixed(1)}s`)
  } else {
    console.error(`Haiku dedup: 0 suspects in selection — skipped`)
  }
  // Clean up temporary property
  for (const s of selected) delete s._suspectMatch

  // Log distributions
  const catCounts = tally(selected, s => zuhdCategory(s))
  const regionCounts = tally(selected, s => s.region || '?')
  console.error(`Selected ${selected.length} stories — categories: ${JSON.stringify(catCounts)}`)
  console.error(`Region distribution: ${JSON.stringify(regionCounts)}`)

  const output = {
    fetchedAt: new Date().toISOString(),
    cycleIndex,
    sources: activeSources.map(s => s.name),
    totalItems: allStories.length,
    dedupedItems: deduped.length,
    freshItems: fresh.length,
    existingArticles: [...existingSlugs],
    stories: selected.map(item => {
      const pubMs = toMs(item.pubDate)
      const daysOld = pubMs ? Math.round((Date.now() - pubMs) / 86400000) : null
      const story = {
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: item.pubDate,
        daysOld,
        category: item.category,
        source: item.source,
        suggestedSlug: slugify(item.title, item.pubDate || new Date().toISOString()),
      }
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
