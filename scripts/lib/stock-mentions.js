// The entity stage's company scan: the prompt Haiku is given and what is kept
// of its answer. `extract-entities.js` makes the call; these two halves are
// here so the answer's shape is tested without one (`stock-mentions.test.js`).
//
// The scan answers two questions about each company an article names. Which
// share it is — so the mention can open a chart — and, since 2026-10-03,
// whether the article is *about* it. The second is what `/api/companies.json`
// lists under a company's chart: a ticker alone is a mention, and a forum that
// Microsoft attended is not Microsoft's news (`lib/companies.js`). Telling the
// two apart is reading, which is the model's work and was already being paid
// for: one more field on a call that reads every new article anyway.
//
// Since 2026-10-10 the same reading answers two more questions the build was
// answering by word match. Which exchanges and straits the story is *about*
// (`venues`): the list under an exchange was the first eight articles naming
// its country, and on that day's build 40 of the 42 stories on seven such
// lists were not market news at all, three Nobel prizes under Stockholm among
// them. And whether it reports something burning (`thermal`), which the map's
// thermal layer decides from a word list that took "Statement Draws Fire" for
// a fire and refused "Drones Hit Kyiv Data Centres". That one is recorded and
// not yet read: the word list is an editorial one, and still the gate.

import { CHOKEPOINT_CATALOG } from './chokepoint-metadata.js'
import { yamlString } from './frontmatter.js'
import { MARKET_TRACKED } from './market-metadata.js'

/**
 * The exchanges and straits a story can be about: the ones the site draws.
 * The id is the instrument's own, as the dispatch and the rail key it.
 */
export const VENUES = [
  ...MARKET_TRACKED.map((m) => ({ id: `mkt:${m.id}`, label: `${m.name} (${m.indexName}), ${m.city}` })),
  ...CHOKEPOINT_CATALOG.map((c) => ({ id: `cp:${c.id}`, label: c.name })),
]
const VENUE_IDS = new Set(VENUES.map((v) => v.id))

/**
 * @typedef {{ mention: string, ticker: string, name: string, subject: boolean }} StockMention
 */

/**
 * What the scan read in one article besides its companies.
 * @typedef {{ venues: string[], thermal: boolean }} StoryReading
 */

/**
 * @param {{ slug: string, title?: string, body: string }[]} articles
 * @returns {string}
 */
export function stockMentionsPrompt(articles) {
  const blocks = articles
    .map(
      (a) =>
        `---
slug: ${a.slug}
title: ${a.title || ''}
body:
"""
${a.body.slice(0, 1500).replace(/"""/g, "'''")}
"""`,
    )
    .join('\n')

  return `You read news articles and answer three things about each: the listed companies it names, the markets and straits it is about, and whether it reports something burning.

COMPANIES. We attach a live stock chart to each mention. For EACH article below, list only companies that:
  - Are mentioned substantively in the body (not just in a source byline or a one-word drive-by)
  - Are publicly traded with a known stable ticker
  - You can confidently resolve to a Yahoo Finance symbol

For each company, give:
  - mention: the exact string used in the body (preserve case, e.g. "Meta", "Nvidia", "TSMC")
  - ticker: Yahoo Finance symbol ("META", "NVDA", "TSM" for TSMC's ADR or "2330.TW" for Taiwan listing; use the main ADR when one exists). SpaceX is listed now: "SPCX".
  - name: human-readable company name ("Meta Platforms", "Nvidia", "Taiwan Semiconductor")
  - subject: true when the article is ABOUT this company — it is the one acting or acted upon, or the news is its business, products, shares, staff or legal trouble. false when it is named as context: a customer, supplier, rival, comparison, example, attendee or the platform something happened on. Most articles have one subject company or none; a deal, lawsuit or dispute between two companies has two.

Skip (do NOT list):
  - Private firms: OpenAI, Anthropic, Stripe, Boeing Defence, Aramco-the-government-entity (Saudi Aramco Public IS listed as 2222.SR — include only if named as the listed entity)
  - Ambiguous-ticker mentions: if you're not confident which ticker is right, omit
  - Countries, governments, people, agencies, indices (we cover those elsewhere)
  - Generic mentions ("a tech company", "big tech", "hyperscalers" without naming specific firms)

VENUES. Each story you list here is printed under that exchange's or strait's chart as its news, so a story that only happens in the country must not be listed. Use only these ids:
${VENUES.map((v) => `  ${v.id} — ${v.label}`).join('\n')}

List an exchange (mkt:) when the article is news for that market: its index, shares or trading; that country's central bank, currency, budget, debt, inflation, growth or trade figures; sanctions, tariffs or export controls on that economy; or a company, deal or commodity large enough to move its index. Do NOT list it for crime, courts, protests, diplomacy, war reports, elections, science, health, sport, disasters or deaths that the article does not tie to money, even when they happen in that country.

List a strait or canal (cp:) when the article concerns passage through it: ships, tankers or cargo in or near it, an attack, seizure, closure, blockade, toll, traffic count or rerouting, or a decision that changes who may pass. Do NOT list it because the article names a country on its shore.

Most articles are about no venue. One about a venue is usually about one or two.

THERMAL. true when the article reports, as something that happened at a place in the last few days, a fire, an explosion, a strike that hit, shelling, bombing, a burning ship or building, a wildfire, a volcanic eruption or an industrial fire: heat a satellite could have seen. false for everything else, including a figure of speech ("draws fire", "under fire"), police firing rounds, a weapon tested, bought, deployed or announced, a threat or a plan to strike, a strike in the sense of a walkout, and prices or policy about fuel.

Return ONLY a JSON object keyed by slug. Each article maps to an object with "companies" (an array, empty when none qualifies), "venues" (an array of ids from the list, empty when none) and "thermal" (true or false).

Example output (copy the shape, never the words):
{
  "2026-04-18-meta-8000-layoffs-ai-capex-gpu-reallocation-zuckerberg": {
    "companies": [
      {"mention": "Meta", "ticker": "META", "name": "Meta Platforms", "subject": true},
      {"mention": "Nvidia", "ticker": "NVDA", "name": "Nvidia", "subject": false}
    ],
    "venues": [],
    "thermal": false
  },
  "2026-04-18-some-pure-mechanism-science-article": {"companies": [], "venues": [], "thermal": false}
}

Articles:
${blocks}

Return ONLY the JSON object. No commentary, no markdown fences.`
}

