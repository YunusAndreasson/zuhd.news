#!/usr/bin/env node
// Event dispatch. For every upcoming event on the money rail's calendar — a
// central-bank decision, an OPEC+ meeting, a major release, a summit — build
// a grounded INPUT bundle and ask Opus for two sentences of prose: what the
// event *is*, and why this occurrence of it is worth watching.
//
// Sibling stage to `narrate-indicators.js` and built on the same two ideas:
//
// ── The two fields, and why they are fingerprinted separately ──────────────
//
// `standing` is definitional and stable — what the FOMC is, how often OPEC+
// meets — so its fingerprint is the event's *identity* (title/institution/
// kind) and it is written approximately once per distinct kind of event.
//
// `recent` is a claim about why THIS occurrence matters, grounded in recent
// coverage. Its fingerprint is the **countdown bucket** plus the set of
// articles offered to the model — not the raw date — so an event six weeks
// out is re-narrated only when it crosses a bucket boundary (60d→30d→14d→
// 7d→3d→1d) or when new coverage actually attaches to it, never every cycle.
// This is the direct mechanism for "don't rebuild a future event every run".
//
// ── Where the grounding comes from ──────────────────────────────────────
//
// Same two sources `narrate-indicators.js` uses, via `lib/coverage-window.js`:
// our own published articles and the wider (mostly-unpublished) wire feed
// archived to `content/.feed-snapshots-merged/`, both matched by topic tag —
// an event carries no entity id in article frontmatter, so unlike the
// indicator dispatch this stage has no direct-match tier, only tag matching.
//
// Env overrides for development:
//   NARRATE_EVENTS_MAX=N     cap items considered this run
//   NARRATE_EVENTS_FORCE=1   ignore the cache (re-narrate everything)
// Flags:
//   --dry-run                build bundles, print sizes, call nothing
//   --only <id>               one event id (e.g. `fomc-2026-09`)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parseClaudeEnvelopeWithUsage } from './lib/claude-envelope.js'
import { runWithConcurrency } from './lib/concurrency.js'
import { validateNumbers, validateProperNouns } from './lib/grounding.js'
import { matchesAnyTag } from './lib/entity-registry.js'
import { loadArticles, loadFeedWindow } from './lib/coverage-window.js'
import { argAt, hasFlag } from './lib/argv.js'

const ROOT = new URL('..', import.meta.url).pathname
const CACHE_PATH = join(ROOT, 'content', '.events-dispatch.json')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'narrate-events-prompt.md')

const MODEL = process.env.ZUHD_EVENTS_MODEL || 'claude-opus-5'
const EFFORT = process.env.ZUHD_EVENTS_EFFORT || 'medium'
const CONCURRENCY = 3
/** Grounding window — same fortnight `narrate-indicators.js` uses. An event
 *  further out than this simply has less coverage to draw `recent` from,
 *  which is honest: nothing has been reported about it yet. */
const WINDOW_DAYS = 14
const MAX_COVERAGE = 12
const MAX_FEED = 12
const STANDING_CAP = 240
const RECENT_CAP = 360

const FORCE = process.env.NARRATE_EVENTS_FORCE === '1'
const MAX_ITEMS = Number(process.env.NARRATE_EVENTS_MAX) || Infinity
const DRY_RUN = hasFlag('dry-run')
const ONLY = argAt('only')

if (!existsSync(PROMPT_PATH)) {
  console.error('Missing narrate-events-prompt.md.')
  process.exit(1)
}
const basePrompt = readFileSync(PROMPT_PATH, 'utf8')
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : { items: {} }
if (!cache.items) cache.items = {}

const stageT0 = Date.now()
const windowStart = Date.now() - WINDOW_DAYS * 86400_000
const iso = (t) => new Date(t).toISOString().slice(0, 10)
const todayIso = iso(Date.now())

// ── Sources ───────────────────────────────────────────────────────────────

/** Newest daily trends snapshot — same lookup `narrate-indicators.js` uses. */
const latestTrendsPath = () => {
  const dir = join(ROOT, 'content', 'trends')
  if (!existsSync(dir)) return null
  const names = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  return names.length ? join(dir, names[names.length - 1]) : null
}

const trendsPath = latestTrendsPath()
const trends = trendsPath ? JSON.parse(readFileSync(trendsPath, 'utf8')) : { events: [] }
const ledger = existsSync(LEDGER_PATH)
  ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8')).stories || []
  : []

const articles = loadArticles(windowStart)
const feedWindow = loadFeedWindow(windowStart)
console.log(
  `Dispatch window ${WINDOW_DAYS}d: ${articles.length} published articles, ` +
    `${feedWindow.length} distinct feed stories, trends ${trendsPath ? todayIso : 'MISSING'}`,
)

