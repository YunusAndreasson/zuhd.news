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

import { runSettled } from './lib/concurrency.js'
import { pathOf } from './lib/datasets.js'
import {
  GDACS_GEOJSON_URL,
  carryNarratives,
  collectionToAlerts,
  detailsInAlertOrder,
  emptyListReport,
  fetchGdacsDetail,
  isGdacsFeatureCollection,
} from './lib/gdacs.js'
import { readJson } from './lib/json-file.js'
import { fetchJson } from './lib/http.js'
import { Degrade, snapshotStage } from './lib/snapshot-stage.js'
import { stageBudget } from './lib/stage-budget.js'

// Concurrency cap for per-event detail fetches. GDACS publishes detail
// endpoints synchronously and they're fast (~200–500ms typical), but firing
// 80 at once is anti-social and risks rate-limit pushback. 6 keeps us under
// 10s wall time even on a worst-case run.
const DETAIL_CONCURRENCY = 6
const LIST_TIMEOUT_MS = 10_000

const started = Date.now()
/** One signal for every request this run makes: `lib/stage-budget.js`. */
const budget = stageBudget('fetch-gdacs')
console.log('Fetching GDACS snapshot (EVENTS4APP)')

function fetchList() {
  return fetchJson(GDACS_GEOJSON_URL, { timeoutMs: LIST_TIMEOUT_MS, signal: budget })
}

/** What the detail pass and the carried narratives came to, for the last line. */
let summary

const { written, snapshot } = await snapshotStage('fetch-gdacs', 'gdacs', produce, {
  // The list has held a hundred alerts on all but five of the last 41 runs.
  isEmpty: (s) => s.alerts.length === 0,
  pretty: false,
})

if (written) {
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `  ✓ wrote ${snapshot.alerts.length} alerts, ${summary.details}/${summary.asked} details${
      summary.failed > 0 ? ` (${summary.failed} failed)` : ''
    }${summary.narrated > 0 ? `, ${summary.narrated} narratives carried` : ''} in ${elapsed}s`,
  )
}

/** The snapshot: the current alerts, the population detail for those that have one, the desk's narratives. */
async function produce() {
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
      throw new Degrade(`list fetch failed (${err.message})`)
    }
  }

  if (!isGdacsFeatureCollection(collection)) throw new Degrade('list payload schema mismatch')

  const dropped = {}
  const alerts = collectionToAlerts(collection, undefined, dropped)

  // A list with no alert in it is a changed response, never a quiet world, and
  // this snapshot is published as it is written.
  const empty = emptyListReport(collection, alerts)
  if (empty) throw new Degrade(empty)
  if (dropped.undated) console.error(`  ⚠ ${dropped.undated} alerts dropped: no readable start date`)
  console.log(`  ✓ list: ${alerts.length} current alerts (within 30d age cliff)`)

  // Pre-fetch detail for EQ + TC alerts. Other event types (FL/VO/DR/WF)
  // surface their relevant scale through severityText already; the detail
  // endpoint has no equivalent population block for them.
  const detailCandidates = alerts.filter((a) => a.eventtype === 'EQ' || a.eventtype === 'TC')
  // Per-event failure is non-fatal — sheet just renders without the
  // population line, same as if mobile had failed the lazy fetch before.
  // Out of time, the details still to come fail at once and the list is
  // written without them: the alerts are the layer, the details one line each.
  const { values, failed } = await runSettled(detailCandidates, DETAIL_CONCURRENCY, (alert) => fetchGdacsDetail(alert, budget))
  if (budget.aborted) console.error(`  ⚠ out of time: the stage's budget ran out with ${detailCandidates.length - failed}/${detailCandidates.length} details in`)
  // Filed in the alerts' order, not the order the answers came back in.
  const details = detailsInAlertOrder(detailCandidates, values)

  // The narrator runs four stages on and may not finish; what it has already
  // written goes back on now, so the file is never published bare.
  const narrated = carryNarratives(alerts, readJson(pathOf('gdacsNarrations'), {}))

  summary = { details: detailCandidates.length - failed, asked: detailCandidates.length, failed, narrated }

  return { generated: new Date().toISOString(), alerts, details }
}
