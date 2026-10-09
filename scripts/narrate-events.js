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

import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { loadArticles, loadFeedWindow } from './lib/coverage-window.js'
import {
  MAX_COVERAGE, MAX_FEED, WINDOW_DAYS, askModel, coverageRow, dryRun, feedRow, loadPrompt, offeredArticles,
  offeredStories, openCache, promptWithInput, runDispatch, storedStanding, threadsFor,
} from './lib/dispatch.js'
import { argAt, hasFlag } from './lib/argv.js'
import { ROOT } from './lib/paths.js'
import { readJson } from './lib/json-file.js'
import { sha1Hex } from './lib/hash.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

const CACHE_PATH = join(ROOT, 'content', '.events-dispatch.json')
const LEDGER_PATH = join(ROOT, 'content', '.story-ledger.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'narrate-events-prompt.md')

const FORCE = process.env.NARRATE_EVENTS_FORCE === '1'
const MAX_ITEMS = Number(process.env.NARRATE_EVENTS_MAX) || Infinity
const DRY_RUN = hasFlag('dry-run')
const ONLY = argAt('only')

// A missing prompt file throws here, with its path.
const prompt = loadPrompt(PROMPT_PATH)
const basePrompt = prompt.text
/** Part of `recentFingerprint` — the same reason as `narrate-indicators.js`:
 *  a prompt edit reaches every event once, at the next full pass. */
const promptHash = sha1Hex(basePrompt, 8)
const cache = openCache(CACHE_PATH)

const stageT0 = Date.now()
// The grounding window is the fortnight `narrate-indicators.js` uses
// (`WINDOW_DAYS`). An event further out than this simply has less coverage to
// draw `recent` from, which is honest: nothing has been reported about it yet.
const windowStart = Date.now() - WINDOW_DAYS * 86400_000
const iso = (t) => new Date(t).toISOString().slice(0, 10)
const todayIso = iso(Date.now())

// ── Sources ───────────────────────────────────────────────────────────────

const trendsPath = latestTrendsPath()
const trends = trendsPath ? JSON.parse(readFileSync(trendsPath, 'utf8')) : { events: [] }
const ledger = readJson(LEDGER_PATH)?.stories || []

const articles = loadArticles(windowStart)
const feedWindow = loadFeedWindow(windowStart)
// The snapshot's own day, from its name: not today's, which this printed
// whatever snapshot it had found.
console.log(
  `Dispatch window ${WINDOW_DAYS}d: ${articles.length} published articles, ` +
    `${feedWindow.length} distinct feed stories, trends ${trendsPath ? basename(trendsPath, '.json') : 'MISSING'}`,
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
  offeredArticles(articles, { topicTags: item.topicTags }).slice(0, MAX_COVERAGE).map(coverageRow)

const feedFor = (item) =>
  offeredStories(feedWindow, { topicTags: item.topicTags }).slice(0, MAX_FEED).map(feedRow)

const buildBundle = (item) => ({
  event: { ...item.identity, date: item.date, daysUntil: item.daysUntil },
  coverage: coverageFor(item),
  feedWindow: feedFor(item),
  threads: threadsFor(ledger, item.topicTags),
})

/** Identity only — what `standing` is about. Deliberately date-independent,
 *  so the FOMC's definitional sentence is written once and not once per
 *  meeting date. */
const standingFingerprint = (item) =>
  sha1Hex(item.identity)

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
  sha1Hex({
    prompt: promptHash,
    bucket: countdownBucket(bundle.event.daysUntil),
    slugs: bundle.coverage.map((c) => c.slug).slice(0, 6).sort(),
    feed: bundle.feedWindow.map((f) => f.headline).slice(0, 6).sort(),
  })

// ── The call ──────────────────────────────────────────────────────────────

const askOpus = askModel('events', 'ZUHD_EVENTS_EFFORT')
const ask = (bundle) => askOpus(promptWithInput(basePrompt, bundle))

/** The two keys an event is cached under. */
const fingerprintsOf = (item, bundle) => ({ standing: standingFingerprint(item), recent: recentFingerprint(bundle) })

// ── Main ──────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  dryRun({
    cache,
    selected,
    bundleOf: buildBundle,
    fingerprintsOf,
    force: FORCE,
    label: (item) => `${item.key.padEnd(24)} in ${String(item.daysUntil).padStart(3)}d `,
  })
  process.exit(0)
}

// The loop, the checks on each answer, the checkpoint, the prune and the stamp
// are `runDispatch`'s (`lib/dispatch.js`), shared with the indicator stage.
//
// The prune drops ids that have left the events window — an event more than
// EVENTS_WINDOW_DAYS out drops from `trends.events` at fetch time, and a past
// one drops here, so without it the file grows a tail of events the site no
// longer shows. One source, the snapshot's `events`: when it gives none (no
// snapshot, or one with no calendar) every entry is held rather than the file
// emptied to match.
const counts = await runDispatch({
  cachePath: CACHE_PATH,
  cache,
  items,
  selected,
  bundleOf: buildBundle,
  fingerprintsOf,
  ask,
  examples: prompt.examples,
  // One sentence for one identity, written once (`storedStanding`): the
  // definition the file already holds for this institution stands, whichever
  // meeting it was written for. This fingerprint does not carry the prompt,
  // so the entry's own `prompt` is what lets a rewritten rubric through.
  standingOf: (item, written, sFp) =>
    (FORCE ? '' : storedStanding(cache.items, item.key, sFp, { shared: true, prompt: promptHash })) || written,
  entryExtra: { prompt: promptHash },
  force: FORCE,
})

const elapsed = ((Date.now() - stageT0) / 1000).toFixed(1)
console.log(
  `  Dispatch: ${counts.generated} new, ${counts.cacheHits} cached, ${counts.recentDropped} recent-dropped, ` +
    `${counts.promptEchoes} prompt-echo, ${counts.rejected} rejected, ${counts.failed} failed; $${counts.costUsd.toFixed(3)} in ${elapsed}s`,
)