/**
 * What is kept of the model's answer: per slug, the companies whose three
 * strings are present and whose ticker looks like one. `subject` is true only
 * for a literal `true` — an absent flag, a string or a guess at another type
 * is a mention, because a wrong "about" puts the wrong story under a chart and
 * a wrong "mention" only leaves one out.
 *
 * Every slug the model answered for is in the map, with an empty list where
 * it found no company: "read, and nothing there" is a different answer from
 * "never read", and the caller records it.
 *
 * @param {unknown} obj  the parsed JSON object
 * @returns {Map<string, StockMention[]>}
 */
export function parseStockMentions(obj) {
  /** @type {Map<string, StockMention[]>} */
  const out = new Map()
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [slug, value] of Object.entries(obj)) {
    // The companies alone, as the answer was before `venues` and `thermal`, or
    // under their key beside them.
    const list = Array.isArray(value) ? value : Array.isArray(value?.companies) ? value.companies : []
    out.set(
      slug,
      list
        .filter(
          (c) =>
            c &&
            typeof c.mention === 'string' &&
            typeof c.ticker === 'string' &&
            /^[A-Z0-9.-]{1,15}$/i.test(c.ticker) &&
            typeof c.name === 'string',
        )
        .map((c) => ({
          mention: c.mention,
          ticker: c.ticker,
          name: c.name,
          subject: c.subject === true,
        })),
    )
  }
  return out
}

/**
 * What is kept of the rest of the answer: per slug, the venues it named that
 * are venues, and whether it called the story thermal.
 *
 * Only an article whose answer carries **both** keys in their own types is in
 * the map. One answered in the old shape, or with a key missing, was not read
 * for these, and the build goes on matching words for it; recorded as "about
 * no venue" it would be off every list for good. An id that is not in
 * `VENUES` is dropped: a model that invents `mkt:nikkei` has named no chart.
 *
 * @param {unknown} obj  the parsed JSON object
 * @returns {Map<string, StoryReading>}
 */
export function parseStoryReadings(obj) {
  /** @type {Map<string, StoryReading>} */
  const out = new Map()
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [slug, value] of Object.entries(obj)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const { venues, thermal } = /** @type {{ venues?: unknown, thermal?: unknown }} */ (value)
    if (!Array.isArray(venues) || typeof thermal !== 'boolean') continue
    out.set(slug, { venues: [...new Set(venues.filter((id) => typeof id === 'string' && VENUE_IDS.has(id)))], thermal })
  }
  return out
}

/**
 * Does this story belong on this exchange's or strait's list? Only when the
 * scan read it and said so.
 *
 * **A story the scan never read is on no list**, and the words do not stand
 * in for it as they do for a company (`isAboutCompany`). They were the whole
 * join, and what they are worth was measured on the build of 2026-10-10: of
 * the 42 stories on seven lists that had fallen to them, 40 were not that
 * market's or that strait's news. Kept as the fallback they also undid the
 * change for a fortnight: with one week of articles read, the places the
 * judged stories left were filled from the week before by the same words. So
 * a list starts with the stories read since, and a cycle whose scan fails
 * adds none, which is the cost.
 *
 * @param {{ venues?: unknown }} meta the article's frontmatter
 * @param {string} id `mkt:lse`, `cp:hormuz`
 */
