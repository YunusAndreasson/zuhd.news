#!/usr/bin/env node
// Indicator dispatch. For every instrument the site shows a number for — the
// trends indicators, the shipping chokepoints and the stock exchanges — build a
// grounded INPUT bundle and ask Opus for two sentences of prose: what the thing
// *is*, and what has actually happened to it recently and why.
//
// This exists because the rail told readers that something moved and never why.
// Five sentences of hand-written copy covered 57 indicators; one of them, shown
// identically on twelve rows, explained that Wikipedia pageviews count how many
// people read an article. That is a fact about the metric, not about the world.
//
// ── The two fields, and why they are fingerprinted separately ──────────────
//
// `standing` is definitional and stable — what Brent is, why the US 10-year
// prices everything else. General knowledge is the legitimate source for it and
// it should not change from day to day, so its fingerprint is the item's
// identity and it is written approximately once.
//
// `recent` is a claim about the last two weeks, so it is where a fabrication
// would actually mislead. Its fingerprint is the rounded series tail plus the
// set of articles offered to the model, which means a day on which neither the
// number nor the coverage moved costs nothing.
//
// Both are asked for in one call — a second call to refresh only one of them
// would cost more than the tokens the discarded field is worth.
//
// ── Where the grounding comes from, at no API cost ────────────────────────
//
// `merge-feeds.js` has been archiving every merged feed to
// `content/.feed-snapshots-merged/` five times a day since May, and each file
// carries ~200 stories with `concepts[].uri` — Wikipedia article URLs. Those are
// the same keys the `wiki-*` indicators are built from. So "why is Iran being
// read about" is answerable from stories we already fetched and mostly never
// published, without one additional call to any news API.
//
// Env overrides for development:
//   NARRATE_INDICATORS_MAX=N     cap items considered this run
//   NARRATE_INDICATORS_FORCE=1   ignore the cache (re-narrate everything)
// Flags:
//   --dry-run                    build bundles, print sizes, call nothing
//   --only <id>                  one namespaced id (e.g. `wiki-iran`, `cp:hormuz`)
//   --new-only                   only instruments with no cache entry at all

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { callIndicatorModel } from './lib/indicator-model.js'
import { runWithConcurrency } from './lib/concurrency.js'
import { seriesEchoes, validateNumbers, validateProperNouns } from './lib/grounding.js'
import { matchesAnyTag } from './lib/entity-registry.js'
import { loadArticles, loadFeedWindow } from './lib/coverage-window.js'
import { argAt, hasFlag } from './lib/argv.js'

if (hasFlag('market-signals')) {
  const { runMarketSignals } = await import('./narrate-market-signals.js')
  await runMarketSignals({ dryRun: hasFlag('dry-run'), noLlm: hasFlag('no-llm') })
  process.exit(0)
}

const ROOT = new URL('..', import.meta.url).pathname
const CACHE_PATH = join(ROOT, 'content', '.indicator-dispatch.json')
const CHOKEPOINTS_PATH = join(ROOT, 'content', '.chokepoints.json')
const MARKETS_PATH = join(ROOT, 'content', '.markets.json')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'narrate-indicators-prompt.md')


const CONCURRENCY = 3
/** The window everything recent is measured over. Two weeks is long enough that
 *  a weekly-published series has moved at least once, and short enough that
 *  "recently" is still an honest word for it. */
const WINDOW_DAYS = 14
/** Offered to the model, not shown to the reader — `citations` is what the
 *  reader sees, and it is capped at 6 by the prompt. */
const MAX_COVERAGE = 12
const MAX_FEED = 12
const STANDING_CAP = 240
const RECENT_CAP = 360

