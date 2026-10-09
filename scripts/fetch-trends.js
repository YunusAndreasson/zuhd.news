#!/usr/bin/env node
// Trends fetcher for zuhd.news.
// Reads scripts/lib/trends-registry.js, calls the configured sources, and
// writes content/trends/YYYY-MM-DD.json: the full snapshot, kept 30 days, not
// committed by the cycle since 2026-08-09 (older ones survive only in git
// history).
//
// How it holds up:
//  - Every request has a deadline, its source's own (10 to 30 s). None is
//    retried but CoinGecko's, once, on a 429.
//  - One source failing does not cost the others, and a registry row that got
//    no answer stands on the previous snapshot's for up to a week
//    (`lib/trends-collect.js`, `lib/trends-carry.js`).
//  - A missing API key skips that source with a warning; it does not abort.
//  - Writing the same day twice overwrites the snapshot. When no source
//    answers, nothing is written and the previous snapshot stays the newest.

import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { INDICATORS, SOURCES } from './lib/trends-registry.js'
import { fetchFredReleaseCalendar } from './lib/trends-sources/fred.js'
import { EVENT_CATALOG, matchFredRelease } from './lib/event-catalog.js'
import { ROOT } from './lib/paths.js'
import { readJson, writeJson } from './lib/json-file.js'
import { calendarIsFrom, carriedCalendar, carriedStocks } from './lib/trends-carry.js'
import { collectRows } from './lib/trends-collect.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

const TRENDS_DIR = join(ROOT, 'content', 'trends')
const FX_CACHE = join(TRENDS_DIR, '.fx-history.json')

const today = new Date().toISOString().slice(0, 10)
const SNAPSHOT_PATH = join(TRENDS_DIR, `${today}.json`)

/**
 * The previous cycle's snapshot, read before this run overwrites today's.
 *
 * On the second and later cycles of a day the newest file *is* today's — still
 * the previous cycle's output, which is what a dynamic source needs to keep
 * its selection stable across cycles (see `orderCandidates` in the Polymarket
 * fetcher). Null on a fresh checkout, which degrades to the old behaviour: a
 * deck chosen from scratch.
 */
const priorSnapshot = (() => {
  const latest = latestTrendsPath()
  return latest ? readJson(latest) : null
})()

// ── Run ────────────────────────────────────────────────────────────────────

const started = Date.now()
console.log(`Fetching trends for ${today}`)

// The snapshot's rows: each source in turn, a row carried from the previous
// snapshot where its fetch returned nothing, and a source that throws costing
// only itself (`collectRows`, `lib/trends-collect.js`).
const { indicators, carried } = await collectRows({
  sources: SOURCES,
  registry: INDICATORS,
  prior: priorSnapshot,
  fxCache: FX_CACHE,
})

const fetched = indicators.length - carried.length
if (carried.length > 0) {
  console.log(
    `  · ${carried.length} row(s) carried from the previous snapshot, no fresh answer: ` +
      carried.map((r) => `${r.id} (as of ${r.asOf})`).join(', '),
  )
}

// Every source came back empty: the network, most likely. The previous
// snapshot stays the newest file, as every sibling fetcher leaves its own.
// Before the rotation below, which would otherwise go on deleting the old
// files of a directory that had stopped getting new ones.
if (fetched === 0) {
  console.error('  ✗ no source returned a row — leaving the previous snapshot in place')
  process.exit(0)
}

// The stock rows the entity stage appended to the snapshot this one replaces
// (`carriedStocks`), or the chip under a story resolves for one cycle. Last,
// where that stage appends them, so the registry's rows and the contracts
// keep their order.
const stocks = carriedStocks(priorSnapshot, new Set(indicators.map((i) => i.id)))
for (const row of stocks.kept) indicators.push(row)
if (stocks.kept.length + stocks.lapsed > 0) {
  console.log(
    `  · stocks: ${stocks.kept.length} row(s) carried from the previous snapshot, ` +
      `${stocks.lapsed} left behind (last close over a week old)`,
  )
}

// Catch silent ID collisions early: every reader joins on the id, and one that
// finds by it takes the first match, so a dupe is a chart drawn from the wrong
// series. `deckIds` keeps two contracts apart; this is the net under it.
const seenIds = new Set()
for (const i of indicators) {
  if (seenIds.has(i.id)) console.warn(`  ⚠ duplicate indicator id: ${i.id}`)
  seenIds.add(i.id)
}

