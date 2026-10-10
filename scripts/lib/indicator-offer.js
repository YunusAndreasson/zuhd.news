// What the writer is offered for one selected story: the live figures it may
// cite. Which of them is drawn under the story is not the writer's to say:
// the chart desk decides that once the article is written (`lib/chart-desk.js`),
// from rows built here.
//
// Pure, so it can be tested and replayed; `attach-indicators.js` (Stage 1.7)
// is the I/O around it and `validate-articles.js` reads its chart check.
//
// ── What a row is ──────────────────────────────────────────────────────────
//
// Four kinds, each carrying the numbers the app's card for that id prints, so
// a sentence built from a row and the chart drawn under it cannot disagree:
//
//   series    a trends-snapshot series (FRED, OER, crypto): level, change
//   strait    `cp:<id>` from `.chokepoints.json`: 7-day traffic vs its normal
//   odds      `poly-*`: a contract's price, its moves in *points*
//   exchange  `mkt:<id>` from `.markets.json`: the index level, its change
//
// `carried` on a row is how many stories of the last three days already cite
// that level (`carriedLevels`, set by the stage). The slow series are the
// hazard: a strait's count is a week behind, so every story in the theatre was
// handed one number, and four of them printed "3.1 ships a day as of 27
// September" inside three days.

import { CC_TO_TOPOJSON_NAME } from '../../shared/countries/iso.ts'
import { completedCloses } from './companies.js'
import { extractEntities, tagMatcher } from './entity-registry.js'
import { labelDay } from './period.js'

/** Four significant figures — what a sentence can carry and what the rail
 *  prints. A writer given 71.2047 will print 71.2047. */
export const sig4 = (n) => (Number.isFinite(n) ? Number(Number(n).toPrecision(4)) : null)

/**
 * How stale a level may be before it stops being a level.
 *
 * A monthly series is legitimately two months behind its own publication and
 * still current; a daily one two months behind is broken. Beyond this the
 * indicator is dropped rather than dated, because a writer handed a figure will
 * use it and the caveat is the first thing a 450-character article cuts.
 */
const MAX_AGE_DAYS = { monthly: 45 }
const STALE_DEFAULT = 12

/**
 * The two windows offered per cadence: a quarter and a year of monthly
 * prints, a week and a month of days.
 *
 * Fixed at 7 and 30 observations first, which on a monthly series is seven
 * months and **twenty-two** — a nearly two-year swing offered beside a daily
 * one as though they were the same kind of statement. A window is only useful
 * if a reader would recognise it as a period. The registry has the two
 * cadences and no third: a weekly print (the mortgage rate, the pump price)
 * is carried as `daily`, each print with its day.
 */
const MONTHLY_WINDOWS = [3, 12]
const WIDER_DAYS = 30

/** At most this many rows per story, and at most one contract among them. A
 *  story is about one or two things, and a longer list reads as a menu the
 *  writer is expected to work through. */
const MAX_ROWS = 4

const DAY = 86400_000

/**
 * The change across the last `n` monthly prints, with the period named.
 *
 * **Observations are not days, and getting that wrong is the whole hazard of
 * this stage.** `wheat` and `rice` are monthly, so the last seven points are
 * seven *months*. The first version labelled every one of them `change7d`,
 * which offered a writer a 12-month commodity swing as a fortnight's move — a
 * wrong number in an article, produced by a stage whose whole purpose is
 * getting numbers into articles. So this counts prints only where a print is
 * a month, and a daily series is measured in days by its dates (`daysMove`).
 */
export const monthlyChange = (values, n) => {
  const v = (values || []).filter(Number.isFinite)
  if (v.length < 2) return null
  const steps = Math.min(n, v.length - 1)
  const from = v[v.length - 1 - steps]
  const to = v[v.length - 1]
  if (!Number.isFinite(from) || from === 0) return null
  return {
    pct: Number((((to - from) / Math.abs(from)) * 100).toFixed(1)),
    over: `${steps} month${steps === 1 ? '' : 's'}`,
  }
}

/**
 * Days since a published `asOf`, or null.
 *
 * **A monthly observation is aged from the end of its month.** FRED dates a
 * monthly print to the month's first day, so August's CPI carries `asOf:
 * 2026-08-01` and is published in mid-September. Aged from the 1st it passed
 * the 45-day limit a week after it came out, and US inflation and unemployment
 * were dropped as stale on most days they were the newest figures there are.
 */
