// What the data says happened that no story here has reported.
//
// The cycle fetches a disaster feed, a prediction-market deck and the
// currencies, and until this every one of them reached the reader only as a
// chart or a map layer drawn *after* the selector had chosen the day's
// stories. The selector never learned that any of it had moved. On 2026-10-16
// GDACS carried two Orange tropical cyclones, Champi bearing down on Guam and
// Simon off Mexico, and not one report of either was in three days of feeds;
// in the fortnight before, a contract on Saudi military action in Yemen went
// from 28% to 72% in a week, and one on Russia–Ukraine talks from 50% to 19%.
//
// This names those gaps where they can be closed, the way `company-gaps.js`
// does for shares: the selector is told (`scripts/data-gaps.js`, run by the
// selector step), and a named storm is asked for by name in the feed's
// tracked-series query (Q6 in `fetch-news-api.js`, the same token). The
// selector still decides: a move with no report in the feed is not a story.
//
// `dataGaps` is pure, so the choice is tested and replayed
// (`data-gaps.test.js`); `loadDataGaps` is its one reader of disk.

import { loadArticles } from './coverage-window.js'
import { pathOf } from './datasets.js'
import { closingSoon, daysMove, oddsScore, pointsMove, storyText, weekMove } from './indicator-offer.js'
import { readJson } from './json-file.js'
import { latestTrendsPath } from './trends-snapshot.js'

const DAY = 86400_000

/** An alert whose last update is older than this has passed. */
const HAZARD_ACTIVE_DAYS = 3
/** A story this recent that names the hazard has reported it. */
const HAZARD_STORY_DAYS = 7
/** Droughts hold an alert for months: a standing condition, never a hook. */
const HAZARD_SKIP_TYPES = new Set(['DR'])
const HAZARD_WORDS = {
  EQ: ['earthquake', 'quake', 'tremor'],
  FL: ['flood', 'floods', 'flooding'],
  VO: ['volcano', 'eruption', 'erupts'],
  WF: ['wildfire', 'wildfires', 'fire', 'fires'],
  TC: ['cyclone', 'typhoon', 'hurricane', 'storm'],
}
/**
 * What a headline calls a tropical cyclone where it is: a typhoon in the
 * north-west Pacific, a hurricane in the Atlantic and north-east Pacific, a
 * cyclone elsewhere. With "Storm", which also finds "Tropical Storm", two
 * phrases a storm: Q6 has never been run with more than 30 keywords, and
 * Event Registry publishes no ceiling.
 *
 * @param {{ lat?: number, lng?: number }} alert
 */
export const stormKind = ({ lat = 0, lng = 0 }) => {
  if (lat >= 0 && lng >= 100) return 'Typhoon'
  if (lat >= 0 && lng < -30) return 'Hurricane'
  return 'Cyclone'
}

/**
 * A week's swing, in points, that a contract's own news must explain. Over
 * 2026-10-01..16 one or two contracts a day reached it, each on a real event
 * (Brazil's first round, a Yemen strike, Romania's prime minister).
 */
export const ODDS_POINTS = 15
/** A story this recent about the contract's question has reported it. */
const ODDS_STORY_DAYS = 3

/**
 * A week's move against the dollar that asks for a reason. The real's slide
 * into Brazil's first round (−4.3%) passed it; the deck's ordinary week does not.
 */
export const FX_PCT = 3
const FX_STORY_DAYS = 7

/**
 * A move is news while it is new: at least this share of the week's move must
 * fall in the last `FRESH_DAYS`, in the same direction. Without it a single
 * jump repeats for a week: the real's rise after Brazil's first round was
 * named on seven consecutive days of the replay, and the US–Iran ceasefire
 * contract on five.
 */
const FRESH_SHARE = 0.5
const FRESH_DAYS = 3

/** Contract tags that say nothing of its subject. A contract with only these and no country is sport or a stock race. */
const ODDS_NO_SUBJECT = new Set(['prediction', 'polymarket', 'odds'])

/** Each line costs the selector's prompt; the hazards also cost Q6 keywords. */
export const MAX_GAPS = { hazards: 2, odds: 3, fx: 2 }

/**
 * @typedef {Object} DataGap
 * @property {'hazard' | 'odds' | 'fx'} kind
 * @property {string} id
 * @property {string} line  as the selector reads it
 * @property {string | null} name  the word a headline about it prints, for `namedSeries`; null when it has none
 * @property {string[]} keywords  what Q6 asks for; empty when the gap has no name a search can find
 */

