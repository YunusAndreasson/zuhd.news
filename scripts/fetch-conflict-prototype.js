#!/usr/bin/env node
// Conflict-events prototype fetcher. Pulls UCDP's Candidate GED dataset
// (academic-grade geocoded violence records, freely redistributable under
// CC-BY 4.0) and writes the transformed events to mobile/lib/conflict-fixture.json
// so the existing useConflictEvents hook reads them unchanged.
//
// UCDP vs ACLED in one breath: UCDP is rigorous, monthly cadence,
// fatality-gated (≥25/year/conflict threshold), no protests/unrest. ACLED
// is daily and includes protests + riots, but commercial use requires a
// paid license — hence UCDP for the prototype, ACLED later if licensing
// clears.
//
// Usage: node scripts/fetch-conflict-prototype.js
//        WINDOW_DAYS=3 node scripts/fetch-conflict-prototype.js
//
// ─── Backend handoff ────────────────────────────────────────────────────
// When the backend takes this over, copy this file to scripts/fetch-conflict.js,
// change OUTPUT_PATH to `content/.conflict.json`, and add the same
// `/api/conflict.json` mirror that build.js already does for /api/gdacs.json.
// The transform logic in scripts/lib/conflict.js stays as-is — it produces
// the canonical ConflictSnapshot shape declared in shared/types.ts. The mobile
// hook (useConflictEvents) needs one swap: bundled-fixture import →
// `useFetchJson(`${API_BASE}/api/conflict.json`, isConflictSnapshot)`. The
// validator (isConflictSnapshot) already exists in mobile/lib/validate.ts.
// ────────────────────────────────────────────────────────────────────────

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { filterRecentWindow, mapUcdpRow, parseCsv, rowsToObjects } from './lib/conflict.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'mobile', 'lib', 'conflict-fixture.json')
const UCDP_URL = 'https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_0_3.csv'

// Time window — events within the last N days of the dataset's max date.
// UCDP records are daily-precision, so WINDOW_DAYS=1 gives "the last 24
// hours of available data" (typically 30-60 events globally; visually
// dense without overwhelming React reconciliation in MiniGlobe). Override
// at the CLI: `WINDOW_DAYS=3 node scripts/fetch-conflict-prototype.js` —
// each step roughly doubles marker count.
const WINDOW_DAYS = Math.max(1, parseInt(process.env.WINDOW_DAYS ?? '1', 10) || 1)

async function main() {
  const started = Date.now()
  console.log(`Fetching UCDP candidate GED from ${UCDP_URL}`)
  const res = await fetch(UCDP_URL)
  if (!res.ok) {
    console.error(`UCDP fetch failed: ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  const csv = await res.text()
  console.log(`Downloaded ${csv.length.toLocaleString('en-US')} bytes`)

  const rows = rowsToObjects(parseCsv(csv))
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
    __data_note:
      `Real conflict events from UCDP Candidate GED v26.0.3 (CC-BY 4.0), ` +
      `filtered to the last ${WINDOW_DAYS} day(s) of the dataset's coverage. ` +
      'UCDP is academic-grade, monthly cadence, fatality-gated; protests/riots ' +
      'are not tracked, so the unrest layer is empty here. Re-run ' +
      'scripts/fetch-conflict-prototype.js to refresh from upstream. ' +
      'For live daily updates + unrest events, switch to ACLED (commercial ' +
      'license required).',
    generated: new Date().toISOString(),
    windowStart,
    windowEnd,
    events: kept,
  }

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)

  const elapsedMs = Date.now() - started
  console.log(`Wrote ${kept.length} events to ${OUTPUT_PATH} in ${elapsedMs}ms`)
}

main().catch((err) => {
  console.error('fetch-conflict-prototype failed:', err)
  process.exit(1)
})
