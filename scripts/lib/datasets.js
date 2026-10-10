// Where the pipeline keeps things: every state location, named once.
//
// About sixty of them, and each was reached by spelling its path:
// `/tmp/zuhd-selection.json` in ten scripts, six places in `run-cycle.sh` and
// three prompts; the ledger in nine files and three spellings; ten scripts
// with paths that only resolve from the repository root. Nothing said what
// kind of thing a file was either, and it matters: a snapshot can be fetched
// again, a history cannot.
//
// A stage asks for a location by name (`pathOf('selection')`). The class is
// what a move to a database decides by: records and histories are what it
// would hold, snapshots what it could, caches and scratch what it would not.

import { isAbsolute, join } from 'node:path'
import { ROOT } from './paths.js'

/**
 * - `record`: what the cycle decides or writes and the site is built from.
 *   The source of truth; nothing regenerates it.
 * - `history`: a series that only grows. Its past exists nowhere else.
 * - `snapshot`: the latest answer from an outside source. The next fetch
 *   replaces it, and a failed fetch leaves the last one standing.
 * - `cache`: rebuildable from other state, at a cost in time or tokens.
 * - `scratch`: one cycle's working files. The next cycle clears them.
 *
 * @typedef {'record' | 'history' | 'snapshot' | 'cache' | 'scratch'} DatasetClass
 */

/** @type {Record<string, { path: string, class: DatasetClass }>} */
const catalog = {
  // ── What the cycle writes and the site is built from ──────────────────
  articles: { path: 'content/articles', class: 'record' },
  storyLedger: { path: 'content/.story-ledger.json', class: 'record' },
  lastCycle: { path: 'content/.last-cycle.json', class: 'record' },
  swedish: { path: 'content/.sv.json', class: 'record' },
  marketSignals: { path: 'content/.market-signals.json', class: 'record' },
  marketSignalState: { path: 'content/.market-signal-state.json', class: 'record' },
  indicatorDispatch: { path: 'content/.indicator-dispatch.json', class: 'record' },
  eventsDispatch: { path: 'content/.events-dispatch.json', class: 'record' },
  experiments: { path: 'content/.experiments.json', class: 'record' },
  dailyAudit: { path: 'content/.daily-audit.json', class: 'record' },
  dailyAuditNotes: { path: 'content/.daily-audit.md', class: 'record' },
  // Frozen since the edu-context stage was removed on 2026-06-19; still built from.
  contextBriefs: { path: 'content/.context-briefs.json', class: 'record' },
  audio: { path: 'content/audio', class: 'record' },
  briefingMeta: { path: 'content/audio/briefing-meta.json', class: 'record' },

  // ── Series ─────────────────────────────────────────────────────────────
  cycleLogs: { path: 'logs', class: 'history' },
  cycleRuns: { path: 'logs/runs', class: 'history' },
  cycleSeries: { path: 'logs/cycles.jsonl', class: 'history' },
  pushLog: { path: 'content/.push-log.json', class: 'history' },
  tweetLog: { path: 'content/.tweet-log.json', class: 'history' },
  instagramLog: { path: 'content/.instagram-log.json', class: 'history' },
  rvsTrend: { path: 'content/.rvs-trend.json', class: 'history' },
  qualityTrend: { path: 'content/.quality-trend.json', class: 'history' },
  specificityTrend: { path: 'content/.specificity-trend.json', class: 'history' },
  analyticsHistory: { path: 'content/.analytics-history.json', class: 'history' },
  iodaHistory: { path: 'content/.ioda-history.json', class: 'history' },
  fxHistory: { path: 'content/trends/.fx-history.json', class: 'history' },
  feedSnapshots: { path: 'content/.feed-snapshots', class: 'history' },
  feedSnapshotsMerged: { path: 'content/.feed-snapshots-merged', class: 'history' },
  autoresearchHistory: { path: 'content/.autoresearch-history', class: 'history' },

  // ── The latest from outside ────────────────────────────────────────────
  trends: { path: 'content/trends', class: 'snapshot' },
  chokepoints: { path: 'content/.chokepoints.json', class: 'snapshot' },
  markets: { path: 'content/.markets.json', class: 'snapshot' },
  companies: { path: 'content/.companies.json', class: 'snapshot' },
  aiModels: { path: 'content/.ai-models.json', class: 'snapshot' },
  gdacs: { path: 'content/.gdacs.json', class: 'snapshot' },
  conflict: { path: 'content/.conflict.json', class: 'snapshot' },
  firms: { path: 'content/.firms.json', class: 'snapshot' },
  ipc: { path: 'content/.ipc.json', class: 'snapshot' },
  ioda: { path: 'content/.ioda.json', class: 'snapshot' },
  analytics: { path: 'content/.analytics.json', class: 'snapshot' },

  // ── Rebuildable ────────────────────────────────────────────────────────
  gdacsNarrations: { path: 'content/.gdacs-narrations.json', class: 'cache' },
  blockCache: { path: 'content/.block-cache.json', class: 'cache' },
  stocksCache: { path: 'content/.stocks-cache.json', class: 'cache' },
  // The consecutive count of cycles that published nothing; the run records say the same.
  cycleAlert: { path: 'content/.cycle-alert.json', class: 'cache' },
  apiStamps: { path: '.cache/api-stamps.json', class: 'cache' },
  ogCards: { path: '.cache/og', class: 'cache' },
  igCards: { path: '.cache/ig', class: 'cache' },
  countryCards: { path: '.cache/og-country', class: 'cache' },

  // ── One cycle's working files ──────────────────────────────────────────
  cycleLock: { path: '/tmp/zuhd-cycle.lock', class: 'scratch' },
  feedApi: { path: '/tmp/zuhd-feed-api.json', class: 'scratch' },
  feedRss: { path: '/tmp/zuhd-feed-rss.json', class: 'scratch' },
  feed: { path: '/tmp/zuhd-feed.json', class: 'scratch' },
  feedSlim: { path: '/tmp/zuhd-feed-slim.json', class: 'scratch' },
  feedSourceStats: { path: '/tmp/zuhd-feed-source-stats.json', class: 'scratch' },
  selection: { path: '/tmp/zuhd-selection.json', class: 'scratch' },
  newArticles: { path: '/tmp/zuhd-new-articles.txt', class: 'scratch' },
  metrics: { path: '/tmp/zuhd-metrics.json', class: 'scratch' },
  breakingPick: { path: 'content/.breaking-pick.json', class: 'scratch' },
  analyticsError: { path: 'content/.analytics-error.json', class: 'scratch' },
}

/** Every state location: its path as written from the repository root (or absolute, in `/tmp`), and its class. */
export const DATASETS = Object.freeze(catalog)

/**
 * The absolute path of a named location. An unknown name throws: a stage that
 * reads from nowhere and finds nothing looks exactly like a quiet day.
 *
 * @param {string} name
 * @returns {string}
 */
export function pathOf(name) {
  const entry = DATASETS[name]
  if (!entry) throw new Error(`pathOf: no dataset named "${name}"`)
  return isAbsolute(entry.path) ? entry.path : join(ROOT, entry.path)
}
