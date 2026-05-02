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

import { writeFileSync } from 'fs'
import { join } from 'path'
import {
  GDACS_GEOJSON_URL,
  collectionToAlerts,
  fetchGdacsDetail,
  isGdacsFeatureCollection,
} from './lib/gdacs.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.gdacs.json')

// Concurrency cap for per-event detail fetches. GDACS publishes detail
// endpoints synchronously and they're fast (~200–500ms typical), but firing
// 80 at once is anti-social and risks rate-limit pushback. 6 keeps us under
// 10s wall time even on a worst-case run.
const DETAIL_CONCURRENCY = 6
const LIST_TIMEOUT_MS = 10_000

const started = Date.now()
console.log('Fetching GDACS snapshot (EVENTS4APP)')

let collection
try {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)
  try {
    const res = await fetch(GDACS_GEOJSON_URL, {
      signal: controller.signal,
      headers: { 'user-agent': 'zuhd-news/1.0 (+https://zuhd.news)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    collection = await res.json()
  } finally {
    clearTimeout(timer)
  }
} catch (err) {
  console.error(`  ✗ list fetch failed (${err.message}) — leaving previous snapshot in place`)
  process.exit(0)
}

if (!isGdacsFeatureCollection(collection)) {
  console.error('  ✗ list payload schema mismatch — leaving previous snapshot in place')
  process.exit(0)
}

const alerts = collectionToAlerts(collection)
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
  } catch (err) {
    // Per-event failure is non-fatal — sheet just renders without the
    // population line, same as if mobile had failed the lazy fetch before.
    failed++
  }
})

const payload = {
  generated: new Date().toISOString(),
  alerts,
  details,
}

writeFileSync(OUTPUT_PATH, JSON.stringify(payload) + '\n')

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(
  `  ✓ wrote ${alerts.length} alerts, ${succeeded}/${detailCandidates.length} details${
    failed > 0 ? ` (${failed} failed)` : ''
  } in ${elapsed}s`,
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
