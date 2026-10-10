// The chart desk: which series, if any, is drawn under each story.
//
// The writer chose it for ten days (2026-10-01 to 10-10), from rows matched to
// the feed's title and the selector's angle before a word was written. Read
// back over 403 articles, the choice was mostly the match's:
//
// - 41 of 55 charts were three series, and 24 one strait. Traffic through it
//   was the story in 8 of those; in 14 it was the region's backdrop, under an
//   OPEC+ quota, a dinar devaluation, a power cut in Karachi.
// - No story about a company carried its share price. Which company a story is
//   about is read after it is written (`subjects:`), a stage too late.
// - 46 contracts were offered and 2 charted, one under an obituary, while the
//   election a contract priced was called without it.
//
// So the choice is made here, after the entity stage, in one call that reads
// the whole batch: the articles as written, every series the app can draw for
// each, the day's contracts, and how often each series has already run. The
// model answers one question a story; the list it chooses from and the limit
// on repeats are code.
//
// Pure. `pick-charts.js` is the reading and writing around it.

import { CC_TO_TOPOJSON_NAME } from '../../shared/countries/iso.ts'
import { visibleText } from './article.js'
import { companyMatcher, isAboutCompany, storyFacts } from './companies.js'
import { canonicalIndicatorId } from './entity-registry.js'
import { ageDays, closingSoon, exchangeRow, oddsRow, seriesRow, sig4, straitRow, weekMove } from './indicator-offer.js'

/**
 * Trends sources the app draws no story chart for (`NOT_LISTED`,
 * mobile/lib/instrument-catalog.ts): pageviews, a strait's vessel classes,
 * and a company outside the twenty, which has no paragraph to open onto.
 * Contracts are read apart (`contractRows`).
 */
const NOT_DRAWN = new Set(['wikipedia', 'portwatch', 'stocks', 'polymarket'])

/** A company quote older than this is off the app's strip, and so has no card
 *  for a story to open (`exchangeIsStale`, mobile/lib/markets.ts). */
const QUOTE_DAYS = 4

/**
 * Sources whose series say something about one country's money: its currency
 * and its central bank's rate. The only series joined by country, and only
 * for a story filed under the economy. A country's name is on a third of all
 * stories; its exchange rate is news in few of them.
 */
const COUNTRY_SOURCES = new Set(['oer', 'bis'])
const COUNTRY_IDS = new Set(['fed-funds', 'us-cpi', 'ez-cpi'])
const MAX_COUNTRIES = 3

/** The most rows one story is shown. The order below puts what the story was
 *  read as being about first, so the cut falls on the country join. */
const MAX_CANDIDATES = 8

/** How a series may repeat inside `REPEAT_HOURS`: under a story whose subject
 *  it is, up to a ceiling; under any other, once. */
export const REPEAT_HOURS = 24
export const SUBJECT_DAY_CAP = 3
export const OTHER_DAY_CAP = 1

export const ROLES = /** @type {const} */ (['subject', 'cause', 'decides'])

/**
 * @typedef {object} DeskSources
 * @property {any} [trends]         the trends snapshot
 * @property {any[]} [chokepoints]  `.chokepoints.json`'s `chokepoints`
 * @property {any[]} [markets]      `.markets.json`'s `exchanges`
 * @property {any[]} [companies]    `.companies.json`'s `companies`
 * @property {Record<string, any>} [dispatch] `.indicator-dispatch.json`'s `items`
 * @property {number} [now]
 */

/**
 * @typedef {object} Candidate
 * @property {string} id
 * @property {string} kind  series, strait, exchange, company, odds
 * @property {string} label
 * @property {string} reading  the level, its move and its date, as one phrase
 * @property {'about' | 'named' | 'country' | 'contract'} via how it came to be on this story's list
 */

