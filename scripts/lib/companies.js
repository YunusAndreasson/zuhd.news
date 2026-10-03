// The company list's arithmetic: what the fetcher keeps of a quote response,
// and what the build publishes of it at `/api/companies.json`.
//
// Pure, so both halves are tested without the network or a build
// (`companies.test.js`). The catalog is `company-metadata.js`.

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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A tag on a word boundary, never inside a word: `amd` is not in `amdahl`. */
const tagMatcher = (tag) => new RegExp(`(^|[^a-z0-9])${escapeRe(tag.toLowerCase())}([^a-z0-9]|$)`)
const lower = (s) => String(s || '').toLowerCase()

/** How many of a story's concepts are trusted to say what it is about. */
const LEADING_CONCEPTS = 2

/**
 * `/api/companies.json`: the snapshot with each company's stories joined on,
 * and the fields only the join needed left behind.
 *
 * The rows are printed under the company's chart as `in the news` and marked
 * on its line, so the join is held to stories *about* the company, and a
 * story that only mentions it is left out. Measured on the first run
 * (2026-10-03), the two looser joins the other layers use both put the wrong
 * story on a card:
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
 * Newest first, and only inside the charted quarter.
 *
 * @param {{ generated: string, companies: any[] }} raw
 * @param {any[]} articles  the build's articles, newest first
 * @param {{ now?: number }} [opts]
 */
export function companiesPayload(raw, articles, { now = Date.now() } = {}) {
  const since = now - COMPANY_STORY_DAYS * 86400_000
  const ticker = (id) => String(id || '').slice('stocks:'.length).toUpperCase()
  const index = []
  for (const a of articles) {
    const t = Date.parse(a.meta?.date)
    if (!Number.isFinite(t) || t < since) continue
    const concepts = (a.concepts || []).map((x) => lower(typeof x === 'object' ? x.label : x))
    const stocks = (Array.isArray(a.meta.entities) ? a.meta.entities : []).filter((e) =>
      String(e?.indicatorId || '').startsWith('stocks:'),
    )
    const judged = Array.isArray(a.meta.subjects)
    const subjects = new Set(judged ? a.meta.subjects.map(ticker) : [])
    index.push({
      row: { slug: a.slug, title: a.title, date: a.meta.date, dateFormatted: a.dateFormatted },
      title: lower(a.title),
      leading: concepts.slice(0, LEADING_CONCEPTS).join(' | '),
      concepts: concepts.join(' | '),
      judged,
      stocks: new Set(stocks.map((e) => ticker(e.indicatorId))),
      /** The words the model tied to each ticker it called a subject. */
      subjectMentions: stocks
        .filter((e) => subjects.has(ticker(e.indicatorId)))
        .map((e) => ({ ticker: ticker(e.indicatorId), mention: lower(e.mention) })),
    })
  }
  return {
    generated: raw.generated,
    companies: (raw.companies || []).map(
      ({ tickers = [], topicTags = [], commonName, ...company }) => {
        const wanted = new Set(tickers.map((t) => String(t).toUpperCase()))
        const tags = topicTags.map(tagMatcher)
        const common = commonName ? tagMatcher(commonName) : null
        const named = (text) => tags.some((re) => re.test(text)) || Boolean(common?.test(text))
        const relatedArticles = []
        for (const a of index) {
          const about =
            a.subjectMentions.some((s) => wanted.has(s.ticker) && named(s.mention)) ||
            tags.some((re) => re.test(a.title)) ||
            (!a.judged &&
              ((common?.test(a.title) &&
                ([...wanted].some((t) => a.stocks.has(t)) ||
                  tags.some((re) => re.test(a.concepts)))) ||
                tags.some((re) => re.test(a.leading))))
          if (!about) continue
          relatedArticles.push(a.row)
          if (relatedArticles.length >= COMPANY_STORIES) break
        }
        return { ...company, relatedArticles }
      },
    ),
  }
}
