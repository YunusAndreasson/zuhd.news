// The weekly editorial-quality scan: what a week of articles measures against
// the rules in write-prompt.md and check-prompt.md.
//
// This was `scripts/measure-quality.js`, which read the corpus and computed
// every metric at its top level. As a function of the week's articles and a
// moment, a metric can be tested for what it counts.
//
// The snapshot goes onto an append-only series the dashboard plots and the
// tuner reads, so every metric's pattern is moved exactly as it stood.

import { ARTICLE_CEILING, stripDateline, visibleText } from './article.js'
import { splitBlocks } from './blocks.js'
import { parseFrontmatter } from './frontmatter.js'
import { hookOf, titleEcho } from './title-echo.js'

export const WINDOW_DAYS = 7

// Bump when a metric changes DEFINITION, so a step in an append-only series is
// legible as a redefinition rather than read as a quality win. Schema 2
// (2026-08-30): acronymViolations moved from the raw body to the visible prose,
// which drops it ~365 → ~92 by excluding `[Iran](country:IR)` link targets.
// Snapshots without `schema` are schema 1 and are not comparable on that metric.
// Schema 3 (2026-09-20): the length budget rose to 480/560 and the body gained
// an optional 5th block, so charOver350Pct, charOver400Pct and wordInRangePct all
// changed definition in the same cycle. A step across that boundary is a
// redefinition, not a quality move.
// Schema 4 (2026-10-09): titleEchoRatePct is the editor's own flag
// (`lib/title-echo.js`): a hook that repeats two thirds of its title's words,
// stemmed and without the filler, and brings no figure the title lacks. It was
// half the title's words of three letters or more, "the" among them, whatever
// the hook added. On the week to 2026-10-04 the two read 48.2% and 18.2% of
// the same 390 articles: the step down is the definition.
export const SCHEMA = 4

/**
 * @typedef {object} QualityRow
 * @property {string} file
 * @property {string} title
 * @property {string} body
 * @property {string} location the dateline city, which the body opens with
 * @property {string} category
 * @property {string[]} sourceNames
 * @property {string[]} sourceCountries `'null'` for a source with no country
 */

/**
 * An article as the scan reads it, or null when it is not in the window: no
 * date, a date that is not one, or one before the cutoff. It throws on a file
 * whose frontmatter does not parse, and the caller leaves that one out.
 *
 * Until 2026-10-09 this read the frontmatter with patterns that expected
 * every value in double quotes, and an article whose `date:` was written
 * without them was left out without a word: two of the corpus's 11,207.
 *
 * @param {string} file
 * @param {string} raw
 * @param {number} cutoff only an article dated at or after this is kept
 * @returns {QualityRow | null}
 */
export function qualityRow(file, raw, cutoff) {
  const { meta, body } = parseFrontmatter(raw)
  const ts = meta.date instanceof Date ? meta.date.getTime() : Date.parse(String(meta.date ?? ''))
  if (Number.isNaN(ts) || ts < cutoff) return null

  const sources = (Array.isArray(meta.sources) ? meta.sources : []).filter((s) => s && typeof s === 'object')
  return {
    file,
    title: String(meta.title ?? ''),
    body,
    location: String(meta.location ?? ''),
    category: String(meta.category ?? ''),
    sourceNames: sources.map((s) => String(s.name ?? '')).filter(Boolean),
    // A source with `country: null` is the hygiene count's whole subject.
    sourceCountries: sources.filter((s) => 'country' in s).map((s) => (s.country === null ? 'null' : String(s.country))),
  }
}

