#!/usr/bin/env node
// GDACS snapshot fetcher for the mobile globe's disaster layer. One server-
// side fetch per cycle replaces N fetches per install — every device used
// to hit gdacsapi/.../EVENTS4APP on launch + 1h-stale resume, plus 1–3
// detail fetches per disaster sheet open. Now: cycle pulls everything
// once, mobile reads /api/gdacs.json from Cloudflare cache.
//
// Output: content/.gdacs.json
// Shape:  { generated, alerts: GdacsAlert[], details: { "EQ:1234567": GdacsDetail, ... } }
//
// Best-effort: any failure leaves the prior snapshot in place. Build.js
// skips the API mirror when the file is absent, and mobile renders an empty
// alert list when /api/gdacs.json 404s — same fail-soft path as chokepoints.

import { join } from 'node:path'
import { runWithConcurrency } from './lib/concurrency.js'
import { pathOf } from './lib/datasets.js'
import {
  GDACS_GEOJSON_URL,
  carryNarratives,
  collectionToAlerts,
  emptyListReport,
  fetchGdacsDetail,
  isGdacsFeatureCollection,
} from './lib/gdacs.js'
import { ROOT } from './lib/paths.js'
import { readJson, writeJson } from './lib/json-file.js'
import { fetchJson } from './lib/http.js'

const OUTPUT_PATH = join(ROOT, 'content', '.gdacs.json')

// Concurrency cap for per-event detail fetches. GDACS publishes detail
// endpoints synchronously and they're fast (~200–500ms typical), but firing
// 80 at once is anti-social and risks rate-limit pushback. 6 keeps us under
// 10s wall time even on a worst-case run.
const DETAIL_CONCURRENCY = 6
const LIST_TIMEOUT_MS = 10_000

const started = Date.now()
console.log('Fetching GDACS snapshot (EVENTS4APP)')

function fetchList() {
  return fetchJson(GDACS_GEOJSON_URL, { timeoutMs: LIST_TIMEOUT_MS })
}

let collection
try {
  collection = await fetchList()
} catch (firstErr) {
  // GDACS intermittently aborts the list fetch (~10% of cycles) — one retry
  // after a short backoff recovers most, keeping the snapshot from going stale.
  console.error(`  ⚠ list fetch failed (${firstErr.message}) — retrying once`)
  await new Promise((r) => setTimeout(r, 3000))
  try {
    collection = await fetchList()
  } catch (err) {
    console.error(`  ✗ list fetch failed (${err.message}) — leaving previous snapshot in place`)
    process.exit(0)
  }
}

if (!isGdacsFeatureCollection(collection)) {
  console.error('  ✗ list payload schema mismatch — leaving previous snapshot in place')
  process.exit(0)
}

const dropped = {}
const alerts = collectionToAlerts(collection, undefined, dropped)

// A list with no alert in it is a changed response, never a quiet world, and
// this snapshot is published as it is written.
const empty = emptyListReport(collection, alerts)
if (empty) {
  console.error(`  ✗ ${empty} — leaving previous snapshot in place`)
  process.exit(0)
}
if (dropped.undated) console.error(`  ⚠ ${dropped.undated} alerts dropped: no readable start date`)
console.log(`  ✓ list: ${alerts.length} current alerts (within 30d age cliff)`)

// Pre-fetch detail for EQ + TC alerts. Other event types (FL/VO/DR/WF)
// surface their relevant scale through severityText already; the detail
// endpoint has no equivalent population block for them.
const detailCandidates = alerts.filter((a) => a.eventtype === 'EQ' || a.eventtype === 'TC')
const details = {}
let succeeded = 0
let failed = 0

await runWithConcurrency(detailCandidates, DETAIL_CONCURRENCY, async (alert) => {
  try {
    const detail = await fetchGdacsDetail(alert)
    details[`${alert.eventtype}:${alert.eventid}`] = detail
    succeeded++
  } catch {
    // Per-event failure is non-fatal — sheet just renders without the
    // population line, same as if mobile had failed the lazy fetch before.
    failed++
  }
})

// The narrator runs four stages on and may not finish; what it has already
// written goes back on now, so the file is never published bare.
const narrated = carryNarratives(alerts, readJson(pathOf('gdacsNarrations'), {}))

const payload = {
  generated: new Date().toISOString(),
  alerts,
  details,
}

writeJson(OUTPUT_PATH, payload, { pretty: false })

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(
  `  ✓ wrote ${alerts.length} alerts, ${succeeded}/${detailCandidates.length} details${
    failed > 0 ? ` (${failed} failed)` : ''
  }${narrated > 0 ? `, ${narrated} narratives carried` : ''} in ${elapsed}s`,
)