/** `Tropical Cyclone CHAMPI-26` → `Champi`; null for an event with no name of its own. */
export const stormName = (alert) => {
  const m = /^Tropical Cyclone ([A-Z][A-Z-]*?)-\d+$/.exec(String(alert?.name ?? ''))
  if (!m) return null
  return m[1].charAt(0) + m[1].slice(1).toLowerCase()
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const wordRe = (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu')

/** What a story says it is about: its headline, lead and concepts, never its whole body. */
const aboutText = (a) => [storyText(a), a.lead].filter(Boolean).join('\n')

const within = (articles, days, now) => {
  const since = now - days * DAY
  return (articles || []).filter((a) => {
    const t = Date.parse(a?.date ?? '')
    return Number.isFinite(t) && t >= since
  })
}

/**
 * GDACS Orange and Red alerts still live that no story of the week names.
 *
 * A storm is named by its name; anything else by its country and its kind
 * ("Tanzania" and "earthquake" in one story), which is as close as a story
 * that never names the event can come.
 *
 * @param {any[]} alerts  `.gdacs.json`'s `alerts`
 * @param {any[]} articles
 * @param {number} now
 * @returns {DataGap[]}
 */
export function hazardGaps(alerts, articles, now) {
  const stories = within(articles, HAZARD_STORY_DAYS, now).map(aboutText)
  const out = []
  for (const a of alerts || []) {
    if (a?.alertlevel !== 'Orange' && a?.alertlevel !== 'Red') continue
    if (HAZARD_SKIP_TYPES.has(a.eventtype)) continue
    const last = Date.parse(a.toDate || a.modifiedDate || '')
    if (!Number.isFinite(last) || now - last > HAZARD_ACTIVE_DAYS * DAY) continue
    const name = a.eventtype === 'TC' ? stormName(a) : null
    const words = HAZARD_WORDS[a.eventtype] ?? []
    const where = a.country || a.affectedCountries?.[0] || ''
    const covered = name
      ? stories.some((s) => wordRe(name).test(s))
      : Boolean(where) && stories.some((s) => wordRe(where).test(s) && words.some((w) => wordRe(w).test(s)))
    if (covered) continue
    const what = name ? `Tropical cyclone ${name}` : a.name
    const place = name && where ? ` (${where})` : ''
    // A storm's text names the class it reached ("Tropical Storm (maximum wind
    // speed of 250 km/h)"); its value is the wind, which says it plainly.
    const severity =
      a.eventtype === 'TC' && Number.isFinite(a.severityValue) && a.severityUnit === 'km/h'
        ? `; winds up to ${Math.round(a.severityValue)} km/h`
        : a.severityText
          ? `; ${a.severityText}`
          : ''
    out.push({
      kind: /** @type {const} */ ('hazard'),
      id: `gdacs:${a.eventid}`,
      line: `- ${what}${place}: GDACS ${a.alertlevel} alert, live since ${fmtDay(a.fromDate)}${severity}`,
      name,
      keywords: name ? [`${stormKind(a)} ${name}`, `Storm ${name}`] : [],
      red: a.alertlevel === 'Red',
      from: Date.parse(a.fromDate) || 0,
    })
  }
  return out
    .sort((x, y) => Number(y.red) - Number(x.red) || y.from - x.from)
    .slice(0, MAX_GAPS.hazards)
    .map(({ red, from, ...gap }) => gap)
}

/**
 * Contracts that swung `ODDS_POINTS` in a week with no story of three days
 * about their question, by the offer's own test (`oddsScore`).
 *
 * @param {any[]} indicators  the trends snapshot's
 * @param {any[]} articles
 * @param {number} now
 * @returns {DataGap[]}
 */
export function oddsGaps(indicators, articles, now) {
  const stories = within(articles, ODDS_STORY_DAYS, now).map((a) => {
    const text = aboutText(a)
    return { text, lower: text.toLowerCase() }
  })
  const out = []
  for (const ind of indicators || []) {
    if (ind?.source !== 'polymarket' || closingSoon(ind, now)) continue
    const hasSubject = (ind.topicTags || []).some((t) => !ODDS_NO_SUBJECT.has(t)) || (ind.countryTags || []).length > 0
    if (!hasSubject) continue
    const move = pointsMove(ind, 7)
    if (!move || Math.abs(move.points) < ODDS_POINTS) continue
    const fresh = pointsMove(ind, FRESH_DAYS)
    if (!fresh || fresh.points * Math.sign(move.points) < FRESH_SHARE * Math.abs(move.points)) continue
    if (stories.some((s) => oddsScore(ind, s.text, s.lower) > 0)) continue
    const level = Math.round(ind.values.at(-1))
    out.push({
      kind: /** @type {const} */ ('odds'),
      id: ind.id,
      line: `- Polymarket, "${ind.label}": ${level - move.points}% → ${level}% in a week`,
      name: null,
      keywords: [],
      points: Math.abs(move.points),
    })
  }
  return out
    .sort((x, y) => y.points - x.points)
    .slice(0, MAX_GAPS.odds)
    .map(({ points, ...gap }) => gap)
}

/**
 * Currencies that moved `FX_PCT` against the dollar in a week with no story of
 * the week about the currency: one the entity stage tied to it, or one that
 * names it in full ("Brazilian real": the bare word is an adjective).
 *
 * The rows are quoted in units per dollar, so a rising row is a falling
 * currency; the line gives the currency's own move.
 *
 * @param {any[]} indicators
 * @param {any[]} articles
 * @param {number} now
 * @returns {DataGap[]}
 */
export function fxGaps(indicators, articles, now) {
  const recent = within(articles, FX_STORY_DAYS, now)
  const out = []
  for (const ind of indicators || []) {
    if (ind?.source !== 'oer') continue
    const move = weekMove(ind)
    if (!move) continue
    const own = Number(((1 / (1 + move.pct / 100) - 1) * 100).toFixed(1))
    if (Math.abs(own) < FX_PCT) continue
    const fresh = daysMove(ind, FRESH_DAYS)
    if (!fresh || fresh.pct * Math.sign(move.pct) < FRESH_SHARE * Math.abs(move.pct)) continue
    const label = String(ind.label || '')
    const covered = recent.some(
      (a) => (a.entityIds || []).includes(ind.id) || (label && wordRe(label).test(aboutText(a))),
    )
    if (covered) continue
    out.push({
      kind: /** @type {const} */ ('fx'),
      id: ind.id,
      line: `- ${label}: ${own > 0 ? 'up' : 'down'} ${Math.abs(own)}% against the dollar in a week`,
      name: null,
      keywords: [],
      size: Math.abs(own),
    })
  }
  return out
    .sort((x, y) => y.size - x.size)
    .slice(0, MAX_GAPS.fx)
    .map(({ size, ...gap }) => gap)
}

/**
 * @param {{ alerts?: any[], indicators?: any[], articles?: any[], now?: number }} input
 * @returns {DataGap[]}  hazards first, then contracts, then currencies
 */
export function dataGaps({ alerts = [], indicators = [], articles = [], now = Date.now() }) {
  return [...hazardGaps(alerts, articles, now), ...oddsGaps(indicators, articles, now), ...fxGaps(indicators, articles, now)]
}

/**
 * The gaps as of now, from the last cycle's snapshots and the site's own
 * stories, or why there is nothing to read them from. Either snapshot may be
 * missing; the other's gaps still stand.
 *
 * @param {{ now?: number, gdacsPath?: string, trendsPath?: string | null, articles?: any[] }} [opts]
 * @returns {{ gaps: DataGap[], skipped: string[] }}
 */
export function loadDataGaps({ now = Date.now(), gdacsPath = pathOf('gdacs'), trendsPath = latestTrendsPath(), articles } = {}) {
  const skipped = []
  const gdacs = readJson(gdacsPath)
  if (!Array.isArray(gdacs?.alerts)) skipped.push(`no GDACS alerts at ${gdacsPath}`)
  const trends = trendsPath ? readJson(trendsPath) : null
  if (!Array.isArray(trends?.indicators)) skipped.push(trendsPath ? `no trends snapshot at ${trendsPath}` : 'no trends snapshot')
  const gaps = dataGaps({
    alerts: gdacs?.alerts ?? [],
    indicators: trends?.indicators ?? [],
    articles: articles ?? loadArticles(now - HAZARD_STORY_DAYS * DAY),
    now,
  })
  return { gaps, skipped }
}

/** For the feed: never throws, since a fault here must not cost the cycle its API stories. */
export function readDataGaps(opts) {
  try {
    return loadDataGaps(opts).gaps
  } catch {
    return []
  }
}
