#!/usr/bin/env node
// Thermal-anomaly snapshot — the map's `thermal` layer.
//
// NASA FIRMS publishes satellite-detected active fires: one row per pixel where
// a VIIRS pass measured infrared radiance above the local background. This
// fetcher asks only where the map already asserts something is happening, then
// hands the rows to `lib/firms.js` to be filtered, clustered and published.
//
// Output: content/.firms.json
// Shape:  { generated, source, dayRange, cells, cellsFailed, aoiDropped,
//           events: ThermalEvent[], skipped: { persistent, belowFloor } }
//
// Best-effort, same contract as fetch-gdacs.js: any failure leaves the prior
// snapshot in place and exits 0, so a bad pass never stops a cycle. Build.js
// skips the mirror when the file is absent and the map draws an empty layer when
// /api/firms.json 404s.
//
// ── Why the AOIs come from the corpus ──────────────────────────────────────
//
// A `world` query is available and would be the wrong thing to ask for. Global
// VIIRS is 50–150k detections a day and almost all of it is agricultural
// burning: drawn on a news map, in a warning tone, each mark would assert a
// cause the data cannot separate — the reason `fetch-ioda.js` exists and renders
// nothing. Scoping the query to places the corpus already covers makes every
// mark corroboration for something with a chain of sources behind it, and takes
// the download from tens of megabytes to well under one.
//
// Seeds are the 14-day story window, and nothing else. Two other feeds were
// tried and both were wrong, for opposite reasons. Conflict events are months in
// arrears, so those cells would return today's fires beside a record from the
// spring. GDACS alerts *are* current, and the idea was to show a declared
// wildfire's actual footprint — but measured against a real snapshot, **1,164 of
// 1,391 events sat within 75 km of a GDACS alert**, because one wildfire alert
// has hundreds of clusters inside that radius. That is the fire texture this
// layer exists to avoid, and it would have re-stated something the disaster
// layer already asserts.
//
// So the layer's claim is narrow and checkable: heat the satellite saw, beside a
// story we published, close enough in time to be the same event.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from './lib/frontmatter.js'
import {
  aoiCells,
  classifyCells,
  clusterEvents,
  JOIN_RADIUS_KM,
  minDistanceKm,
  parseFirmsCsv,
} from './lib/firms.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.firms.json')
const ARTICLES_DIR = join(ROOT, 'content', 'articles')

/**
 * VIIRS aboard Suomi-NPP. One instrument rather than the four available: each
 * extra source is another request per cell for detections of the same fires, and
 * `satellites` on the published event already says which pass saw it.
 */
const SOURCE = 'VIIRS_SNPP_NRT'

/**
 * Days per query. Five is the API's ceiling, and the whole reason to ask for
 * more than one: days two to five are the baseline the flare filter judges
 * against. NRT carries no `type` column, so persistence is the only way to tell
 * a gas flare from a fire, and a one-day window cannot see persistence at all.
 */
const DAY_RANGE = 5

/** The story window, matching `BUILD_WINDOW_DAYS` in build.js. */
const WINDOW_DAYS = 14

const REQUEST_TIMEOUT_MS = 30_000
/** Concurrent cell requests. FIRMS allows 5000 per 10 minutes; this is about
 *  finishing inside a pipeline stage without hammering a public service. */
const CELL_CONCURRENCY = 4

const key = process.env.FIRMS_MAP_KEY
if (!key) {
  // Same shape as the optional keys in fetch-trends.js: a missing credential is
  // a skipped source, never a failed cycle.
  console.log('Thermal snapshot: FIRMS_MAP_KEY not set — skipping, previous snapshot kept')
  process.exit(0)
}

const started = Date.now()
console.log(`Fetching thermal anomalies (${SOURCE}, ${DAY_RANGE}d)`)

// --- Seeds ----------------------------------------------------------------

const windowStart = Date.now() - WINDOW_DAYS * 86_400_000
const seeds = []