// ── Item list ─────────────────────────────────────────────────────────────

const dayMs = (d) => Date.parse(`${d}T00:00:00Z`)

const items = []
for (const ev of trends.events || []) {
  if (!ev?.id || !ev.date || ev.date < todayIso) continue
  items.push({
    key: ev.id,
    identity: { title: ev.title, institution: ev.institution, kind: ev.kind },
    date: ev.date,
    daysUntil: Math.round((dayMs(ev.date) - dayMs(todayIso)) / 86400_000),
    topicTags: ev.topicTags || [],
  })
}

const selected = items
  .filter((it) => (ONLY ? it.key === ONLY : true))
  .slice(0, Number.isFinite(MAX_ITEMS) ? MAX_ITEMS : items.length)

console.log(`Items: ${items.length} total, ${selected.length} selected`)

// ── Bundles ───────────────────────────────────────────────────────────────

/** No entity-id tier here — events carry no frontmatter id to match against,
 *  only topic tags. */
const coverageFor = (item) =>
  articles
    .filter((a) => matchesAnyTag(item.topicTags, a.hay))
    .slice(0, MAX_COVERAGE)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      date: String(a.date).slice(0, 10),
      dateline: a.location,
      lead: a.lead,
    }))

const feedFor = (item) =>
  feedWindow
    .filter((s) => matchesAnyTag(item.topicTags, s.hay))
    .slice(0, MAX_FEED)
    .map((s) => ({ headline: s.title, date: s.date, source: s.source, outlets: s.outlets }))

const threadsFor = (item) =>
  ledger
    .filter((t) => matchesAnyTag(item.topicTags, String(t.label || '').toLowerCase()))
    .slice(0, 3)
    .map((t) => ({ label: t.label, arc: t.arc, summary: t.summary }))

const buildBundle = (item) => ({
  event: { ...item.identity, date: item.date, daysUntil: item.daysUntil },
  coverage: coverageFor(item),
  feedWindow: feedFor(item),
  threads: threadsFor(item),
})

/** Identity only — what `standing` is about. Deliberately date-independent,
 *  so the FOMC's definitional sentence is written once and not once per
 *  meeting date. */
const standingFingerprint = (item) =>
  createHash('sha1').update(JSON.stringify(item.identity)).digest('hex').slice(0, 16)

/** The countdown bucket a date falls into, coarse enough that a date moving
 *  by a day or two (a meeting slipping, a cycle running a few hours later)
 *  does not force a rewrite on its own. */
const countdownBucket = (daysUntil) => {
  if (daysUntil <= 1) return '0-1'
  if (daysUntil <= 3) return '1-3'
  if (daysUntil <= 7) return '3-7'
  if (daysUntil <= 14) return '7-14'
  if (daysUntil <= 30) return '14-30'
  if (daysUntil <= 60) return '30-60'
  return '60+'
}

/**
 * What `recent` is about — **the countdown bucket plus the story, never the
 * raw date**. A daily cycle would otherwise change `daysUntil` by one on
 * every run and bust the cache for every event, every time, which is exactly
 * the "steady state costs nothing" claim `narrate-indicators.js` was written
 * to make true and this stage exists to keep true for events too.
 */
const recentFingerprint = (bundle) =>
  createHash('sha1')
    .update(
      JSON.stringify({
        bucket: countdownBucket(bundle.event.daysUntil),
        slugs: bundle.coverage.map((c) => c.slug).slice(0, 6).sort(),
        feed: bundle.feedWindow.map((f) => f.headline).slice(0, 6).sort(),
      }),
    )
    .digest('hex')
    .slice(0, 16)

// ── The call ──────────────────────────────────────────────────────────────

const callClaude = (bundle) => {
  const fullPrompt = `${basePrompt}

## INPUT (this is the only material \`recent\` may draw from)

\`\`\`json
${JSON.stringify(bundle, null, 2)}
\`\`\`

Output ONLY the JSON object \`{ "standing": "...", "recent": "...", "citations": [...] }\`. No markdown, no fences.`

  const env = { ...process.env }
  delete env.CLAUDECODE

  const t0 = Date.now()
  const result = spawnSync(
    'claude',
    [
      '--model', MODEL,
      '--effort', EFFORT,
      '--no-session-persistence',
      '--max-turns', '1',
      '--output-format', 'json',
      '--exclude-dynamic-system-prompt-sections',
      '-p', fullPrompt,
    ],
    { encoding: 'utf-8', timeout: 120_000, maxBuffer: 1024 * 1024, env },
  )
  const elapsedMs = Date.now() - t0

  if (result.status !== 0) {
    const why =
      String(result.stderr || '').trim() || String(result.stdout || '').trim() || '(no output)'
    return { elapsedMs, error: `claude exit ${result.status}: ${why.slice(0, 300)}` }
  }
  try {
    const envelope = parseClaudeEnvelopeWithUsage(result.stdout)
    const r = envelope.result
    if (!r || typeof r !== 'object') return { elapsedMs, error: 'no object in result' }
    return { elapsedMs, out: r, costUsd: envelope.total_cost_usd, usage: envelope.usage }
  } catch (err) {
    return { elapsedMs, error: `parse: ${err.message}` }
  }
}