const FORCE = process.env.NARRATE_INDICATORS_FORCE === '1'
const MAX_ITEMS = Number(process.env.NARRATE_INDICATORS_MAX) || Infinity
const DRY_RUN = hasFlag('dry-run')
const ONLY = argAt('only')
/**
 * Only instruments this file has never seen — the non-04:00 pass.
 *
 * The full run is daily and that is the right cadence for *rewriting* an
 * explanation. Appearing is a different event: a Polymarket question can enter
 * the deck on any cycle (selection is sticky since 2026-09-04, but a market
 * still expires, decides, or is displaced) and the `wiki-*` set is re-picked
 * from our own concepts, so a new instrument can be on the site for up to 24
 * hours before it has any prose. On the web that is a card missing a
 * paragraph; in the app it is no card at all, because the graph decks gate
 * deck membership on having an explanation. The outlook column was 1-2 cards
 * deep for this reason alone.
 *
 * "Never seen" includes "seen, but with no `standing`": an entry with an empty
 * definition is one the app drops exactly as it drops a missing one, so it is
 * retried here rather than left for 04:00. (The writer below already refuses
 * to cache an empty standing, so this is a guard against older entries and a
 * partial write, not the common path.)
 *
 * Not `FORCE`'s opposite and not a cheaper full run: an item already in the
 * cache is skipped here even when its fingerprints have moved, so this can
 * never do the daily pass's job early. Steady state is zero calls, which is why
 * it is safe on a cycle that publishes four more times a day.
 */
const NEW_ONLY = hasFlag('new-only')

if (!existsSync(PROMPT_PATH)) {
  console.error('Missing narrate-indicators-prompt.md.')
  process.exit(1)
}
const basePrompt = readFileSync(PROMPT_PATH, 'utf8')
/** Part of `recentFingerprint`, so a prompt edit reaches every item once at
 *  the next full pass rather than only the ones whose story happens to move
 *  that day. The output is a function of the prompt and the input; a cache
 *  key that ignored half of that let a rewritten prompt sit unapplied. */
const promptHash = createHash('sha1').update(basePrompt).digest('hex').slice(0, 8)
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : { items: {} }
if (!cache.items) cache.items = {}

const stageT0 = Date.now()
const windowStart = Date.now() - WINDOW_DAYS * 86400_000
const iso = (t) => new Date(t).toISOString().slice(0, 10)

// ── Sources ───────────────────────────────────────────────────────────────

/** Newest daily trends snapshot. Same answer `build/entity-pages.js` computes;
 *  duplicated here only because that module is ESM under `scripts/build/` and
 *  importing it would pull the whole page builder into a pipeline stage. */
const latestTrendsPath = () => {
  const dir = join(ROOT, 'content', 'trends')
  if (!existsSync(dir)) return null
  const names = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  return names.length ? join(dir, names[names.length - 1]) : null
}

const trendsPath = latestTrendsPath()
const trends = trendsPath ? JSON.parse(readFileSync(trendsPath, 'utf8')) : { indicators: [] }
const chokepoints = existsSync(CHOKEPOINTS_PATH)
  ? JSON.parse(readFileSync(CHOKEPOINTS_PATH, 'utf8')).chokepoints || []
  : []
const exchanges = existsSync(MARKETS_PATH)
  ? JSON.parse(readFileSync(MARKETS_PATH, 'utf8')).exchanges || []
  : []
const ledger = existsSync(LEDGER_PATH)
  ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8')).stories || []
  : []

// `loadArticles`/`loadFeedWindow` live in `lib/coverage-window.js` — the same
// join `narrate-events.js` needs, extracted so the two stages cannot drift.
const articles = loadArticles(windowStart)
const feedWindow = loadFeedWindow(windowStart)
console.log(
  `Dispatch window ${WINDOW_DAYS}d: ${articles.length} published articles, ` +
    `${feedWindow.length} distinct feed stories, trends ${trendsPath ? iso(Date.now()) : 'MISSING'}`,
)

// ── Item list ─────────────────────────────────────────────────────────────

/** Round a series tail so cosmetic wobble does not bust the `recent` cache.
 *  Four significant figures is what the rail prints, so anything finer is a
 *  change no reader could see. */
const sig4 = (n) => (Number.isFinite(n) ? Number(Number(n).toPrecision(4)) : null)

const changePct = (values) => {
  const v = (values || []).filter(Number.isFinite)
  if (v.length < 2 || v[0] === 0) return null
  return ((v[v.length - 1] - v[0]) / Math.abs(v[0])) * 100
}

