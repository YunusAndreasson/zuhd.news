// The company list's arithmetic: what the fetcher keeps of a quote response,
// and what the build publishes of it at `/api/companies.json`.
//
// Pure, so both halves are tested without the network or a build
// (`companies.test.js`). The catalog is `company-metadata.js`.

import { tagMatcher } from './entity-registry.js'
import { instrumentMismatch } from './market-metadata.js'

/** How many of a company's stories the payload carries. The app's card lists
 *  and marks three (`MAX_CITED`); one spare survives a story being withdrawn. */
export const COMPANY_STORIES = 4

/**
 * How far back a story may be and still be listed. The chart is a quarter of
 * closes, and a story inside it is a mark on the line; one from before the
 * line starts has nowhere to be drawn and is not "in the news".
 */
export const COMPANY_STORY_DAYS = 92

/**
 * Does this response identify as the company asked for?
 *
 * Null when it does, a reason when it does not. The currency and zone are the
 * exchange catalog's own check; the name is the one this list adds, because
 * fifteen of the twenty are dollar shares in New York and those two fields
 * cannot tell them apart.
 *
 * @param {{ currency: string, tz: string, match: string }} entry
 * @param {{ currencyReported?: string, timezone?: string, name?: string }} data
 * @returns {string | null}
 */
export function companyMismatch(entry, data) {
  const place = instrumentMismatch({ symbol: '', currency: entry.currency, tz: entry.tz }, data)
  if (place) return place
  const name = String(data.name || '').toLowerCase()
  if (!name.includes(entry.match)) return `name "${data.name}" does not contain "${entry.match}"`
  return null
}

/**
 * The closes of completed sessions, and nothing after them.
 *
 * A fetch made while an exchange is open carries today's bar at the price of
 * that minute, and a cached series can end in a live quote appended under
 * today's date. Published, either would put an unfinished session's number
 * under the date of the last close — and change the file on every cycle of a
 * trading day, which sends it to every reader again (`stable-stamp.js`). One
 * close a day is what the list prints, so one close a day is what it keeps.
 *
 * @param {{ values: number[], periods: string[], dates?: string[], completed?: boolean[] }} data
 * @returns {{ values: number[], periods: string[] }}
 */
export function completedCloses(data) {
  const values = []
  const periods = []
  for (let i = 0; i < data.values.length; i++) {
    if (data.completed && data.completed[i] !== true) continue
    const value = data.values[i]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    values.push(value)
    periods.push(data.periods[i] ?? '')
  }
  return { values, periods }
}

/**
 * A company as `content/.companies.json` holds it: the catalog's entry with
 * its quote. `tickers`, `topicTags` and `commonName` are for the build's join
 * and are not published.
 *
 * @typedef {Object} CompanyRecord
 * @property {string} id
 * @property {string} name
 * @property {string} about
 * @property {string} symbol
 * @property {string} iso2
 * @property {string} currency
 * @property {string} currencyName
 * @property {number} level  the last completed session's close
 * @property {string} asOf
 * @property {{ values: number[], periods: string[] }} series
 * @property {string} sourceLabel
 * @property {string} blurb
 * @property {string[]} tickers
 * @property {string[]} topicTags
 * @property {string} [commonName]
 * @property {boolean} [stale]
 */

/**
 * One company's record for `content/.companies.json`, or the reason it has
 * none: exactly one of the two is set.
 *
 * @param {import('./company-metadata.js').CompanyEntry} entry
 * @param {any} data  `fetchYahooStock`'s result
 * @param {{ stale?: boolean }} [opts]
 * @returns {{ record: CompanyRecord | null, rejected: string | null }}
 */
