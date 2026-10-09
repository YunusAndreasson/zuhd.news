// The Reader Value Score of one cycle's batch: the record each cycle appends
// to `content/.rvs-trend.json`, which the dashboard draws.
//
// Three clusters, each 0 to 100, from the articles alone: how they are
// written, how they are sourced, what they cover. No model is asked, so a
// cycle's score costs nothing.
//
// This was the deterministic half of `scripts/autoresearch/score.js`, the
// scorer of a replay harness, and the cycle ran it through the harness's
// entry point: every cycle parsed the 16 MB `content/.context-briefs.json` to
// find no brief for its batch (`briefCount` was 0 in all 365 records), scored
// a briefing cluster and a picking cluster it then wrote down as `null`, and
// looked for a log under a name no log has. Here is what the record is made
// from, and nothing else.

import { existsSync } from 'node:fs'
import { ARTICLE_CEILING, tryReadArticle, visibleText } from './article.js'
import { CATEGORY_FLOORS, FLOORS_MAY_GO_UNMET } from './dedup.js'
import { readJson, writeJson } from './json-file.js'
import { REGION_CODES, regionFromCoords } from './regions.js'

/**
 * The record's `schema`. A reader comparing two records checks it first.
 *   1: five clusters, briefing among them
 *   2: 2026-07-03, writing, sourcing and coverage only (the context briefs
 *      had stopped on 06-19, and the cluster dragged every score to ~50)
 *   3: 2026-10-09, freshness is measured. It was 1.0 in every record before,
 *      so coverage reads up to 40 points lower from here, and the score 12
 */
export const SCHEMA = 3

/**
 * What good coverage is, as a judgement: the share of a batch each region
 * should hold, and a floor for the share that falls in the ummah-weighted
 * regions (the Middle East, Asia, Africa). The coverage cluster is scored by
 * how far a batch sits from it. Change the numbers to change what the score
 * rewards; the scorer does not move.
 *
 * Regions are `lib/regions.js`'s: ME, AS, AF, EU, AM, OC, and GL for a
 * dateline in none of them.
 */
export const TARGET_BALANCE = {
  regions: { ME: 0.25, AS: 0.25, AF: 0.1, EU: 0.15, AM: 0.15, OC: 0.02, GL: 0.08 },
  ummahWeightedRegions: ['ME', 'AS', 'AF'],
  ummahFloor: 0.5,
}

/**
 * How much of the score each cluster is. They were 0.20, 0.15 and 0.15 of a
 * five-cluster score; the other half (picking, briefing) is not scored in a
 * cycle, so these three are scaled to sum to 1.
 */
const WEIGHTS = { writing: 0.2 / 0.5, sourcing: 0.15 / 0.5, coverage: 0.15 / 0.5 }

/** The trend keeps this many records: about 73 days at five cycles a day. */
const KEEP = 365

/**
 * @typedef {object} RvsRow
 * @property {string} slug
 * @property {string} title
 * @property {string} category
 * @property {string} body
 * @property {number | null} lat
 * @property {number | null} lng
 * @property {number} date when the story was published at its source, in ms; `NaN` for a `date` that is not one
 * @property {string[]} sourceNames
 * @property {string[]} sourceCountries `'null'` for a source with no country
 */

/**
 * An article as the scorer reads it.
 *
 * Until 2026-10-09 this was a reader of its own with a pattern a field, each
 * expecting its value in double quotes: an article whose `category:` was
 * written without them (two of the 2,224 from September and October) read as
 * having none, failed the "missing fields" guardrail and counted towards no
 * category floor.
 *
 * @param {import('./article.js').Article} article
 * @returns {RvsRow}
 */
export function rvsRow({ slug, meta, body }) {
  const sources = (Array.isArray(meta.sources) ? meta.sources : []).filter((s) => s && typeof s === 'object')
  /** @param {unknown} v */
  const coordinate = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  // YAML reads a `date:` written without quotes as a date, not a string.
  const date = /** @type {unknown} */ (meta.date)
  return {
    slug,
    title: String(meta.title ?? ''),
    category: String(meta.category ?? ''),
    body,
    lat: coordinate(meta.lat),
    lng: coordinate(meta.lng),
    date: date instanceof Date ? date.getTime() : Date.parse(String(date ?? '')),
    sourceNames: sources.map((s) => String(s.name ?? '')).filter(Boolean),
    // As `lib/quality-metrics.js` reads them: a source with `country: null` is
    // what the guardrail below is for.
    sourceCountries: sources.filter((s) => 'country' in s).map((s) => (s.country === null ? 'null' : String(s.country))),
  }
}

