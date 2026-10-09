#!/usr/bin/env node
// Conflict-events snapshot, for the conflict layer on the map and the globe.
// One fetch on the server replaces one on every install. The source is UCDP's
// Candidate Events Dataset: geocoded records of organised violence, coded by
// hand at Uppsala, redistributable under CC-BY 4.0.
//
// Output: content/.conflict.json, which the build mirrors to /api/conflict.json
// Shape:  { generated, ucdpVersion, windowStart, windowEnd, events: ConflictEvent[] }
//
// A candidate release is one month, published about a month in arrears, as one
// CSV: 1.4 MB and 1,806 rows for August 2026. About half the rows pass the
// quality gates in `lib/conflict.js`, and the snapshot is the last week of the
// release, counted back from its own newest date and never from today.
//
// The release is pinned (`UCDP_VERSION`), and the pin is the dataset's recency:
// nothing fails while it goes stale. Two things watch it, both below. The lag
// alarm warns when the window has fallen 45 days behind, and after each write
// the fetcher asks UCDP whether the next release's file exists yet.
//
// The cycle calls this every run and it fetches when the snapshot is six hours
// old, by the `generated` stamp inside it and never by the file's mtime.
//
// Best-effort: any failure, and any release with no usable event in it, leaves
// the last snapshot in place and exits 0. The build skips the mirror when the
// file is absent, and the app draws an empty layer when /api/conflict.json 404s.
//
// Usage: node scripts/fetch-conflict.js
//        WINDOW_DAYS=3 node scripts/fetch-conflict.js
//        FORCE=1 node scripts/fetch-conflict.js  (fetch whatever the snapshot's age)

import {
  candidateCsvUrl,
  emptyReleaseReport,
  filterRecentWindow,
  mapUcdpRow,
  nextReleases,
  parseCsv,
  rowsToObjects,
} from './lib/conflict.js'
import { pathOf } from './lib/datasets.js'
import { fetchOk } from './lib/http.js'
import { Degrade, snapshotStage } from './lib/snapshot-stage.js'

// The candidate release this reads. Its last number is the month: 26.0.8 is
// August 2026, and the release after 26.0.12 is 27.0.1.
// Was pinned at 26.0.3 until 2026-08-30, four releases behind, which is the
// only reason the globe's conflict layer was showing a 25-31 March window in
// late August. The bump is not optional maintenance: this constant IS the
// dataset's recency, and nothing failed while it rotted — see DATASET_STALE_DAYS
// and the probe after the write.
const UCDP_VERSION = '26.0.8'
const UCDP_URL = candidateCsvUrl(UCDP_VERSION)

// UCDP candidate is a daily-precision dataset trailing real-time by 1-3
// months — narrow windows (1-2d) collapse to whatever the dataset's max
// date is, producing a sparse single-day pile. 7d spreads markers across
// a real conflict week (Burkina, Sudan, Myanmar, Mexico, Ukraine, Lebanon)
// and stays under MiniGlobe's ~150-marker perf threshold (typical: ~240
// events globally, 30-50 visible per hemisphere on the globe).
const WINDOW_DAYS = Math.max(1, parseInt(process.env.WINDOW_DAYS ?? '7', 10) || 7)

// Skip the fetch when the snapshot is younger than this. The release changes
// once a month and the file is the same 1.4 MB each time it is asked for.
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000
// Generous for a file this size, which arrives in half a second: it was set
// when the download was believed to be ~50 MB. Inside the stage's `timeout 120`.
const CSV_TIMEOUT_MS = 105_000

const started = Date.now()

const { written, snapshot } = await snapshotStage('fetch-conflict', 'conflict', produce, {
  isEmpty: (s) => s.events.length === 0,
  // Freshness comes from the `generated` stamp INSIDE the snapshot, never the
  // file mtime. `run-cycle.sh` runs `git pull --rebase --autostash` three times a
  // cycle, and autostash rewrites every modified file — which refreshed this
  // file's mtime on every run and made the 6h window permanently unexpired. The
  // snapshot silently froze: last real fetch 2026-08-23, still being served a
  // week later. coverage-map.js already carries this warning ("git ops change
  // mtime, breaking the window"); this fetcher was the one place that missed it.
  freshFor: CACHE_MAX_AGE_MS,
  // A bumped pin must fetch now, not up to six hours later.
  freshIf: (previous) => previous.ucdpVersion === UCDP_VERSION,
  force: Boolean(process.env.FORCE),
})

