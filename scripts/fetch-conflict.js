#!/usr/bin/env node
// Conflict-events snapshot, for the conflict layer on the map and the globe.
// One fetch on the server replaces one on every install. The source is UCDP's
// Candidate Events Dataset: geocoded records of organised violence, coded by
// hand at Uppsala, redistributable under CC-BY 4.0.
//
// Output: content/.conflict.json, which the build mirrors to /api/conflict.json
// Shape:  { generated, ucdpVersion, windowStart, windowEnd, events: ConflictEvent[],
//           skipped: { lowPrecision, noFatalities, …, outsideWindow } }
//
// A candidate release is one month, published about a month in arrears, as one
// CSV: 1.4 MB and 1,806 rows for August 2026. About half the rows pass the
// quality gates in `lib/conflict.js`, and the snapshot is the last week of the
// release, counted back from its own newest date and never from today.
//
// The release read is the newest UCDP has published, found on each fetch by
// asking after the files that can follow the one in hand (`newestRelease`,
// `lib/conflict.js`): one HEAD a name, starting from the snapshot's own release
// or the floor (`UCDP_FLOOR`), whichever is newer. UCDP publishes month M on the
// 20th of M+1. The lag alarm warns when the window has fallen behind what that
// cadence allows, which now means the walk has stopped finding releases.
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
  compareReleases,
  emptyReleaseReport,
  filterRecentWindow,
  droppedRowsReport,
  mapUcdpRow,
  newestRelease,
  newGateTally,
  REQUIRED_COLUMNS,
} from './lib/conflict.js'
import { csvObjects } from './lib/csv.js'
import { pathOf } from './lib/datasets.js'
import { fetchOk } from './lib/http.js'
import { Degrade, snapshotStage } from './lib/snapshot-stage.js'
import { stageBudget } from './lib/stage-budget.js'

// The oldest candidate release a snapshot may come from, and where the walk to
// the newest starts when there is no snapshot. Its last number is the month:
// 26.0.9 is September 2026, and the release after 26.0.12 is 27.0.1.
//
// It was the release itself, pinned and bumped by hand, and it rotted twice:
// at 26.0.3 until 2026-08-30, four releases behind, when the globe showed a
// 25-31 March week in late August; and at 26.0.8 from 2026-10-20, when 26.0.9
// came out, until 2026-11-06, while the log said "bump UCDP_VERSION" every
// cycle. Nothing needs it moved now; move it only to stop an old release from
// ever being read again.
const UCDP_FLOOR = '26.0.9'

// UCDP's answer to one HEAD on a release's file name. Inside the stage's budget.
const PROBE_TIMEOUT_MS = 10_000

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
/** One signal for the release probes and the download: `lib/stage-budget.js`. */
const budget = stageBudget('fetch-conflict')

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
  // A raised floor must fetch now, not up to six hours later. A new release
  // is found by the walk at the next fetch, at most six hours after it is out.
  freshIf: (previous) => compareReleases(previous.ucdpVersion ?? '', UCDP_FLOOR) >= 0,
  force: Boolean(process.env.FORCE),
})

if (written) {
  console.log(`Wrote ${snapshot.events.length} events to ${pathOf('conflict')} in ${Date.now() - started}ms`)
}

/**
 * Whether a release's file is there: one HEAD, inside the stage's budget.
 *
 * @param {string} version
 * @returns {Promise<{ ok: boolean, said: string }>}
 */
async function published(version) {
  const head = await fetch(candidateCsvUrl(version), {
    method: 'HEAD',
    signal: AbortSignal.any([budget, AbortSignal.timeout(PROBE_TIMEOUT_MS)]),
  })
  return { ok: head.ok, said: `HTTP ${head.status}` }
}

/**
 * The snapshot: the last week of the newest release, of the rows that pass the gates.
 *
 * @param {{ previous: any }} context
 */
async function produce({ previous }) {
  // The release, found. From the snapshot's own when it is past the floor: the
  // walk need not ask again after the months it has already found.
  const held = typeof previous?.ucdpVersion === 'string' ? previous.ucdpVersion : ''
  const from = compareReleases(held, UCDP_FLOOR) > 0 ? held : UCDP_FLOOR
  const { version, asked } = await newestRelease(from, published)
  // One line either way: "not yet" from a probe that works and silence from
  // one that has stopped working must not look the same in the log.
  const notYet = asked.map((a) => `v${a.version}: ${a.said}`).join('; ')
  console.log(`UCDP release v${version}${version === from ? '' : ` (new since v${from})`}; after it, ${notYet || 'nothing asked'}`)
  const url = candidateCsvUrl(version)

  // The release, as rows. There was a second way in, UCDP's paginated JSON API
  // behind an access token, written on the belief that the CSV was ~50 MB. It is
  // 1.4 MB, the token was never set, and the path had never run: it asked for up
  // to forty pages at sixty seconds each inside a 120-second stage and skipped
  // the column check below. It is gone; this is the one fetch.
  let rows
  try {
    console.log(`Fetching UCDP candidate GED v${version}: ${url}`)
    const res = await fetchOk(url, { timeoutMs: CSV_TIMEOUT_MS, signal: budget })
    const csv = await res.text()
    console.log(`Downloaded ${csv.length.toLocaleString('en-US')} bytes`)
    rows = csvObjects(csv, REQUIRED_COLUMNS)
  } catch (err) {
    throw new Degrade(`UCDP fetch failed (${err.message})`)
  }
  console.log(`Parsed ${rows.length.toLocaleString('en-US')} rows`)

  const events = []
  const dropped = newGateTally()
  const today = new Date().toISOString().slice(0, 10)
  for (const r of rows) {
    const event = mapUcdpRow(r, dropped, { today })
    if (event) events.push(event)
  }
  const left = droppedRowsReport(dropped)
  console.log(`Filtered to ${events.length.toLocaleString('en-US')} events after quality gates${left ? ` (dropped ${left})` : ''}`)
  if (dropped.undated || dropped.undatedSources || dropped.unreadableEnd) {
    console.error(
      `  ⚠ unreadable dates: ${dropped.undated} events dropped, ` +
        `${dropped.undatedSources} reported sources dropped, ${dropped.unreadableEnd} end dates left off`,
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

  // A release ends on its month's last day and the next comes out on the 20th
  // of the month after (26.0.5 to 26.0.9, June to October 2026, all on the
  // 20th). So the newest window is up to 51 days old in the ordinary course,
  // and the 45 this was set at warned every month from the 15th to the 20th.
  // Past 60 a release is more than a week late or the walk has stopped finding
  // them: a 25-31 March window went unnoticed into late August because the
  // line above printed it every time, correctly, and it read as normal.
  const DATASET_STALE_DAYS = 60
  const windowEndMs = Date.parse(windowEnd)
  if (Number.isFinite(windowEndMs)) {
    const lagDays = Math.floor((Date.now() - windowEndMs) / 86400000)
    if (lagDays > DATASET_STALE_DAYS) {
      console.error(
        `  ⚠ UCDP v${version} is ${lagDays}d behind (window ends ${windowEnd}), and no newer release was found — see the release line above`,
      )
    }
  }

  return {
    generated: new Date().toISOString(),
    ucdpVersion: version,
    windowStart,
    windowEnd,
    events: kept,
    // What the release held that these events are not: the rows each gate
    // dropped, and the events that passed and fall before the week kept. A
    // bounded dataset that does not say what it left out reads as the whole.
    skipped: { ...dropped, outsideWindow: events.length - kept.length },
  }
}
