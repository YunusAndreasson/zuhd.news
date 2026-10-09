#!/usr/bin/env node
// Indicator dispatch. For every instrument the site shows a number for — the
// trends indicators, the shipping chokepoints, the stock exchanges and the
// largest companies' shares — build a grounded INPUT bundle and ask Opus for
// two sentences of prose: what the thing *is*, and what has actually happened
// to it recently and why.
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
// identity and it is written approximately once: a call made for `recent`
// keeps the definition the cache already holds (`storedStanding`).
//
// `recent` is a claim about the last two weeks, so it is where a fabrication
// would actually mislead. Its fingerprint is the story, not the number: the
// stories offered to the model, the move in bands and the dates of the
// extremes (`recentFingerprint`). A day on which none of those moved costs
// nothing. Most days most of them move: the daily passes of 2026-10-02 to
// 10-09 asked again for 72% to 93% of their items.
//
// Both are asked for in one call — a second call to refresh only one of them
// would cost more than the tokens the discarded field is worth.
//
// ── Where the grounding comes from, at no API cost ────────────────────────
//
// `merge-feeds.js` has been archiving every merged feed to
// `content/.feed-snapshots-merged/` five times a day since May: the cycle's
// pool, some sixty stories a file and about 3,200 distinct over a fortnight,
// most with `concepts` that name Wikipedia articles. Those are the same keys
// the `wiki-*` indicators are built from. So "why is Iran being read about" is
// answerable from stories we already fetched and mostly never published,
// without one additional call to any news API.
//
// Env overrides for development:
//   NARRATE_INDICATORS_MAX=N     cap items considered this run
//   NARRATE_INDICATORS_FORCE=1   ignore the cache (re-narrate everything)
//   ZUHD_DISPATCH_MODEL=id       the model (`lib/models.js`, use `dispatch`)
//   ZUHD_DISPATCH_EFFORT=level   its effort; `medium` when unset
// Flags:
//   --dry-run                    build bundles; print their sizes and whether
//                                the cache answers each; call nothing
//   --only <id>                  one namespaced id (e.g. `wiki-iran`, `cp:hormuz`)
//   --new-only                   only instruments with no cache entry at all
//   --market-signals             run the market-signal stage instead
//                                (`narrate-market-signals.js`; takes --dry-run
//                                and --no-llm)

import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { companyMatcher, isAboutCompany, storyFacts } from './lib/companies.js'
import { loadArticles, loadFeedWindow } from './lib/coverage-window.js'
import {
  MAX_COVERAGE, MAX_FEED, WINDOW_DAYS, askModel, coverageRow, dryRun, feedRow, loadPrompt, offeredArticles,
  offeredStories, openCache, promptWithInput, runDispatch, storedStanding, threadsFor,
} from './lib/dispatch.js'
import { sig4 } from './lib/indicator-offer.js'
import { argAt, hasFlag } from './lib/argv.js'
import { ROOT } from './lib/paths.js'
import { readJson } from './lib/json-file.js'
import { sha1Hex } from './lib/hash.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

if (hasFlag('market-signals')) {
  const { runMarketSignals } = await import('./narrate-market-signals.js')
  await runMarketSignals({ dryRun: hasFlag('dry-run'), noLlm: hasFlag('no-llm') })
  process.exit(0)
}

const CACHE_PATH = join(ROOT, 'content', '.indicator-dispatch.json')
const CHOKEPOINTS_PATH = join(ROOT, 'content', '.chokepoints.json')
const MARKETS_PATH = join(ROOT, 'content', '.markets.json')
const COMPANIES_PATH = join(ROOT, 'content', '.companies.json')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'narrate-indicators-prompt.md')

