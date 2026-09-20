#!/usr/bin/env node
// Deterministic editorial-quality scan over the last 7 days of articles.
// Outputs:
//   /tmp/zuhd-quality-metrics.json — current snapshot
//   content/.quality-trend.json    — appended snapshot history (dashboard + git)
//
// Every metric maps to a rule in write-prompt.md or check-prompt.md.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { splitBlocks } from './lib/blocks.js'

const ARTICLES_DIR = 'content/articles'
const TREND_PATH = 'content/.quality-trend.json'
const OUT_PATH = '/tmp/zuhd-quality-metrics.json'

const WINDOW_DAYS = 7
const cutoff = Date.now() - WINDOW_DAYS * 86400_000

// ── Load articles in window ─────────────────────────────────
const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'))
const articles = []
for (const f of files) {
  const raw = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fm) continue
  const yaml = fm[1]
  const body = fm[2].trim()
  const dateStr = (yaml.match(/^date:\s*"([^"]+)"/m) || [])[1]
  if (!dateStr) continue
  const ts = Date.parse(dateStr)
  if (Number.isNaN(ts) || ts < cutoff) continue

  const title = (yaml.match(/^title:\s*"([^"]+)"/m) || [])[1] || ''
  const category = (yaml.match(/^category:\s*"([^"]+)"/m) || [])[1] || ''
  const sourceNames = [...yaml.matchAll(/^\s+- name:\s*"([^"]+)"/gm)].map(m => m[1])
  const sourceCountries = [...yaml.matchAll(/^\s+country:\s*"?(null|[A-Z]{2})"?/gm)].map(m => m[1])

  articles.push({ file: f, title, body, category, sourceNames, sourceCountries })
}

if (articles.length === 0) {
  console.error('measure-quality: no articles in window — writing empty snapshot')
}

