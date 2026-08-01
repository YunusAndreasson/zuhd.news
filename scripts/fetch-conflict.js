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

import { writeFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { filterRecentWindow, mapUcdpRow, parseCsv, rowsToObjects } from './lib/conflict.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.conflict.json')
// UCDP candidate release version — bump monthly when UCDP publishes the next
// candidate (26.0.1 … 26.0.5 monthly, 26.01.26.03 quarterly). One constant
// drives both the JSON API path and the legacy CSV fallback URL.
const UCDP_VERSION = '26.0.3'
const UCDP_API_URL = `https://ucdpapi.pcr.uu.se/api/gedevents/${UCDP_VERSION}`
const UCDP_URL = `https://ucdp.uu.se/downloads/candidateged/GEDEvent_v${UCDP_VERSION.replace(/\./g, '_')}.csv`
// The JSON API (a few hundred KB paginated vs the ~50 MB CSV) requires a free
// access token since 2026 (header x-ucdp-access-token; register at ucdp.uu.se).
// Without UCDP_ACCESS_TOKEN in the env we skip straight to the CSV.
const UCDP_TOKEN = process.env.UCDP_ACCESS_TOKEN || ''

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

async function fetchWithTimeout(url, extraHeaders = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'zuhd-news/1.0 (+https://zuhd.news)', ...extraHeaders },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

// Primary: UCDP JSON API — paginated, a few hundred KB total vs the ~50 MB CSV.
// The candidate release is one bounded month, so we paginate the whole version
// with NO server-side date filter: the dataset trails real-time by 1-3 months,
// and filterRecentWindow anchors on the dataset's own max date, not on today.
// Response shape: { TotalCount, TotalPages, Result: [...] } with the same
// lowercase field names as the CSV, so mapUcdpRow consumes rows unchanged.
async function fetchRowsFromApi() {
  const PAGE_SIZE = 1000
  const MAX_PAGES = 40 // defensive cap: a candidate month is a few thousand rows
  const rows = []
  let page = 0
  let totalPages = 1
  while (page < totalPages && page < MAX_PAGES) {
    const res = await fetchWithTimeout(
      `${UCDP_API_URL}?pagesize=${PAGE_SIZE}&page=${page}`,
      { 'x-ucdp-access-token': UCDP_TOKEN },
    )
    const data = await res.json()
    if (!Array.isArray(data.Result)) throw new Error('unexpected API shape (no Result array)')
    // Stringify all values: the CSV path delivers strings, and mapUcdpRow's
    // comparisons (e.g. type_of_violence === '3') depend on that.
    for (const r of data.Result) {
      rows.push(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])))
    }
    totalPages = Number(data.TotalPages) || 1
    page++
  }
  if (page >= MAX_PAGES && totalPages > MAX_PAGES) {
    console.error(`  ⚠ UCDP API pagination capped at ${MAX_PAGES} pages (${totalPages} reported) — window may be partial`)
  }
  console.log(`Fetched ${rows.length.toLocaleString('en-US')} rows from UCDP API (${page} pages)`)
  return rows
}

// Fallback: the legacy multi-MB CSV download.
async function fetchRowsFromCsv() {
  console.log(`Falling back to CSV: ${UCDP_URL}`)
  const res = await fetchWithTimeout(UCDP_URL)
  const csv = await res.text()
  console.log(`Downloaded ${csv.length.toLocaleString('en-US')} bytes`)
  return rowsToObjects(parseCsv(csv))
}

let rows
if (UCDP_TOKEN) {
  try {
    console.log(`Fetching UCDP candidate GED from ${UCDP_API_URL}`)
    rows = await fetchRowsFromApi()
  } catch (apiErr) {
    console.error(`  ✗ UCDP API fetch failed (${apiErr.message}) — trying CSV fallback`)
  }
} else {
  console.log('No UCDP_ACCESS_TOKEN — using CSV download (register a free token at ucdp.uu.se to switch to the ~KB JSON API)')
}
if (!rows) {
  try {
    rows = await fetchRowsFromCsv()
  } catch (err) {
    console.error(`  ✗ UCDP fetch failed (${err.message}) — leaving previous snapshot in place`)
    process.exit(0)
  }
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