/**
 * The classes whose hand-written `blurb` *is* the definition, so this stage
 * never regenerates it.
 *
 * A chokepoint's blurb answers the reader's whole question in one line — *"One
 * fifth of global seaborne oil passes through this 21-mile strait between Iran
 * and Oman"* says what the thing is, where it is, and why it is on a news map.
 * Paraphrasing that would be the failure `cycle.md`'s "editorial lists are
 * editorial" is about.
 *
 * **An exchange's blurb is not, and every one of the 32 was written on the
 * assumption that the reader already knows the ticker.** *"Trades Sunday to
 * Thursday. Heavily weighted to banks, defence and technology"* never says that
 * TA-125 is the Tel Aviv Stock Exchange's largest 125 listings; *"The Arab
 * world's oldest exchange, founded in Alexandria in 1883"* says nothing
 * whatever about the number EGX 30 puts on the card. There is a second mismatch
 * underneath: **the blurb describes the exchange while every card headlines the
 * index**, so a reader who arrives at `BIST 100` is answered with a sentence
 * about Borsa İstanbul and still does not know what the 100 counts.
 *
 * So for an exchange the model writes it, with the blurb in the bundle as
 * material it is told to keep — the editorial claim survives, the
 * identification goes in front of it, and the catalog is still the fallback if
 * the model's sentence is missing or over cap.
 *
 * **A company's blurb is the definition too** (2026-10-03). It was written for
 * exactly this slot — what the company is, with no rank, price or year in it
 * (`lib/company-metadata.js`) — and it is the sentence the app's card falls
 * back to on a day with nothing to say, so it has to be the one the catalog
 * holds and not a paraphrase that drifts from it.
 */
const BLURB_IS_DEFINITION = new Set(['chokepoint', 'company'])

const FORCE = process.env.NARRATE_INDICATORS_FORCE === '1'
const MAX_ITEMS = Number(process.env.NARRATE_INDICATORS_MAX) || Infinity
const DRY_RUN = hasFlag('dry-run')
const ONLY = argAt('only')
/**
 * Only instruments this file has never seen — the pass of every cycle but the
 * daily one (`DAILY_HOUR`, `lib/cycle-run.js`).
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
 * retried here rather than left for the daily pass. (`runDispatch` already
 * refuses to cache an empty standing, so this is a guard against older entries
 * and a partial write, not the common path.)
 *
 * Not `FORCE`'s opposite and not a cheaper full run: an item already in the
 * cache is skipped here even when its fingerprints have moved, so this can
 * never do the daily pass's job early. Steady state is zero calls, which is why
 * it is safe on a cycle that publishes four more times a day.
 */
const NEW_ONLY = hasFlag('new-only')

// A missing prompt file throws here, with its path.
const prompt = loadPrompt(PROMPT_PATH)
const basePrompt = prompt.text
/** Part of `recentFingerprint`, so a prompt edit reaches every item once at
 *  the next full pass rather than only the ones whose story happens to move
 *  that day. The output is a function of the prompt and the input; a cache
 *  key that ignored half of that let a rewritten prompt sit unapplied. */
const promptHash = sha1Hex(basePrompt, 8)
const cache = openCache(CACHE_PATH)

const stageT0 = Date.now()
const windowStart = Date.now() - WINDOW_DAYS * 86400_000

// ── Sources ───────────────────────────────────────────────────────────────

const trendsPath = latestTrendsPath()
const trends = trendsPath ? JSON.parse(readFileSync(trendsPath, 'utf8')) : { indicators: [] }
const chokepoints = readJson(CHOKEPOINTS_PATH)?.chokepoints || []
const exchanges = readJson(MARKETS_PATH)?.exchanges || []
const companies = readJson(COMPANIES_PATH)?.companies || []
const ledger = readJson(LEDGER_PATH)?.stories || []

// `loadArticles`/`loadFeedWindow` live in `lib/coverage-window.js` — the same
// join `narrate-events.js` needs, extracted so the two stages cannot drift.
const articles = loadArticles(windowStart)
const feedWindow = loadFeedWindow(windowStart)
// The snapshot's own day, from its name. This line printed today's date
// whenever a snapshot was found, so one three days old read as fresh.
console.log(
  `Dispatch window ${WINDOW_DAYS}d: ${articles.length} published articles, ` +
    `${feedWindow.length} distinct feed stories, trends ${trendsPath ? basename(trendsPath, '.json') : 'MISSING'}`,
)