// ── Helpers ─────────────────────────────────────────────────
const meaningfulWords = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
const afterDateline = body => body.replace(/^[^—]+—\s*/, '')
const hookOf = body => afterDateline(body).split(/\.\s+/)[0]
const sentencesOf = body => afterDateline(body).split(/\.\s+/).filter(Boolean)
const PASSIVE_RE = /^[A-Z][\w\s',.-]{0,40}\s+(was|were)\s+\w+(ed|en)\b/

// ── Metric 1: character & word length ───────────────────────
const charLengths = articles.map(a => a.body.length)
// Visible length matches the editor rule: link markup ([Iran](country:IR)) doesn't
// count against the budget. 480 is the soft target (informational, kept on the raw
// basis for trend continuity); 560 is the hard ceiling (actionable). The metric
// KEYS still say 350/400: they are an append-only series the dashboard plots by
// key, so they are named for the thresholds they were born with, not the ones
// they carry. Read `schema` for what a number means.
//   schema 1: 350 / 400, three blocks, 40-55 words
//   schema 2: 360 / 440, four blocks, 48-60 words
//   schema 3: 480 / 560, four blocks plus an optional counterpoint-or-quote,
//             52-75 words — see write-prompt.md <rhythm>.
const visibleText = s => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const visibleLen = s => visibleText(s).length
const visibleLengths = articles.map(a => visibleLen(a.body))
const wordCounts = articles.map(a => a.body.split(/\s+/).filter(Boolean).length)
// Block count: how often the optional counterpoint-or-quote block is earned. Not
// a target — a four-block article is a complete article — but a rate near 0 means
// the writer stopped reaching for it, and a rate near 100 means it is being
// filled rather than earned.
const blockCounts = articles.map(a => splitBlocks(a.body).filter(b => b.length > 5).length)

// ── Metric 2: title-echo rate ──────────────────────────────
// Hook shares ≥50% of the title's meaningful words.
const echoHits = articles.filter(a => {
  const tw = new Set(meaningfulWords(a.title))
  const hw = meaningfulWords(hookOf(a.body))
  if (tw.size === 0 || hw.length === 0) return false
  return hw.filter(w => tw.has(w)).length / tw.size >= 0.5
}).length

// ── Metric 3: passive-voice hook ───────────────────────────
// First sentence starts with noun-ish + was/were + past-participle.
// Noisy; calibrate against first weeks of data.
const passiveHookHits = articles.filter(a => PASSIVE_RE.test(hookOf(a.body))).length

// ── Metric 3b: passive voice, full body ────────────────────
// Same pattern, scanned across every sentence — the "active voice everywhere"
// rule in write-prompt.md/check-prompt.md covers the whole body, not just the hook.
const passiveBodyHits = articles.filter(a => sentencesOf(a.body).some(s => PASSIVE_RE.test(s))).length

// ── Metric 3c: semicolons ──────────────────────────────────
// write-prompt.md/check-prompt.md ban semicolons — a semicolon joining two
// clauses is two ideas that should be two sentences.
const semicolonHits = articles.filter(a => a.body.includes(';')).length

// ── Metric 4: causal-claim patterns ────────────────────────
const CAUSAL_PATTERNS = [
  /\bgave\s+\S+\s+cover\b/i,
  /\bgains?\s+credibility\b/i,
  /\bgap\s+widens?\s+with\b/i,
  /\baddresses?\s+the\s+wrong\b/i,
  /\bsingle\s+point\s+of\s+failure\b/i,
]
let causalClaimHits = 0
const causalArticles = []
for (const a of articles) {
  for (const p of CAUSAL_PATTERNS) {
    if (p.test(a.body)) { causalClaimHits++; causalArticles.push(a.file); break }
  }
}

// ── Metric 5: press-era phrases ────────────────────────────
const PRESS_PATTERNS = [
  /\bat\s+press\s+time\b/i,
  /\bthis\s+(morning|afternoon|evening|week)\b/i,
]
let pressEraHits = 0
for (const a of articles) {
  for (const p of PRESS_PATTERNS) {
    if (p.test(a.body)) { pressEraHits++; break }
  }
}

// ── Metric 6: hedge / filler vocabulary ────────────────────
const HEDGE_PATTERNS = [
  /\b(could\s+reshape|may\s+signal|is\s+poised\s+to|raising\s+questions)\b/i,
  /\bsignificant(ly)?\b/i,
  /\bamid\b/i,
]
const hedgeArticles = articles.filter(a => HEDGE_PATTERNS.some(p => p.test(a.body))).length

// ── Metric 7: acronym violations ───────────────────────────
// Strict: only the prompt whitelist + AI (universally understood) pass.
const WHITELIST = new Set(['US', 'UK', 'EU', 'UN', 'WHO', 'NATO', 'ISIS', 'IDF', 'IMF', 'ICC', 'ICJ', 'AI'])
// Measured on the *visible* prose, not the source. Country markup is written
// `[Iran](country:IR)`, so scanning the raw body counted every link target as an
// unexpanded acronym: the top five violators were CN, PK, RU, IN, IR — ISO codes
// no reader ever sees — and 1,186 such links across the August corpus were
// inflating a metric the tuning stage reads as a writing fault. `visibleText` is
// the same `$1` substitution `visibleLen` already measures length with.
const acronymTally = new Map()
for (const a of articles) {
  const tokens = [...visibleText(a.body).matchAll(/\b[A-Z]{2,5}\b/g)].map(m => m[0])
  for (const t of tokens) if (!WHITELIST.has(t)) acronymTally.set(t, (acronymTally.get(t) || 0) + 1)
}
const acronymViolations = [...acronymTally.values()].reduce((a, b) => a + b, 0)
const topAcronymViolators = [...acronymTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

// ── Metric 8: country:null (data hygiene) ─────────────────
let countryNullCount = 0
for (const a of articles) for (const c of a.sourceCountries) if (c === 'null') countryNullCount++

// ── Metric 9: source concentration ────────────────────────
const outletCounts = new Map()
for (const a of articles) for (const n of a.sourceNames) outletCounts.set(n, (outletCounts.get(n) || 0) + 1)
const totalSources = [...outletCounts.values()].reduce((a, b) => a + b, 0)
const sortedOutlets = [...outletCounts.entries()].sort((a, b) => b[1] - a[1])
const top3 = sortedOutlets.slice(0, 3).reduce((sum, [, v]) => sum + v, 0)

// ── Metric 10: multi-source rate ──────────────────────────
const multiSourceCount = articles.filter(a => a.sourceNames.length >= 2).length

// ── Metric 11: category balance ───────────────────────────
const catCounts = {}
for (const a of articles) catCounts[a.category] = (catCounts[a.category] || 0) + 1

// ── Assemble snapshot ─────────────────────────────────────
const pct = (n, d) => +((d ? n / d : 0) * 100).toFixed(1)
const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

// Bump when a metric changes DEFINITION, so a step in an append-only series is
// legible as a redefinition rather than read as a quality win. Schema 2
// (2026-08-30): acronymViolations moved from the raw body to the visible prose,
// which drops it ~365 → ~92 by excluding `[Iran](country:IR)` link targets.
// Snapshots without `schema` are schema 1 and are not comparable on that metric.
// Schema 3 (2026-09-20): the length budget rose to 480/560 and the body gained
// an optional 5th block, so charOver350Pct, charOver400Pct and wordInRangePct all
// changed definition in the same cycle. A step across that boundary is a
// redefinition, not a quality move.
const SCHEMA = 3

const snapshot = {
  week: new Date().toISOString().slice(0, 10),
  schema: SCHEMA,
  windowDays: WINDOW_DAYS,
  articleCount: articles.length,
  metrics: {
    charLengthAvg: avg(charLengths),
    charOver350Pct: pct(charLengths.filter(c => c > 480).length, articles.length),
    charOver400Pct: pct(visibleLengths.filter(c => c > 560).length, articles.length),
    wordCountAvg: avg(wordCounts),
    // One window across both shapes: four blocks run 52-66 words and five run
    // 62-75, and which shape an article takes is the writer's call on the
    // sources, not a quality signal. A single 52-75 band measures what it is
    // for — a body that overshot or came up empty — without reading a legitimate
    // four-block article as out of range.
    wordInRangePct: pct(wordCounts.filter(w => w >= 52 && w <= 75).length, articles.length),
    blockCountAvg: +(blockCounts.reduce((a, b) => a + b, 0) / (blockCounts.length || 1)).toFixed(2),
    fiveBlockRatePct: pct(blockCounts.filter(b => b >= 5).length, articles.length),
    titleEchoRatePct: pct(echoHits, articles.length),
    passiveHookRatePct: pct(passiveHookHits, articles.length),
    passiveBodyRatePct: pct(passiveBodyHits, articles.length),
    semicolonRatePct: pct(semicolonHits, articles.length),
    causalClaimHits,
    pressEraHits,
    hedgeRatePct: pct(hedgeArticles, articles.length),
    acronymViolations,
    topAcronymViolators,
    countryNullCount,
    topOutletSharePct: pct(top3, totalSources),
    top3Outlets: sortedOutlets.slice(0, 3).map(([name, count]) => ({ name, count })),
    multiSourceRatePct: pct(multiSourceCount, articles.length),
    categoryBalance: catCounts,
  },
}

writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2))

