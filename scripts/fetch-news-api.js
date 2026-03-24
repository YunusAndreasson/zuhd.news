#!/usr/bin/env node
// Fetches news from NewsAPI.ai (Event Registry).
// Strategy: events endpoint for story discovery + article queries for source diversity.
// Output: /tmp/zuhd-feed-api.json
import { writeFileSync } from 'fs'
import { slugify, zuhdCategory } from './lib/utils.js'

const API_KEY = process.env.NEWSAPI_KEY
const OUTPUT = '/tmp/zuhd-feed-api.json'
if (!API_KEY) {
  console.error('NEWSAPI_KEY not set')
  // Write empty feed so merge-feeds.js doesn't use stale data
  writeFileSync(OUTPUT, JSON.stringify({ fetchedAt: new Date().toISOString(), events: 0, stories: [] }))
  process.exit(1)
}

const API_BASE = 'https://eventregistry.org/api/v1'
const MAX_BODY = 10000  // 1M context window allows full article text

// ── Category filter ─────────────────────────────────────────────────

const INCLUDE_CATEGORIES = ['news/Politics', 'news/Business', 'news/Science', 'news/Technology', 'news/Environment', 'news/Health']
const EXCLUDE_CATEGORIES = ['news/Sports', 'news/Arts_and_Entertainment']

// ── Region / Bloc Classification ────────────────────────────────────

