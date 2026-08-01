#!/usr/bin/env node
// Acute food insecurity snapshot — the map's `famine` layer.
//
// The IPC classifies a subnational area into one of five phases: a determination
// made by a named Technical Working Group, on a date, from published evidence.
// This fetcher assembles it from the two files OCHA's Humanitarian Data Exchange
// serves, joins them, reduces each area to one point, and hands the result to
// `build.js` to publish. The arithmetic and every judgement in it live in
// `lib/ipc.js`.
//
// Output: content/.ipc.json
// Shape:  { generated, source, license, csv, ageLimitMonths, countries,
//           areas: IpcArea[], skipped: {...} }
//
// Best-effort, same contract as fetch-firms.js and fetch-gdacs.js: any failure
// leaves the prior snapshot in place and exits 0, so a bad pass never stops a
// cycle. `build.js` skips the mirror when the file is absent and the map draws an
// empty layer when /api/ipc.json 404s.
//
// ── Why two files, and why the download is bounded ─────────────────────────
//
// The published CSV has the dates and the populations and no phase; the
// per-country GeoJSON has the phase and the geometry and no dates. Neither can
// produce a mark alone — see the header of `lib/ipc.js` for the whole account.
//
// The 52 country GeoJSONs are **63.1 MB** together, which is not a payload
// question — none of it is shipped — but it is a question of what to ask a public
// humanitarian service for, five times a day. So geometry is fetched only for
// countries that survive the age gate *and* hold at least one area with
// population in Phase 4 or 5. That pre-filter is sound rather than convenient:
// IPC's thresholds cannot classify an area at Phase 4 with nobody in Phase 4, so
// a country with no such area anywhere cannot contribute a mark. Countries
// dropped this way are counted and named in the payload, because a bounded fetch
// that does not say what it skipped reads as coverage.
//
// ── No key ─────────────────────────────────────────────────────────────────
//
// The IPC's own API requires one, granted through a request form. HDX publishes
// the same classification under **CC0** with no key at all, which is why this
// fetcher has no credential branch — unlike fetch-firms.js, there is nothing to
// be missing. The licence is recorded in the payload so the surface drawing it
// can say where it came from.

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { representativePoint } from './lib/geo-point.js'
import { runWithConcurrency } from './lib/concurrency.js'
import {
  AGE_LIMIT_MONTHS,
  gateByAge,
  joinAreas,
  parseIpcAreaCsv,
} from './lib/ipc.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.ipc.json')

const HDX = 'https://data.humdata.org/api/3/action/package_search'
/** The exact dataset family, so the search cannot drift onto something else. */
const HDX_QUERY = 'title:"Acute Food Insecurity Country Data"'
const HDX_ROWS = 60
const GLOBAL_DATASET = 'global-acute-food-insecurity-country-data'
/** Area level, wide layout, latest analysis only — the smallest file that has it all. */
const GLOBAL_CSV = 'ipc_global_area_wide_latest.csv'

const REQUEST_TIMEOUT_MS = 60_000
/** Concurrent GeoJSON requests. Politeness, not a documented limit. */
const FETCH_CONCURRENCY = 4
const UA = 'zuhd-news/1.0 (+https://zuhd.news)'

const started = Date.now()
const now = started
console.log('Fetching IPC acute food insecurity classification')

/** Anything that goes wrong past this point leaves the previous snapshot alone. */
const bail = (message) => {
  console.error(`  ✗ ${message} — leaving previous snapshot in place`)
  process.exit(0)
}

const getJson = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const getText = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// --- Catalogue -------------------------------------------------------------

let catalogue
try {
  catalogue = await getJson(
    `${HDX}?q=${encodeURIComponent(HDX_QUERY)}&rows=${HDX_ROWS}`,
  )
} catch (err) {
  bail(`HDX catalogue unreachable (${err.message})`)
}
const datasets = catalogue?.result?.results ?? []
if (datasets.length === 0) bail('HDX catalogue returned no datasets')

const globalSet = datasets.find((d) => d.name === GLOBAL_DATASET)
const csvResource = (globalSet?.resources ?? []).find((r) => r.name === GLOBAL_CSV)
if (!csvResource?.url) bail(`no ${GLOBAL_CSV} in the HDX catalogue`)

/**
 * ISO3 → GeoJSON url, keyed off the resource filename rather than the dataset
 * title. `ipc_som.geojson` states the country in a form that cannot be
 * mistranslated; "Somalia: Acute Food Insecurity Country Data" would have to be
 * mapped back through a name table this fetcher has no business owning.
 */
const geoByIso3 = new Map()
for (const d of datasets) {
  for (const r of d.resources ?? []) {
    const m = /^ipc_([a-z]{3})\.geojson$/i.exec(r.name ?? '')
    if (m && r.url) geoByIso3.set(m[1].toUpperCase(), r.url)
  }
}
console.log(`  catalogue: ${datasets.length} datasets, ${geoByIso3.size} country geometries`)

// --- The classification table ----------------------------------------------

let rows
try {
  rows = parseIpcAreaCsv(await getText(csvResource.url))
} catch (err) {
  bail(`area table unusable (${err.message})`)
}
if (rows.length === 0) bail('area table parsed to no rows')

