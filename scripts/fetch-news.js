#!/usr/bin/env node
// RSS fetcher — niche sources not in the NewsAPI.ai index.
// These provide editorial taste: specialist tech, investigative, Muslim world.
// Output: /tmp/zuhd-feed-rss.json (merged with API feed by merge-feeds.js)
import { rmSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'
import { pathOf } from './lib/datasets.js'
import { feedPubDate } from './lib/feed-age.js'
import { rssItemImage } from './lib/feed-image.js'
import { fetchSourcePage, stripTags } from './lib/fetch-source-text.js'
import { bestStoryIds, bodiesFirst, documentHolds, hackerNewsStories, worthRetrying } from './lib/rss-feed.js'
import { slugify, zuhdCategory } from './lib/utils.js'
import { writeJson } from './lib/json-file.js'
import { fetchJson, fetchText } from './lib/http.js'

const OUT = pathOf('feedRss')

// Shared parser — reused across all sources (same options for RSS and Atom)
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
  // thethirdpole.net 403s since the Dialogue Earth rebrand — it had failed every
  // cycle in the log window (41/41) with the whole science feed silently lost.
  { name: 'Dialogue Earth', url: 'https://dialogue.earth/en/feed/',            format: 'rss2', defaultCategory: 'science' },
  { name: 'Global Voices', url: 'https://globalvoices.org/feed/',              format: 'rss2' },
]

const EXCLUDE_RE = /\b(opinion|features|gallery|photos|video|sport|entertainment|culture|food|travel|lifestyle|podcast)\b/i

// A publisher's clock a few seconds fast is not worth a line. A date hours
// ahead is a feed wrong about when its story ran, and an operator's to see:
// the line starts with the mark the run record keeps as a warning.
const AHEAD_WORTH_SAYING_MS = 60_000

// ── Helpers ─────────────────────────────────────────────────────────

const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&rsquo;': '\u2019', '&lsquo;': '\u2018', '&rdquo;': '\u201D', '&ldquo;': '\u201C', '&ndash;': '\u2013', '&mdash;': '\u2014', '&nbsp;': ' ' }

function decodeEntities(str) {
  return str.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec))
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return HTML_ENTITIES[`&${name};`] || m
  })
}

function extractText(val) {
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) return val['#text'] || val?.a?.['#text'] || ''
  return ''
}

function toArray(items) { return Array.isArray(items) ? items : [items] }
function parseRss2Items(feed) { return toArray(feed?.rss?.channel?.item || []) }
function parseAtomItems(feed) { return toArray((feed?.feed || feed)?.entry || []) }


// ── Fetch + Parse ───────────────────────────────────────────────────