if (existsSync(ARTICLES_DIR)) {
  for (const file of readdirSync(ARTICLES_DIR)) {
    if (!file.endsWith('.md')) continue
    try {
      const { meta } = parseFrontmatter(readFileSync(join(ARTICLES_DIR, file), 'utf8'))
      if (meta?.lat == null || meta?.lng == null) continue
      const t = meta.date ? Date.parse(meta.date) : NaN
      // No date is not a reason to drop a seed — the AOI is coarse and the join
      // happens in build.js against the real point set.
      if (Number.isFinite(t) && t < windowStart) continue
      seeds.push({ lat: meta.lat, lng: meta.lng })
    } catch {
      // A single unparseable article must not cost the whole layer.
    }
  }
}
const { cells, dropped } = aoiCells(seeds)
console.log(
  `  ${cells.length} AOI cells from ${seeds.length} geo-located stories` +
    (dropped > 0 ? ` (${dropped} cells over the cap, dropped)` : ''),
)

if (cells.length === 0) {
  console.error('  ✗ no AOI cells — leaving previous snapshot in place')
  process.exit(0)
}

// --- Fetch ----------------------------------------------------------------

const cellUrl = (bbox) =>
  `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${SOURCE}/${bbox.join(',')}/${DAY_RANGE}`

async function fetchCell(cell) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(cellUrl(cell.bbox), {
      signal: controller.signal,
      headers: { 'user-agent': 'zuhd-news/1.0 (+https://zuhd.news)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    // FIRMS answers a bad key or an over-quota caller with 200 and a sentence,
    // not a status code. Without this the CSV parser throws "missing expected
    // columns" once per cell and the real reason never reaches the log.
    if (/invalid|error|exceed/i.test(text.slice(0, 200)) && !text.startsWith('latitude')) {
      throw new Error(`upstream said: ${text.slice(0, 120).replace(/\s+/g, ' ').trim()}`)
    }
    return parseFirmsCsv(text)
  } finally {
    clearTimeout(timer)
  }
}

const rows = []
let cellsFailed = 0
let firstError = null

await runWithConcurrency(cells, CELL_CONCURRENCY, async (cell) => {
  try {
    rows.push(...(await fetchCell(cell)))
  } catch (err) {
    cellsFailed++
    if (!firstError) firstError = err.message
  }
})

if (cellsFailed === cells.length) {
  console.error(
    `  ✗ every cell failed (${firstError}) — leaving previous snapshot in place`,
  )
  process.exit(0)
}
if (cellsFailed > 0) {
  // Recorded rather than swallowed: a partial fetch publishes a partial map, and
  // that has to be visible in the payload rather than looking like a quiet day.
  console.error(`  ⚠ ${cellsFailed}/${cells.length} cells failed (${firstError})`)
}

console.log(`  ✓ ${rows.length} detections across ${cells.length - cellsFailed} cells`)

// --- Filter and cluster ---------------------------------------------------

// Classified and clustered over the whole set at once, not per cell: a fire on a
// cell boundary is one fire, and clustering inside each response would publish
// it as two events with half the radiative power each.
const now = Date.now()
const classified = classifyCells(rows, { now })
const { events: clustered, skipped } = clusterEvents(rows, classified, { now })

// The scope, enforced. An AOI cell is 1,100 km across, so querying around the
// corpus bounds the download and not the map: the first run of this fetcher
// produced 7,771 events, most of them crop fires hundreds of kilometres from
// anything we published. Only anomalies within the join radius of a seed survive
// — which is the same radius build.js does the article join on, so an event that
// reaches the payload can always be explained by something on the map.
const events = []
let unattached = 0
for (const event of clustered) {
  const km = minDistanceKm(event, seeds)
  if (km > JOIN_RADIUS_KM) {
    unattached++
    continue
  }
  events.push({ ...event, seedKm: Math.round(km * 10) / 10 })
}

const payload = {
  generated: new Date(now).toISOString(),
  source: SOURCE,
  dayRange: DAY_RANGE,
  joinRadiusKm: JOIN_RADIUS_KM,
  cells: cells.length,
  cellsFailed,
  aoiDropped: dropped,
  events,
  skipped: { ...skipped, unattached },
}

writeFileSync(OUTPUT_PATH, JSON.stringify(payload) + '\n')

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(
  `  ✓ wrote ${events.length} events of ${clustered.length} clustered ` +
    `(${unattached} beyond ${JOIN_RADIUS_KM}km of any story, ` +
    `${skipped.persistent} detections in steady sources, ` +
    `${skipped.belowFloor} clusters under the floor) in ${elapsed}s`,
)

async function runWithConcurrency(items, limit, worker) {
  const queue = items.slice()
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      if (next === undefined) return
      await worker(next)
    }
  })
  await Promise.all(runners)
}