// Upcoming major US data releases (CPI, payrolls, GDP, FOMC…) — one extra
// FRED call, fail-soft. Concrete "what's next" dates for editorial surfaces.
//
// Once a day, not once a cycle. The endpoint is slow (`fred.js` gives it 30 s
// and says 15-20 s is usual) and the answer is ten days of dates that change
// when a day passes. `releaseCalendarAsOf` is the day of the call the calendar
// came from, so today's is used again and one carried over a failed call is
// asked for at the next cycle.
let releaseCalendar = []
let releaseCalendarAsOf = null
if (calendarIsFrom(priorSnapshot, today)) {
  releaseCalendar = carriedCalendar(priorSnapshot, today)
  releaseCalendarAsOf = today
  console.log(`  · fred: ${releaseCalendar.length} major releases, from today's earlier call`)
} else if (process.env.FRED_API_KEY) {
  releaseCalendar = await fetchFredReleaseCalendar(process.env.FRED_API_KEY)
  if (releaseCalendar.length > 0) {
    releaseCalendarAsOf = today
    console.log(`  · fred: ${releaseCalendar.length} major releases in next 10d`)
  }
}
// The call failed (it answers `[]` for that) or was not made: the previous
// snapshot's entries that are still ahead, so a slow endpoint does not take
// the CPI date off the rail for a cycle.
if (releaseCalendar.length === 0) {
  releaseCalendar = carriedCalendar(priorSnapshot, today)
  releaseCalendarAsOf = priorSnapshot?.releaseCalendarAsOf ?? null
  if (releaseCalendar.length > 0) {
    console.log(`  · fred: ${releaseCalendar.length} release(s) carried from the previous snapshot's calendar`)
  }
}

// The money rail's events block: the hand-curated catalog (central banks,
// OPEC+, major non-US releases, summits/elections — nothing here is fetched
// live, see `event-catalog.js`) merged with FRED's own recognised releases,
// windowed to the next EVENTS_WINDOW_DAYS. FOMC is deliberately not re-derived
// from `releaseCalendar` here — the catalog already carries it from the Fed's
// own published calendar, and matching it again would print the same
// decision twice a quarter.
const EVENTS_WINDOW_DAYS = 120
const eventsWindowEnd = new Date(Date.now() + EVENTS_WINDOW_DAYS * 86400_000)
  .toISOString()
  .slice(0, 10)
// One per id: FRED lists several releases a day that match one label — GDP,
// GDP by industry, GDP by state all read /^gross domestic product/ — and the
// rail printed "US GDP" three times on 2026-09-25.
const fredEvents = [...new Map(releaseCalendar.map(matchFredRelease).filter(Boolean).map((e) => [e.id, e])).values()]
const events = [...EVENT_CATALOG, ...fredEvents]
  .filter((e) => e.date >= today && e.date <= eventsWindowEnd)
  .sort((a, b) => a.date.localeCompare(b.date))
if (events.length > 0) {
  console.log(`  · events: ${events.length} in next ${EVENTS_WINDOW_DAYS}d`)
}

// ── Write snapshot ─────────────────────────────────────────────────────────

mkdirSync(TRENDS_DIR, { recursive: true })

const snapshot = {
  fetchedAt: new Date().toISOString(),
  asOf: today,
  releaseCalendar,
  ...(releaseCalendarAsOf ? { releaseCalendarAsOf } : {}),
  events,
  indicators,
}

writeJson(SNAPSHOT_PATH, snapshot)
console.log(`Wrote ${SNAPSHOT_PATH} — ${indicators.length} indicators`)

// Rotation. Every reader takes only the newest snapshot (each carries its own
// full series), so the history was 150 KB a day that nothing opened — 159
// files, 16 MB, by 2026-09-25. Thirty days keeps a month to diff by hand.
const KEEP_DAYS = 30
const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10)
let rotated = 0
for (const f of readdirSync(TRENDS_DIR)) {
  if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < cutoff) {
    unlinkSync(join(TRENDS_DIR, f))
    rotated++
  }
}
if (rotated) console.log(`Rotated ${rotated} trends snapshots older than ${KEEP_DAYS} days`)

const elapsed = Math.round((Date.now() - started) / 1000)
console.log(`Trends: ${fetched} indicators fetched, ${indicators.length - fetched} carried — ${elapsed}s`)
