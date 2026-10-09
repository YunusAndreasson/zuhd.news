#!/usr/bin/env node
// Fetches news from NewsAPI.ai (Event Registry).
// Strategy: events endpoint for story discovery + article queries for source diversity.
// Output: /tmp/zuhd-feed-api.json
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { countryOf, extractConcepts, hasHeadline, mapCategory, redact, resultsAt, sourceName, storyFrom, toSource } from './lib/api-feed.js'
import { eventCoveredRecently, loadDedupContext } from './lib/dedup.js'
import { MAX_FEED_AGE_MS } from './lib/feed-age.js'
import { readUnexplainedMovers } from './lib/company-gaps.js'
import { namedSeries, pickTracked, TRACKED_KEYWORDS } from './lib/tracked-stories.js'
import { slugify } from './lib/utils.js'
import { writeJson } from './lib/json-file.js'
import { runWithConcurrency } from './lib/concurrency.js'

const API_KEY = process.env.NEWSAPI_KEY
const OUTPUT = '/tmp/zuhd-feed-api.json'
if (!API_KEY) {
  console.error('NEWSAPI_KEY not set')
  // Write empty feed so merge-feeds.js doesn't use stale data
  writeJson(OUTPUT, { fetchedAt: new Date().toISOString(), events: 0, stories: [] }, { pretty: false })
  process.exit(1)
}

const API_BASE = 'https://eventregistry.org/api/v1'

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

  const affectedCountry = countryOf(eventLocation)

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

// Token accounting — NewsAPI.ai charges ~5 tokens per event search, ~1 per article search.
// Tracks every apiPost so cycles can log actual cost vs budgeted cost.
const API_TIMEOUT_MS = 90_000
// `otherCalls` is always 0: every call says which of the three kinds it is
// (it counted a call that named none, and none ever did: `other=0` in each of
// 41 cycle logs). The key stays because the feed file and the snapshot under
// `content/` have always carried it, and the token line prints it.
const tokenStats = { eventCalls: 0, articleCalls: 0, perEventCalls: 0, otherCalls: 0, estTokens: 0 }
const CALLS_OF = /** @type {const} */ ({ events: 'eventCalls', articles: 'articleCalls', perEvent: 'perEventCalls' })

/** @param {keyof typeof CALLS_OF} tag which kind of call, for the count */
async function apiPost(endpoint, params, tag) {
  // Cost model: event/getEvents = 5 tokens, article queries = 1, event/getEvent = 1
  const cost = endpoint === 'event/getEvents' ? 5 : 1
  tokenStats.estTokens += cost
  tokenStats[CALLS_OF[tag]]++

  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: API_KEY, ...params }),
    // `run-cycle.sh` runs this stage with no outer `timeout`, so without a
    // deadline here one hung connection stalled the whole cycle before the
    // selector ever ran. Covers the body too.
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!res.ok) {
    // Surface a sliver of the body so 401/429/5xx are diagnosable from logs.
    // Without the key, should the body quote the request back.
    let detail = ''
    try { detail = redact((await res.text()).slice(0, 200), API_KEY) } catch {}
    throw new Error(`NewsAPI.ai ${endpoint} ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`)
  }
  return res.json()
}

/**
 * The list an answer carries at `path`. One that carries none is said, on a
 * line the run record keeps as a warning: it read as "0 events" or "0
 * articles", which is also what a quiet query gives.
 */
function listOf(data, path, endpoint) {
  const { results, saw } = resultsAt(data, path)
  if (saw) console.error(`⚠ NewsAPI ${endpoint} answered with ${redact(saw, API_KEY)}`)
  return results
}

