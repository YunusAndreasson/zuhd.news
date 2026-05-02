#!/usr/bin/env node
// Conflict-events snapshot fetcher for the mobile globe's conflict layer.
// Mirrors the fetch-gdacs.js pattern: one server-side fetch per cycle
// replaces N fetches per install. Pulls UCDP's Candidate GED dataset
// (academic-grade geocoded violence records, freely redistributable under
// CC-BY 4.0) and writes the canonical ConflictSnapshot to content/.conflict.json.
//
// Output: content/.conflict.json
// Shape:  { generated, windowStart, windowEnd, events: ConflictEvent[] }
//
// UCDP candidate data refreshes monthly — we cap upstream churn with a
// 6h mtime cache to avoid re-downloading the multi-MB CSV every cycle
// (5×/day = wasteful for monthly-cadence data). The cycle still runs
// every iteration; the cache short-circuits when the snapshot is fresh.
//
// Best-effort: any failure leaves the prior snapshot in place. Build.js
// skips the API mirror when the file is absent, and mobile renders an
// empty conflict layer when /api/conflict.json 404s.
//
// Usage: node scripts/fetch-conflict.js
//        WINDOW_DAYS=3 node scripts/fetch-conflict.js
//        FORCE=1 node scripts/fetch-conflict.js  (bypass mtime cache)

import { writeFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { filterRecentWindow, mapUcdpRow, parseCsv, rowsToObjects } from './lib/conflict.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.conflict.json')
const UCDP_URL = 'https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_0_3.csv'

// UCDP candidate is a daily-precision dataset trailing real-time by 1-3
// months — narrow windows (1-2d) collapse to whatever the dataset's max
// date is, producing a sparse single-day pile. 7d spreads markers across
// a real conflict week (Burkina, Sudan, Myanmar, Mexico, Ukraine, Lebanon)
// and stays under MiniGlobe's ~150-marker perf threshold (typical: ~240
// events globally, 30-50 visible per hemisphere on the globe).
const WINDOW_DAYS = Math.max(1, parseInt(process.env.WINDOW_DAYS ?? '7', 10) || 7)

// Skip re-fetch when the local snapshot is younger than this. UCDP
// candidate updates monthly so 6h is plenty fresh; saves ~50 MB/day of
// upstream bandwidth and ~10s of cycle wall time.
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 60_000

function cacheFresh() {
  if (process.env.FORCE) return false
  if (!existsSync(OUTPUT_PATH)) return false
  try {
    const ageMs = Date.now() - statSync(OUTPUT_PATH).mtimeMs
    return ageMs < CACHE_MAX_AGE_MS
  } catch {
    return false
  }
}

const started = Date.now()

if (cacheFresh()) {
  console.log(`Snapshot fresh (<6h) — keeping existing ${OUTPUT_PATH}`)
  process.exit(0)
}

console.log(`Fetching UCDP candidate GED from ${UCDP_URL}`)

let csv
try {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(UCDP_URL, {
      signal: controller.signal,
      headers: { 'user-agent': 'zuhd-news/1.0 (+https://zuhd.news)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    csv = await res.text()
  } finally {
    clearTimeout(timer)
  }
} catch (err) {
  console.error(`  ✗ UCDP fetch failed (${err.message}) — leaving previous snapshot in place`)
  process.exit(0)
}

console.log(`Downloaded ${csv.length.toLocaleString('en-US')} bytes`)

let rows
try {
  rows = rowsToObjects(parseCsv(csv))
} catch (err) {
  console.error(`  ✗ UCDP parse failed (${err.message}) — leaving previous snapshot in place`)
  process.exit(0)
}
console.log(`Parsed ${rows.length.toLocaleString('en-US')} rows`)

const events = []
for (const r of rows) {
  const event = mapUcdpRow(r)
  if (event) events.push(event)
}
console.log(`Filtered to ${events.length.toLocaleString('en-US')} events after quality gates`)

const { kept, windowStart, windowEnd } = filterRecentWindow(events, WINDOW_DAYS)
console.log(
  `Kept ${kept.length} events in window ${windowStart} → ${windowEnd} (last ${WINDOW_DAYS}d of dataset)`,
)

const snapshot = {
  generated: new Date().toISOString(),
  windowStart,
  windowEnd,
  events: kept,
}

writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)

const elapsedMs = Date.now() - started
console.log(`Wrote ${kept.length} events to ${OUTPUT_PATH} in ${elapsedMs}ms`)