const { kept: gated, skipped: ageSkipped } = gateByAge(rows, { now })
console.log(
  `  ${rows.length} areas published, ${gated.length} within ${AGE_LIMIT_MONTHS} months ` +
    `(${ageSkipped.staleAnalysis} stale, ${ageSkipped.unreadableVintage} unreadable vintage)`,
)
if (gated.length === 0) bail('no analysis inside the age limit')

// --- Which countries need geometry -----------------------------------------

const byCountry = new Map()
for (const row of gated) {
  if (!byCountry.has(row.country)) byCountry.set(row.country, [])
  byCountry.get(row.country).push(row)
}

/** See the header: no population in Phase 4 or 5 means no Phase 4+ classification. */
const hasGraveCandidate = (areas) =>
  areas.some((a) => (a.population.p4 ?? 0) > 0 || (a.population.p5 ?? 0) > 0)

const wanted = []
const noCandidate = []
const noGeometry = []
for (const [iso3, areas] of byCountry) {
  if (!hasGraveCandidate(areas)) {
    noCandidate.push(iso3)
    continue
  }
  const url = geoByIso3.get(iso3)
  if (!url) {
    noGeometry.push(iso3)
    continue
  }
  wanted.push({ iso3, url, areas })
}
console.log(
  `  ${wanted.length} countries hold an Emergency/Catastrophe caseload ` +
    `(${noCandidate.length} do not, ${noGeometry.length} have no published geometry)`,
)
if (wanted.length === 0) bail('no country holds a Phase 4 or 5 caseload')

// --- Geometry, and the join -------------------------------------------------

const skipped = {
  ...ageSkipped,
  unjoined: 0,
  noGeometry: 0,
  noPhase: 0,
  countriesNoCandidate: noCandidate.length,
  countriesNoGeometry: noGeometry.length,
}

let geoModule
try {
  geoModule = await import('d3-geo')
} catch (err) {
  bail(`d3-geo unavailable (${err.message})`)
}
const { geoArea, geoCentroid } = geoModule
const point = (f) => representativePoint(f, geoCentroid, geoArea)

const areas = []
const countries = []
let countriesFailed = 0
let firstError = null

await runWithConcurrency(wanted, FETCH_CONCURRENCY, async ({ iso3, url, areas: rowsFor }) => {
  let collection
  try {
    collection = JSON.parse(await getText(url))
  } catch (err) {
    // One country's geometry failing must not cost the layer: the rest of the
    // world is still a correct, if smaller, map. Counted, not swallowed.
    countriesFailed++
    if (!firstError) firstError = `${iso3}: ${err.message}`
    return
  }
  const joined = joinAreas(rowsFor, collection.features, point, skipped)
  areas.push(...joined)
  countries.push({
    iso3,
    areas: joined.length,
    published: rowsFor.length,
    vintage: rowsFor[0]?.analysisLabel ?? null,
  })
})

if (areas.length === 0) bail(`no area survived the join (${firstError ?? 'no reason recorded'})`)
if (countriesFailed > 0) {
  console.error(`  ⚠ ${countriesFailed}/${wanted.length} country geometries failed (${firstError})`)
}

// Newest analysis first, then gravest — so a truncated read of the file is still
// a read of the most current and most serious of it.
areas.sort((a, b) => a.ageMonths - b.ageMonths || b.phase - a.phase)

const payload = {
  generated: new Date(now).toISOString(),
  source: 'IPC / Cadre Harmonisé, via OCHA Humanitarian Data Exchange',
  license: 'CC0-1.0',
  csv: GLOBAL_CSV,
  ageLimitMonths: AGE_LIMIT_MONTHS,
  countriesFailed,
  countries: countries.sort((a, b) => a.iso3.localeCompare(b.iso3)),
  // Written wide — every gated area of every fetched country, at every phase —
  // while /api/ipc.json carries only Phase 4 and 5. Same treatment `.firms.json`
  // and `.ioda.json` get: the evidence stays inspectable and only what can be
  // accounted for is drawn.
  areas: areas.map((a) => ({
    iso3: a.country,
    level1: a.level1,
    area: a.area,
    phase: a.phase,
    confidence: a.confidence,
    prolongedCrisis: a.prolongedCrisis,
    lat: Math.round(a.lat * 1e5) / 1e5,
    lng: Math.round(a.lng * 1e5) / 1e5,
    vintage: a.analysisLabel,
    ageMonths: a.ageMonths,
    from: a.current.from ? a.current.from.toISOString().slice(0, 10) : null,
    to: a.current.to ? a.current.to.toISOString().slice(0, 10) : null,
    projections: a.projections
      .filter((w) => w.from && w.to)
      .map((w) => ({ from: w.from.toISOString().slice(0, 10), to: w.to.toISOString().slice(0, 10) })),
    population: a.population,
  })),
  skipped,
}

writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload)}\n`)

const grave = areas.filter((a) => a.phase >= 4).length
const catastrophe = areas.filter((a) => a.phase >= 5).length
const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(
  `  ✓ wrote ${areas.length} classified areas across ${countries.length} countries ` +
    `(${grave} at Emergency or worse, ${catastrophe} at Catastrophe; ` +
    `${skipped.unjoined} names unjoined, ${skipped.noPhase} without a phase, ` +
    `${skipped.noGeometry} without usable geometry) in ${elapsed}s`,
)

if (!existsSync(OUTPUT_PATH)) bail('output vanished after write')