export const ageDays = (asOf, cadence, now) => {
  const t = Date.parse(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  let from = t
  if (cadence === 'monthly') {
    const d = new Date(t)
    from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  }
  return Math.max(0, Math.round((now - from) / DAY))
}

const isStale = (age, cadence) => age != null && age > (MAX_AGE_DAYS[cadence] ?? STALE_DEFAULT)

/**
 * What a story is about: the title and the selector's angle — **never the
 * source bodies**.
 *
 * The bodies were included first, on the reasoning that they are the prose
 * the writer works from. They are also full news articles, and a full news
 * article contains every incidental noun in the English language: the first
 * run offered a **wheat price to a story about a solar eclipse**, because a
 * paragraph describing where to stand in Spain mentioned "wheat fields and
 * rolling hills". That is precisely the wrong-crossreference failure this
 * work exists to remove, arriving one stage earlier than usual.
 *
 * A title, an angle and a concept list are *statements of what the story is
 * about*. A body is everything the outlet happened to write. Only the first
 * kind can decide whether a number belongs in front of a writer.
 */
export const storyText = (story) => {
  const concepts = (Array.isArray(story.concepts) ? story.concepts : [])
    .map((c) => (c && typeof c === 'object' ? c.label : c))
    .filter((s) => typeof s === 'string')
  return [story.title, story.angle, ...concepts].filter(Boolean).join('\n')
}

// ── Matching a contract or an event to a story ─────────────────────────────

const COUNTRY_NAMES = new Set([
  ...Object.values(CC_TO_TOPOJSON_NAME).map((n) => n.toLowerCase()),
  // How prose names the two countries whose Natural Earth names nobody writes.
  'us', 'usa', 'america', 'united states', 'uk', 'britain',
])

/**
 * The country a word names — itself, or through its demonym — or null.
 *
 * "Israeli" is the place as an adjective and carries no more about a story
 * than "Israel" does, so the two resolve to one country and count once. They
 * counted twice at first, and a replay of a week's stories hung the
 * *Netanyahu next prime minister?* contract off every story that wrote both
 * words — settlers in Jalud, a flight diverted to Saudi Arabia.
 */
const countryOf = (word) => {
  const w = word.toLowerCase()
  if (COUNTRY_NAMES.has(w)) return w === 'usa' || w === 'america' ? 'us' : w === 'britain' ? 'uk' : w
  if (!/(an|ian|i|ese|ish|ic)$/.test(w)) return null
  for (const name of COUNTRY_NAMES) {
    if (name.length >= 4 && !name.includes(' ') && w.startsWith(name.slice(0, Math.max(4, name.length - 1)))) return name
  }
  return null
}

/** Aliases a country is written as, for the calendar's country check. */
const COUNTRY_ALIASES = {
  US: ['us', 'u.s.', 'united states', 'american', 'america', 'washington'],
  GB: ['uk', 'britain', 'british', 'united kingdom', 'london'],
}
const namesCountry = (code, lower) =>
  [CC_TO_TOPOJSON_NAME[code]?.toLowerCase(), ...(COUNTRY_ALIASES[code] || [])]
    .filter(Boolean)
    .some((n) => tagMatcher(n).test(lower))

/**
 * Whether one key appears in the story.
 *
 * A key of three letters or fewer — `fed`, `cpi`, `boe` — is matched only as
 * the capitalised or upper-case word, against the original text. On the
 * lowercased haystack `fed` is "fed up" and `mpc` is a fragment of anything.
 */
const hasKey = (key, text, lower) => {
  if (key.length <= 3) {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const cap = k[0].toUpperCase() + k.slice(1).toLowerCase()
    return new RegExp(`\\b(?:${k.toUpperCase()}|${cap})\\b`).test(text)
  }
  return tagMatcher(key.toLowerCase()).test(lower)
}

/** Tags every contract carries, or that name a kind of question rather than
 *  its subject. `ceasefire` is weak rather than absent: alone it would hang an
 *  Israel–Iran contract off a Sudanese truce, beside a country it is decisive. */
const ODDS_DROP_TAGS = new Set(['prediction', 'polymarket', 'odds', 'election'])
const ODDS_WEAK_TAGS = new Set(['ceasefire'])

/** Capitalised words that open or shape a question without naming anything. */
const LABEL_STOP = new Set([
  'Will', 'Another', 'No', 'Next', 'The', 'By', 'Before', 'After', 'President',
  'Prime', 'Minister', 'PM', 'Dem', 'Democratic', 'Republican', 'Jan', 'Feb',
  'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
  'January', 'February', 'March', 'April', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
])

/**
 * A contract's match keys, each marked weak or specific.
 *
 * Its own tags, plus the proper nouns of its question — the tags alone miss
 * the subject of most elections (`Flávio Bolsonaro wins Brazil 2026?` is
 * tagged only `election`). A name is a run of capitalised words, plus its last
 * word when that is long enough to be a surname on its own ("Bolsonaro").
 * Names are matched case-sensitively, so `Marine Le Pen` is not a marine
 * biology story.
 */
export const oddsKeys = (ind) => {
  /** @type {Map<string, {weak: boolean, exact: boolean}>} */
  const keys = new Map()
  for (const tag of ind.topicTags || []) {
    const t = String(tag).toLowerCase()
    if (ODDS_DROP_TAGS.has(t)) continue
    keys.set(t, { weak: ODDS_WEAK_TAGS.has(t) || countryOf(t) != null, exact: false })
  }
  const words = String(ind.label || '').split(/[^\p{L}.'’]+/u).filter(Boolean)
  let run = []
  const flush = () => {
    if (!run.length) return
    const name = run.join(' ')
    const add = (k) => {
      if (keys.has(k.toLowerCase())) return
      keys.set(k, { weak: countryOf(k) != null, exact: true })
    }
    add(name)
    const last = run[run.length - 1]
    if (run.length > 1 && last.length >= 5) add(last)
    run = []
  }
  for (const w of words) {
    const clean = w.replace(/[.'’]+$/, '')
    const cap = /^\p{Lu}/u.test(clean)
    const particle = run.length > 0 && /^(Le|La|de|da|van|von|al|bin)$/.test(clean)
    if ((cap && !LABEL_STOP.has(clean) && clean.length > 1 && clean !== 'U.S') || particle) run.push(clean)
    else flush()
  }
  flush()
  return keys
}

/**
 * Whether a contract is about this story: one of its specific keys (a name,
 * a waterway, the Fed), or three weak ones together.
 *
 * Two weak keys was the first threshold, and a week's replay showed what two
 * countries buy: *Putin out by June 2027?* (tagged `ukraine`, naming Russia)
 * on every story of the war. Three is what a contract actually about a
 * relationship needs — Israel *and* Iran *and* the ceasefire is the ceasefire
 * contract's story; Iran alone is not "the US invades Iran".
 *
 * **A question made of single words needs two of them.** A name key is any
 * capitalised word of the question, which for *Google best AI model?* is
 * `Google` and `AI`, and for *Balance of Power: R Senate, R House* is four
 * ordinary nouns. One of those alone is a topic, not the question: over two
 * days of selections the Google contract was offered to ten stories — AI
 * cameras in Delhi, deepfakes, a BMW plant — and *Balance of Power* to Indian
 * power stocks. A question with one such word (`Netanyahu`, `Gemini`) or a
 * full name (`JD Vance`) still stands on it, and so does a tag (`hormuz`,
 * `fed`), which someone chose as the subject.
 *
 * Returns a score for ranking (specific keys count double), 0 when not
 * offered.
 */
export const oddsScore = (ind, text, lower) => {
  let specific = 0
  let decisive = 0
  const weak = new Set()
  const seen = new Set()
  const keys = oddsKeys(ind)
  const isLooseWord = (key, { weak: isWeak, exact }) => exact && !isWeak && !key.includes(' ')
  const looseWords = [...keys].filter(([key, k]) => isLooseWord(key, k)).length
  for (const [key, meta] of keys) {
    const { weak: isWeak, exact } = meta
    const k = key.toLowerCase()
    if (seen.has(k)) continue
    const hit = exact
      ? new RegExp(`(^|[^\\p{L}])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(text)
      : hasKey(key, text, lower)
    if (!hit) continue
    seen.add(k)
    if (isWeak) weak.add(countryOf(k) ?? k)
    else {
      specific++
      if (looseWords < 2 || !isLooseWord(key, meta)) decisive++
    }
  }
  if (!decisive && specific < 2 && weak.size < 3) return 0
  return specific * 2 + weak.size
}

/**
 * A row's observations with the day each fell on, oldest first, or null when
 * they cannot be dated.
 *
 * `dates` where the row carries them (FRED, the BIS, an exchange): the day
 * itself. Otherwise the period labels, which have no year. The newest is
 * placed by `asOf`, and the year steps back wherever a label would fall after
 * the one that follows it (a series across New Year).
 *
 * **The newest label may be later than `asOf`, and is not last year's for
 * it.** `asOf` is the last *completed* close, and a series fetched while its
 * exchange is open ends in today's bar. Read as "a label after `asOf` is the
 * year before", that bar became a year-old anchor and the week had no move:
 * 12 of the 26 exchanges in the `.markets.json` of 2026-10-09 10:09.
 *
 * @param {{ values?: number[], periods?: string[], dates?: string[], asOf?: string }} ind
 * @returns {{ t: number, v: number }[] | null}
 */
const datedPoints = (ind) => {
  const values = ind.values || []
  /** @type {number[]} */
  let days
  if (Array.isArray(ind.dates) && ind.dates.length === values.length) {
    days = ind.dates.map((d) => Date.parse(`${d}T00:00:00Z`))
  } else {
    const periods = ind.periods || []
    const end = Date.parse(`${ind.asOf}T00:00:00Z`)
    if (!Number.isFinite(end) || periods.length !== values.length) return null
    days = new Array(values.length)
    let year = new Date(end).getUTCFullYear()
    // A newest label half a year past `asOf` is last year's: `asOf` Jan 2
    // over a series whose last label is Dec 31.
    let next = end + 183 * DAY
    for (let i = periods.length - 1; i >= 0; i--) {
      let t = labelDay(periods[i], year)
      if (t > next) t = labelDay(periods[i], --year)
      if (!Number.isFinite(t)) return null
      days[i] = t
      next = t
    }
  }
  const points = []
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(days[i]) && Number.isFinite(values[i])) points.push({ t: days[i], v: values[i] })
  }
  return points
}

/**
 * The value at the latest observation on or before `days` before the newest,
 * or null when there is none, or none within `slackDays` of it.
 *
 * Contracts are sampled more than once a day (`Sep 30, Sep 30`), so counting
 * observations is not counting days. Counted from the newest observation, as
 * the app counts (`weekMove`, mobile/lib/cards/week-move.ts), and not from
 * `asOf`, which an open session's bar runs past.
 */
const valueDaysBack = (ind, days, slackDays = Infinity) => {
  const points = datedPoints(ind)
  if (!points?.length) return null
  const target = points[points.length - 1].t - days * DAY
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].t <= target) return points[i].t >= target - slackDays * DAY ? points[i].v : null
  }
  return null
}

/**
 * The move the app's chart prints beside a daily series: seven calendar days,
 * anchored on the last observation on or before a week before the newest, and
 * none when that anchor is more than three days late (`gaugeMove`,
 * mobile/lib/cards/week-move.ts — the same rule, so the same number).
 *
 * This replaced seven *observations*, which on a series that skips weekends is
 * nine days. And it is the move the prompt says to cite for a charted series:
 * the first real run wrote "Brent crude's 23% monthly jump" over a chart whose
 * chip said ▼12% over 7 days — both true, and a contradiction to anyone
 * reading one under the other.
 */
export const weekMove = (ind) => {
  const last = (ind.values || []).filter(Number.isFinite).at(-1)
  const then = valueDaysBack(ind, 7, 3)
  if (!Number.isFinite(last) || then == null || then === 0) return null
  return { pct: Number((((last - then) / Math.abs(then)) * 100).toFixed(1)), over: '7 days' }
}

const pointsMove = (ind, days) => {
  const last = (ind.values || []).at(-1)
  const then = valueDaysBack(ind, days)
  if (!Number.isFinite(last) || then == null) return null
  return { points: Math.round(last - then), over: `${days} days` }
}

/**
 * The change over `days` calendar days, with the days it really spans named.
 *
 * From the latest observation on or before `days` before the newest. A series
 * that skips weekends, or prints once a week, has none exactly there, so the
 * span is counted and said: `32 days`, `35 days`. A series shorter than the
 * window gives its whole length, as it always has (`29 days` for a currency).
 *
 * This replaced thirty *observations* under the name of thirty days. On
 * 2026-10-09 the writer was handed Brent `+35.3% over 30 days` for the move
 * from 24 August to 6 October, 43 days, and the two weekly prints the
 * registry carries as daily (the mortgage rate, the pump price) had twelve
 * weeks under the name `12 days`. `recent` had been through this already
 * (`weekMove`).
 *
 * @param {{ values?: number[], periods?: string[], dates?: string[], asOf?: string }} ind
 * @param {number} days
 */
const daysMove = (ind, days) => {
  const points = datedPoints(ind)
  if (!points || points.length < 2) return null
  const last = points[points.length - 1]
  let from = points[0]
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].t <= last.t - days * DAY) {
      from = points[i]
      break
    }
  }
  const span = Math.round((last.t - from.t) / DAY)
  if (span < 1 || from.v === 0) return null
  return {
    pct: Number((((last.v - from.v) / Math.abs(from.v)) * 100).toFixed(1)),
    over: `${span} day${span === 1 ? '' : 's'}`,
  }
}

/** Event tags that name a kind of decision rather than whose: "interest rate"
 *  is every central bank's, "cpi" every statistics office's. They count only
 *  beside a country the event belongs to. */
const EVENT_GENERIC_TAGS = new Set([
  'interest rate', 'interest rates', 'cpi', 'consumer price index', 'gdp',
  'gross domestic product', 'unemployment rate', 'summit', 'inflation',
])
const CALENDAR_DAYS = 60
const CLOSING_DAYS = 3
const MAX_CALENDAR = 2

// ── A row for each kind ────────────────────────────────────────────────────
//
// Each returns the row, `'stale'` for a level too old to be one, or null when
// there is nothing to read. The offer below and the chart desk build from the
// same four, so a figure in a sentence and the line picked to go under it are
// read off one row.

/**
 * @param {any} ind  a trends-snapshot series
 * @param {{ now: number, asOf?: string }} ctx `asOf`: the snapshot's own, for a row without one
 */
export function seriesRow(ind, { now, asOf: fallback = '' }) {
  if (!ind || !Array.isArray(ind.values)) return null
  const values = ind.values.filter(Number.isFinite)
  if (values.length < 2) return null
  const cadence = ind.cadence || 'daily'
  const asOf = ind.asOf || fallback
  const age = ageDays(asOf, cadence, now)
  if (isStale(age, cadence)) return 'stale'
  const monthly = cadence === 'monthly'
  const [quarter, year] = MONTHLY_WINDOWS
  return {
    id: ind.id,
    kind: 'series',
    label: ind.label,
    level: sig4(values[values.length - 1]),
    unit: ind.unit || '',
    cadence,
    // "Aug 2026" for a monthly print: the month it measures, which is how a
    // sentence dates it ("US inflation was 2.9% in August").
    period: Array.isArray(ind.periods) ? ind.periods.at(-1) : undefined,
    // A daily series' `recent` is the chart's own week and its `wider` a
    // month of days; a monthly print has neither, and keeps its quarter and
    // its year.
    recent: monthly ? monthlyChange(values, quarter) : weekMove(ind),
    wider: monthly ? monthlyChange(values, year) : daysMove(ind, WIDER_DAYS),
    // Non-negotiable: a figure a writer cannot date is a figure they will
    // present as today's.
    asOf,
    ageDays: age,
  }
}

/**
 * A strait is read from its own payload, the numbers its card prints
 * (`straitCardFor`, mobile/lib/cards/markets.ts): seven-day traffic, all
 * ships, against the 90-day normal. These ids were looked up in the trends
 * snapshot until 2026-09-30, which has no `cp:*` rows — so every Hormuz,
 * Suez and Bab-el-Mandeb story reached the writer with no figure at all.
 *
 * @param {any} c  a `.chokepoints.json` entry
 * @param {{ now: number }} ctx
 */
export function straitRow(c, { now }) {
  const level = c?.last7Avg?.n_total
  const series = c?.series?.total
  if (!c || !Number.isFinite(level) || !Array.isArray(series) || series.length < 2) return null
  const age = ageDays(c.asOf, 'daily', now)
  if (isStale(age, 'daily')) return 'stale'
  const d = c.delta7vs90?.n_total
  return {
    id: `cp:${c.id}`,
    kind: 'strait',
    label: `${c.name} traffic`,
    level: sig4(level),
    unit: 'ships a day, 7-day average, all ships',
    normal: sig4(c.baseline90Avg?.n_total),
    vsNormalPct: Number.isFinite(d) ? Math.round(d * 100) : null,
    asOf: c.asOf,
    ageDays: age,
  }
}

/**
 * Whether a contract is in its last days. A question about to close is not a
 * forecast of what's next — "Iran charges Hormuz fees by September 30?" won
 * every Hormuz story of its final day in a replay, over the contract on
 * whether traffic recovers.
 *
 * @param {any} ind
 * @param {number} now
 */
export const closingSoon = (ind, now) => {
  const end = Date.parse(ind?.endDate ?? '')
  return Number.isFinite(end) && end - now < CLOSING_DAYS * DAY
}

/**
 * @param {any} ind  a `polymarket` row of the trends snapshot
 * @param {{ now: number }} ctx
 */
export function oddsRow(ind, { now }) {
  if (!ind || !Array.isArray(ind.values) || !ind.values.length) return null
  const age = ageDays(ind.asOf, 'daily', now)
  if (isStale(age, 'daily')) return 'stale'
  return {
    id: ind.id,
    kind: 'odds',
    question: ind.label,
    level: Math.round(ind.values.at(-1)),
    unit: '% (price of a Yes share)',
    recent: pointsMove(ind, 7),
    wider: pointsMove(ind, 30),
    source: 'Polymarket',
    asOf: ind.asOf,
    ageDays: age,
  }
}

/**
 * An exchange is read at its completed sessions (`completedCloses`), which
 * is what its `asOf` dates. A snapshot taken while the exchange is open ends
 * in that minute's price, and the level was read off the end: London on
 * 2026-10-09 would have been offered 10,540 "as of 8 October", a day whose
 * close was 10,441.6. A level that cannot be dated is dropped, not dated.
 *
 * @param {any} m  a `.markets.json` exchange
 * @param {{ now: number }} ctx
 */
export function exchangeRow(m, { now }) {
  if (!m || !Array.isArray(m.series?.values) || !Array.isArray(m.series?.periods)) return null
  const closes = { ...completedCloses(m.series), asOf: m.asOf }
  if (closes.values.length < 2) return null
  const age = ageDays(m.asOf, 'daily', now)
  if (isStale(age, 'daily')) return 'stale'
  return {
    id: `mkt:${m.id}`,
    kind: 'exchange',
    label: `${m.indexName} (${m.name})`,
    level: sig4(closes.values.at(-1)),
    unit: `index points${m.currency ? `, priced in ${m.currency}` : ''}`,
    recent: weekMove(closes),
    wider: daysMove(closes, WIDER_DAYS),
    asOf: m.asOf,
    ageDays: age,
  }
}

// ── The offer ──────────────────────────────────────────────────────────────

/**
 * @param {any} story   A selection entry.
 * @param {object} sources
 * @param {any} [sources.trends]       The trends snapshot.
 * @param {any[]} [sources.chokepoints] `.chokepoints.json`'s `chokepoints`.
 * @param {any[]} [sources.markets]     `.markets.json`'s `exchanges`.
 * @param {number} [sources.now]
 */
export function offerFor(story, { trends, chokepoints = [], markets = [], now = Date.now() } = {}) {
  const text = storyText(story)
  const lower = text.toLowerCase()
  const indicators = (trends?.indicators || []).filter((i) => i?.id)
  const byId = new Map(indicators.map((i) => [i.id, i]))
  let stale = 0

  const rows = []
  /** @param {any} row a builder's answer: a row, `'stale'` or null */
  const push = (row) => {
    if (row === 'stale') stale++
    else if (row && !rows.some((r) => r.id === row.id)) rows.push(row)
  }

  // Ambiguous mentions are deliberately dropped rather than defaulted. The
  // entity stage resolves `rupee` and `pound` with a Haiku call it is already
  // making; guessing here would put a Pakistani rupee level in front of a
  // writer covering Delhi, and a wrong number in an article is far worse than
  // an absent one.
  const { resolved } = extractEntities(text)
  const straits = []
  const exchanges = []
  for (const e of resolved) {
    if (e.indicatorId.startsWith('cp:')) straits.push(e.indicatorId)
    else if (e.indicatorId.startsWith('mkt:')) exchanges.push(e.indicatorId)
    else push(seriesRow(byId.get(e.indicatorId), { now, asOf: trends?.asOf }))
  }

  for (const id of straits) push(straitRow(chokepoints.find((x) => `cp:${x.id}` === id), { now }))

  // One contract at most: the best-scoring, the snapshot's own order breaking
  // ties (it ranks incumbents and waterway questions first).
  let best = null
  for (const ind of indicators) {
    if (ind.source !== 'polymarket' || !Array.isArray(ind.values) || !ind.values.length) continue
    if (closingSoon(ind, now)) continue
    const score = oddsScore(ind, text, lower)
    if (score > 0 && (!best || score > best.score)) best = { ind, score }
  }
  if (best) push(oddsRow(best.ind, { now }))

  for (const id of exchanges) push(exchangeRow(markets.find((x) => `mkt:${x.id}` === id), { now }))

  // Everything above is in match order, and a contract is capped at one — so
  // the cap below cuts exchanges first and contracts never crowd out a price.
  const offered = rows.slice(0, MAX_ROWS)

  const today = new Date(now).toISOString().slice(0, 10)
  const horizon = new Date(now + CALENDAR_DAYS * DAY).toISOString().slice(0, 10)
  const calendar = (trends?.events || [])
    .filter((e) => e?.date && e.date >= today && e.date <= horizon)
    .filter((e) => {
      const tags = (e.topicTags || []).map((t) => String(t).toLowerCase())
      if (tags.some((t) => !EVENT_GENERIC_TAGS.has(t) && hasKey(t, text, lower))) return true
      return (
        tags.some((t) => EVENT_GENERIC_TAGS.has(t) && hasKey(t, text, lower)) &&
        (e.countryTags || []).some((cc) => namesCountry(cc, lower))
      )
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_CALENDAR)
    .map((e) => ({ title: e.title, institution: e.institution, date: e.date }))

  return { indicators: offered, calendar, stale }
}

// ── The chart a written article carries ────────────────────────────────────

/**
 * Whether an article's `chart:` stands, or the reason it is dropped.
 *
 * The chart desk writes it and names only an id it built a row for, so this
 * is the check on what reaches the build by any other road: a hand-written
 * article, a writer that set one from habit. The id must be one the cycle
 * publishes a series for.
 *
 * Returns `null` when the chart stands.
 *
 * @param {string} id
 * @param {{ known?: Set<string> }} ctx
 */
export function chartProblem(id, { known = new Set() } = {}) {
  if (typeof id !== 'string' || !id.trim()) return 'empty'
  return known.has(id) ? null : `"${id}" is not a known series`
}

/**
 * How many of these articles cite each id's level: `{ id: n }`, which the
 * stage puts on the offered rows as `carried`. An article counts for an id when it names the instrument
 * (`entities[]`, or its `chart`) and prints the level, to half a per cent:
 * tighter than `citesFigure`, which is asked about one row's own article.
 *
 * @param {{ meta: any, body: string }[]} articles the last days' articles
 * @param {{ id: string, level: number | null }[]} rows one row an id, as the builders above give them
 * @returns {Record<string, number>}
 */
export function carriedLevels(articles, rows) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const row of rows) {
    if (!Number.isFinite(row.level)) continue
    const n = articles.filter(({ meta, body }) => {
      const names =
        meta?.chart === row.id || (Array.isArray(meta?.entities) && meta.entities.some((e) => e?.indicatorId === row.id))
      return names && numbersIn(body).some((n) => Math.abs(n - Math.abs(row.level)) <= Math.max(Math.abs(n) * 0.005, 0.05))
    }).length
    if (n > 0) out[row.id] = n
  }
  return out
}

/** The numbers a body prints, read as a reader would: link markup costs its label. */
function numbersIn(body) {
  return (String(body).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map((s) => Number(s.replace(/,/g, '')))
    .filter(Number.isFinite)
}

/** The figures a row offers, for the cite check. */
const rowFigures = (row) =>
  [row.level, row.normal, row.vsNormalPct, row.recent?.pct, row.wider?.pct, row.recent?.points, row.wider?.points]
    .filter(Number.isFinite)
    .map(Math.abs)

/**
 * Whether the body quotes one of the row's figures — within 5%, the same
 * proportional tolerance `validateNumbers` (lib/grounding.js) allows, so
 * `$88.9` cites a level of 88.90 and `53%` a change of −53.
 *
 * A measurement, never a gate: under the "subject decides" rule a chart is
 * allowed to carry a number the prose leaves out.
 */
export function citesFigure(body, row) {
  const figures = rowFigures(row)
  return numbersIn(body).some((n) => figures.some((f) => Math.abs(f - n) <= Math.max(Math.abs(n) * 0.05, 0.05)))
}