// ── Shared article query defaults ────────────────────────────────────
// Look back 1 day for articles — catches late-indexed content from previous cycle windows
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const TODAY = new Date().toISOString().slice(0, 10)
const ARTICLE_DEFAULTS = {
  resultType: 'articles',
  articlesCount: 100,
  lang: 'eng',
  dataType: ['news'],
  isDuplicateFilter: 'skipDuplicates',
  dateStart: YESTERDAY,
  articleBodyLen: -1,
  includeArticleConcepts: true,
  includeArticleCategories: true,
  includeArticleLocation: true,
  includeArticleSentiment: true, // per-source tone for divergence detection
  includeArticleImage: true,    // captured as image: <url> per source for evaluation
  includeArticleAuthors: false, // never used
  includeSourceLocation: true,
  includeSourceRanking: true,
  includeArticleSocialScore: true, // free public-attention signal for the selector
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
  // Muslim-majority nations underrepresented in Western wire services
  'http://en.wikipedia.org/wiki/Egypt',
  'http://en.wikipedia.org/wiki/Algeria',
  'http://en.wikipedia.org/wiki/Morocco',
  'http://en.wikipedia.org/wiki/Iraq',
  'http://en.wikipedia.org/wiki/Yemen',
  'http://en.wikipedia.org/wiki/Somalia',
  'http://en.wikipedia.org/wiki/Afghanistan',
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
    // Window, not an open-ended floor. `dateStart` alone means "dated today OR
    // LATER", so the size sort filled up with *scheduled* events — product
    // launches, withdrawal deadlines, elections weeks out (measured 2026-08-30:
    // 50/50 events dated today→Oct 26, none in the past). Those clusters have no
    // `infoArticle`, so they arrive sourceless and merge-feeds.js drops them:
    // 31-42 of every 72 stories, worst at 04:00 when "today" is 4 hours old and
    // nothing yet clears minArticlesInEvent. The lookback catches events that
    // broke overnight; dateEnd keeps the calendar out. Same call, same 5 tokens.
    dateStart: YESTERDAY,
    dateEnd: TODAY,
    minArticlesInEvent: 10,
    // Return-info flags change payload only, never token cost (ER cost model
    // is per call/page). infoArticle = the medoid article the event title/summary
    // came from — gives headline-only events a real URL + body for free.
    includeEventInfoArticle: true,
    includeEventSocialScore: true,
  }, 'events')
  return listOf(data, ['events', 'results'], 'event/getEvents')
}

// Q2: Reader-aligned sources — guaranteed slot for niche sources the reader chose us for (1 token)
const READER_ALIGNED = [
  // Hacker/AI culture
  'theregister.com', 'the-decoder.com', 'arstechnica.com', 'technologyreview.com',
  // Macro-economics depth
  'bloomberg.com', 'ft.com', 'economist.com', 'coindesk.com',
  // Muslim world from inside
  'aljazeera.com', 'middleeasteye.net', 'trtworld.com', 'en.mehrnews.com', 'dawn.com', 'wamda.com',
  // Accountability
  'occrp.org', 'theintercept.com', 'hrw.org', 'amnesty.org', 'mondoweiss.net', 'balkaninsight.com',
  // Global South
  'rappler.com', 'irrawaddy.com', 'news.mongabay.com', 'disruptafrica.com', 'caixinglobal.com',
]

/** One `article/getArticles` query over `ARTICLE_DEFAULTS` (1 token). */
async function queryArticles(params) {
  const data = await apiPost('article/getArticles', { ...ARTICLE_DEFAULTS, ...params }, 'articles')
  return listOf(data, ['articles', 'results'], 'article/getArticles')
}

function fetchReaderAlignedArticles() {
  return queryArticles({
    articlesSortBy: 'date',
    sourceUri: READER_ALIGNED,
  })
}

// Q3: Remaining curated sources — wire, regional, science (1 token)
const CURATED_REMAINING = CURATED_SOURCES.filter(s => !READER_ALIGNED.includes(s))

function fetchCuratedArticles() {
  return queryArticles({
    articlesSortBy: 'date',
    sourceUri: CURATED_REMAINING,
  })
}

// Q3: Gap-region sources — different countries, sorted by importance (1 token)
function fetchGapArticles() {
  return queryArticles({
    articlesSortBy: 'sourceImportance',
    eventFilter: 'skipArticlesWithoutEvent',
    categoryUri: INCLUDE_CATEGORIES,
    ignoreCategoryUri: EXCLUDE_CATEGORIES,
    sourceLocationUri: GAP_COUNTRIES,
  })
}

// Q4: Broad global news — top-ranked sources, catches events Q2/Q3 missed (1 token)
function fetchBroadArticles() {
  return queryArticles({
    articlesSortBy: 'date',
    eventFilter: 'skipArticlesWithoutEvent',
    categoryUri: INCLUDE_CATEGORIES,
    ignoreCategoryUri: EXCLUDE_CATEGORIES,
    startSourceRankPercentile: 0,
    endSourceRankPercentile: 20,
  })
}