/** The extremes, with the dates they fell on — the input that lets `recent` say
 *  what happened *on the day it spiked* rather than merely that it did. */
const extremes = (values, periods) => {
  const pts = (values || [])
    .map((v, i) => ({ v, p: periods?.[i] }))
    .filter((p) => Number.isFinite(p.v))
  if (!pts.length) return null
  let hi = pts[0]
  let lo = pts[0]
  for (const p of pts) {
    if (p.v > hi.v) hi = p
    if (p.v < lo.v) lo = p
  }
  return { high: { value: sig4(hi.v), on: hi.p }, low: { value: sig4(lo.v), on: lo.p } }
}

const items = []

for (const ind of trends.indicators || []) {
  if (!ind?.id || !Array.isArray(ind.values) || ind.values.length < 2) continue
  const values = ind.values.filter(Number.isFinite)
  items.push({
    key: ind.id,
    klass: ind.source === 'wikipedia' ? 'attention' : ind.source === 'polymarket' ? 'odds' : 'indicator',
    identity: {
      label: ind.label,
      unit: ind.unit || '',
      source: ind.sourceLabel || ind.source || '',
      cadence: ind.cadence || 'daily',
    },
    series: {
      windowDays: values.length,
      latest: sig4(values[values.length - 1]),
      changePctOverSeries: sig4(changePct(values)),
      extremes: extremes(ind.values, ind.periods),
      asOf: ind.asOf || '',
    },
    // The Wikipedia article this series counts, lowercased for the feed join.
    wikiTitle: ind.source === 'wikipedia' ? String(ind.seriesId || '').replace(/_/g, ' ').toLowerCase() : null,
    topicTags: ind.topicTags || [],
    catalogBlurb: null,
  })
}

for (const cp of chokepoints) {
  if (!cp?.id) continue
  const values = (cp.series?.total || []).filter(Number.isFinite)
  items.push({
    key: `cp:${cp.id}`,
    klass: 'chokepoint',
    identity: { label: cp.name, unit: 'vessels/day', source: 'IMF PortWatch', cadence: 'daily' },
    series: {
      windowDays: values.length,
      latest: sig4(values[values.length - 1]),
      changePctOverSeries: sig4(changePct(values)),
      extremes: extremes(cp.series?.total, cp.series?.periods),
      asOf: cp.asOf || '',
      last7VsBaseline90Pct: sig4((cp.delta7vs90?.n_total ?? 0) * 100),
      weatherAlert: cp.weather?.alert || null,
      maxWave24hM: cp.weather?.maxWave24hM ?? null,
    },
    wikiTitle: null,
    topicTags: cp.topicTags || [],
    // Editorial prose already written by a human. Never regenerated — see
    // `cycle.md`, "editorial lists are editorial".
    catalogBlurb: cp.blurb || null,
  })
}

for (const ex of exchanges) {
  if (!ex?.id) continue
  const values = (ex.series?.values || []).filter(Number.isFinite)
  items.push({
    key: `mkt:${ex.id}`,
    klass: 'exchange',
    identity: {
      label: `${ex.name}${ex.indexName ? ` (${ex.indexName})` : ''}`,
      unit: ex.currency || 'index',
      source: ex.sourceLabel || 'Yahoo Finance',
      cadence: 'daily',
      city: ex.city || '',
    },
    series: {
      windowDays: values.length,
      latest: sig4(values[values.length - 1]),
      dayChangePct: sig4(ex.changePct),
      changePctOverSeries: sig4(changePct(values)),
      extremes: extremes(ex.series?.values, ex.series?.periods),
      asOf: ex.asOf || '',
    },
    wikiTitle: null,
    topicTags: [...(ex.topicTags || []), ...(ex.countryTags || [])],
    catalogBlurb: ex.blurb || null,
  })
}

const selected = items
  .filter((it) => (ONLY ? it.key === ONLY : true))
  .filter((it) => (NEW_ONLY ? !cache.items[it.key]?.standing : true))
  .slice(0, Number.isFinite(MAX_ITEMS) ? MAX_ITEMS : items.length)