const WESTERN = new Set(['US', 'GB', 'CA', 'AU', 'NZ', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT'])
const WIRE_NAMES = new Set(['Associated Press', 'Reuters', 'Agence France-Presse', 'AFP'])

const REGIONS = {
  ME: ['IR', 'IQ', 'SY', 'LB', 'JO', 'IL', 'PS', 'SA', 'AE', 'QA', 'BH', 'KW', 'OM', 'YE', 'EG', 'TR', 'DZ', 'MA', 'TN', 'LY'],
  SA: ['AF', 'PK', 'BD', 'LK', 'NP', 'IN', 'MV'],
  EA: ['CN', 'JP', 'KR', 'KP', 'TW', 'MN', 'HK'],
  SEA: ['VN', 'TH', 'MY', 'ID', 'PH', 'SG', 'MM', 'KH', 'LA', 'BN'],
  EU: ['GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'PL', 'UA', 'RO', 'SE', 'NO', 'FI', 'DK', 'CZ', 'HU', 'GR', 'BG', 'HR', 'RS', 'SK', 'SI', 'LT', 'LV', 'EE', 'IE', 'PT', 'AT', 'CH'],
  CAsia: ['KZ', 'UZ', 'TM', 'KG', 'TJ', 'GE', 'AM', 'AZ'],
  AF: ['NG', 'KE', 'ZA', 'ET', 'GH', 'TZ', 'SD', 'SN', 'CI', 'CM', 'UG', 'RW', 'MZ', 'AO', 'CD', 'SS'],
  AM: ['US', 'CA', 'MX', 'BR', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'CU', 'BO', 'PY', 'UY'],
  RU: ['RU', 'BY'],
}

function sameRegion(a, b) {
  if (!a || !b) return false
  return Object.values(REGIONS).some(r => r.includes(a) && r.includes(b))
}

const COUNTRY_LOOKUP = {
  'Iran': 'IR', 'China': 'CN', 'Russia': 'RU', 'United States': 'US',
  'United Kingdom': 'GB', 'India': 'IN', 'Pakistan': 'PK', 'Turkey': 'TR',
  'France': 'FR', 'Germany': 'DE', 'Japan': 'JP', 'South Korea': 'KR',
  'Brazil': 'BR', 'Nigeria': 'NG', 'Kenya': 'KE', 'Sudan': 'SD',
  'Egypt': 'EG', 'South Africa': 'ZA', 'Australia': 'AU', 'Canada': 'CA',
  'Indonesia': 'ID', 'Malaysia': 'MY', 'Kazakhstan': 'KZ', 'Israel': 'IL',
  'Qatar': 'QA', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE',
  'Mexico': 'MX', 'Argentina': 'AR', 'Colombia': 'CO', 'Italy': 'IT',
  'Spain': 'ES', 'Netherlands': 'NL', 'Sweden': 'SE', 'Norway': 'NO',
  'Denmark': 'DK', 'Finland': 'FI', 'Poland': 'PL', 'Ukraine': 'UA',
  'Romania': 'RO', 'Greece': 'GR', 'Ireland': 'IE', 'Bangladesh': 'BD',
  'Sri Lanka': 'LK', 'Vietnam': 'VN', 'Thailand': 'TH', 'Philippines': 'PH',
  'Singapore': 'SG', 'Myanmar': 'MM', 'Afghanistan': 'AF', 'Iraq': 'IQ',
  'Syria': 'SY', 'Lebanon': 'LB', 'Jordan': 'JO', 'Palestine': 'PS',
  'New Zealand': 'NZ', 'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT',
  'Portugal': 'PT', 'Czech Republic': 'CZ', 'Hungary': 'HU', 'Bulgaria': 'BG',
  'Serbia': 'RS', 'Croatia': 'HR', 'Hong Kong': 'HK', 'Taiwan': 'TW',
  'Ethiopia': 'ET', 'Ghana': 'GH', 'Tanzania': 'TZ', 'Uganda': 'UG',
  'Algeria': 'DZ', 'Morocco': 'MA', 'Tunisia': 'TN', 'Senegal': 'SN',
  'Georgia': 'GE', 'Armenia': 'AM', 'Azerbaijan': 'AZ', 'Uzbekistan': 'UZ',
  'Belarus': 'BY', 'Cuba': 'CU', 'Peru': 'PE', 'Chile': 'CL', 'Venezuela': 'VE',
}

function getCountryCode(source) {
  const loc = source?.location
  if (!loc) return null
  const countryName = loc.type === 'country'
    ? loc.label?.eng
    : loc.country?.label?.eng
  return countryName ? (COUNTRY_LOOKUP[countryName] || null) : null
}

function getCountryFromLoc(loc) {
  if (!loc) return null
  if (loc.type === 'country') return COUNTRY_LOOKUP[loc.label?.eng] || null
  if (loc.country) return COUNTRY_LOOKUP[loc.country?.label?.eng] || null
  return null
}

// ── Source Diversity Algorithm ───────────────────────────────────────

function assembleSourcePanel(articles, eventLocation) {
  // Dedupe by source name — no two articles from the same outlet
  const seenNames = new Set()
  const unique = []
  for (const a of articles) {
    const name = a.source?.title || ''
    if (!seenNames.has(name)) {
      seenNames.add(name)
      unique.push(a)
    }
  }

  if (unique.length <= 3) return unique

  const affectedCountry = eventLocation ? getCountryFromLoc(eventLocation) : null

  const affected = [], regional = [], wire = [], alternative = []
  for (const a of unique) {
    const cc = a._sourceCountry
    const srcName = a.source?.title || ''
    if (cc && cc === affectedCountry) {
      affected.push(a)
    } else if (WIRE_NAMES.has(srcName)) {
      wire.push(a)
    } else if (WESTERN.has(cc) && (a.source?.ranking?.importanceRank || 999999) < 3000) {
      wire.push(a)
    } else if (affectedCountry && sameRegion(cc, affectedCountry)) {
      regional.push(a)
    } else if (!WESTERN.has(cc)) {
      alternative.push(a)
    } else {
      wire.push(a)
    }
  }

  const byRank = arr => arr.sort((a, b) => (a.source?.ranking?.importanceRank || 999999) - (b.source?.ranking?.importanceRank || 999999))
  const panel = []
  const usedCountries = new Set()

  function pickFrom(arr) {
    byRank(arr)
    for (const a of arr) {
      if (!usedCountries.has(a._sourceCountry) || !a._sourceCountry) {
        panel.push(a)
        if (a._sourceCountry) usedCountries.add(a._sourceCountry)
        return
      }
    }
    if (arr.length > 0 && panel.length < 5) panel.push(arr[0])
  }

  pickFrom(affected)
  pickFrom(regional)
  pickFrom(wire)
  byRank(alternative)
  for (const a of alternative) {
    if (panel.length >= 5) break
    if (!usedCountries.has(a._sourceCountry) || !a._sourceCountry) {
      panel.push(a)
      if (a._sourceCountry) usedCountries.add(a._sourceCountry)
    }
  }

  // Fill to 3
  if (panel.length < 3) {
    for (const a of unique.filter(a => !panel.includes(a))) {
      if (panel.length >= 3) break
      panel.push(a)
    }
  }

  // Cap: max 2 Western-bloc sources
  let westernCount = panel.filter(a => WESTERN.has(a._sourceCountry)).length
  while (westernCount > 2 && panel.length > 2) {
    const idx = [...panel].reverse().findIndex(a => WESTERN.has(a._sourceCountry))
    if (idx === -1) break
    const realIdx = panel.length - 1 - idx
    const replacement = unique.find(a => !panel.includes(a) && !WESTERN.has(a._sourceCountry))
    if (replacement) { panel[realIdx] = replacement; westernCount-- }
    else break
  }

  return panel.slice(0, 5)
}

// ── API Calls ───────────────────────────────────────────────────────

async function apiPost(endpoint, params) {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: API_KEY, ...params }),
  })
  if (!res.ok) {
    console.error(`API ${endpoint} error ${res.status}`)
    return {}
  }
  return res.json()
}