export function companyRecord(entry, data, { stale = false } = {}) {
  const refuse = (/** @type {string} */ rejected) => ({ record: null, rejected })
  const mismatch = companyMismatch(entry, data)
  if (mismatch) return refuse(mismatch)
  const series = completedCloses(data)
  if (series.values.length < 2) {
    return refuse(`${series.values.length} completed close(s), nothing to chart`)
  }
  const level = series.values[series.values.length - 1]
  if (!(level > 0)) return refuse(`unusable close ${level}`)
  return {
    rejected: null,
    record: {
      id: entry.id,
      name: entry.name,
      about: entry.about,
      symbol: entry.symbol,
      iso2: entry.iso2,
      currency: entry.currency,
      currencyName: entry.currencyName,
      level,
      asOf: data.asOf,
      series,
      sourceLabel: `Yahoo Finance · ${entry.exchange}`,
      blurb: entry.blurb,
      tickers: entry.tickers,
      topicTags: entry.topicTags,
      ...(entry.commonName ? { commonName: entry.commonName } : {}),
      ...(stale ? { stale: true } : {}),
    },
  }
}

/** A tag on a word boundary, never inside a word: `amd` is not in `amdahl`.
 *  The matcher is the registry's; a story's side is lowercased by `storyFacts`,
 *  so the tag's is here. */
const wholeTag = (tag) => tagMatcher(tag.toLowerCase())
const lower = (s) => String(s || '').toLowerCase()
const tickerOf = (id) => String(id || '').slice('stocks:'.length).toUpperCase()

/** How many of a story's concepts are trusted to say what it is about. */
const LEADING_CONCEPTS = 2

/**
 * What a story says about which companies it concerns, read once per story.
 *
 * @param {{ title?: string, concepts?: any[], entities?: any, subjects?: any }} story
 *   `concepts` as labels or `{ label }`; `entities` and `subjects` as the
 *   article's frontmatter carries them.
 */
export function storyFacts(story) {
  const concepts = (story.concepts || []).map((x) => lower(typeof x === 'object' ? x?.label : x))
  const stocks = (Array.isArray(story.entities) ? story.entities : []).filter((e) =>
    String(e?.indicatorId || '').startsWith('stocks:'),
  )
  const judged = Array.isArray(story.subjects)
  const subjects = new Set(judged ? story.subjects.map(tickerOf) : [])
  return {
    title: lower(story.title),
    leading: concepts.slice(0, LEADING_CONCEPTS).join(' | '),
    concepts: concepts.join(' | '),
    judged,
    stocks: new Set(stocks.map((e) => tickerOf(e.indicatorId))),
    /** The words the model tied to each ticker it called a subject. */
    subjectMentions: stocks
      .filter((e) => subjects.has(tickerOf(e.indicatorId)))
      .map((e) => ({ ticker: tickerOf(e.indicatorId), mention: lower(e.mention) })),
  }
}

/** A company's side of the join, compiled once per company. */
export function companyMatcher({ tickers = [], topicTags = [], commonName }) {
  return {
    wanted: new Set(tickers.map((t) => String(t).toUpperCase())),
    tags: topicTags.map(wholeTag),
    common: commonName ? wholeTag(commonName) : null,
  }
}

/**
 * Is this story *about* this company, rather than naming it?
 *
 * The rows it decides are printed under the company's chart as `in the news`
 * and marked on its line, and they are what the narration stage is offered
 * first as the reason a share moved — so a story that only mentions the
 * company must not pass. Measured on the first run (2026-10-03), the two
 * looser joins the other layers use both put the wrong story on a card:
 *
 * - **A ticker in `entities[]` is a mention, and sometimes not even that.**
 *   A forum in Baku listed under Microsoft because Microsoft attended; a Saudi
 *   carmaker listed under TSMC because the entity stage gave Foxconn TSMC's
 *   ticker.
 * - **The tail of `concepts` is noise.** A euro-zone inflation story carried
 *   `Amazon (company)` fourth of five, beside `Fullscreen (company)`.
 *
 * Whether a story is about a company is a judgement, and the entity stage's
 * model makes it as it reads the story (`subjects:` in frontmatter,
 * `lib/stock-mentions.js`). So a story is a company's when
 *   1. the model judged it to be about one of the company's tickers, **and
 *      the words it tied that ticker to name the company** — the second half
 *      is what keeps Foxconn off TSMC's card — or
 *   2. its **title** carries one of the company's tags.
 * A story the model never read — everything written before 2026-10-03, and a
 * cycle whose scan timed out — has no judgement to go on, and for those alone
 * two weaker signs stand in:
 *   3. the title carries the company's `commonName` — `apple`, `amazon` — and
 *      something else agrees it is the company: its ticker among the story's
 *      entities, or a tag anywhere in its concepts, or
 *   4. a tag is in one of its first two concepts, which is how a story about
 *      Aramco's pipeline is found when its title names the port.
 *
 * @param {ReturnType<typeof storyFacts>} facts
 * @param {ReturnType<typeof companyMatcher>} matcher
 */