/**
 * The batch, read. A file that is not there or does not parse is left out:
 * the validator has moved a quarantined article aside by the time a cycle is
 * scored, and the list still names it.
 *
 * @param {{ path: string }[]} files as `batchFiles()` (`lib/article-files.js`) returns them
 * @returns {RvsRow[]}
 */
export function readBatch(files) {
  const rows = []
  for (const { path } of files) {
    if (!path.endsWith('.md')) continue
    const { article } = tryReadArticle(path)
    if (article) rows.push(rvsRow(article))
  }
  return rows
}

/** @param {number} x */
const clamp01 = (x) => Math.max(0, Math.min(1, x))

/** @param {string} s */
const meaningfulWords = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)

/**
 * What one article does and does not do, by the rules in `write-prompt.md`.
 *
 * These are the weekly scan's detectors (`lib/quality-metrics.js`), written
 * out a second time, and the two are to become one. Until they are: the word
 * band here ends at 78, three past the prompt's 75, because the count takes
 * in the one to three words of the dateline.
 *
 * @param {Pick<RvsRow, 'title' | 'body' | 'sourceNames'>} article
 */
export function flagsOf({ title, body, sourceNames }) {
  const charLen = visibleText(body).length
  const wordCount = body.split(/\s+/).filter(Boolean).length
  const hook = body.replace(/^[^—]+—\s*/, '').split(/\.\s+/)[0] || ''
  const titleWords = new Set(meaningfulWords(title))
  const hookWords = meaningfulWords(hook)
  return {
    charLen,
    wordCount,
    charInRange: charLen <= ARTICLE_CEILING,
    wordInRange: wordCount >= 52 && wordCount <= 78,
    passive: /^[A-Z][\w\s',.-]{0,40}\s+(was|were)\s+\w+(ed|en)\b/.test(hook),
    hedge: /\b(could\s+reshape|may\s+signal|is\s+poised\s+to|raising\s+questions|significant(ly)?|amid)\b/i.test(body),
    pressEra: /\b(at\s+press\s+time|this\s+(morning|afternoon|evening|week))\b/i.test(body),
    // The hook holds half or more of the title's words.
    titleEcho: titleWords.size > 0 && hookWords.length > 0 && hookWords.filter((w) => titleWords.has(w)).length / titleWords.size >= 0.5,
    multiSource: sourceNames.length >= 2,
  }
}

// ── Guardrails ───────────────────────────────────────────────────────

/**
 * What is wrong with the batch as a whole, as the record's
 * `guardrailFailures`: one phrase a failure, none when nothing is.
 *
 * The category floors are the selector's own (`lib/dedup.js`), imported so
 * the two cannot part again: this copy once said tech 2 while the selector's
 * said 3.
 *
 * @param {RvsRow[]} articles
 * @returns {string[]}
 */
export function checkGuardrails(articles) {
  const failures = []
  for (const a of articles) {
    if (!a.title || !a.category || !a.body || a.body.length < 50) failures.push(`article ${a.slug} missing fields or body too short`)
    if (a.sourceCountries.includes('null')) failures.push(`article ${a.slug} has source with country:null`)
  }
  if (articles.length < 8) failures.push(`publish count ${articles.length} below floor 8`)
  /** @type {Record<string, number>} */
  const perCategory = {}
  for (const a of articles) perCategory[a.category] = (perCategory[a.category] || 0) + 1
  for (const [category, floor] of Object.entries(CATEGORY_FLOORS)) {
    if (FLOORS_MAY_GO_UNMET.has(category)) continue
    const got = perCategory[category] || 0
    if (got < floor) failures.push(`category ${category} below floor ${floor} (got ${got})`)
  }
  return failures
}

// ── Writing: brevity and voice ───────────────────────────────────────

/**
 * Half for brevity (inside the ceiling, inside the word band), half for
 * voice. Two voice faults in every article cost the whole voice half.
 *
 * @param {RvsRow[]} articles
 */
export function scoreWriting(articles) {
  if (articles.length === 0) return { score: 0, detail: { reason: 'no articles' } }
  const flags = articles.map(flagsOf)
  /** @param {'charInRange' | 'wordInRange' | 'passive' | 'hedge' | 'pressEra' | 'titleEcho'} flag */
  const rate = (flag) => flags.filter((f) => f[flag]).length / articles.length
  const [charInRange, wordInRange] = [rate('charInRange'), rate('wordInRange')]
  const [passive, hedge, pressEra, titleEcho] = [rate('passive'), rate('hedge'), rate('pressEra'), rate('titleEcho')]
  const brevity = ((charInRange + wordInRange) / 2) * 50
  const voice = (1 - clamp01((passive + hedge + pressEra + titleEcho) / 2)) * 50
  return { score: brevity + voice, detail: { brevity, voice, charInRange, wordInRange, passive, hedge, pressEra, titleEcho } }
}

// ── Sourcing: more than one source, and not always the same three ────

/**
 * Sixty for the share of articles with two sources or more, forty for how
 * little of the batch's sourcing its three most-cited outlets hold.
 *
 * @param {RvsRow[]} articles
 */
export function scoreSourcing(articles) {
  if (articles.length === 0) return { score: 0, detail: { reason: 'no articles' } }
  const cited = articles.flatMap((a) => a.sourceNames)
  /** @type {Map<string, number>} */
  const perOutlet = new Map()
  for (const name of cited) perOutlet.set(name, (perOutlet.get(name) || 0) + 1)
  const top3 = [...perOutlet.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0)
  const top3Share = cited.length ? top3 / cited.length : 0
  const multiSourceRate = articles.filter((a) => flagsOf(a).multiSource).length / articles.length
  return { score: multiSourceRate * 60 + (1 - top3Share) * 40, detail: { multiSourceRate, top3Share, uniqueOutlets: perOutlet.size } }
}

// ── Coverage: where the batch is, against where it should be ─────────

/**
 * The region an article is about: its own coordinates, which say where the
 * story is, before its first source's country, which says where the outlet
 * is. `GL` when neither places it.
 *
 * @param {RvsRow} article
 */
function regionOf(article) {
  const byDateline = regionFromCoords(article.lat, article.lng)
  if (byDateline) return byDateline
  const country = article.sourceCountries.find((c) => c && c !== 'null')
  for (const [region, codes] of Object.entries(REGION_CODES)) if (country && codes.includes(country)) return region
  return 'GL'
}

/**
 * How old the batch's stories were when the cycle began, as the median of
 * their ages in days: an article's `date` is its source's publication time.
 * A story dated after the start is new, not from the future.
 *
 * @param {RvsRow[]} articles
 * @param {number} runStarted ms
 * @returns {number | null} null when no article carries a date
 */
function medianAgeDays(articles, runStarted) {
  const ages = articles
    .filter((a) => !Number.isNaN(a.date))
    .map((a) => Math.max(0, (runStarted - a.date) / 86_400_000))
    .sort((a, b) => a - b)
  return ages.length ? ages[Math.floor(ages.length / 2)] : null
}

/**
 * Forty for freshness, thirty for how closely the batch's regions follow
 * `TARGET_BALANCE` (e to the minus KL divergence: 1 on a match, falling
 * away), thirty for the share that falls in the floor's regions.
 *
 * Freshness is 1 for a batch published the hour it broke, a half at a day
 * old, a quarter at three. Until schema 3 it was 1 in every record: it took
 * the age from two frontmatter keys (`sourcePubDate`, `pubDate`) that no
 * article has ever carried, and a batch with no measurable age was scored as
 * one with none. A batch that carries no date now earns nothing for it.
 *
 * @param {RvsRow[]} articles
 * @param {number} [runStarted] when the cycle began, in ms; now when absent
 */
export function scoreCoverage(articles, runStarted = Date.now()) {
  if (articles.length === 0) return { score: 0, detail: { reason: 'no articles' } }
  const medianAge = medianAgeDays(articles, runStarted)
  const freshness = medianAge === null ? 0 : 1 / (1 + medianAge)

  /** @type {Record<string, number>} */
  const observedRegions = {}
  for (const region of articles.map(regionOf)) observedRegions[region] = (observedRegions[region] || 0) + 1
  for (const region of Object.keys(observedRegions)) observedRegions[region] /= articles.length

  let klRegion = 0
  for (const [region, target] of Object.entries(TARGET_BALANCE.regions)) {
    const p = (observedRegions[region] || 0) + 1e-9
    klRegion += p * Math.log(p / (target + 1e-9))
  }
  const regionFit = Math.exp(-klRegion)

  const ummahShare = TARGET_BALANCE.ummahWeightedRegions.reduce((sum, region) => sum + (observedRegions[region] || 0), 0)
  const ummahMet = ummahShare >= TARGET_BALANCE.ummahFloor ? 1 : ummahShare / TARGET_BALANCE.ummahFloor

  return { score: freshness * 40 + regionFit * 30 + ummahMet * 30, detail: { medianAgeDays: medianAge, freshness, klRegion, regionFit, ummahShare, ummahMet, observedRegions } }
}

// ── The record ───────────────────────────────────────────────────────

/** @param {number} x */
const round2 = (x) => Math.round(x * 100) / 100

/**
 * One cycle's line in the trend.
 *
 * `picking` and `briefing` are null and `briefCount` is 0: no cycle scores
 * them, and the keys stay because the series has carried them since its
 * first record and the dashboard prints them. `degenerate` marks a batch too
 * small to mean much (the 2026-04-30 22:00 cycle shipped one article and
 * moved the series' deviation by a quarter), for a reader to leave out.
 *
 * `runId` is the cycle's own id (`2026-10-09_0501`), the key of its record
 * in `logs/cycles.jsonl` and the name of its log. `cycleId` never was: it is
 * the minute the cycle was scored, a quarter of an hour or more after the
 * start, so the two series could not be joined.
 *
 * @param {RvsRow[]} articles
 * @param {{ now?: Date, runStarted?: number, runId?: string | null }} [known] `now` is when the cycle was scored;
 *   `runStarted` when it began, in ms, which is what a story's age is taken against (`now` when it is not known)
 */
export function rvsRecord(articles, { now = new Date(), runStarted = now.getTime(), runId = null } = {}) {
  const clusters = { writing: scoreWriting(articles).score, sourcing: scoreSourcing(articles).score, coverage: scoreCoverage(articles, runStarted).score }
  const rvs = clusters.writing * WEIGHTS.writing + clusters.sourcing * WEIGHTS.sourcing + clusters.coverage * WEIGHTS.coverage
  const ts = now.toISOString()
  return {
    ts,
    // The minute it was scored, `2026-10-09T05-15`.
    cycleId: `${ts.slice(0, 13)}-${ts.slice(14, 16)}`,
    runId,
    cycleHour: ts.slice(11, 13),
    schema: SCHEMA,
    rvs: round2(rvs),
    clusters: {
      picking: null,
      writing: round2(clusters.writing),
      briefing: null,
      sourcing: round2(clusters.sourcing),
      coverage: round2(clusters.coverage),
    },
    articleCount: articles.length,
    briefCount: 0,
    guardrailFailures: checkGuardrails(articles),
    degenerate: articles.length < 4,
  }
}

/**
 * Add a record to the trend file, which keeps its last `KEEP`.
 *
 * A file that is there and does not read as a series is left exactly as it
 * is, and the record is not written. The trend is a history: read leniently,
 * a file with a merge conflict in it came back as `[]`, and the write that
 * followed replaced 365 records with this cycle's one, which the cycle then
 * committed.
 *
 * @param {string} path
 * @param {ReturnType<typeof rvsRecord>} record
 * @returns {boolean} whether the record was written
 */
export function appendRecord(path, record) {
  const trend = existsSync(path) ? readJson(path, null) : []
  if (!Array.isArray(trend)) {
    console.error(`rvs: ${path} is there and is not a series — left as it is, and this cycle's record is not written`)
    return false
  }
  trend.push(record)
  writeJson(path, trend.slice(-KEEP))
  return true
}