// ── Shared article query defaults ────────────────────────────────────
const ARTICLE_DEFAULTS = {
  resultType: 'articles',
  articlesCount: 100,
  lang: 'eng',
  dataType: ['news'],
  isDuplicateFilter: 'skipDuplicates',
  dateStart: new Date().toISOString().slice(0, 10),
  articleBodyLen: -1,           // full text — eliminates prefetch stage
  includeArticleConcepts: true,
  includeArticleCategories: true,
  includeArticleLocation: true,
  includeArticleImage: false,   // never used
  includeArticleAuthors: false, // never used
  includeSourceLocation: true,
  includeSourceRanking: true,
}

// ── Source lists (used by merged Q2+Q3 query) ───────────────────────
const CURATED_SOURCES = [
  // Wire + Western
  'bbc.com', 'reuters.com', 'france24.com', 'dw.com',
  // Muslim world + Middle East
  'aljazeera.com', 'middleeasteye.net', 'al-monitor.com', 'en.mehrnews.com',
  'trtworld.com', 'newarab.com', 'middleeastmonitor.com', 'thenationalnews.com',
  // Israel (critical domestic voice)
  'haaretz.com',
  // South + East Asia
  'dawn.com', 'scmp.com', 'antaranews.com', 'caixinglobal.com',
  'rappler.com', 'asia.nikkei.com', 'irrawaddy.com',
  // Russia
  'tass.com',
  // Africa + Latin America
  'dailymaverick.co.za', 'premiumtimesng.com', 'dabangasudan.org', 'techcabal.com',
  // Science + Tech
  'restofworld.org', 'statnews.com', 'newscientist.com', 'nature.com',
  'arstechnica.com', 'technologyreview.com', 'coindesk.com',
  'carbonbrief.org', 'quantamagazine.org',
  // Niche regional + moved from RSS (indexed in API)
  'eurasianet.org', 'insightcrime.org', 'sixthtone.com',
  'occrp.org', 'wamda.com',
  // Balkans (Bosnia, Albania — Muslim communities)
  'balkaninsight.com', 'sarajevotimes.com', 'albaniandailynews.com',
  // Human rights + investigative (critical of occupation, evidence-based)
  'theintercept.com', 'hrw.org', 'amnesty.org', 'mondoweiss.net',
  // Economy
  'bloomberg.com', 'ft.com', 'economist.com',
  // Climate + Global South environment
  'news.mongabay.com',
  // Ukraine/Eastern Europe
  'kyivindependent.com',
  // Tech + Global South startups + AI + hacker culture
  'techcrunch.com', 'semafor.com', 'disruptafrica.com', 'the-decoder.com',
  'theregister.com',
]