const clean = (s) =>
  typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '') : ''

// ── Main ──────────────────────────────────────────────────────────────────

let generated = 0
let cacheHits = 0
let rejected = 0
let failed = 0
let recentDropped = 0
let totalCostUsd = 0

if (DRY_RUN) {
  for (const item of selected) {
    const bundle = buildBundle(item)
    console.log(
      `  ${item.key.padEnd(24)} in ${String(item.daysUntil).padStart(3)}d  ` +
        `${String(JSON.stringify(bundle).length).padStart(6)}B  ` +
        `coverage=${bundle.coverage.length} feed=${bundle.feedWindow.length} threads=${bundle.threads.length}`,
    )
  }
  const withNothing = selected.filter((i) => {
    const b = buildBundle(i)
    return b.coverage.length === 0 && b.feedWindow.length === 0
  })
  console.log(`\n${withNothing.length}/${selected.length} items have no coverage and no feed match:`)
  console.log(`  ${withNothing.map((i) => i.key).join(', ') || '(none)'}`)
  process.exit(0)
}

await runWithConcurrency(selected, CONCURRENCY, async (item) => {
  const bundle = buildBundle(item)
  const sFp = standingFingerprint(item)
  const rFp = recentFingerprint(bundle)
  const prev = cache.items[item.key]

  if (!FORCE && prev && prev.standingFingerprint === sFp && prev.recentFingerprint === rFp) {
    cacheHits++
    return
  }

  const result = callClaude(bundle)
  if (result.error) {
    failed++
    console.log(`  ✗ ${item.key}: ${result.error}`)
    return
  }
  if (typeof result.costUsd === 'number') totalCostUsd += result.costUsd

  const standing = clean(result.out.standing)
  const recentRaw = clean(result.out.recent)

  const recentBad = recentRaw
    ? (validateNumbers(recentRaw, bundle) ?? validateProperNouns(recentRaw, bundle))
    : null

  const overCap = (s, cap) => s.length > cap * 1.4
  const recent = recentBad || overCap(recentRaw, RECENT_CAP) ? '' : recentRaw

  if (!standing || overCap(standing, STANDING_CAP)) {
    rejected++
    console.log(`  ✗ ${item.key}: standing missing or over cap — "${standing}"`)
    return
  }
  if (recentRaw && !recent) {
    recentDropped++
    console.log(`  ~ ${item.key}: recent dropped (${recentBad || 'over cap'}) — "${recentRaw}"`)
  }

  const offered = new Set(bundle.coverage.map((c) => c.slug))
  const citations = (Array.isArray(result.out.citations) ? result.out.citations : [])
    .filter((s) => typeof s === 'string' && offered.has(s))
    .slice(0, 6)

  cache.items[item.key] = {
    standingFingerprint: sFp,
    recentFingerprint: rFp,
    standing,
    recent,
    citations: recent ? citations : [],
    generatedAt: new Date().toISOString(),
  }
  generated++
  console.log(`  ✓ ${item.key}: ${recent || standing}`)
})

// Prune ids that have left the events window — an event more than
// EVENTS_WINDOW_DAYS out drops from `trends.events` at fetch time, and a
// past one drops here, so without this the file grows a tail of events the
// site no longer shows.
{
  const live = new Set(items.map((i) => i.key))
  let dropped = 0
  for (const k of Object.keys(cache.items)) {
    if (!live.has(k)) {
      delete cache.items[k]
      dropped++
    }
  }
  if (dropped > 0) console.log(`  pruned ${dropped} stale entries`)
}

cache.generatedAt = new Date().toISOString()
cache.windowDays = WINDOW_DAYS
writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)

const elapsed = ((Date.now() - stageT0) / 1000).toFixed(1)
console.log(
  `  Dispatch: ${generated} new, ${cacheHits} cached, ${recentDropped} recent-dropped, ` +
    `${rejected} rejected, ${failed} failed; $${totalCostUsd.toFixed(3)} in ${elapsed}s`,
)