console.log(
  `Items: ${items.length} total, ${selected.length} selected${NEW_ONLY ? ' (new only)' : ''}`,
)

// ── Bundles ───────────────────────────────────────────────────────────────

/**
 * Articles offered to the model for one item.
 *
 * Two tiers, and the order is the point. A frontmatter `entities[]` hit is a
 * resolved claim that this story is *about* this instrument; a `topicTags` hit
 * is a word appearing near it. Ranking the first above the second is what keeps
 * the citation list from filling with stories that merely say "sanctions".
 */
const coverageFor = (item) => {
  const direct = articles.filter((a) => a.entityIds.includes(item.key))
  const tagged = articles.filter(
    (a) => !direct.includes(a) && matchesAnyTag(item.topicTags, a.hay),
  )
  return [...direct, ...tagged].slice(0, MAX_COVERAGE).map((a) => ({
    slug: a.slug,
    title: a.title,
    date: String(a.date).slice(0, 10),
    dateline: a.location,
    lead: a.lead,
  }))
}

/**
 * Feed stories offered to the model for one item.
 *
 * For an attention series the join is the **Wikipedia article title**, which is
 * exact: `wiki-iran` is built from the pageviews of `Iran`, and a feed story
 * tagged with `en.wikipedia.org/wiki/Iran` is by construction a story about the
 * thing being read about. That exactness is what lets the attention block
 * explain an event instead of restating the metric.
 *
 * Everything else falls back to whole-tag matching.
 */
const feedFor = (item) => {
  const hits = item.wikiTitle
    ? feedWindow.filter((s) => s.conceptTitles.includes(item.wikiTitle))
    : feedWindow.filter((s) => matchesAnyTag(item.topicTags, s.hay))
  return hits.slice(0, MAX_FEED).map((s) => ({
    headline: s.title,
    date: s.date,
    source: s.source,
    outlets: s.outlets,
  }))
}

const threadsFor = (item) =>
  ledger
    .filter((t) => matchesAnyTag(item.topicTags, String(t.label || '').toLowerCase()))
    .slice(0, 3)
    .map((t) => ({ label: t.label, arc: t.arc, summary: t.summary }))

const buildBundle = (item) => ({
  instrument: { kind: item.klass, ...item.identity },
  series: item.series,
  coverage: coverageFor(item),
  feedWindow: feedFor(item),
  threads: threadsFor(item),
})

/** Identity only — what `standing` is about. */
const standingFingerprint = (item) =>
  createHash('sha1')
    .update(JSON.stringify({ ...item.identity, klass: item.klass, blurb: item.catalogBlurb }))
    .digest('hex')
    .slice(0, 16)

/**
 * What `recent` is about — **the story, not the number**.
 *
 * The first version hashed the series itself, and that made the cache useless in
 * a way that only shows up on the bill: a daily-cadence close moves every day,
 * so every daily indicator busted its own fingerprint every day and the "steady
 * state costs nothing" claim in this file's header was false for ~all 98 items.
 *
 * What should force a rewrite is a change in the *explanation*: different
 * stories behind it, or a move large enough that the previous sentence no longer
 * describes it. So:
 *
 *  - **The top six slugs and headlines, sorted.** Sorted because the set is what
 *    matters and the ranking within it wobbles; six rather than twelve because
 *    the tail of the offered list is rarely what the sentence was built from.
 *  - **The move in 5-point bands.** A benchmark drifting from −11% to −12% is the
 *    same story told with a different decimal; crossing from −11% to −4% is not.
 *  - **The dates of the extremes, not their values.** "The peak was 9 July" is
 *    the fact `recent` hangs on. The peak being 16,933 rather than 16,940 is not.
 */
