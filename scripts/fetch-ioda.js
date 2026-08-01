#!/usr/bin/env node
// Country-level internet outage snapshot, from Georgia Tech / CAIDA's IODA.
//
// Output: content/.ioda.json
// Shape:  { generated, recentDays, baselineDays, countries: [{ iso2, name,
//           eventCount, recentPerDay, baselinePerDay, ratio }] }
//
// Best-effort, same contract as fetch-gdacs.js: any failure leaves the prior
// snapshot in place, build.js skips the mirror when the file is absent.
//
// ── Why nothing on the map reads this yet ────────────────────────────────────
//
// This was written to carry an internet-shutdown layer, and the layer was not
// built, because the data does not support the claim it would make.
//
// IODA's country score scales with the number of affected /24s, so ranked raw
// it is a map of small, fragile networks: Central African Republic, Guam,
// Norfolk Island. Normalising each country against its own 90-day baseline —
// which is the right instinct, and what this script does — reorders the list
// without fixing it. Measured that way the loudest countries are Nauru
// (ratio ~1330, population ~12,000), Tuvalu, Turks and Caicos, St Vincent,
// the Marshall Islands and Åland. A magnitude floor does clear those out, but
// only because score tracks affected address count: the floor is a population
// filter wearing a magnitude costume, and where it sits is a number chosen by
// eye rather than derived from anything.
//
// The deeper problem is that the signal does not separate the two causes. A
// government cutting access during a protest and a submarine cable parting off
// a small island produce the same shape here, and a map that drew them the
// same way — in a warning tone, on a news site — would be asserting a cause it
// cannot see. Nothing in the payload distinguishes them.
//
// So the fetch lands and the layer waits. The value of running it now is the
// baseline: IODA's API answers for windows, not history, and having our own
// per-cycle series is what would let someone eventually calibrate a threshold
// against events whose cause is known. Cost is two requests and ~20 KB a cycle.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.ioda.json')

const API = 'https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary'
const DAY = 86_400
// The 90-day query is the slow one — ~12s observed against a warm API. The
// cycle allows this stage 90s, so a ceiling well above the observed cost still
// fails long before it can hold up a build.
const TIMEOUT_MS = 30_000

/** The window treated as "now". Short enough that a day-long outage dominates it. */
const RECENT_DAYS = Number(process.env.IODA_RECENT_DAYS || 2)
/** What each country is compared against — its own recent past, not other countries. */
const BASELINE_DAYS = Number(process.env.IODA_BASELINE_DAYS || 90)

const started = Date.now()
console.log('Fetching IODA country outage summary')

const pull = async (from, until) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = `${API}?from=${from}&until=${until}&entityType=country&limit=300`
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'zuhd-news/1.0 (+https://zuhd.news)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    // IODA answers 200 with an `error` string for a bad window rather than a
    // 4xx, so a status check alone would let a malformed request through as an
    // empty snapshot and quietly overwrite a good one.
    if (json.error) throw new Error(json.error)
    if (!Array.isArray(json.data)) throw new Error('no data array')
    return new Map(
      json.data.map((d) => [
        d.entity?.code,
        {
          name: d.entity?.name ?? d.entity?.code,
          score: d.scores?.overall ?? 0,
          events: d.event_cnt ?? 0,
        },
      ]),
    )
  } finally {
    clearTimeout(timer)
  }
}

const now = Math.floor(Date.now() / 1000)
const recentFrom = now - RECENT_DAYS * DAY

let recent
let baseline
try {
  // The baseline window *ends* where the recent one begins. Overlapping them
  // pins every country whose only outage in three months is the current one at
  // exactly BASELINE_DAYS/RECENT_DAYS, which looks like a ranking and is an
  // artifact of the arithmetic.
  ;[recent, baseline] = await Promise.all([
    pull(recentFrom, now),
    pull(recentFrom - BASELINE_DAYS * DAY, recentFrom),
  ])
} catch (err) {
  console.error(`  ✗ fetch failed (${err.message}) — leaving previous snapshot in place`)
  process.exit(0)
}

const countries = []
for (const [iso2, r] of recent) {
  if (!iso2) continue
  const b = baseline.get(iso2)
  const recentPerDay = r.score / RECENT_DAYS
  const baselinePerDay = (b?.score ?? 0) / BASELINE_DAYS
  countries.push({
    iso2,
    name: r.name,
    eventCount: r.events,
    recentPerDay: Math.round(recentPerDay),
    baselinePerDay: Math.round(baselinePerDay),
    // null rather than Infinity: a country with no baseline had no outage in
    // three months, which is a different statement from "a very large ratio",
    // and JSON has no Infinity to say it with anyway.
    ratio: baselinePerDay > 0 ? Number((recentPerDay / baselinePerDay).toFixed(1)) : null,
  })
}
// Highest ratio first, no-baseline countries last. A country with no outage in
// three months and one now is a real novelty, but it arrives with a single
// event and no magnitude to speak of, so it is weaker evidence than a measured
// jump — sorting it above everything else would overstate it.
countries.sort((a, b) => {
  if (a.ratio === null && b.ratio === null) return b.recentPerDay - a.recentPerDay
  if (a.ratio === null) return 1
  if (b.ratio === null) return -1
  return b.ratio - a.ratio
})

writeFileSync(
  OUTPUT_PATH,
  JSON.stringify({
    generated: new Date().toISOString(),
    recentDays: RECENT_DAYS,
    baselineDays: BASELINE_DAYS,
    countries,
  }),
)

const novel = countries.filter((c) => c.ratio === null).length
console.log(
  `  ✓ ${countries.length} countries with outage events in ${RECENT_DAYS}d ` +
    `(${novel} with no ${BASELINE_DAYS}d baseline) — ${Date.now() - started}ms`,
)
