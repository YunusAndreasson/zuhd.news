// Which stories about a charted series reach the selector.
//
// The site draws ~40 series — oil, gas, gold, the currencies, US rates, ship
// traffic through the straits — and an article may carry one as its chart
// (`chart:`, see `indicator-offer.js`). For the first full day of that feature
// no article did, and the writer was not the reason: **the feed had nothing to
// chart.** Of 149 raw items in the 18:00 fetch on 2026-10-01, four had a
// headline about any of it, while the same hour's wires carried "Three oil
// tankers hit by projectiles in Hormuz strait", "10-year Treasury yields
// highest since 2002" and "Yen weakens as BOJ summary damps rate-hike bets".
//
// Nothing was filtering those out. The fetch asks for the 50 largest events
// and the newest 100 articles from each source list, and a wire's market desk
// is a few items among hundreds; they were simply never in the sample. So
// `fetch-news-api.js` asks for them by name (Q6, one token), and this picks
// the handful that take a guaranteed slot in the feed.
//
// Pure, so the choice can be tested and replayed. The selector still decides
// what runs: this only makes sure the candidates exist.

import { extractEntities } from './entity-registry.js'
import { isFreshFeedItem } from './feed-age.js'

/**
 * Headline words the query asks for — what a wire actually prints over a
 * story about a series the site charts.
 *
 * **Not derived from `entity-registry.js`, on purpose.** Its mentions resolve a
 * word inside a story someone already chose (`oil`, `rice`, `euro`, `rand`,
 * `pound`), and as a search over every headline of the day those return the
 * rice harvest and Euro 2028. These are the narrower phrases a headline about
 * the *series* uses. A series added there needs a line here only if its
 * stories should be sought out, not merely recognised.
 */
export const TRACKED_KEYWORDS = [
  // Energy
  'oil prices', 'crude', 'Brent', 'OPEC', 'natural gas',
  // The straits
  'Hormuz', 'Suez Canal', 'Red Sea', 'Bab el-Mandeb', 'Panama Canal',
  // Rates
  'Treasury yields', 'bond yields', 'Federal Reserve', 'Fed', 'ECB', 'US inflation',
  // Currencies the site charts that make headlines by name. No `rupee`: it is
  // two currencies, and the offer drops an ambiguous mention rather than guess.
  'yen', 'lira', 'naira', 'yuan', 'ruble',
  // Metals, grain, crypto
  'gold', 'copper', 'wheat', 'Bitcoin',
]

/** Formats the selector is told to skip anyway; they would only take a slot
 *  from a report. Wires label them at the head of the headline. */
const NOT_A_REPORT = /^\s*(commentary|column|view|opinion|analysis|explainer|breakingviews|live updates?|live|podcast|newsletter)\b\s*[:|—-]?/i

const outletOf = (a) => a?.source?.uri || a?.source?.title || ''
const timeOf = (a) => Date.parse(a?.dateTimePub || a?.dateTime || '') || 0

/**
 * The series a headline is about, or `other`. A strait outranks a commodity:
 * "three oil tankers hit in Hormuz" is the strait's story, and `oil` would
 * file it with every price report of the day.
 */
export const seriesOf = (title) => {
  const ids = extractEntities(title).resolved.map((e) => e.indicatorId).filter((id) => !/^(stocks|mkt):/.test(id))
  return ids.find((id) => id.startsWith('cp:')) ?? ids[0] ?? 'other'
}

/**
 * The tracked-series stories that get a slot, best first.
 *
 * Articles are grouped by the API's event cluster, one outlet once per group.
 * An article with no cluster stands alone, which is most of them: on the day
 * this was measured the Hormuz tanker attack was one Reuters item with no
 * event.
 *
 * **The slots are spread across series, and that is the rule that matters.**
 * Ranked on outlets alone, the first real run spent six of eight slots on the
 * Federal Reserve and bitcoin — two wires each on Kashkari, on Jefferson, on a
 * bank's price target — and none on Hormuz, where the day's one real event
 * was a single Reuters report. Two wires carrying the same speech is not
 * weight. So each series takes one slot before any takes a second
 * (`perSeries` at most); within a series, a story several outlets reported
 * comes before one a single outlet did, then the newest.
 *
 * `perOutlet` caps how many single-outlet stories one outlet may lead, so
 * Bloomberg's market desk (a third of the results) cannot take every slot. A
 * multi-outlet group is exempt: it is not that outlet's story.
 *
 * @param {any[]} articles  Results of the tracked-series query.
 * @param {object} [opts]
 * @param {Set<string>} [opts.usedEventUris]  Events already in the feed.
 * @param {Set<string>} [opts.usedUrls]       Articles already in a panel.
 * @param {number} [opts.slots]
 * @param {number} [opts.perSeries]
 * @param {number} [opts.perOutlet]
 * @param {number} [opts.maxAgeMs]  The feed's own age cut. A story whose newest
 *   report is past it is dropped by `merge-feeds.js`, and would spend a slot
 *   on nothing: the query reaches back a day, the pool twelve hours.
 * @param {number} [opts.now]
 * @returns {any[][]} Groups of articles, each one story.
 */
export function pickTracked(
  articles,
  {
    usedEventUris = new Set(),
    usedUrls = new Set(),
    slots = 8,
    perSeries = 2,
    perOutlet = 2,
    maxAgeMs = Infinity,
    now = Date.now(),
  } = {},
) {
  /** @type {Map<string, any[]>} */
  const groups = new Map()
  let solo = 0
  for (const a of articles || []) {
    if (!a?.title || NOT_A_REPORT.test(a.title)) continue
    if (usedUrls.has(a.url)) continue
    // An event already in the feed is already a story; its articles joined
    // that story's panel when the fetch indexed them.
    if (a.eventUri && usedEventUris.has(a.eventUri)) continue
    const key = a.eventUri || `solo:${solo++}`
    const group = groups.get(key) || []
    if (group.some((b) => outletOf(b) === outletOf(a))) continue
    group.push(a)
    groups.set(key, group)
  }

  const ranked = [...groups.values()]
    .map((g) => g.sort((a, b) => timeOf(b) - timeOf(a)))
    .filter((g) => maxAgeMs === Infinity || isFreshFeedItem(g[0].dateTimePub || g[0].dateTime, now, maxAgeMs))
    .sort((a, b) => b.length - a.length || timeOf(b[0]) - timeOf(a[0]))
    .map((group) => ({
      group,
      series: group.map((a) => seriesOf(a.title)).find((id) => id !== 'other') ?? 'other',
    }))

  const picked = []
  const taken = new Set()
  /** @type {Record<string, number>} */
  const perSeriesCount = {}
  /** @type {Record<string, number>} */
  const led = {}
  for (let round = 1; round <= perSeries && picked.length < slots; round++) {
    for (const entry of ranked) {
      if (picked.length >= slots) break
      if (taken.has(entry) || (perSeriesCount[entry.series] || 0) >= round) continue
      if (entry.group.length === 1) {
        const outlet = outletOf(entry.group[0])
        if ((led[outlet] || 0) >= perOutlet) continue
        led[outlet] = (led[outlet] || 0) + 1
      }
      taken.add(entry)
      perSeriesCount[entry.series] = (perSeriesCount[entry.series] || 0) + 1
      picked.push(entry.group)
    }
  }
  return picked
}