// ── Append to trend (replace same-week snapshot for idempotent reruns) ──
let trend = []
if (existsSync(TREND_PATH)) {
  try { trend = JSON.parse(readFileSync(TREND_PATH, 'utf-8')) } catch {}
}
trend = trend.filter(t => t.week !== snapshot.week)
trend.push(snapshot)
if (trend.length > 52) trend = trend.slice(-52)
writeFileSync(TREND_PATH, JSON.stringify(trend, null, 2))

// ── Summary to stdout ─────────────────────────────────────
const m = snapshot.metrics
console.log(`Quality metrics: ${articles.length} articles in last ${WINDOW_DAYS}d`)
console.log(`  length: charAvg=${m.charLengthAvg} over480=${m.charOver350Pct}% over560=${m.charOver400Pct}%  wordAvg=${m.wordCountAvg} inRange=${m.wordInRangePct}%`)
console.log(`  shape:  blockAvg=${m.blockCountAvg} fiveBlock=${m.fiveBlockRatePct}%`)
console.log(`  style:  titleEcho=${m.titleEchoRatePct}% passiveHook=${m.passiveHookRatePct}% passiveBody=${m.passiveBodyRatePct}% semicolon=${m.semicolonRatePct}% hedge=${m.hedgeRatePct}%`)
console.log(`  rules:  causal=${m.causalClaimHits} pressEra=${m.pressEraHits} acronymViol=${m.acronymViolations} countryNull=${m.countryNullCount}`)
console.log(`  source: top3Share=${m.topOutletSharePct}% multiSrc=${m.multiSourceRatePct}%`)
