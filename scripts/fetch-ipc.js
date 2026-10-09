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
// Shape:  { generated, source, license, csv, ageLimitMonths, countriesFailed,
//           countries: [{ iso3, areas, published, vintage }], areas: IpcArea[],
//           skipped: { staleAnalysis, unreadableVintage, unjoined, noGeometry,
//           noPhase, countriesNoCandidate, countriesNoGeometry, countriesFailed } }
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
// dropped this way are counted in the payload (`skipped.countriesNoCandidate`),
// because a bounded fetch that does not say what it skipped reads as coverage.
//
// ── No key ─────────────────────────────────────────────────────────────────
//
// The IPC's own API requires one, granted through a request form. HDX publishes
// the same classification under **CC0** with no key at all, which is why this
// fetcher has no credential branch — unlike fetch-firms.js, there is nothing to
// be missing. The licence is recorded in the payload so the surface drawing it
// can say where it came from.

import { representativePoint } from './lib/geo-point.js'
import { runSettled } from './lib/concurrency.js'
import {
  AGE_LIMIT_MONTHS,
  byVintagePhaseCountry,
  gateByAge,
  joinCountry,
  parseIpcAreaCsv,
} from './lib/ipc.js'
import { fetchJson, fetchText } from './lib/http.js'
import { Degrade, snapshotStage } from './lib/snapshot-stage.js'
import { stageBudget } from './lib/stage-budget.js'

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

const started = Date.now()
const now = started
console.log('Fetching IPC acute food insecurity classification')

/** Anything that goes wrong past this point leaves the previous snapshot alone. */
const bail = (message) => {
  throw new Degrade(message)
}

/** One signal for every request this run makes: `lib/stage-budget.js`. */
const budget = stageBudget('fetch-ipc')
const getJson = (url) => fetchJson(url, { timeoutMs: REQUEST_TIMEOUT_MS, signal: budget })
const getText = (url) => fetchText(url, { timeoutMs: REQUEST_TIMEOUT_MS, signal: budget })

const { written, snapshot } = await snapshotStage('fetch-ipc', 'ipc', produce, {
  isEmpty: (s) => s.areas.length === 0,
  pretty: false,
})

if (written) {
  const { areas, countries, skipped } = snapshot
  const grave = areas.filter((a) => a.phase >= 4).length
  const catastrophe = areas.filter((a) => a.phase >= 5).length
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `  ✓ wrote ${areas.length} classified areas across ${countries.length} countries ` +
      `(${grave} at Emergency or worse, ${catastrophe} at Catastrophe; ` +
      `${skipped.unjoined} names unjoined, ${skipped.noPhase} without a phase, ` +
      `${skipped.noGeometry} without usable geometry) in ${elapsed}s`,
  )
}

/** The snapshot: every gated area of every country with a grave caseload, classified and placed. */
async function produce() {
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

  // The search is cut at `rows`, and it returned 56 of them on 2026-10-09: five
  // more countries and the cut binds. Which datasets it drops is the search's
  // own ranking, so a country would lose its geometry, or the table itself would
  // go, with nothing here to say why. CKAN states the uncut total.
  const matching = catalogue?.result?.count
  if (Number.isFinite(matching) && matching > datasets.length) {
    console.error(
      `  ⚠ HDX holds ${matching} datasets for this search and returned ${datasets.length}: ` +
        `HDX_ROWS (${HDX_ROWS}) is cutting the catalogue, raise it`,
    )
  }

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
    // Filled in below, once the countries have been asked for. Here as well as
    // at the top of the snapshot: `skipped` is the block the build carries into
    // /api/ipc.json, and without it a fetch that lost five countries was
    // published as a full one.
    countriesFailed: 0,
  }

  let geoModule
  try {
    geoModule = await import('d3-geo')
  } catch (err) {
    bail(`d3-geo unavailable (${err.message})`)
  }
  const { geoArea, geoCentroid } = geoModule
  const point = (f) => representativePoint(f, geoCentroid, geoArea)

  // One country's geometry failing must not cost the layer: the rest of the
  // world is still a correct, if smaller, map. Counted, not swallowed. The join
  // is inside the worker with the fetch: a file can parse and still not be a
  // collection, and that is this country's failure too.
  const { values, errors, failed: countriesFailed } = await runSettled(wanted, FETCH_CONCURRENCY, async ({ url, areas: rowsFor }) =>
    joinCountry(rowsFor, await getText(url), point),
  )
  const firstFailed = errors.findIndex((err) => err !== undefined)
  const firstError = firstFailed < 0 ? null : `${wanted[firstFailed].iso3}: ${/** @type {Error} */ (errors[firstFailed]).message}`

  const areas = []
  const countries = []
  wanted.forEach(({ iso3, areas: rowsFor }, i) => {
    const country = values[i]
    if (!country) return
    skipped.unjoined += country.tally.unjoined
    skipped.noGeometry += country.tally.noGeometry
    skipped.noPhase += country.tally.noPhase
    for (const area of country.joined) areas.push(area)
    countries.push({
      iso3,
      areas: country.joined.length,
      published: rowsFor.length,
      vintage: rowsFor[0]?.analysisLabel ?? null,
    })
  })

  if (areas.length === 0) bail(`no area survived the join (${firstError ?? 'no reason recorded'})`)
  skipped.countriesFailed = countriesFailed
  if (countriesFailed > 0) {
    console.error(`  ⚠ ${countriesFailed}/${wanted.length} country geometries failed (${firstError})`)
  }
  if (budget.aborted) {
    console.error(`  ⚠ out of time: the stage's budget ran out with ${countries.length}/${wanted.length} countries in`)
  }

  // Newest analysis first, then gravest — so a truncated read of the file is still
  // a read of the most current and most serious of it. Then by country, so the
  // order is the data's and not the order the countries' files came back in.
  areas.sort(byVintagePhaseCountry)

  return {
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
}