if (written) {
  console.log(`Wrote ${snapshot.events.length} events to ${pathOf('conflict')} in ${Date.now() - started}ms`)

  // The next release, asked directly. The lag alarm in `produce` is a proxy that
  // fires weeks late (26.0.8 was live while 26.0.7 was pinned and nothing
  // warned); a HEAD on the next file's name is the fact itself. Both names it
  // could have are asked: next month's, and the first of next year's, which is
  // what follows a December and which `patch + 1` alone would never find.
  //
  // After the write, because it is advice. Ahead of it, its fifteen seconds were
  // added to the download's 105 inside a 120-second stage, so a slow answer to a
  // question nobody needed answered could cost a snapshot already in hand.
  //
  // One line either way: "not yet" from a probe that works and silence from one
  // that has stopped working must not look the same in the log.
  const asked = await Promise.all(
    nextReleases(UCDP_VERSION).map(async (version) => {
      try {
        const head = await fetch(candidateCsvUrl(version), { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
        return { version, ok: head.ok, said: `HTTP ${head.status}` }
      } catch (err) {
        return { version, ok: false, said: err.message }
      }
    }),
  )
  const out = asked.filter((a) => a.ok)
  if (out.length > 0) {
    console.error(
      `  ⚠ UCDP candidate v${out.map((a) => a.version).join(', v')} is published — bump UCDP_VERSION (pinned ${UCDP_VERSION})`,
    )
  } else {
    console.log(`  next release not yet published (${asked.map((a) => `v${a.version}: ${a.said}`).join('; ')})`)
  }
}

/** The snapshot: the last week of the pinned release, of the rows that pass the gates. */
async function produce() {
  // The release, as rows. There was a second way in, UCDP's paginated JSON API
  // behind an access token, written on the belief that the CSV was ~50 MB. It is
  // 1.4 MB, the token was never set, and the path had never run: it asked for up
  // to forty pages at sixty seconds each inside a 120-second stage and skipped
  // the column check below. It is gone; this is the one fetch.
  let rows
  try {
    console.log(`Fetching UCDP candidate GED v${UCDP_VERSION}: ${UCDP_URL}`)
    const res = await fetchOk(UCDP_URL, { timeoutMs: CSV_TIMEOUT_MS })
    const csv = await res.text()
    console.log(`Downloaded ${csv.length.toLocaleString('en-US')} bytes`)
    rows = rowsToObjects(parseCsv(csv))
  } catch (err) {
    throw new Degrade(`UCDP fetch failed (${err.message})`)
  }
  console.log(`Parsed ${rows.length.toLocaleString('en-US')} rows`)

  const events = []
  const dropped = {}
  const today = new Date().toISOString().slice(0, 10)
  for (const r of rows) {
    const event = mapUcdpRow(r, dropped, { today })
    if (event) events.push(event)
  }
  console.log(`Filtered to ${events.length.toLocaleString('en-US')} events after quality gates`)
  if (dropped.undated || dropped.undatedSources || dropped.unreadableEnd) {
    console.error(
      `  ⚠ unreadable dates: ${dropped.undated ?? 0} events dropped, ` +
        `${dropped.undatedSources ?? 0} reported sources dropped, ${dropped.unreadableEnd ?? 0} end dates left off`,
    )
  }
  if (dropped.postdated) {
    console.error(`  ⚠ ${dropped.postdated} events dropped: dated after today (${today}), in a dataset a month in arrears`)
  }

  // A release with no event in it is a changed file, never a month of peace, and
  // this snapshot is published as it is written.
  const empty = emptyReleaseReport(rows, events)
  if (empty) throw new Degrade(empty)

  const { kept, windowStart, windowEnd } = filterRecentWindow(events, WINDOW_DAYS)
  console.log(
    `Kept ${kept.length} events in window ${windowStart} → ${windowEnd} (last ${WINDOW_DAYS}d of dataset)`,
  )

  // UCDP candidate trails real-time by 1-3 months by design, so a window a few
  // weeks back is normal and must not warn. Past this, the pin is stale rather
  // than the dataset lagging — which is exactly how a 25-31 March window went
  // unnoticed into late August: the line above printed it every time, correctly,
  // and read as normal. Bump UCDP_VERSION when this fires.
  const DATASET_STALE_DAYS = 45
  const windowEndMs = Date.parse(windowEnd)
  if (Number.isFinite(windowEndMs)) {
    const lagDays = Math.floor((Date.now() - windowEndMs) / 86400000)
    if (lagDays > DATASET_STALE_DAYS) {
      console.error(
        `  ⚠ UCDP v${UCDP_VERSION} is ${lagDays}d behind (window ends ${windowEnd}) — a newer candidate release is probably out; bump UCDP_VERSION`,
      )
    }
  }

  return {
    generated: new Date().toISOString(),
    ucdpVersion: UCDP_VERSION,
    windowStart,
    windowEnd,
    events: kept,
  }
}