const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`

/** A row's numbers as the phrase the model reads: enough to tell a line that
 *  moved from one that did not, and how old it is. */
function reading(row) {
  const parts = [`${row.level}${row.unit ? ` ${row.unit}` : ''}`]
  if (Number.isFinite(row.vsNormalPct)) parts.push(`${signed(row.vsNormalPct)}% against its normal`)
  const move = row.recent
  if (move && Number.isFinite(move.pct)) parts.push(`${signed(move.pct)}% over ${move.over}`)
  if (move && Number.isFinite(move.points)) parts.push(`${signed(move.points)} points over ${move.over}`)
  if (row.asOf) parts.push(`as of ${row.asOf}`)
  return parts.join(', ')
}

/**
 * A tracked company's share as a row, or null when the app has no card for it
 * today.
 *
 * @param {any} c  a `.companies.json` record
 * @param {number} now
 */
function companyRow(c, now) {
  const values = (c?.series?.values || []).filter(Number.isFinite)
  if (!c?.id || values.length < 2 || c.stale) return null
  const age = ageDays(c.asOf, 'daily', now)
  if (age == null || age > QUOTE_DAYS) return null
  return {
    id: `co:${c.id}`,
    kind: 'company',
    label: `${c.name} share price`,
    level: sig4(c.level),
    unit: `${c.currencyName || c.currency} a share`,
    recent: weekMove({ values: c.series.values, periods: c.series.periods, asOf: c.asOf }),
    asOf: c.asOf,
  }
}

/** The country codes a body links, in the order it links them. */
const countriesOf = (body) => [...new Set([...String(body).matchAll(/\]\(country:([A-Z]{2})\)/g)].map((m) => m[1]))]

/**
 * Every series the app can draw under this story: what the entity stage read
 * the story as being about, what it names, and, for an economy story, the
 * currency and policy rate of the countries it links.
 *
 * The app's own gate decides what is on the list (`instrumentCardFor`,
 * mobile/lib/instrument-catalog.ts): a series needs the desk's paragraph, a
 * strait a traffic history, a company a quote from this week. An id that
 * fails it draws nothing, and a choice spent on it is a story without a chart.
 *
 * @param {{ title?: string, body: string, meta: any }} article
 * @param {DeskSources} sources
 * @returns {Candidate[]}
 */
export function candidatesFor(article, { trends, chokepoints = [], markets = [], companies = [], dispatch = {}, now = Date.now() } = {}) {
  const meta = article.meta || {}
  const indicators = (trends?.indicators || []).filter((i) => i?.id)
  const byId = new Map(indicators.map((i) => [i.id, i]))
  const hasStanding = (id) => Boolean(dispatch?.[id]?.standing)

  /** @type {Candidate[]} */
  const out = []
  /** @param {any} row @param {Candidate['via']} via */
  const add = (row, via) => {
    if (!row || row === 'stale' || out.some((c) => c.id === row.id)) return
    out.push({ id: row.id, kind: row.kind, label: row.label, reading: reading(row), via })
  }
  /** @param {string} raw @param {Candidate['via']} via */
  const addId = (raw, via) => {
    const id = canonicalIndicatorId(String(raw || ''))
    if (id.startsWith('cp:')) return add(straitRow(chokepoints.find((c) => `cp:${c.id}` === id), { now }), via)
    if (id.startsWith('mkt:')) return hasStanding(id) && add(exchangeRow(markets.find((m) => `mkt:${m.id}` === id), { now }), via)
    const ind = byId.get(id)
    if (!ind || NOT_DRAWN.has(ind.source) || !hasStanding(id)) return
    add(seriesRow(ind, { now, asOf: trends?.asOf }), via)
  }

  // What the story is about, as the entity stage read it: its exchanges and
  // straits, and the tracked companies among its subjects.
  for (const id of Array.isArray(meta.venues) ? meta.venues : []) addId(id, 'about')
  const facts = storyFacts({ title: article.title ?? meta.title, concepts: meta.concepts, entities: meta.entities, subjects: meta.subjects })
  for (const c of companies) {
    if (isAboutCompany(facts, companyMatcher(c))) add(companyRow(c, now), 'about')
  }

  // What it names.
  for (const e of Array.isArray(meta.entities) ? meta.entities : []) addId(e?.indicatorId, 'named')

  // The money of the countries it links.
  if (meta.category === 'economy') {
    for (const cc of countriesOf(article.body).slice(0, MAX_COUNTRIES)) {
      for (const ind of indicators) {
        if (!(ind.countryTags || []).includes(cc)) continue
        if (COUNTRY_SOURCES.has(ind.source) || COUNTRY_IDS.has(ind.id)) addId(ind.id, 'country')
      }
    }
  }

  return out.slice(0, MAX_CANDIDATES)
}

/**
 * The day's contracts, offered to every story: a short list (twenty at most),
 * and whether a question is a story's own next step is exactly what words
 * could not match. One in its last days is no forecast of what comes next
 * (`closingSoon`).
 *
 * @param {DeskSources} sources
 * @returns {Candidate[]}
 */
export function contractRows({ trends, dispatch = {}, now = Date.now() } = {}) {
  /** @type {Candidate[]} */
  const out = []
  for (const ind of trends?.indicators || []) {
    if (ind?.source !== 'polymarket' || !dispatch?.[ind.id]?.standing || closingSoon(ind, now)) continue
    const row = oddsRow(ind, { now })
    if (!row || row === 'stale') continue
    const closes = typeof ind.endDate === 'string' ? `, closes ${ind.endDate.slice(0, 10)}` : ''
    out.push({ id: row.id, kind: 'odds', label: row.question, reading: `${reading(row)}${closes}`, via: 'contract' })
  }
  return out
}

const countryName = (cc) => CC_TO_TOPOJSON_NAME[cc] || cc

/**
 * @param {{ slug: string, title?: string, body: string, meta: any }[]} articles the batch, as written
 * @param {Map<string, Candidate[]>} candidates per slug (`candidatesFor`)
 * @param {Candidate[]} contracts `contractRows`
 * @param {Record<string, number>} [recent] how many stories of the last day carry each id
 */
export function chartDeskPrompt(articles, candidates, contracts, recent = {}) {
  const ran = (id) => (recent[id] > 0 ? ` — already under ${recent[id]} ${recent[id] === 1 ? 'story' : 'stories'} today` : '')
  const line = (c) => `    ${c.id} — ${c.label}: ${c.reading}${ran(c.id)}`
  const blocks = articles
    .map((a) => {
      const rows = candidates.get(a.slug) || []
      const places = countriesOf(a.body).map(countryName).join(', ')
      return `---