export function isAboutCompany(facts, { wanted, tags, common }) {
  const named = (text) => tags.some((re) => re.test(text)) || Boolean(common?.test(text))
  return (
    facts.subjectMentions.some((s) => wanted.has(s.ticker) && named(s.mention)) ||
    tags.some((re) => re.test(facts.title)) ||
    (!facts.judged &&
      ((Boolean(common?.test(facts.title)) &&
        ([...wanted].some((t) => facts.stocks.has(t)) || tags.some((re) => re.test(facts.concepts)))) ||
        tags.some((re) => re.test(facts.leading))))
  )
}

/**
 * `/api/companies.json`: the snapshot with each company's stories and the
 * desk's account of its share joined on, and the fields only the join needed
 * left behind.
 *
 * **`recent`** is the indicator dispatch's paragraph for `co:<id>` — what
 * happened to the share and why, where the fortnight's coverage says. It is
 * left out when the desk wrote none, so the app's fallback to the catalog
 * sentence fires on absence and never on an empty string.
 *
 * **`relatedArticles`** are the stories that paragraph was built from, when
 * it has any; otherwise the stories about the company (`isAboutCompany`),
 * newest first, inside the charted quarter. The same rule the strait and
 * exchange payloads follow (`citedOr` in `build.js`): a list under an account
 * is the account's evidence.
 *
 * @param {{ generated: string, companies: any[] }} raw
 * @param {any[]} articles  the build's articles, newest first
 * @param {{ now?: number, dispatch?: Record<string, any> }} [opts]
 *   `dispatch`: `content/.indicator-dispatch.json`'s `items`.
 */
export function companiesPayload(raw, articles, { now = Date.now(), dispatch = {} } = {}) {
  const since = now - COMPANY_STORY_DAYS * 86400_000
  const index = []
  const rowBySlug = new Map()
  for (const a of articles) {
    const t = Date.parse(a.meta?.date)
    if (!Number.isFinite(t) || t < since) continue
    const row = { slug: a.slug, title: a.title, date: a.meta.date, dateFormatted: a.dateFormatted }
    rowBySlug.set(a.slug, row)
    index.push({
      row,
      facts: storyFacts({
        title: a.title,
        concepts: a.concepts,
        entities: a.meta.entities,
        subjects: a.meta.subjects,
      }),
    })
  }
  return {
    generated: raw.generated,
    companies: (raw.companies || []).map(
      ({ tickers = [], topicTags = [], commonName, ...company }) => {
        const matcher = companyMatcher({ tickers, topicTags, commonName })
        const about = []
        for (const a of index) {
          if (!isAboutCompany(a.facts, matcher)) continue
          about.push(a.row)
          if (about.length >= COMPANY_STORIES) break
        }
        const d = dispatch?.[`co:${company.id}`]
        const recent = typeof d?.recent === 'string' ? d.recent.trim() : ''
        // Resolved against the corpus here, not trusted: the dispatch is a
        // committed file, and a story can be withdrawn between the run that
        // wrote it and this build.
        const cited = recent
          ? (Array.isArray(d.citations) ? d.citations : [])
              .map((slug) => rowBySlug.get(slug))
              .filter(Boolean)
              .slice(0, COMPANY_STORIES)
          : []
        return {
          ...company,
          ...(recent ? { recent } : {}),
          relatedArticles: cited.length ? cited : about,
        }
      },
    ),
  }
}