const recentFingerprint = (bundle) => {
  const band = (pct) => (Number.isFinite(pct) ? Math.round(pct / 5) : null)
  return createHash('sha1')
    .update(
      JSON.stringify({
        prompt: promptHash,
        move: band(bundle.series.changePctOverSeries),
        dayMove: band(bundle.series.dayChangePct),
        baseline: band(bundle.series.last7VsBaseline90Pct),
        peakOn: bundle.series.extremes?.high?.on ?? null,
        troughOn: bundle.series.extremes?.low?.on ?? null,
        alert: bundle.series.weatherAlert ?? null,
        slugs: bundle.coverage.map((c) => c.slug).slice(0, 6).sort(),
        feed: bundle.feedWindow.map((f) => f.headline).slice(0, 6).sort(),
      }),
    )
    .digest('hex')
    .slice(0, 16)
}

// ── The call ──────────────────────────────────────────────────────────────

const callClaude = (bundle) => {
  const fullPrompt = `${basePrompt}

## INPUT (this is the only material \`recent\` may draw from)

\`\`\`json
${JSON.stringify(bundle, null, 2)}
\`\`\`

Output ONLY the JSON object \`{ "standing": "...", "recent": "...", "citations": [...] }\`. No markdown, no fences.`

  return callIndicatorModel(fullPrompt)
}

const clean = (s) =>
  typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '') : ''

// ── Main ──────────────────────────────────────────────────────────────────

let generated = 0
let cacheHits = 0
let rejected = 0
let failed = 0
let recentDropped = 0
let chartEchoes = 0
let totalCostUsd = 0

if (DRY_RUN) {
  for (const item of selected) {
    const bundle = buildBundle(item)
    console.log(
      `  ${item.key.padEnd(30)} ${String(JSON.stringify(bundle).length).padStart(6)}B  ` +
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

  // The catalog's own sentence wins where there is one. Chokepoints and
  // exchanges carry hand-written blurbs and regenerating them would be this
  // stage overwriting an editorial judgement with a paraphrase of it.
  const standing = item.catalogBlurb || clean(result.out.standing)
  const recentRaw = clean(result.out.recent)

  // **`standing` is not grounding-checked, and that is the field's definition
  // rather than an oversight.** It is the one place general knowledge is the
  // source — what Brent is, what the VIX measures — so a bundle it was never
  // meant to draw from cannot be the authority on it. Checked anyway at first,
  // and it rejected "The CBOE's index of expected S&P 500 swings" because the
  // 500 in an index's own name was not in the input. Length is the only gate.
  //
  // `recent` claims what happened last week, so it gets both checks.
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
    // A rejected `recent` is not a rejected item: the standing sentence is
    // still true and still an improvement on no prose at all.
    recentDropped++
    console.log(`  ~ ${item.key}: recent dropped (${recentBad || 'over cap'}) — "${recentRaw}"`)
  }
  // Logged and counted, never dropped — see `seriesEchoes`. The prompt forbids
  // repeating the chart; this line is how the log says whether it listened.
  if (recent) {
    const echoed = seriesEchoes(recent, bundle.series)
    if (echoed.length > 0) {
      chartEchoes++
      console.log(`  ~ ${item.key}: reads the chart (${echoed.join(', ')})`)
    }
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
    // A citation list without the sentence it supports is a related-articles
    // list with no argument behind it, which is what this stage replaced.
    citations: recent ? citations : [],
    generatedAt: new Date().toISOString(),
  }
  generated++
  console.log(`  ✓ ${item.key}: ${recent || standing}`)
})

// Prune ids that have left every source payload. Polymarket questions close and
// Wikipedia series are re-picked from our own concepts every cycle, so without
// this the file grows a tail of instruments the site no longer shows.
//
// The daily pass only. `items` is assembled from three payloads that each
// degrade to `[]` when their file is unreadable, so a prune is only as safe as
// the weakest source that ran — and a `--new-only` pass, which happens four
// more times a day, has nothing to gain from bookkeeping the 04:00 run does
// anyway. Deleting eleven chokepoint entries because one file was mid-write is
// not a trade worth making four extra times for a tidier cache.
if (!NEW_ONLY) {
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
    `${chartEchoes} chart-echo, ${rejected} rejected, ${failed} failed; ` +
    `$${totalCostUsd.toFixed(3)} in ${elapsed}s`,
)