slug: ${a.slug}
category: ${a.meta?.category || ''}
title: ${a.title || a.meta?.title || ''}${places ? `\nplaces: ${places}` : ''}
body:
"""
${visibleText(a.body).slice(0, 1500).replace(/"""/g, "'''")}
"""
series:
${rows.length ? rows.map(line).join('\n') : '    (none)'}`
    })
    .join('\n')

  return `You are the data desk of a news site. Under each story the app can draw ONE small line chart: a price, a rate, ships through a strait, a company's shares, or a prediction market's odds. For each story below, say which line belongs under it, or that none does. Most stories get none: a court ruling, a strike on a town, an appointment, a summit, a study, a death. A chart that is not the story's own is worse than no chart.

A line belongs under a story in exactly three cases. Name the case as "role".

"subject": the line IS the story. The story reports this price, rate, index, currency or traffic itself, or it is news for this company's shares: its results, a deal, a ruling or ban against it, a product that failed, a contract it won.
  - A story of ships attacked, seized, stopped or let through a strait is about that strait's traffic.
  - A company that is only the place something happened, a supplier, a customer or a comparison is not the subject. Nor is one whose product is the setting of a political story (a government blocking a service, a regulator's review of a whole industry): the news has to be the company's own.

"cause": the story says, in its own words, that a fresh move in this line is why the thing happened. Oil jumping this week is why an airline cut flights; a currency sliding is why a central bank acted.
  - A condition that has held for weeks is the backdrop of every story in its region and the cause of none. A strait shut since last month is not the chart under each fuel shortage, budget, power cut or diplomatic visit that mentions it.
  - When a story is about a price that moved BECAUSE of something, the price is the subject and is the chart, not the thing that moved it.

"decides": the line is what is about to be decided.
  - A central bank's rate under a story about its decision, or the next one.
  - A CONTRACT (the list at the end; any story may take one) when the story leaves a question open and the contract asks that question: who wins the election the story is about, whether the truce it reports holds, whether the strike, deal or rate move it describes happens by the date. The test: if the contract settled tomorrow, would that be this story's next headline? When it would, take it, even if the story is politics and has no other line on its list.
  - A contract that shares only a person, a country or a topic with the story fails that test. A leader's "next prime minister?" is not the chart for each act of his government; an election contract is not the chart for that country's diplomacy, courts or protests. Never for a story about something already settled.

What is never a chart:
  - A line that only shares a country, a company or a sector with the story. A country's currency is not the chart for its court cases; a company's shares are not the chart for an industry survey that names it.
  - A line the story mentions in passing, or as one of several pressures.
  - A general mood. "Markets", "energy" or "the economy" being in the story is not a reason.

Where a case does hold, set the chart: the reader's next question after "the central bank raised rates to defend the currency" is where the currency stands, and after "the company lost the contract" what its shares did. A story about a central bank, a currency, a commodity's price, an index or a listed company's own news usually has its line on the list. Hesitate over the stories that are not about money or a market at all.

Choose only from that story's own "series" list and the CONTRACTS list. Use the id exactly as written.

You are reading the whole batch at once, as an editor planning a page. A reader swipes from one story to the next, and the same chart under three of them reads as one chart with three captions. Give a line to the story whose subject it is. Where two stories of the batch would carry the same line and it is the subject of only one, the other takes its second-best line or none. A line marked "already under N stories today" needs to be the subject to run again.

Return ONLY a JSON object keyed by slug, one entry for every story. Each is {"chart": "<id>", "role": "subject" | "cause" | "decides"} or {"chart": null}.

Example output (copy the shape, never the ids):
{
  "2026-01-05-tolls-on-the-kiel-canal-double": {"chart": "cp:kiel", "role": "subject"},
  "2026-01-05-acme-recalls-every-battery-it-sold": {"chart": "co:acme", "role": "subject"},
  "2026-01-05-ruritania-votes-on-sunday": {"chart": "poly-who-wins-ruritania-2026", "role": "decides"},
  "2026-01-05-court-jails-former-minister": {"chart": null}
}

Stories:
${blocks}
---

CONTRACTS (prices from a prediction market; a question, the price of Yes, its move):
${contracts.length ? contracts.map(line).join('\n') : '    (none today)'}

Return ONLY the JSON object. No commentary, no markdown fences.`
}

/**
 * A story's answer: the series and why it is the story's, or `chart: null`
 * for a story read and given none.
 *
 * @typedef {{ chart: string | null, role?: typeof ROLES[number] }} Pick
 */

/**
 * What is kept of the answer: per slug it answered for, the id it chose when
 * that id was on the story's own list or among the contracts and the role is
 * one of the three, and no chart otherwise.
 *
 * A slug it did not answer for is not in the map: "read, and nothing belongs"
 * is a different answer from "never read", and only the first takes a chart
 * off an article.
 *
 * @param {unknown} obj  the parsed JSON object
 * @param {Map<string, Candidate[]>} candidates
 * @param {Candidate[]} contracts
 * @returns {Map<string, Pick>}
 */
export function parseChartDesk(obj, candidates, contracts) {
  /** @type {Map<string, Pick>} */
  const out = new Map()
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  const open = new Set(contracts.map((c) => c.id))
  for (const [slug, own] of candidates) {
    const value = /** @type {any} */ (obj)[slug]
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const id = typeof value.chart === 'string' ? canonicalIndicatorId(value.chart.trim()) : null
    const listed = id != null && (own.some((c) => c.id === id) || open.has(id))
    out.set(slug, listed && ROLES.includes(value.role) ? { chart: /** @type {string} */ (id), role: value.role } : { chart: null })
  }
  return out
}

/**
 * How many stories of the last day carry each chart.
 *
 * @param {{ chart?: unknown, at: number }[]} published every recent article outside the batch: its `chart:` and when it was published
 * @param {number} now
 * @returns {Record<string, number>}
 */
export function recentCharts(published, now) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const a of published) {
    if (typeof a.chart !== 'string' || !(now - a.at < REPEAT_HOURS * 3_600_000) || a.at > now) continue
    const id = canonicalIndicatorId(a.chart.trim())
    out[id] = (out[id] || 0) + 1
  }
  return out
}

/**
 * The limit on repeats, which is not the model's to keep: told to spread a
 * chart, a model spreads it within the page it can see, and the last ten days
 * ran one strait's line under five stories in a day across five cycles.
 *
 * In batch order, a pick stands while its series is under fewer than
 * `OTHER_DAY_CAP` stories of the last day, or under fewer than
 * `SUBJECT_DAY_CAP` when the story's subject is that series.
 *
 * @param {string[]} order the batch's slugs, in the order they were written
 * @param {Map<string, Pick>} picks
 * @param {Record<string, number>} recent `recentCharts`
 * @returns {{ kept: Map<string, Pick>, capped: { slug: string, id: string, role: string, under: number }[] }}
 */
export function applyCaps(order, picks, recent) {
  const counts = { ...recent }
  /** @type {Map<string, Pick>} */
  const kept = new Map()
  const capped = []
  // Subjects first: the story a line is about must not lose it to a story
  // that only cites it and happened to be written earlier.
  const isSubject = (/** @type {string} */ slug) => {
    const pick = picks.get(slug)
    return pick != null && pick.chart != null && pick.role === 'subject'
  }
  const ranked = [...order].sort((a, b) => Number(isSubject(b)) - Number(isSubject(a)))
  for (const slug of ranked) {
    const pick = picks.get(slug)
    if (!pick) continue
    if (pick.chart == null) {
      kept.set(slug, pick)
      continue
    }
    const under = counts[pick.chart] || 0
    if (under >= (pick.role === 'subject' ? SUBJECT_DAY_CAP : OTHER_DAY_CAP)) {
      capped.push({ slug, id: pick.chart, role: pick.role, under })
      kept.set(slug, { chart: null })
      continue
    }
    counts[pick.chart] = under + 1
    kept.set(slug, pick)
  }
  return { kept, capped }
}