const GAP_COUNTRIES = [
  'http://en.wikipedia.org/wiki/Iran',
  'http://en.wikipedia.org/wiki/China',
  'http://en.wikipedia.org/wiki/Russia',
  'http://en.wikipedia.org/wiki/Kenya',
  'http://en.wikipedia.org/wiki/Sudan',
  'http://en.wikipedia.org/wiki/Brazil',
  'http://en.wikipedia.org/wiki/Turkey',
  'http://en.wikipedia.org/wiki/Qatar',
  'http://en.wikipedia.org/wiki/Pakistan',
  'http://en.wikipedia.org/wiki/South_Africa',
  'http://en.wikipedia.org/wiki/Nigeria',
  'http://en.wikipedia.org/wiki/Colombia',
  'http://en.wikipedia.org/wiki/Indonesia',
  'http://en.wikipedia.org/wiki/Malaysia',
  'http://en.wikipedia.org/wiki/Bangladesh',
  'http://en.wikipedia.org/wiki/United_Arab_Emirates',
]

// Q1: Event discovery (5 tokens)
async function fetchEvents() {
  const data = await apiPost('event/getEvents', {
    resultType: 'events',
    eventsCount: 50,
    eventsSortBy: 'size',
    lang: 'eng',
    categoryUri: INCLUDE_CATEGORIES,
    ignoreCategoryUri: EXCLUDE_CATEGORIES,
    dateStart: new Date().toISOString().slice(0, 10),
    minArticlesInEvent: 10,
  })
  return (data.events?.results || []).filter(Boolean)
}

// Q2: Curated editorial sources (1 token)
async function fetchCuratedArticles() {
  const data = await apiPost('article/getArticles', {
    ...ARTICLE_DEFAULTS,
    articlesSortBy: 'date',
    sourceUri: CURATED_SOURCES,
  })
  return data.articles?.results || []
}

// Q3: Gap-region sources — different countries, sorted by importance (1 token)
async function fetchGapArticles() {
  const data = await apiPost('article/getArticles', {
    ...ARTICLE_DEFAULTS,
    articlesSortBy: 'sourceImportance',
    eventFilter: 'skipArticlesWithoutEvent',
    categoryUri: INCLUDE_CATEGORIES,
    ignoreCategoryUri: EXCLUDE_CATEGORIES,
    sourceLocationUri: GAP_COUNTRIES,
  })
  return data.articles?.results || []
}

// Q4: Broad global news — top-ranked sources, catches events Q2/Q3 missed (1 token)
async function fetchBroadArticles() {
  const data = await apiPost('article/getArticles', {
    ...ARTICLE_DEFAULTS,
    articlesSortBy: 'date',
    eventFilter: 'skipArticlesWithoutEvent',
    categoryUri: INCLUDE_CATEGORIES,
    ignoreCategoryUri: EXCLUDE_CATEGORIES,
    startSourceRankPercentile: 0,
    endSourceRankPercentile: 20,
  })
  return data.articles?.results || []
}

// mapCategory alias — uses shared zuhdCategory with API category arrays
const mapCategory = (categories) => zuhdCategory(categories || [])