function normalizeItem(raw, source) {
  const title = decodeEntities(extractText(raw.title).trim())
  if (!title) return null

  let link = raw.link || ''
  if (Array.isArray(link)) link = (link.find(l => l['@_rel'] === 'alternate') || link[0])?.['@_href'] || ''
  else if (typeof link === 'object') link = link['@_href'] || link['#text'] || ''

  const description = decodeEntities(stripTags(extractText(raw.description || raw.summary || raw['dc:description'] || ''))).trim()
  const pubDate = raw.pubDate || raw.published || raw.updated || raw['dc:date'] || raw.date || ''
  const category = source.defaultCategory || ''

  const rawContent = extractText(raw['content:encoded'] || raw.content || '')
  const contentText = rawContent ? decodeEntities(stripTags(rawContent)).trim() : ''

  return { title, description, link, pubDate, category, contentText: contentText || undefined, image: rssItemImage(raw), source: source.name }
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

// Three retries, 10 s apart: a feed gets about 70 s before it is given up.
// One was not enough when the resolver was slow (2026-10-08 22:03: 27 lookups
// queue on node's four lookup threads, and the retry's lookup waits behind the
// first round's). Measured that night, by the try on which each of the 26
// feeds answered: 8 on the first, 10 by the second, 13 by the third, all 26 by
// the fourth.
const FEED_RETRIES = 3

/**
 * A feed that gave nothing, and why: on the log, and on the result for
 * `sourceStats`.
 *
 * @param {{ name: string }} source
 * @param {string} why
 * @returns {FeedResult}
 */
function failedFeed(source, why) {
  console.error(`  ✗ ${source.name}: ${why}`)
  /** @type {FeedResult} */
  const empty = []
  empty._error = why
  return empty
}

/** @returns {Promise<FeedResult>} */
async function fetchSource(source, retries = FEED_RETRIES) {
  let xml
  try {
    xml = await fetchText(source.url, { timeoutMs: 10_000 })
  } catch (err) {
    // Only what a wait can change is asked again (`worthRetrying`): a 403 or a
    // 404 was retried like a timeout, three more times, ten seconds apart.
    if (retries > 0 && worthRetrying(err)) {
      await new Promise(r => setTimeout(r, 10000))
      return fetchSource(source, retries - 1)
    }
    return failedFeed(source, err.message)
  }
  // From here nothing is asked again: a document that does not parse now will
  // not parse in ten seconds. And an answer that holds no items says what it
  // does hold. It was an empty list with no error, which is what a feed with
  // nothing new looks like: a feed that changed format, or an address that now
  // serves a page, read as a quiet day.
  try {
    const feed = rssParser.parse(xml)

    const rawItems = source.format === 'atom' ? parseAtomItems(feed) : parseRss2Items(feed)
    if (rawItems.length === 0) return failedFeed(source, `no items as ${source.format}: the document holds ${documentHolds(feed)}`)

    const items = rawItems.map(raw => normalizeItem(raw, source)).filter(Boolean)
    if (items.length === 0) return failedFeed(source, `${rawItems.length} items and no title in any: the first holds ${documentHolds({ item: rawItems[0] })}`)
    return items.filter(isRelevant)
  } catch (err) {
    return failedFeed(source, `not a feed this can read (${err.message})`)
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

    // Through `fetchJson`, which reads the status: a 429 with a JSON body was
    // parsed, found to have no hits, and counted as a quiet day on Hacker News.
    const [algolia, bestAnswer] = await Promise.all([
      fetchJson(algoliaUrl, { timeoutMs: 8000 }),
      fetchJson(bestUrl, { timeoutMs: 8000 }).catch(() => null),
    ])
    if (!Array.isArray(algolia?.hits)) console.error(`  ✗ Hacker News: Algolia answered without a list of hits: it holds ${documentHolds(algolia)}`)

    // Fetch metadata for top 15 best stories (catches peaked-and-fallen stories)
    const bestItems = await Promise.all(
      bestStoryIds(bestAnswer).map(id =>
        fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeoutMs: 5000 }).catch(() => null)
      )
    )

    // Merge and deduplicate by HN story ID
    const all = hackerNewsStories(algolia, bestItems)

    // Filter and sort by comment count (discussion = newsworthy)
    const filtered = all
      .filter(s => !HN_SKIP_TITLE.test(s.title))
      .filter(s => {
        try { return !HN_SKIP_DOMAINS.test(new URL(s.url).hostname.replace(/^www\./, '')) } catch { return false }
      })
      .filter(s => isRelevant({ title: s.title, category: '' }))
      .sort((a, b) => b.comments - a.comments)

    console.error(`  HN Algolia: ${filtered.length} stories (${algolia?.hits?.length || 0} algolia + ${bestItems.filter(Boolean).length} best, after dedup/filter)`)

    // Fetch article bodies for top HN stories (fetch 5; only 3 used, buffer for failures).
    // The same fetch and the same bar enrich-selection uses: a page counts as
    // a body from 500 characters, above THIN_BODY, so a story fetched here is
    // never one the prefilter then marks thin. It was 200, with a second
    // extractor.
    const toFetch = filtered.slice(0, 5)
    const bodies = await Promise.all(toFetch.map(s => fetchSourcePage(s.url)))
    const withPages = filtered.map((s, i) => ({ ...s, bodyText: bodies[i]?.text || null, image: bodies[i]?.image || null }))
    const fetched = bodies.filter(b => b?.text).length
    console.error(`  HN body fetch: ${fetched}/${toFetch.length} articles had extractable content`)

    // The ones that gave a body first: that is what the two spare fetches are for.
    return bodiesFirst(withPages, toFetch.length).map(s => ({
      title: s.title,
      description: `${s.score} points, ${s.comments} comments on Hacker News`,
      link: s.url,
      // An item with no time is undated, like a feed item with none; an
      // invalid Date here threw and took every Hacker News story with it.
      pubDate: Number.isFinite(s.time) ? new Date(s.time * 1000).toISOString() : '',
      category: 'tech',
      contentText: s.bodyText || undefined,
      image: s.image || null,
      source: 'Hacker News',
    }))
  } catch (err) {
    return failedFeed({ name: 'Hacker News' }, err.message)
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // The last cycle's file goes first. Nothing else clears it, so a run that
  // died before it wrote left the feed of the cycle before for merge-feeds.js
  // to merge as this one's, and for the log to count (`RSS fetch: 77 stories`).
  rmSync(OUT, { force: true })
  console.error(`Fetching ${SOURCES.length} RSS niche sources + Hacker News...`)

  const [rssResults, hnItems] = await Promise.all([
    // An arrow, not `SOURCES.map(fetchSource)`: `map` passes the index as the
    // second argument, which is `retries`. The first feed got no retry and the
    // twenty-sixth got 25, each after a 10 s sleep, in a stage with no timeout.
    // That accident was also what carried the stage through a slow resolver,
    // which is why the count is now chosen (`FEED_RETRIES`).
    Promise.all(SOURCES.map((source) => fetchSource(source))),
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
  try { writeJson('/tmp/zuhd-feed-source-stats.json', { fetchedAt: new Date().toISOString(), sources: sourceStats }, { pretty: false }) } catch {}

  const allItems = [
    ...rssResults.flatMap((items, i) => items.slice(0, capFor(SOURCES[i].name))),
    ...hnItems.slice(0, capFor('Hacker News')),
  ]
  const hnUsed = Math.min(hnItems.length, capFor('Hacker News'))
  console.error(`Raw items: ${allItems.length} (${allItems.length - hnUsed} RSS + ${hnUsed} HN)`)

  // No dedup here. What is already published is the prefilter's to remove (by
  // link, slug, event and title), and a headline two feeds share is one story
  // in merge-feeds.js.
  const now = Date.now()
  const stories = []
  for (const item of allItems) {
    const category = item.category || zuhdCategory([], item.title, item.description)
    // The date as the feed prints it is the publisher's: RFC 822, any offset,
    // and on 2026-10-09 a day ahead. `feedPubDate` says what the story carries.
    const { pubDate, ahead } = feedPubDate(item.pubDate, now)
    if (ahead >= AHEAD_WORTH_SAYING_MS) {
      console.error(`⚠ RSS date ahead of the clock: ${item.source} dates "${item.title}" ${item.pubDate}, ${(ahead / 3_600_000).toFixed(1)} h from now. Taken as now.`)
    }

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
      sources: [{ name: item.source, url: item.link, country: SOURCE_COUNTRY[item.source] || null, body: (item.contentText || item.description || '').slice(0, 3000), image: item.image || null }],
      concepts: [],
      location: null,
      sentiment: null,
      origin: 'rss',
    })
  }

  const output = { fetchedAt: new Date().toISOString(), stories }
  writeJson(OUT, output)
  console.error(`Wrote ${stories.length} stories to ${OUT}`)
  console.log(`${stories.length} stories from ${SOURCES.length} sources`)
}

main().catch(e => { console.error(e); process.exit(1) })
