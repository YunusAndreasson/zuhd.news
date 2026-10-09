// The largest companies whose share moved sharply this week with no story on
// the site to say why.
//
// The app charts twenty shares, and the daily narration explains a move only
// from stories about the company itself (`isAboutCompany`): a mention, a
// supplier or the whole market is not a reason. So a share the site has not
// covered opens onto what the company is, however far it moved. On
// 2026-10-04 that was ASML, up 8.6% in a week, last reported here in July.
//
// Nothing downstream can fix that: the writer has no story and the narration
// has nothing true to cite. This names the gap where it can be closed. The
// feed asks for the company by name (`fetch-news-api.js`, Q6) so a report of
// what moved it is in the pool, and the selector is told the share moved
// (`scripts/company-gaps.js`, run by the selector step). The selector still
// decides: a move with no cause in the feed is not a story.
//
// `unexplainedMovers` is pure, so the choice is tested and replayed
// (`company-gaps.test.js`); `loadUnexplainedMovers` is its one reader of disk.

import { companyMatcher, isAboutCompany, storyFacts } from './companies.js'
import { loadArticles } from './coverage-window.js'
import { pathOf } from './datasets.js'
import { weekMove } from './indicator-offer.js'
import { readJson } from './json-file.js'

/**
 * A week's move, in percent, that asks for a reason. Measured on the twenty
 * shares' quarter of closes (2026-10-04): the median five-session move was
 * 2.8%, and one company-week in five reached 7%.
 */
export const MOVER_PCT = 7

/** How far back a story about the company still explains its share: the
 *  narration's own window (`WINDOW_DAYS` in `narrate-indicators.js`). */
export const MOVER_STORY_DAYS = 14

/** At most this many, largest move first: each costs the feed a keyword and
 *  the selector a line. */
export const MAX_MOVERS = 3

/** A quote older than this is last week's move, not this one's. */
const MAX_QUOTE_AGE_DAYS = 4

const DAY = 86400_000

/**
 * @typedef {Object} QuotedCompany  What this reads of a `CompanyRecord`.
 * @property {string} id
 * @property {string} name
 * @property {string} [about]
 * @property {string} asOf
 * @property {{ values: number[], periods: string[] }} series
 * @property {string[]} [tickers]
 * @property {string[]} [topicTags]
 * @property {string} [commonName]
 * @property {boolean} [stale]
 */

/**
 * @param {QuotedCompany[]} companies
 *   `content/.companies.json`'s records.
 * @param {{ title?: string, date?: string, concepts?: any[], entities?: any, subjects?: any }[]} articles
 *   The site's stories, as `loadArticles` reads them. Those older than
 *   `MOVER_STORY_DAYS` are ignored.
 * @param {{ now?: number }} [opts]
 * @returns {{ id: string, name: string, about: string, pct: number, keyword: string | null }[]}
 *   `keyword` is what a headline about the company prints (`headlineName`),
 *   or null where the name is ordinary English (`commonName`): a title search
 *   for `Amazon` returns the forest.
 */
export function unexplainedMovers(companies, articles, { now = Date.now() } = {}) {
  const since = now - MOVER_STORY_DAYS * DAY
  const facts = []
  for (const a of articles || []) {
    const t = Date.parse(a?.date ?? '')
    if (Number.isFinite(t) && t >= since) facts.push(storyFacts(a))
  }
  const movers = []
  for (const co of companies || []) {
    if (!co?.id || co.stale) continue
    const asOf = Date.parse(`${co.asOf}T00:00:00Z`)
    if (!Number.isFinite(asOf) || now - asOf > MAX_QUOTE_AGE_DAYS * DAY) continue
    const move = weekMove({ values: co.series?.values, periods: co.series?.periods, asOf: co.asOf })
    if (!move || Math.abs(move.pct) < MOVER_PCT) continue
    const matcher = companyMatcher({
      tickers: co.tickers,
      topicTags: co.topicTags,
      commonName: co.commonName,
    })
    if (facts.some((f) => isAboutCompany(f, matcher))) continue
    movers.push({
      id: co.id,
      name: co.name,
      about: co.about || '',
      pct: move.pct,
      keyword: co.commonName ? null : headlineName(co),
    })
  }
  return movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, MAX_MOVERS)
}

/**
 * The company as a headline names it: `Samsung`, not `Samsung Electronics`;
 * `Aramco`, `JPMorgan`, `Berkshire`. The shortest of its tags that its name
 * contains, in the name's own case, and the whole name where none is.
 *
 * @param {{ name: string, topicTags?: string[] }} co
 */
export function headlineName({ name, topicTags = [] }) {
  const lower = name.toLowerCase()
  let best = null
  for (const tag of topicTags) {
    const at = lower.indexOf(String(tag).toLowerCase())
    if (at < 0 || !tag) continue
    if (!best || tag.length < best.length) best = { at, length: tag.length }
  }
  return best ? name.slice(best.at, best.at + best.length) : name
}

/**
 * The movers as of now, from the last cycle's quotes and the site's own
 * stories, or why there is nothing to read them from.
 *
 * `skipped` tells "no share moved" from "nothing was read", which an empty
 * list alone cannot: a snapshot that has gone missing or lost its `companies`
 * would otherwise be a quiet week for as long as it lasted. A fault past that
 * (a row this cannot read) throws, for the caller to decide what it costs.
 *
 * @param {{ now?: number, companiesPath?: string, articles?: Parameters<typeof unexplainedMovers>[1] }} [opts]
 *   `articles` defaults to the site's stories of the last `MOVER_STORY_DAYS`.
 * @returns {{ movers: ReturnType<typeof unexplainedMovers>, skipped?: string }}
 */
export function loadUnexplainedMovers({ now = Date.now(), companiesPath = pathOf('companies'), articles } = {}) {
  const snapshot = readJson(companiesPath)
  if (!snapshot) return { movers: [], skipped: `no companies snapshot at ${companiesPath}` }
  if (!Array.isArray(snapshot.companies)) {
    return { movers: [], skipped: `the companies snapshot has no list (keys: ${Object.keys(snapshot).join(', ') || 'none'})` }
  }
  return { movers: unexplainedMovers(snapshot.companies, articles ?? loadArticles(now - MOVER_STORY_DAYS * DAY), { now }) }
}

/**
 * The same, for the feed (`fetch-news-api.js`, Q6), which must run whatever
 * state the snapshot is in: empty on a box with none, on an unreadable one
 * and on any fault. The selector's line is `scripts/company-gaps.js`, which
 * reads through `loadUnexplainedMovers` and reports what it found.
 *
 * @param {Parameters<typeof loadUnexplainedMovers>[0]} [opts]
 */
export function readUnexplainedMovers(opts) {
  try {
    return loadUnexplainedMovers(opts).movers
  } catch {
    return []
  }
}

/** A mover as the selector reads it: `ASML (chip-making machines): up 8.6% in a week`. */
export function moverLine({ name, about, pct }) {
  const what = about ? ` (${about})` : ''
  return `- ${name}${what}: ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% in a week`
}