// ── The detectors ───────────────────────────────────────────
const PASSIVE_RE = /^[A-Z][\w\s',.-]{0,40}\s+(was|were)\s+\w+(ed|en)\b/

// Visible length matches the editor rule: link markup ([Iran](country:IR)) doesn't
// count against the budget. 480 is the soft target (informational, kept on the raw
// basis for trend continuity); 560 is the hard ceiling (actionable), and is
// `ARTICLE_CEILING`. The metric KEYS still say 350/400: they are an append-only
// series the dashboard plots by key, so they are named for the thresholds they
// were born with, not the ones they carry. Read `schema` for what a number means.
//   schema 1: 350 / 400, three blocks, 40-55 words
//   schema 2: 360 / 440, four blocks, 48-60 words
//   schema 3: 480 / 560, four blocks plus an optional counterpoint-or-quote,
//             52-75 words — see write-prompt.md <rhythm>.
const TARGET_MAX = 480
// One window across both shapes: four blocks run 52-66 words and five run
// 62-75, and which shape an article takes is the writer's call on the
// sources, not a quality signal. A single 52-75 band measures what it is
// for — a body that overshot or came up empty — without reading a legitimate
// four-block article as out of range.
const WORD_BAND_MIN = 52
const WORD_BAND_MAX = 75

const CAUSAL_PATTERNS = [
  /\bgave\s+\S+\s+cover\b/i,
  /\bgains?\s+credibility\b/i,
  /\bgap\s+widens?\s+with\b/i,
  /\baddresses?\s+the\s+wrong\b/i,
  /\bsingle\s+point\s+of\s+failure\b/i,
]
const PRESS_PATTERNS = [
  /\bat\s+press\s+time\b/i,
  /\bthis\s+(morning|afternoon|evening|week)\b/i,
]
const HEDGE_PATTERNS = [
  /\b(could\s+reshape|may\s+signal|is\s+poised\s+to|raising\s+questions)\b/i,
  /\bsignificant(ly)?\b/i,
  /\bamid\b/i,
]
// Strict: only the prompt whitelist + AI (universally understood) pass.
const WHITELIST = new Set(['US', 'UK', 'EU', 'UN', 'WHO', 'NATO', 'ISIS', 'IDF', 'IMF', 'ICC', 'ICJ', 'AI'])

/**
 * What the detectors say of one article: the per-article half of every
 * rule-based measure, in one place. `qualitySnapshot` sums them over a week;
 * a per-cycle scorer can sum them over a batch, and that is what the argument
 * is shaped for. It takes only what it reads, so a caller with an article
 * record of its own can pass it as it is: a title, the body (the prose under
 * the frontmatter, trimmed, dateline and link markup included), the
 * frontmatter `location`, and the sources' names.
 *
 * The RVS scorer (`autoresearch/score.js`) carried a copy of six of these,
 * regex for regex. For its writing cluster: brevity is `!overCeiling` and
 * `wordInRange`, voice is `passiveHook`, `hedge`, `pressEra` and `titleEcho`;
 * for its sourcing cluster, `multiSource`.
 *
 * `wordBandMax` is the one threshold a caller sets. The word count is the
 * body's as written, so it includes the dateline and its dash, and the budget
 * in write-prompt.md is for the prose. The weekly series has always counted
 * to 75 and stays there; the scorer has counted to 78 since 2026-09-20, for
 * "the 1-3 word dateline this count includes", and calls with
 * `{ wordBandMax: 78 }`. On the 403 articles filed from 2026-10-02 to 10-09,
 * 54% fall in 52-75 and another 15% in 76-78.
 *
 * @param {{ title: string, body: string, location?: string, sourceNames: string[] }} a
 * @param {{ wordBandMax?: number }} [opts]
 */
export function articleFlags(a, { wordBandMax = WORD_BAND_MAX } = {}) {
  const charLength = a.body.length
  const visibleLength = visibleText(a.body).length
  const wordCount = a.body.split(/\s+/).filter(Boolean).length
  // The body without its dateline, by the location (`stripDateline`). This cut
  // at the first em dash wherever it stood, so a body with no dateline and a
  // dash further down lost everything before the dash, its hook included.
  const sentences = stripDateline(a.body, a.location).split(/\.\s+/)
  return {
    // ── Character and word length ──
    /** As written, link markup included: what `charLengthAvg` and the soft target are measured on. */
    charLength,
    /** As the reader sees it: what the ceiling is measured on. */
    visibleLength,
    wordCount,
    overTarget: charLength > TARGET_MAX,
    overCeiling: visibleLength > ARTICLE_CEILING,
    wordInRange: wordCount >= WORD_BAND_MIN && wordCount <= wordBandMax,
    // Block count: how often the optional counterpoint-or-quote block is earned. Not
    // a target — a four-block article is a complete article — but a rate near 0 means
    // the writer stopped reaching for it, and a rate near 100 means it is being
    // filled rather than earned.
    blockCount: splitBlocks(a.body).filter((b) => b.length > 5).length,
    // ── Title echo ──
    // The hook says the title again: the measure the editor is shown each cycle
    // (`titleEcho`, `lib/title-echo.js`, and why it is that measure). One
    // instrument, so the week's rate is the rate of what the editor was asked to
    // look at. Until schema 4 this was a test of its own, at half the words.
    titleEcho: titleEcho(a.title, hookOf(a.body, a.location)).echo,
    // ── Passive voice, in the hook ──
    // First sentence starts with noun-ish + was/were + past-participle.
    // Noisy; calibrate against first weeks of data.
    passiveHook: PASSIVE_RE.test(sentences[0]),
    // ── Passive voice, anywhere ──
    // Same pattern, scanned across every sentence — the "active voice everywhere"
    // rule in write-prompt.md/check-prompt.md covers the whole body, not just the hook.
    passiveBody: sentences.some((sentence) => PASSIVE_RE.test(sentence)),
    // ── Semicolons ──
    // write-prompt.md/check-prompt.md ban semicolons — a semicolon joining two
    // clauses is two ideas that should be two sentences.
    semicolon: a.body.includes(';'),
    // ── Causal claims, press-era phrases, hedge and filler vocabulary ──
    causalClaim: CAUSAL_PATTERNS.some((p) => p.test(a.body)),
    pressEra: PRESS_PATTERNS.some((p) => p.test(a.body)),
    hedge: HEDGE_PATTERNS.some((p) => p.test(a.body)),
    // ── More than one source ──
    multiSource: a.sourceNames.length >= 2,
  }
}

/** @typedef {ReturnType<typeof articleFlags>} ArticleFlags */

/**
 * The week's snapshot. Every metric maps to a rule in write-prompt.md or
 * check-prompt.md.
 *
 * @param {QualityRow[]} articles the articles in the window
 * @param {number} now the snapshot is filed under this moment's date
 */
export function qualitySnapshot(articles, now) {
  // ── Metrics 1 to 6 and 10: what the detectors say of each article ──
  const flags = articles.map((a) => articleFlags(a))
  /** How many articles a detector fired on. @param {keyof ArticleFlags} key */
  const hits = (key) => flags.filter((f) => f[key]).length

  // ── Metric 7: acronym violations ───────────────────────────
  // Measured on the *visible* prose, not the source. Country markup is written
  // `[Iran](country:IR)`, so scanning the raw body counted every link target as an
  // unexpanded acronym: the top five violators were CN, PK, RU, IN, IR — ISO codes
  // no reader ever sees — and 1,186 such links across the August corpus were
  // inflating a metric the tuning stage reads as a writing fault. `visibleText` is
  // the same `$1` substitution the visible length is measured with.
  /** @type {Map<string, number>} */
  const acronymTally = new Map()
  for (const a of articles) {
    const tokens = [...visibleText(a.body).matchAll(/\b[A-Z]{2,5}\b/g)].map((m) => m[0])
    for (const t of tokens) if (!WHITELIST.has(t)) acronymTally.set(t, (acronymTally.get(t) || 0) + 1)
  }
  const acronymViolations = [...acronymTally.values()].reduce((a, b) => a + b, 0)
  const topAcronymViolators = [...acronymTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  // ── Metric 8: country:null (data hygiene) ─────────────────
  let countryNullCount = 0
  for (const a of articles) for (const c of a.sourceCountries) if (c === 'null') countryNullCount++

  // ── Metric 9: source concentration ────────────────────────
  /** @type {Map<string, number>} */
  const outletCounts = new Map()
  for (const a of articles) for (const n of a.sourceNames) outletCounts.set(n, (outletCounts.get(n) || 0) + 1)
  const totalSources = [...outletCounts.values()].reduce((a, b) => a + b, 0)
  const sortedOutlets = [...outletCounts.entries()].sort((a, b) => b[1] - a[1])
  const top3 = sortedOutlets.slice(0, 3).reduce((sum, [, v]) => sum + v, 0)

  // ── Metric 11: category balance ───────────────────────────
  /** @type {Record<string, number>} */
  const catCounts = {}
  for (const a of articles) catCounts[a.category] = (catCounts[a.category] || 0) + 1

  // ── Assemble snapshot ─────────────────────────────────────
  /** @param {number} n @param {number} d */
  const pct = (n, d) => +((d ? n / d : 0) * 100).toFixed(1)
  /** @param {number[]} arr */
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0)
  const blockCounts = flags.map((f) => f.blockCount)

  return {
    week: new Date(now).toISOString().slice(0, 10),
    schema: SCHEMA,
    windowDays: WINDOW_DAYS,
    articleCount: articles.length,
    metrics: {
      charLengthAvg: avg(flags.map((f) => f.charLength)),
      charOver350Pct: pct(hits('overTarget'), articles.length),
      charOver400Pct: pct(hits('overCeiling'), articles.length),
      wordCountAvg: avg(flags.map((f) => f.wordCount)),
      wordInRangePct: pct(hits('wordInRange'), articles.length),
      blockCountAvg: +(blockCounts.reduce((a, b) => a + b, 0) / (blockCounts.length || 1)).toFixed(2),
      fiveBlockRatePct: pct(blockCounts.filter((b) => b >= 5).length, articles.length),
      titleEchoRatePct: pct(hits('titleEcho'), articles.length),
      passiveHookRatePct: pct(hits('passiveHook'), articles.length),
      passiveBodyRatePct: pct(hits('passiveBody'), articles.length),
      semicolonRatePct: pct(hits('semicolon'), articles.length),
      causalClaimHits: hits('causalClaim'),
      pressEraHits: hits('pressEra'),
      hedgeRatePct: pct(hits('hedge'), articles.length),
      acronymViolations,
      topAcronymViolators,
      countryNullCount,
      topOutletSharePct: pct(top3, totalSources),
      top3Outlets: sortedOutlets.slice(0, 3).map(([name, count]) => ({ name, count })),
      multiSourceRatePct: pct(hits('multiSource'), articles.length),
      categoryBalance: catCounts,
    },
  }
}

/** @typedef {ReturnType<typeof qualitySnapshot>} QualitySnapshot */

/**
 * The series with this snapshot on the end, in place of any other for the
 * same day (a rerun replaces its own entry), and no longer than a year.
 *
 * @param {{ week: string }[]} trend
 * @param {QualitySnapshot} snapshot
 */
export function withSnapshot(trend, snapshot) {
  const next = trend.filter((t) => t.week !== snapshot.week)
  next.push(snapshot)
  return next.length > 52 ? next.slice(-52) : next
}

/**
 * The lines the stage prints.
 *
 * @param {QualitySnapshot} snapshot
 */
export function qualitySummary(snapshot) {
  const m = snapshot.metrics
  return [
    `Quality metrics: ${snapshot.articleCount} articles in last ${WINDOW_DAYS}d`,
    `  length: charAvg=${m.charLengthAvg} over480=${m.charOver350Pct}% over560=${m.charOver400Pct}%  wordAvg=${m.wordCountAvg} inRange=${m.wordInRangePct}%`,
    `  shape:  blockAvg=${m.blockCountAvg} fiveBlock=${m.fiveBlockRatePct}%`,
    `  style:  titleEcho=${m.titleEchoRatePct}% passiveHook=${m.passiveHookRatePct}% passiveBody=${m.passiveBodyRatePct}% semicolon=${m.semicolonRatePct}% hedge=${m.hedgeRatePct}%`,
    `  rules:  causal=${m.causalClaimHits} pressEra=${m.pressEraHits} acronymViol=${m.acronymViolations} countryNull=${m.countryNullCount}`,
    `  source: top3Share=${m.topOutletSharePct}% multiSrc=${m.multiSourceRatePct}%`,
  ]
}