// Q6: Stories about the series the site charts — a headline that names oil,
// a strait, a currency, the Fed (1 token). The other queries sample the day
// by size and by recency, and a wire's market desk is a few items among
// hundreds: of 149 raw items on 2026-10-01 18:00, four were about any of it,
// while Reuters ran three tankers hit at Hormuz. What is asked for and which
// results get a slot is `lib/tracked-stories.js`.
//
// **Fail-soft, unlike the five above.** They are the feed; this is an
// addition to it, and a rejected keyword list must not cost the cycle its API
// stories.
//
// It also asks, by name, for a company whose share moved sharply this week
// with no story here to say why (`lib/company-gaps.js`): the same token.
const MOVERS = readUnexplainedMovers()

async function fetchTrackedArticles() {
  try {
    return await queryArticles({
      articlesSortBy: 'date',
      keyword: [...TRACKED_KEYWORDS, ...MOVERS.flatMap((m) => m.keyword ?? [])],
      keywordOper: 'or',
      keywordLoc: 'title',
      // "gold" is also a medal and a film; the category filter is what keeps
      // the Asian Games out.
      categoryUri: INCLUDE_CATEGORIES,
      ignoreCategoryUri: EXCLUDE_CATEGORIES,
      sourceUri: CURATED_SOURCES,
    })
  } catch (e) {
    console.error(`Q6 tracked-series query failed, continuing without it: ${e.message}`)
    return []
  }
}