// ── Item list ─────────────────────────────────────────────────────────────

// A series is rounded with `sig4` (`lib/indicator-offer.js`, where the writer's
// offers round theirs): four significant figures is what the rail prints, so
// anything finer is a change no reader could see. The move bands that
// `recentFingerprint` hashes are taken from values rounded this way.

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
    topicTags: ex.topicTags || [],
    // Its own field, never more `topicTags`: a tag is matched as a lowercased
    // word, and `IN`, `IT` and `US` are words (`offeredArticles`).
    countryTags: ex.countryTags || [],
    catalogBlurb: ex.blurb || null,
  })
}

/** Each article's side of the company join, read once: twenty companies ask. */
const articleFacts = new WeakMap()
const factsOf = (article) => {
  let facts = articleFacts.get(article)
  if (!facts) {
    facts = storyFacts(article)
    articleFacts.set(article, facts)
  }
  return facts
}

// The largest companies' shares (`fetch-companies.js`). They joined this pass
// when they took slots in the app's top strip: a reader who taps a share that
// moved 9% in a week is asking why, and the card answered what the company is.
for (const co of companies) {
  if (!co?.id) continue
  const values = (co.series?.values || []).filter(Number.isFinite)
  if (values.length < 2) continue
  const last = values[values.length - 1]
  const prior = values[values.length - 2]
  const matcher = companyMatcher(co)
  items.push({
    key: `co:${co.id}`,
    klass: 'company',
    identity: {
      label: co.name,
      unit: `${co.currency} a share`,
      source: co.sourceLabel || 'Yahoo Finance',
      cadence: 'daily',
      business: co.about || '',
      country: co.iso2 || '',
    },
    series: {
      windowDays: values.length,
      latest: sig4(last),
      dayChangePct: sig4(prior ? ((last - prior) / Math.abs(prior)) * 100 : null),
      changePctOverSeries: sig4(changePct(values)),
      extremes: extremes(co.series?.values, co.series?.periods),
      asOf: co.asOf || '',
    },
    wikiTitle: null,
    topicTags: co.topicTags || [],
    catalogBlurb: co.blurb || null,
    // The first tier of coverage is the stories *about* the company, by the
    // rule the build lists them under its chart with. An `entities[]` hit is
    // only a mention here — a forum the company attended — and offered first,
    // a mention is what the model reaches for when asked why a share moved.
    about: (article) => isAboutCompany(factsOf(article), matcher),
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
 * Articles offered to the model for one item: the stories about it, then the
 * stories that carry one of its tags, then (an exchange) its own country's.
 * The tiers and why they are in that order are `offeredArticles`'.
 */
const coverageFor = (item) =>
  offeredArticles(articles, {
    direct: (a) => (item.about ? item.about(a) : a.entityIds.includes(item.key)),
    topicTags: item.topicTags,
    countryTags: item.countryTags,
  })
    .slice(0, MAX_COVERAGE)
    .map(coverageRow)

/** Feed stories offered to the model for one item (`offeredStories`): by
 *  Wikipedia title for an attention series, by tag for everything else. */
const feedFor = (item) => offeredStories(feedWindow, item).slice(0, MAX_FEED).map(feedRow)

const buildBundle = (item) => ({
  // `catalogBlurb` rides the identity block rather than sitting beside it,
  // because for the classes that have one it *is* part of what the instrument
  // is. It was absent entirely while the blurb short-circuited `standing` for
  // every item that carried one — the model was told to write a definition and
  // never shown the editorial sentence its output had to agree with.
  instrument: { kind: item.klass, ...item.identity, ...(item.catalogBlurb ? { blurb: item.catalogBlurb } : {}) },
  series: item.series,
  coverage: coverageFor(item),
  feedWindow: feedFor(item),
  threads: threadsFor(ledger, item.topicTags),
})

/**
 * Identity only — what `standing` is about.
 *
 * `promptHash` is in here for the same reason `recentFingerprint` carries it:
 * the output is a function of the prompt and the input, and a key that ignores
 * half of that leaves a rewritten rubric unapplied on every item whose identity
 * never changes — which is all of them, since identity is what this hashes.
 * It costs nothing: both fields come back from one call, and `recentFingerprint`
 * already busts on a prompt edit.
 */
const standingFingerprint = (item) =>
  sha1Hex({ ...item.identity, klass: item.klass, blurb: item.catalogBlurb, prompt: promptHash })

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
  return sha1Hex({
    prompt: promptHash,
    move: band(bundle.series.changePctOverSeries),
    dayMove: band(bundle.series.dayChangePct),
    baseline: band(bundle.series.last7VsBaseline90Pct),
    peakOn: bundle.series.extremes?.high?.on ?? null,
    troughOn: bundle.series.extremes?.low?.on ?? null,
    alert: bundle.series.weatherAlert ?? null,
    slugs: bundle.coverage.map((c) => c.slug).slice(0, 6).sort(),
    feed: bundle.feedWindow.map((f) => f.headline).slice(0, 6).sort(),
  })
}

// ── The call ──────────────────────────────────────────────────────────────

const askOpus = askModel('dispatch', 'ZUHD_DISPATCH_EFFORT')
const ask = (bundle) => askOpus(promptWithInput(basePrompt, bundle))

/** The two keys an item is cached under. */
const fingerprintsOf = (item, bundle) => ({ standing: standingFingerprint(item), recent: recentFingerprint(bundle) })

// ── Main ──────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  dryRun({ cache, selected, bundleOf: buildBundle, fingerprintsOf, force: FORCE })
  process.exit(0)
}

/**
 * The payload a key is minted from, by its prefix. `items` is assembled from
 * four payloads that each degrade to `[]` when their file is unreadable, so a
 * prune is only as safe as the weakest source that ran: `staleKeys` drops a
 * key only when its own payload gave something. Everything unprefixed is the
 * trends snapshot's, `stocks:` rows included.
 */
const sourceOf = (key) =>
  key.startsWith('cp:') ? 'chokepoints' : key.startsWith('mkt:') ? 'markets' : key.startsWith('co:') ? 'companies' : 'trends'

// The loop, the checks on each answer, the checkpoint, the prune and the stamp
// are `runDispatch`'s (`lib/dispatch.js`), shared with the events stage. The
// prune is the daily pass's only: Polymarket questions close and Wikipedia
// series are re-picked from our own concepts every cycle, so without it the
// file grows a tail of instruments the site no longer shows.
const counts = await runDispatch({
  cachePath: CACHE_PATH,
  cache,
  items,
  selected,
  bundleOf: buildBundle,
  fingerprintsOf,
  ask,
  examples: prompt.examples,
  // The definition already written for this identity stands while the identity
  // does (`storedStanding`): the call was made for `recent`, and the `standing`
  // that came back with it is a second paraphrase of a sentence the card
  // already carries. A stored catalog blurb is the exception for a class
  // whose blurb is not the definition: it was the fallback on a day the model
  // wrote none, and keeping it would make that day permanent.
  standingOf: (item, written, sFp) => {
    const held = FORCE ? '' : storedStanding(cache.items, item.key, sFp)
    return BLURB_IS_DEFINITION.has(item.klass)
      ? item.catalogBlurb || held || written
      : (held !== item.catalogBlurb && held) || written || item.catalogBlurb
  },
  force: FORCE,
  newOnly: NEW_ONLY,
  sourceOf,
})

const elapsed = ((Date.now() - stageT0) / 1000).toFixed(1)
console.log(
  `  Dispatch: ${counts.generated} new, ${counts.cacheHits} cached, ${counts.recentDropped} recent-dropped, ` +
    `${counts.chartEchoes} chart-echo, ${counts.promptEchoes} prompt-echo, ${counts.rejected} rejected, ${counts.failed} failed; ` +
    `$${counts.costUsd.toFixed(3)} in ${elapsed}s`,
)