function extractConcepts(articles) {
  const map = new Map()
  for (const a of articles) {
    for (const c of (a.concepts || [])) {
      const label = c.label?.eng
      if (!label) continue
      if (!map.has(label) || (c.score || 0) > (map.get(label).score || 0)) {
        map.set(label, c)
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8)
    .map(c => c.label?.eng)
    .filter(Boolean)
}

function avg(nums) {
  return nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : null
}

// Sentiment spread: max - min across sources. >0.5 = divergent framing.
function sentimentSpread(articles) {
  const sentiments = articles.map(a => a.sentiment).filter(s => s != null)
  if (sentiments.length < 2) return null
  return +(Math.max(...sentiments) - Math.min(...sentiments)).toFixed(2)
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.error('Fetching from NewsAPI.ai...')

  // Run all 4 queries in parallel (5+1+1+1 = 8 tokens)
  const [events, curatedArticles, gapArticles, broadArticles] = await Promise.all([
    fetchEvents(),
    fetchCuratedArticles(),
    fetchGapArticles(),
    fetchBroadArticles(),
  ])

  console.error(`Q1: ${events.length} events, Q2: ${curatedArticles.length} curated, Q3: ${gapArticles.length} gap, Q4: ${broadArticles.length} broad`)

  // Annotate all articles with country codes
  const allArticles = [...curatedArticles, ...gapArticles, ...broadArticles]
  const seen = new Set()
  const dedupedArticles = []
  for (const a of allArticles) {
    if (seen.has(a.uri)) continue
    seen.add(a.uri)
    a._sourceCountry = getCountryCode(a.source) || null
    dedupedArticles.push(a)
  }

  console.error(`Deduped articles: ${dedupedArticles.length}`)

  // Index articles by eventUri
  const articlesByEvent = new Map()
  const standaloneArticles = []
  for (const a of dedupedArticles) {
    if (a.eventUri) {
      if (!articlesByEvent.has(a.eventUri)) articlesByEvent.set(a.eventUri, [])
      articlesByEvent.get(a.eventUri).push(a)
    } else {
      standaloneArticles.push(a)
    }
  }

  // Build stories: merge events with their matched articles
  const stories = []
  const usedEventUris = new Set()

  for (const event of events) {
    const uri = event.uri
    const matchedArticles = articlesByEvent.get(uri) || []
    const title = event.title?.eng || ''
    const totalArticles = event.totalArticleCount || 0
    const eventLoc = event.location || null
    const eventConcepts = (event.concepts || [])
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 8)
      .map(c => c.label?.eng)
      .filter(Boolean)
    const eventDate = event.eventDate || new Date().toISOString().slice(0, 10)
    const eventCategories = event.categories || []

    usedEventUris.add(uri)

    if (matchedArticles.length === 0) {
      // Event with no matched articles — include as headline-only for the selector
      stories.push({
        title,
        description: event.summary?.eng || '',
        link: '',
        pubDate: eventDate + 'T00:00:00Z',
        category: mapCategory(eventCategories),
        source: '',
        suggestedSlug: slugify(title, eventDate),
        eventUri: uri,
        eventCoverage: totalArticles,
        sources: [],
        concepts: eventConcepts,
        location: eventLoc?.type === 'place' ? eventLoc.label?.eng : (eventLoc?.label?.eng || null),
        sentiment: null,
        origin: 'api',
      })
      continue
    }

    // Assemble diverse source panel
    const panel = assembleSourcePanel(matchedArticles, eventLoc)
    const primary = panel[0]
    const concepts = eventConcepts.length > 0 ? eventConcepts : extractConcepts(panel)
    const location = eventLoc?.type === 'place'
      ? eventLoc.label?.eng
      : (eventLoc?.label?.eng || primary.location?.label?.eng || null)

    stories.push({
      title: primary.title || title,
      description: (primary.body || '').slice(0, 300),
      link: primary.url || '',
      pubDate: primary.dateTimePub || primary.dateTime || eventDate + 'T00:00:00Z',
      category: mapCategory(primary.categories || eventCategories),
      source: primary.source?.title || '',
      suggestedSlug: slugify(primary.title || title, primary.dateTimePub || eventDate),
      eventUri: uri,
      eventCoverage: totalArticles,
      sources: panel.map(a => ({
        name: a.source?.title || '',
        url: a.url || '',
        country: a._sourceCountry,
        body: (a.body || '').slice(0, MAX_BODY),
        importanceRank: a.source?.ranking?.importanceRank || null,
        sentiment: a.sentiment != null ? +a.sentiment.toFixed(2) : null,
      })),
      concepts,
      location,
      sentiment: avg(panel.map(a => a.sentiment).filter(s => s != null)),
      sentimentDivergence: sentimentSpread(panel),
      origin: 'api',
    })
  }

  // Sort: events with matched articles first (by coverage), then headline-only events
  stories.sort((a, b) => {
    const aHas = a.sources.length > 0 ? 1 : 0
    const bHas = b.sources.length > 0 ? 1 : 0
    if (aHas !== bHas) return bHas - aHas
    return (b.eventCoverage || 0) - (a.eventCoverage || 0)
  })

  // Add standalone + unmatched articles — prioritize niche/specialist sources
  // These are the science, tech, and specialist stories that don't cluster into big events
  const NICHE_SOURCES = new Set([
    'statnews.com', 'newscientist.com', 'nature.com', 'arstechnica.com',
    'technologyreview.com', 'coindesk.com', 'carbonbrief.org', 'restofworld.org',
    'dailymaverick.co.za', 'premiumtimesng.com', 'dabangasudan.org',
    'en.mehrnews.com', 'tass.com', 'dawn.com',
  ])

  // Also include articles from Q2/Q3 that matched events but weren't in a panel
  const panelUris = new Set(stories.flatMap(s => s.sources.map(src => src.url)))
  const unmatched = dedupedArticles.filter(a =>
    !panelUris.has(a.url) && !standaloneArticles.includes(a)
  )

  const allCandidates = [...standaloneArticles, ...unmatched]

  // Sort: niche sources first, then by source importance
  const isNiche = a => NICHE_SOURCES.has(a.source?.uri || '')
  allCandidates.sort((a, b) => {
    if (isNiche(a) !== isNiche(b)) return isNiche(a) ? -1 : 1
    return (a.source?.ranking?.importanceRank || 999999) - (b.source?.ranking?.importanceRank || 999999)
  })

  // Dedupe + cap per source to prevent one outlet dominating standalone
  const storyFingerprints = new Set(stories.map(s => s.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)))
  const sourceCount = {}

  let added = 0
  for (const a of allCandidates) {
    if (added >= 25) break
    const fp = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
    if (storyFingerprints.has(fp)) continue
    const srcName = a.source?.title || '?'
    sourceCount[srcName] = (sourceCount[srcName] || 0) + 1
    if (sourceCount[srcName] > 3) continue  // max 3 standalone per source
    storyFingerprints.add(fp)

    stories.push({
      title: a.title,
      description: (a.body || '').slice(0, 300),
      link: a.url || '',
      pubDate: a.dateTimePub || a.dateTime,
      category: mapCategory(a.categories || []),
      source: a.source?.title || '',
      suggestedSlug: slugify(a.title, a.dateTimePub || a.dateTime),
      eventUri: a.eventUri || null,
      eventCoverage: null,
      sources: [{
        name: a.source?.title || '',
        url: a.url || '',
        country: a._sourceCountry,
        body: (a.body || '').slice(0, MAX_BODY),
        importanceRank: a.source?.ranking?.importanceRank || null,
      }],
      concepts: (a.concepts || []).slice(0, 5).map(c => c.label?.eng || '').filter(Boolean),
      location: a.location?.label?.eng || null,
      sentiment: a.sentiment,
      origin: 'api',
    })
    added++
  }

  const withSources = stories.filter(s => s.sources.length > 0).length
  const multiSource = stories.filter(s => s.sources.length > 1).length
  const output = {
    fetchedAt: new Date().toISOString(),
    events: events.length,
    stories,
  }

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2))
  console.error(`Wrote ${stories.length} stories: ${withSources} with articles (${multiSource} multi-source), ${stories.length - withSources} headline-only`)
  console.log(`${stories.length} stories from ${events.length} events`)
}

main().catch(e => { console.error(e); process.exit(1) })