export const onVenueList = (meta, id) => Array.isArray(meta?.venues) && meta.venues.includes(id)

/**
 * The frontmatter lines recording what the scan read: `venues:` with one id a
 * line, or `venues: []` for a story read and about none, and `thermal:`.
 * Their own keys, as `subjects:` is and for its reason, and not more ids in
 * `subjects`: every article read before 2026-10-10 says `subjects: []`, which
 * would then read as "about no exchange" of stories nobody asked that of.
 *
 * @param {StoryReading} reading
 * @returns {{ venues: string[], thermal: string[] }} each key's lines
 */
export function readingBlocks({ venues, thermal }) {
  return {
    venues: venues.length === 0 ? ['venues: []'] : ['venues:', ...venues.map((id) => `  - ${yamlString(id)}`)],
    thermal: [`thermal: ${thermal}`],
  }
}

/**
 * What an article's frontmatter gets from the companies the scan named in it:
 * an entity for each one there is a chart for, and the ids of the ones the
 * article is about.
 *
 * The two are decided apart. An entity is a mention a reader can press, and a
 * press with no chart behind it opens nothing, so a ticker Yahoo did not
 * answer for is no entity. Whether the article is *about* the company is the
 * model's reading of the article and has nothing to do with Yahoo. They were
 * decided together: a subject whose ticker Yahoo refused was dropped before
 * it was noted, and the article went down as `subjects: []`, "read, and
 * about none", which also turns off the weaker signs the build falls back on
 * for an article nobody read. Seven tickers were refused in the 41 cycles to
 * 2026-10-09: symbols the model had out of date (SNE, ANTM, TTM) or gave
 * without their exchange (HSBA, HCLTECH, CAP), and one it had wrong (RMST).
 *
 * @param {StockMention[]} companies what the scan named in one article
 * @param {Set<string>} charted the indicator ids a chart was fetched for
 * @returns {{ entities: { mention: string, indicatorId: string, kind: 'stock' }[], subjects: string[] }}
 */
export function companyEntries(companies, charted) {
  /** @type {{ mention: string, indicatorId: string, kind: 'stock' }[]} */
  const entities = []
  /** @type {string[]} */
  const subjects = []
  for (const c of companies) {
    const id = `stocks:${c.ticker.toUpperCase()}`
    if (c.subject && !subjects.includes(id)) subjects.push(id)
    if (!charted.has(id) || entities.some((e) => e.indicatorId === id)) continue
    entities.push({ mention: c.mention, indicatorId: id, kind: 'stock' })
  }
  return { entities, subjects }
}

/**
 * A chart for each ticker, one request at a time, until time is up. No
 * request is begun after `until`; the tickers that were not asked for are
 * named, because a bounded job says what it left out.
 *
 * One at a time because Yahoo rate-limits a shared address. A request can
 * take 20 s when both of its hosts hang, the loop ran after up to 110 s of
 * model calls, and the stage is killed at 180 s with its only write still
 * ahead of it: four slow tickers were enough to lose the whole batch.
 *
 * @template T
 * @param {Iterable<string>} tickers
 * @param {(ticker: string) => Promise<T | null>} fetchOne null when there is no chart to be had
 * @param {{ until: number, now?: () => number }} opts `until` in epoch ms; `now` is for a test
 * @returns {Promise<{ charts: Map<string, T>, unasked: string[] }>}
 */
export async function chartsUntil(tickers, fetchOne, { until, now = Date.now }) {
  /** @type {Map<string, T>} */
  const charts = new Map()
  /** @type {string[]} */
  const unasked = []
  for (const ticker of tickers) {
    if (now() >= until) {
      unasked.push(ticker)
      continue
    }
    const chart = await fetchOne(ticker)
    if (chart) charts.set(ticker, chart)
  }
  return { charts, unasked }
}

/**
 * The frontmatter block recording which instruments an article is about, as
 * the model judged it: `subjects:` with one indicator id a line, or
 * `subjects: []` for an article that was read and is about none.
 *
 * Its own key, not a field on `entities[]`: that array is published to the
 * app and the map, and a key added to its items would ride out with them.
 *
 * @param {string[]} ids  indicator ids, e.g. `stocks:NVDA`
 * @returns {string[]} lines, the first being `subjects: …`
 */
export function subjectsBlock(ids) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return ['subjects: []']
  return ['subjects:', ...unique.map((id) => `  - ${yamlString(id)}`)]
}