// Pick the most specific/arresting headline from a panel.
// Wire headlines are flat ("EU says deal will apply May 1").
// Non-wire headlines are specific ("Lebanon expels Iran's ambassador").
// Prefer shorter, punchier titles with numbers or named actors.
function bestTitle(articles, fallback) {
  if (!articles.length) return fallback
  const scored = articles.map(a => {
    const t = a.title || ''
    let score = 0
    // Shorter titles tend to be punchier
    if (t.length < 70) score += 2
    if (t.length < 50) score += 2
    // Numbers are specific
    if (/\d/.test(t)) score += 1
    // Quotes suggest a named actor
    if (/['"\u2018\u201C]/.test(t)) score += 1
    // Colon/dash often means explanatory wire headline — penalize
    if (/[:,] /.test(t) && t.length > 60) score -= 1
    // "says", "announces", "declares" suggest wire framing
    if (/\b(says|announces|according)\b/i.test(t)) score -= 1
    return { title: t, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].title || fallback
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.error('Fetching from NewsAPI.ai...')

  // Run all 5 queries in parallel (5+1+1+1+1 = 9 tokens)
  const [events, readerArticles, curatedArticles, gapArticles, broadArticles] = await Promise.all([
    fetchEvents(),
    fetchReaderAlignedArticles(),
    fetchCuratedArticles(),
    fetchGapArticles(),
    fetchBroadArticles(),
  ])
  // Q6 runs after them, never beside them (1 token). Five at once is the
  // API's ceiling: as a sixth parallel request it drew a 429 on the first
  // real run — and on Q4, not on itself, so its own catch could not contain
  // it and the cycle would have gone RSS-only.
  const trackedArticles = await fetchTrackedArticles()

  console.error(`Q1: ${events.length} events, Q2: ${readerArticles.length} reader, Q3: ${curatedArticles.length} curated, Q4: ${gapArticles.length} gap, Q5: ${broadArticles.length} broad, Q6: ${trackedArticles.length} tracked`)

  // Annotate all articles with country codes. Tracked articles join the pool,
  // so one about an event already in Q1 lands in that event's panel.
  const trackedUris = new Set(trackedArticles.map(a => a.uri))
  const allArticles = [...readerArticles, ...curatedArticles, ...gapArticles, ...broadArticles, ...trackedArticles]
  const seen = new Set()
  const dedupedArticles = []
  for (const a of allArticles) {
    if (seen.has(a.uri)) continue
    seen.add(a.uri)
    a._sourceCountry = countryOf(a.source?.location)
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

  // Per-event fetch: directly fetch 15 diverse articles for up to 8 events.
  // This guarantees multi-source panels — the Q2-Q5 matching often misses.
  // Cost: ≤1 token per event, ≤8 tokens/cycle — the same ceiling as before.
  //
  // **Only events we have not already covered.** This took the top 8 by
  // coverage, which are mostly running stories already in the ledger; the
  // prefilter then drops them by eventUri (layer 3 of wouldDedup), so the
  // panel never reached the writer — 6 of 8 on 2026-09-25, with the same
  // events re-bought every cycle. The budget now walks down the list past
  // covered events, so the same tokens buy panels for stories we can still
  // run. `eventCoveredRecently` is prefilter's own test, over prefilter's
  // own 7-day window.
  const TOP_EVENTS_TO_FETCH = 8
  const PER_EVENT_CONCURRENCY = 4
  const MAX_EVENTS_SCANNED = 24
  // What is already covered decides which panels are worth a token, and only
  // that. If it cannot be read (`loadRecentArticles` now throws where it gave
  // an empty list) no event is skipped as covered, the same eight calls at
  // most are made, and the feed is not lost over an enrichment's bookkeeping.
  /** @type {Parameters<typeof eventCoveredRecently>[1]} */
  let dedupCtx = { ledgerEventUris: new Map(), recentSlugs: [] }
  try {
    dedupCtx = loadDedupContext(7 * 24 * 3600 * 1000)
  } catch (e) {
    console.error(`⚠ per-event fetch: what is already covered could not be read (${e.message}), so no event is skipped as covered`)
  }
  let perEventFetched = 0
  let perEventCalls = 0
  const perEventLog = []
  // Which events to buy is decided before any call — it depends on coverage
  // and Q1–Q5's counts, never on what a per-event call returns — so the calls
  // run together and merge in scan order, which keeps `seen` and the log
  // exactly as the serial loop had them. Four at once: five is the API's
  // ceiling (see Q6 above).
  const targets = []
  for (const event of events.slice(0, MAX_EVENTS_SCANNED)) {
    if (targets.length >= TOP_EVENTS_TO_FETCH) break
    const uri = event.uri
    const covered = eventCoveredRecently(uri, dedupCtx)
    if (covered) {
      perEventLog.push({ uri, cov: event.totalArticleCount, skipped: `covered by ${covered}`, preCount: 0, tokens: 0 })
      continue
    }
    const preCount = (articlesByEvent.get(uri) || []).length
    // Skip if we already have 3+ articles from Q2-Q5
    if (preCount >= 3) {
      perEventLog.push({ uri, cov: event.totalArticleCount, skipped: 'already>=3', preCount, tokens: 0 })
      continue
    }
    const log = { uri, cov: event.totalArticleCount, preCount, returned: 0, tokens: 1 }
    perEventLog.push(log)
    targets.push({ uri, log, data: null })
  }

  await runWithConcurrency(targets, PER_EVENT_CONCURRENCY, async (t) => {
    // Fetch articles for this event (skip info/redirect check — saves 1 token per event;
    // if the URI was redirected the query returns empty and we move on).
    // Fail-soft: a panel is an enrichment, and one failed call used to throw
    // out of main() and cost the cycle every API story.
    try {
      t.data = await apiPost('event/getEvent', {
        eventUri: t.uri,
        resultType: 'articles',
        articlesCount: 15,
        articlesLang: 'eng',
        articlesSortBy: 'sourceImportance',
        articleBodyLen: -1,
        // Top-half sources only — same bound Q5 uses. Without it the 15-article
        // budget fills with bottom-tier reprints of the same wire copy.
        startSourceRankPercentile: 0,
        endSourceRankPercentile: 50,
        includeSourceLocation: true,
        includeSourceRanking: true,
        includeArticleSentiment: true,
        includeArticleConcepts: true,
        includeArticleLocation: true,
      }, 'perEvent')
    } catch (e) {
      t.log.error = e.message
    }
  })
  perEventCalls = targets.length

  for (const { uri, log, data } of targets) {
    // A call that failed has its error on the line already. One that answered
    // with no list of articles says what it held: a redirected event "returns
    // empty and we move on", and nothing recorded what empty looked like.
    const { results: fetchedArts, saw } = data ? resultsAt(data, [uri, 'articles', 'results']) : { results: [], saw: undefined }
    if (saw) log.saw = redact(saw, API_KEY)
    log.returned = fetchedArts.length
    if (fetchedArts.length > 0) {
      // Annotate and add to the event's article pool
      for (const a of fetchedArts) {
        if (seen.has(a.uri)) continue
        seen.add(a.uri)
        a._sourceCountry = countryOf(a.source?.location)
        if (!articlesByEvent.has(uri)) articlesByEvent.set(uri, [])
        articlesByEvent.get(uri).push(a)
      }
      perEventFetched++
    }
  }
  console.error(`Per-event fetch: enriched ${perEventFetched}/${perEventCalls} uncovered events (${perEventLog.filter(e => e.skipped?.startsWith('covered')).length} already-covered skipped)`)
  // Per-event detail log — one line per event so experiments can audit waste/yield
  for (const e of perEventLog) {
    const tail = e.skipped ? `skipped=${e.skipped}` : e.error ? `error=${e.error}` : `returned=${e.returned}${e.saw ? ` saw="${e.saw}"` : ''}`
    console.error(`  per-event ${e.uri} cov=${e.cov||0} preCount=${e.preCount} tokens=${e.tokens} ${tail}`)
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
      .map(c => c.uri ? { label: c.label?.eng, uri: c.uri } : c.label?.eng)
      .filter(Boolean)
    const eventDate = event.eventDate || new Date().toISOString().slice(0, 10)
    const eventCategories = event.categories || []

    usedEventUris.add(uri)

    if (matchedArticles.length === 0) {
      // Event with no matched articles. The medoid article (includeEventInfoArticle,
      // free) gives these a real URL — and, when its body came back with substance,
      // a writable single-source panel instead of a headline-only stub the writer
      // must skip.
      const medoid = event.infoArticle || null
      const medoidSource = medoid ? toSource(medoid) : null
      const medoidSources = medoidSource && medoidSource.body.length >= 500 ? [medoidSource] : []
      stories.push({
        title,
        description: event.summary?.eng || (medoid?.body || '').slice(0, 300),
        link: medoid?.url || '',
        pubDate: medoid?.dateTimePub || medoid?.dateTime || `${eventDate}T00:00:00Z`,
        category: mapCategory(eventCategories),
        // By `sourceName`, like every other story: this one named the outlet
        // itself, so a nature.com paper here was "Nature" whatever its journal.
        source: sourceName(medoid),
        suggestedSlug: slugify(title, eventDate),
        eventUri: uri,
        eventDate: eventDate,
        eventCoverage: totalArticles,
        socialScore: event.socialScore ?? null,
        sources: medoidSources,
        concepts: eventConcepts,
        location: eventLoc?.label?.eng || null,
        sentiment: null,
        origin: 'api',
      })
      continue
    }

    // Assemble diverse source panel
    const panel = assembleSourcePanel(matchedArticles, eventLoc)
    const primary = panel[0]
    const concepts = eventConcepts.length > 0 ? eventConcepts : extractConcepts(panel)
    const location = eventLoc?.label?.eng || primary.location?.label?.eng || null

    const storyTitle = panel.length > 1 ? bestTitle(panel, primary.title || title) : (primary.title || title)
    // Where an event's story departs from an article's own (`storyFrom`): the
    // event dates and files it when the article does not, and counts it.
    stories.push(storyFrom(primary, panel, {
      title: storyTitle,
      pubDate: primary.dateTimePub || primary.dateTime || `${eventDate}T00:00:00Z`,
      eventDate,
      category: mapCategory(primary.categories || eventCategories),
      suggestedSlug: slugify(storyTitle, primary.dateTimePub || eventDate),
      eventUri: uri,
      eventCoverage: totalArticles,
      socialScore: event.socialScore ?? null,
      concepts,
      location,
    }))
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

  // Stories about a charted series take their slots first: the standalone
  // pass below ranks by outlet, and would spend its 22 before reaching them.
  const storyFingerprints = new Set(stories.map(s => s.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)))
  const trackedGroups = pickTracked(dedupedArticles.filter(a => trackedUris.has(a.uri)), {
    usedEventUris,
    usedUrls: panelUris,
    maxAgeMs: MAX_FEED_AGE_MS,
    named: namedSeries(MOVERS),
  })
  let tracked = 0
  for (const group of trackedGroups) {
    const panel = group.length > 1 ? assembleSourcePanel(group, null) : group
    const primary = panel[0]
    const storyTitle = panel.length > 1 ? bestTitle(panel, primary.title) : primary.title
    const fp = storyTitle.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
    if (storyFingerprints.has(fp)) continue
    storyFingerprints.add(fp)
    for (const a of group) panelUris.add(a.url)
    stories.push(storyFrom(primary, panel, { title: storyTitle }))
    tracked++
  }
  console.error(`Tracked-series stories: ${tracked} (${trackedGroups.filter(g => g.length > 1).length} multi-source)`)
  if (MOVERS.length > 0) {
    console.error(`Unexplained movers asked for by name: ${MOVERS.map((m) => `${m.keyword ?? `${m.name} (not searched)`} ${m.pct > 0 ? '+' : ''}${m.pct}%`).join(', ')}`)
  }
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
  const sourceCount = {}

  let added = 0
  let untitled = 0
  for (const a of allCandidates) {
    if (added >= 22) break
    // A story of its own needs a headline. An article with none threw here,
    // after every token was spent and before the feed below was written.
    if (!hasHeadline(a)) { untitled++; continue }
    const fp = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
    if (storyFingerprints.has(fp)) continue
    const srcName = a.source?.title || '?'
    sourceCount[srcName] = (sourceCount[srcName] || 0) + 1
    if (sourceCount[srcName] > 3) continue  // max 3 standalone per source
    storyFingerprints.add(fp)

    // A panel of one. Three keys are as this story has always written them and
    // not as `storyFrom` would: its first five concepts by name and in the
    // API's order, its tone unrounded, and no divergence, which a lone article
    // cannot have. Its source now carries that tone, as a panel's sources do.
    stories.push(storyFrom(a, [a], {
      concepts: (a.concepts || []).slice(0, 5).map(c => c.label?.eng || '').filter(Boolean),
      sentiment: a.sentiment,
      sentimentDivergence: undefined,
    }))
    added++
  }
  if (untitled > 0) console.error(`Standalone: ${untitled} article(s) with no title left out`)

  const withSources = stories.filter(s => s.sources.length > 0).length
  const multiSource = stories.filter(s => s.sources.length > 1).length
  const output = {
    fetchedAt: new Date().toISOString(),
    events: events.length,
    tokens: tokenStats,
    stories,
  }

  writeJson(OUTPUT, output)
  console.error(`Wrote ${stories.length} stories: ${withSources} with articles (${multiSource} multi-source), ${stories.length - withSources} headline-only`)
  console.error(`NewsAPI tokens this cycle: ~${tokenStats.estTokens} (events=${tokenStats.eventCalls}×5 articles=${tokenStats.articleCalls}×1 perEvent=${tokenStats.perEventCalls}×1 other=${tokenStats.otherCalls})`)
  console.log(`${stories.length} stories from ${events.length} events`)

  // Archive slim snapshot for backtest/replay (keeps 30 days).
  // Strip article bodies to keep snapshots small; story-level metadata is enough for filter experiments.
  try {
    const SNAP_DIR = 'content/.feed-snapshots'
    mkdirSync(SNAP_DIR, { recursive: true })
    const slim = {
      fetchedAt: output.fetchedAt,
      events: output.events,
      tokens: output.tokens,
      stories: stories.map(s => ({
        title: s.title,
        pubDate: s.pubDate,
        eventDate: s.eventDate,
        socialScore: s.socialScore ?? null,
        category: s.category,
        source: s.source,
        suggestedSlug: s.suggestedSlug,
        eventUri: s.eventUri,
        eventCoverage: s.eventCoverage,
        sources: (s.sources || []).map(src => ({ name: src.name, url: src.url, country: src.country, importanceRank: src.importanceRank, image: src.image || null })),
        location: s.location,
        sentiment: s.sentiment,
        origin: s.origin,
      })),
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
    const snapPath = `${SNAP_DIR}/${stamp}.json`
    writeJson(snapPath, slim, { pretty: false })
    // Rotate: keep last 30 days only
    const cutoff = Date.now() - 30 * 86400000
    for (const f of readdirSync(SNAP_DIR)) {
      try {
        const p = `${SNAP_DIR}/${f}`
        if (statSync(p).mtimeMs < cutoff) unlinkSync(p)
      } catch {}
    }
  } catch (e) {
    console.error(`snapshot archive failed: ${e.message}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
