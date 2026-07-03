#!/usr/bin/env node
// Chokepoints snapshot fetcher for the mobile globe's ambient transit layer.
// Distinct from fetch-trends.js — this writes a single, small JSON consumed
// directly by the mobile client, not the editor Claude. Runs on the same
// systemd cadence as fetch-trends (stage 3.4 of run-cycle.sh).
//
// Output: content/.chokepoints.json
// Shape:  { generated, chokepoints: [{id, name, blurb, lat, lng, last7Avg,
//          baseline90Avg, delta7vs90, series, asOf, topicTags, primaryField,
//          weather?: { asOf, maxWave24hM, alert? }}] }
//
// Best-effort: if PortWatch is unreachable the script logs and exits 0,
// leaving any previous .chokepoints.json intact (build.js skips the mirror
// when the file is absent, so a missing snapshot degrades gracefully).

import { writeFileSync } from 'fs'
import { join } from 'path'
import { CHOKEPOINT_BY_ID, CHOKEPOINT_CATALOG } from './lib/chokepoint-metadata.js'
import { fetchAllChokepointsSnapshot } from './lib/trends-sources/portwatch.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.chokepoints.json')

// Wave-height thresholds (combined sea + swell, peak over past 24h):
//   < 2.5 m  → calm/moderate, no alert
//   2.5–4 m  → "rough" — small craft warnings; some ports restrict
//   ≥ 4 m    → "very rough" — real shipping disruption
const ROUGH_M = 2.5
const VERY_ROUGH_M = 4.0
const MARINE_TIMEOUT_MS = 8000

const started = Date.now()
console.log('Fetching chokepoints snapshot (PortWatch)')

const rows = await fetchAllChokepointsSnapshot()
if (!rows || rows.length === 0) {
  console.error('  ✗ no chokepoint rows returned — leaving previous snapshot in place')
  process.exit(0)
}

const chokepoints = rows.map((r) => {
  const meta = CHOKEPOINT_BY_ID[r.id]
  return {
    id: r.id,
    name: meta.name,
    blurb: meta.blurb,
    lat: meta.lat,
    lng: meta.lng,
    topicTags: meta.topicTags,
    primaryField: meta.primaryField,
    last7Avg: r.last7Avg,
    baseline90Avg: r.baseline90Avg,
    delta7vs90: r.delta7vs90,
    series: r.series,
    asOf: r.asOf,
  }
})

// Marine weather attachment — open-meteo Marine API gives 24h wave-height at
// sea-level coords. Used to disambiguate transit-volume drops on the
// chokepoint sheet: storm hovering + transits down = weather; calm seas +
// transits down = actual disruption. Inland canals (Suez, Panama) and
// shallow narrow straits return null/missing wave data and silently skip.
console.log('  Fetching marine weather (open-meteo Marine API, one batched call)…')
try {
  const weathers = await fetchMarineWeatherBatch(chokepoints)
  for (let i = 0; i < chokepoints.length; i++) {
    if (weathers[i]) chokepoints[i].weather = weathers[i]
  }
} catch {
  /* fail-soft — snapshot ships without weather */
}
const weatherCount = chokepoints.filter((c) => c.weather).length
const alertCount = chokepoints.filter((c) => c.weather?.alert).length

const payload = {
  generated: new Date().toISOString(),
  chokepoints,
}

writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n')

const missing = CHOKEPOINT_CATALOG.length - chokepoints.length
const note = missing > 0 ? ` (${missing} missing)` : ''
console.log(
  `  ✓ wrote ${chokepoints.length}/${CHOKEPOINT_CATALOG.length} chokepoints${note}, ${weatherCount} with weather${alertCount > 0 ? ` (${alertCount} alerts)` : ''} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
)

// One batched request for every chokepoint: open-meteo accepts comma-separated
// latitude/longitude lists and returns one result object per location, in
// order. Collapses ~10 sequential calls into 1. Returns an array aligned with
// `points`; entries are null where wave data is unavailable (inland canals).
async function fetchMarineWeatherBatch(points) {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine')
  url.searchParams.set('latitude', points.map((p) => p.lat).join(','))
  url.searchParams.set('longitude', points.map((p) => p.lng).join(','))
  url.searchParams.set('hourly', 'wave_height')
  url.searchParams.set('past_days', '1')
  url.searchParams.set('forecast_days', '1')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MARINE_TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    // A single rejected coordinate can 400 the whole batch — degrade to the
    // old per-point calls so one bad location doesn't blank all weather.
    console.log(`  batch marine call HTTP ${res.status} — falling back to per-point`)
    return Promise.all(points.map((p) => fetchMarineWeatherSingle(p.lat, p.lng).catch(() => null)))
  }
  const json = await res.json()
  // Multi-location responses are an array; a single location comes back bare.
  const results = Array.isArray(json) ? json : [json]
  return points.map((_, i) => extractWeather(results[i]))
}

async function fetchMarineWeatherSingle(lat, lng) {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('hourly', 'wave_height')
  url.searchParams.set('past_days', '1')
  url.searchParams.set('forecast_days', '1')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MARINE_TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) return null
  return extractWeather(await res.json())
}

function extractWeather(locationJson) {
  const series = locationJson?.hourly?.wave_height
  if (!Array.isArray(series)) return null
  // Take last 24 hours (most recent 24 entries — past_days=1 + 1 forecast
  // gives ~48 entries, we only want what's already happened/imminent).
  const window = series.slice(-24).filter((n) => Number.isFinite(n) && n > 0)
  if (window.length === 0) return null
  const max = Math.max(...window)
  const alert = max >= VERY_ROUGH_M ? 'very_rough' : max >= ROUGH_M ? 'rough' : null
  return {
    asOf: new Date().toISOString(),
    maxWave24hM: Math.round(max * 10) / 10,
    alert,
  }
}
