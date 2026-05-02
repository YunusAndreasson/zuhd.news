#!/usr/bin/env node
// One-off (annual-ish) fetch of country-card datasets:
//   1. Climate change   — Open-Meteo ERA5 archive, 1950-2024
//   2. Economic momentum — World Bank GDP/cap + inflation, 1990-latest
//   3. Demographic curve — World Bank fertility + population, 1960-latest
//   4. Trade orientation — World Bank "% merch exports to high-income", 1990-latest
//
// Output: shared/data/country-cards.json
//
// Run: node scripts/fetch-country-cards.js [--only=climate,economy,...]

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COUNTRY_DATA } from '../shared/countries/country-data.ts'
import { CC_TO_TOPOJSON_NAME } from '../shared/countries/iso.ts'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'shared', 'data', 'country-cards.json')
const COORDS_CACHE = join(ROOT, 'shared', 'data', '.country-card-coords.json')

/** Atomic-ish checkpoint write: serialize to a sibling tmp file then rename
 *  over the destination. Avoids leaving a half-written JSON on disk if the
 *  process is killed mid-write — restart-safe iff the OS rename is atomic
 *  (it is on POSIX local filesystems). */
function writeCheckpoint(data) {
  mkdirSync(dirname(OUT), { recursive: true })
  const tmp = OUT + '.tmp'
  writeFileSync(tmp, JSON.stringify(data))
  // Node's renameSync is atomic on POSIX.
  renameSync(tmp, OUT)
}

const args = new Set(process.argv.slice(2))
const onlyArg = [...args].find(a => a.startsWith('--only='))?.slice('--only='.length)
const only = onlyArg ? new Set(onlyArg.split(',')) : null
const want = (k) => !only || only.has(k)

// ---- name → iso2 ----
const NAME_TO_ISO2 = Object.fromEntries(
  Object.entries(CC_TO_TOPOJSON_NAME).map(([cc, name]) => [name, cc])
)
// Manual aliases for country-data.ts names that don't match the topojson name
const ALIAS = {
  'United States': 'US',
  'Czech Republic': 'CZ',
  'Republic of the Congo': 'CG',
  'DR Congo': 'CD',
  'Democratic Republic of the Congo': 'CD',
  'Ivory Coast': 'CI',
  'East Timor': 'TL',
  'Eswatini': 'SZ',
  'Cape Verde': 'CV',
  'São Tomé and Príncipe': 'ST',
  'Vatican City': 'VA',
  'Macao': 'MO',
  'Hong Kong': 'HK',
  'South Sudan': 'SS',
  'Bosnia and Herzegovina': 'BA',
  'North Macedonia': 'MK',
  'The Bahamas': 'BS',
  'Saint Kitts and Nevis': 'KN',
  'Saint Lucia': 'LC',
  'Saint Vincent and the Grenadines': 'VC',
  'Antigua and Barbuda': 'AG',
  'Equatorial Guinea': 'GQ',
}

function nameToIso2(name) {
  if (NAME_TO_ISO2[name]) return NAME_TO_ISO2[name]
  if (ALIAS[name]) return ALIAS[name]
  return null
}

// ---- ISO2 → ISO3 (World Bank uses iso3) ----
// Minimal table for the codes we care about; if missing we'll skip WB lookups.
const ISO2_TO_ISO3 = {
  AD: 'AND', AE: 'ARE', AF: 'AFG', AG: 'ATG', AL: 'ALB', AM: 'ARM', AO: 'AGO', AR: 'ARG', AT: 'AUT', AU: 'AUS', AZ: 'AZE',
  BA: 'BIH', BB: 'BRB', BD: 'BGD', BE: 'BEL', BF: 'BFA', BG: 'BGR', BH: 'BHR', BI: 'BDI', BJ: 'BEN', BN: 'BRN', BO: 'BOL', BR: 'BRA', BS: 'BHS', BT: 'BTN', BW: 'BWA', BY: 'BLR', BZ: 'BLZ',
  CA: 'CAN', CD: 'COD', CF: 'CAF', CG: 'COG', CH: 'CHE', CI: 'CIV', CL: 'CHL', CM: 'CMR', CN: 'CHN', CO: 'COL', CR: 'CRI', CU: 'CUB', CV: 'CPV', CY: 'CYP', CZ: 'CZE',
  DE: 'DEU', DJ: 'DJI', DK: 'DNK', DM: 'DMA', DO: 'DOM', DZ: 'DZA',
  EC: 'ECU', EE: 'EST', EG: 'EGY', ER: 'ERI', ES: 'ESP', ET: 'ETH',
  FI: 'FIN', FJ: 'FJI', FM: 'FSM', FR: 'FRA',
  GA: 'GAB', GB: 'GBR', GD: 'GRD', GE: 'GEO', GH: 'GHA', GM: 'GMB', GN: 'GIN', GQ: 'GNQ', GR: 'GRC', GT: 'GTM', GW: 'GNB', GY: 'GUY',
  HN: 'HND', HR: 'HRV', HT: 'HTI', HU: 'HUN',
  ID: 'IDN', IE: 'IRL', IL: 'ISR', IN: 'IND', IQ: 'IRQ', IR: 'IRN', IS: 'ISL', IT: 'ITA',
  JM: 'JAM', JO: 'JOR', JP: 'JPN',
  KE: 'KEN', KG: 'KGZ', KH: 'KHM', KI: 'KIR', KM: 'COM', KN: 'KNA', KP: 'PRK', KR: 'KOR', KW: 'KWT', KZ: 'KAZ',
  LA: 'LAO', LB: 'LBN', LC: 'LCA', LI: 'LIE', LK: 'LKA', LR: 'LBR', LS: 'LSO', LT: 'LTU', LU: 'LUX', LV: 'LVA', LY: 'LBY',
  MA: 'MAR', MC: 'MCO', MD: 'MDA', ME: 'MNE', MG: 'MDG', MH: 'MHL', MK: 'MKD', ML: 'MLI', MM: 'MMR', MN: 'MNG', MR: 'MRT', MT: 'MLT', MU: 'MUS', MV: 'MDV', MW: 'MWI', MX: 'MEX', MY: 'MYS', MZ: 'MOZ',
  NA: 'NAM', NE: 'NER', NG: 'NGA', NI: 'NIC', NL: 'NLD', NO: 'NOR', NP: 'NPL', NR: 'NRU', NZ: 'NZL',
  OM: 'OMN',
  PA: 'PAN', PE: 'PER', PG: 'PNG', PH: 'PHL', PK: 'PAK', PL: 'POL', PS: 'PSE', PT: 'PRT', PW: 'PLW', PY: 'PRY',
  QA: 'QAT',
  RO: 'ROU', RS: 'SRB', RU: 'RUS', RW: 'RWA',
  SA: 'SAU', SB: 'SLB', SC: 'SYC', SD: 'SDN', SE: 'SWE', SG: 'SGP', SI: 'SVN', SK: 'SVK', SL: 'SLE', SM: 'SMR', SN: 'SEN', SO: 'SOM', SR: 'SUR', SS: 'SSD', ST: 'STP', SV: 'SLV', SY: 'SYR', SZ: 'SWZ',
  TD: 'TCD', TG: 'TGO', TH: 'THA', TJ: 'TJK', TL: 'TLS', TM: 'TKM', TN: 'TUN', TO: 'TON', TR: 'TUR', TT: 'TTO', TV: 'TUV', TW: 'TWN', TZ: 'TZA',
  UA: 'UKR', UG: 'UGA', US: 'USA', UY: 'URY', UZ: 'UZB',
  VA: 'VAT', VC: 'VCT', VE: 'VEN', VN: 'VNM', VU: 'VUT',
  WS: 'WSM',
  XK: 'XKX',
  YE: 'YEM',
  ZA: 'ZAF', ZM: 'ZMB', ZW: 'ZWE',
}

// ---- Build country list ----
const countries = []
for (const [name, data] of Object.entries(COUNTRY_DATA)) {
  if (name === 'Antarctica') continue
  if (!data.capital) continue
  const iso2 = nameToIso2(name)
  if (!iso2) {
    console.warn(`  ! no iso2 for "${name}" — skipping`)
    continue
  }
  countries.push({ name, iso2, iso3: ISO2_TO_ISO3[iso2] ?? null, capital: data.capital })
}
console.log(`Countries: ${countries.length}\n`)

// ---- Concurrency helper ----
async function runBatched(items, concurrency, fn) {
  const results = []
  let i = 0
  let errors = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      try {
        results[idx] = await fn(items[idx], idx)
      } catch (err) {
        errors++
        results[idx] = null
        const label = items[idx]?.name ?? items[idx]?.iso2 ?? idx
        console.error(`  ✗ ${label}: ${err.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { results, errors }
}

// ---- 1. Geocode capitals ----
// Hardcoded fallbacks for capitals Open-Meteo geocoder doesn't return cleanly.
// Each entry: ISO2 → [lat, lon]. Picked from canonical city centers.
const COORD_FALLBACK = {
  GQ: [3.7523, 8.7742],     // Malabo (de facto)
  PS: [31.9038, 35.2034],   // Ramallah (de facto)
  LK: [6.9271, 79.8612],    // Colombo (commercial; Kotte is admin)
  US: [38.9072, -77.0369],  // Washington, D.C.
  EH: [27.1536, -13.2033],  // El Aaiún
}

async function geocode(country) {
  const fb = COORD_FALLBACK[country.iso2]
  if (fb) return { lat: fb[0], lon: fb[1] }
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', country.capital)
  url.searchParams.set('country', country.iso2)
  url.searchParams.set('count', '1')
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`)
  const json = await res.json()
  const r = json.results?.[0]
  if (!r) throw new Error(`no geocode result for ${country.capital}, ${country.iso2}`)
  return { lat: r.latitude, lon: r.longitude }
}

let coords = {}
if (existsSync(COORDS_CACHE)) {
  coords = JSON.parse(readFileSync(COORDS_CACHE, 'utf8'))
  console.log(`Coords cache: ${Object.keys(coords).length} hits`)
}
const toGeocode = countries.filter(c => !coords[c.iso2])
if (toGeocode.length > 0) {
  console.log(`Geocoding ${toGeocode.length} capitals…`)
  const t0 = Date.now()
  const { results, errors } = await runBatched(toGeocode, 5, geocode)
  for (let i = 0; i < toGeocode.length; i++) {
    if (results[i]) coords[toGeocode[i].iso2] = results[i]
  }
  writeFileSync(COORDS_CACHE, JSON.stringify(coords, null, 2))
  console.log(`  ${Object.keys(coords).length} cached · ${errors} errors · ${Date.now() - t0}ms\n`)
}

// ---- 2. Climate (Open-Meteo archive, batched multi-location) ----
// Open-Meteo accepts comma-separated lat/lon lists — one request returns an
// array, one element per location. Per-call data budget (locations × years
// × variables) caps batch size at ~5 for our 75-year × 3-variable query;
// larger batches return HTTP 400 "too much data". Total ~34 batches.
const CLIMATE_BATCH_SIZE = 5

function reduceClimate(daily) {
  const days = daily.time
  const tmax = daily.temperature_2m_max
  const tmin = daily.temperature_2m_min
  const precip = daily.precipitation_sum

  const yearly = new Map()
  for (let i = 0; i < days.length; i++) {
    const year = +days[i].slice(0, 4)
    if (!yearly.has(year)) {
      yearly.set(year, { tmaxSum: 0, tmaxN: 0, tminSum: 0, tminN: 0, precipSum: 0, hotDays: 0, coldNights: 0 })
    }
    const y = yearly.get(year)
    if (tmax[i] != null) { y.tmaxSum += tmax[i]; y.tmaxN++; if (tmax[i] > 35) y.hotDays++ }
    if (tmin[i] != null) { y.tminSum += tmin[i]; y.tminN++; if (tmin[i] < 0) y.coldNights++ }
    if (precip[i] != null) { y.precipSum += precip[i] }
  }

  const annual = [...yearly.entries()].sort(([a], [b]) => a - b).map(([year, y]) => ({
    year,
    meanT: y.tmaxN > 0 && y.tminN > 0 ? ((y.tmaxSum / y.tmaxN) + (y.tminSum / y.tminN)) / 2 : null,
    hotDays: y.hotDays,
    coldNights: y.coldNights,
    precip: y.precipSum,
  })).filter(y => y.meanT != null)

  if (annual.length === 0) return null

  // Baseline 1981-2000 is the "before steep modern warming" reference; the
  // sharp acceleration starts in the 2000s. Recent = 2014-2023 — most
  // recent complete decade. This keeps the warming delta legible (typical
  // global signal: +0.8 to +1.5°C) while staying within the 1980-onward
  // archive window we fetch.
  const baseline = annual.filter(y => y.year >= 1981 && y.year <= 2000)
  const recent = annual.filter(y => y.year >= 2014 && y.year <= 2023)
  if (baseline.length === 0 || recent.length === 0) return null
  const mean = (arr, k) => arr.reduce((s, x) => s + x[k], 0) / arr.length
  const baseT = mean(baseline, 'meanT')
  const sparkline = annual.map(y => +(y.meanT - baseT).toFixed(2))
  const decadal = []
  for (let d = 1980; d <= 2020; d += 10) {
    const dec = annual.filter(y => y.year >= d && y.year < d + 10)
    if (dec.length === 0) continue
    decadal.push({ d, t: +mean(dec, 'meanT').toFixed(2), hot: Math.round(mean(dec, 'hotDays')) })
  }
  return {
    warmingC: +(mean(recent, 'meanT') - baseT).toFixed(2),
    hotDaysBaseline: Math.round(mean(baseline, 'hotDays')),
    hotDaysRecent: Math.round(mean(recent, 'hotDays')),
    coldNightsBaseline: Math.round(mean(baseline, 'coldNights')),
    coldNightsRecent: Math.round(mean(recent, 'coldNights')),
    anomalies: sparkline,
    sparklineStartYear: annual[0].year,
    decadal,
  }
}

async function fetchClimateBatch(batch, attempt = 0) {
  const lats = batch.map(c => coords[c.iso2].lat).join(',')
  const lons = batch.map(c => coords[c.iso2].lon).join(',')
  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', lats)
  url.searchParams.set('longitude', lons)
  // 1980-2024 (45 years) is a sufficient window to show post-1980 warming
  // acceleration. Going back to 1950 worked for single-country prototypes
  // but the 75y × 3-var × 5-loc payload exceeds Open-Meteo's free-tier
  // per-call data budget (HTTP 400 "too much data") and triggers heavy
  // burst-throttling. 45y × 3 × 5 fits comfortably.
  url.searchParams.set('start_date', '1980-01-01')
  url.searchParams.set('end_date', '2024-12-31')
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum')
  url.searchParams.set('timezone', 'UTC')
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (res.status === 429 && attempt < 6) {
    const wait = 30_000 + 30_000 * attempt
    console.log(`    429 — waiting ${wait}ms before retry ${attempt + 1}`)
    await new Promise(r => setTimeout(r, wait))
    return fetchClimateBatch(batch, attempt + 1)
  }
  if (!res.ok) throw new Error(`climate batch HTTP ${res.status}`)
  const data = await res.json()
  // Single-location requests return an object; multi-location returns an array.
  const arr = Array.isArray(data) ? data : [data]
  return arr.map((d, i) => ({ country: batch[i], climate: d.daily ? reduceClimate(d.daily) : null }))
}

// ---- 3. World Bank bulk fetch ----
async function fetchWorldBank(indicator, dateRange = '1990:2024') {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&date=${dateRange}&per_page=20000`
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`WB ${indicator} HTTP ${res.status}`)
  const json = await res.json()
  const rows = json[1] ?? []
  // Group by iso3 (country.id is iso2 but countryiso3code is iso3)
  const byIso3 = new Map()
  for (const r of rows) {
    if (r.value == null) continue
    const iso3 = r.countryiso3code
    if (!iso3) continue
    if (!byIso3.has(iso3)) byIso3.set(iso3, [])
    byIso3.get(iso3).push([+r.date, +r.value])
  }
  for (const arr of byIso3.values()) arr.sort((a, b) => a[0] - b[0])
  return byIso3
}

// ---- 4. Run jobs ----
// When --only is set we MERGE with the existing file so partial re-runs
// (e.g. retrying climate after a rate-limit failure) don't wipe other slices.
const out = (() => {
  if (only && existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf8'))
      console.log(`Merging --only=${[...only].join(',')} into existing ${Object.keys(prev.byIso2).length}-country file`)
      return { ...prev, generated: new Date().toISOString(), byIso2: { ...prev.byIso2 } }
    } catch (err) {
      console.warn(`  ! could not parse existing ${OUT}: ${err.message}`)
    }
  }
  return { generated: new Date().toISOString(), countries: countries.length, byIso2: {} }
})()
for (const c of countries) {
  if (!out.byIso2[c.iso2]) out.byIso2[c.iso2] = {}
}

if (want('climate')) {
  console.log('Climate (Open-Meteo archive, batched)…')
  const t0 = Date.now()
  const haveCoords = countries.filter(c => coords[c.iso2])
  // Resume support: skip countries that already have a climate entry from
  // a previous run. Open-Meteo's hourly rate-limit budget makes full reruns
  // expensive, so a partial fetch followed by a later top-up is the normal
  // failure mode. To force a full refresh, delete `country-cards.json`
  // (or the climate field per country) before running.
  const todo = haveCoords.filter(c => !out.byIso2[c.iso2]?.climate)
  const skipped = haveCoords.length - todo.length
  if (skipped > 0) {
    console.log(`  ${skipped} countries already have climate data — resuming with ${todo.length} remaining`)
  }
  const batches = []
  for (let i = 0; i < todo.length; i += CLIMATE_BATCH_SIZE) {
    batches.push(todo.slice(i, i + CLIMATE_BATCH_SIZE))
  }
  console.log(`  ${todo.length} countries in ${batches.length} batches of ${CLIMATE_BATCH_SIZE}`)
  let ok = 0
  let errs = 0
  // Serial across batches (each batch is large; concurrency = 1 is plenty).
  for (let bi = 0; bi < batches.length; bi++) {
    try {
      const items = await fetchClimateBatch(batches[bi])
      for (const item of items) {
        if (item.climate) {
          out.byIso2[item.country.iso2].climate = item.climate
          ok++
        }
      }
      console.log(`  batch ${bi + 1}/${batches.length}: ${items.filter(i => i.climate).length}/${items.length} OK`)
      // Checkpoint after each successful batch so a kill (rate-limit
      // backoff timeout, manual abort, machine sleep) leaves the data we
      // DID get on disk. Only byIso2 updates here — `global` aggregates
      // recompute at the end, so a mid-run kill keeps stale globals until
      // the next full successful run.
      writeCheckpoint(out)
    } catch (err) {
      errs++
      console.error(`  batch ${bi + 1}/${batches.length} failed: ${err.message}`)
    }
  }
  // "ok / haveCoords" reports against the FULL universe (including the
  // resume-skipped already-fetched ones) so the success rate is comparable
  // across runs. `todo.length` would inflate the rate after a partial run.
  const totalWithClimate = haveCoords.filter(c => out.byIso2[c.iso2]?.climate).length
  console.log(`  ${totalWithClimate}/${haveCoords.length} OK · ${ok} new this run · ${errs} batch errors · ${Date.now() - t0}ms\n`)
}

if (want('economy')) {
  console.log('Economy (World Bank GDP/cap + inflation)…')
  const t0 = Date.now()
  const [gdp, inflation] = await Promise.all([
    fetchWorldBank('NY.GDP.PCAP.CD', '1990:2024'),
    fetchWorldBank('FP.CPI.TOTL.ZG', '1990:2024'),
  ])
  let ok = 0
  for (const c of countries) {
    if (!c.iso3) continue
    const e = {}
    if (gdp.has(c.iso3)) e.gdpPerCapita = gdp.get(c.iso3)
    if (inflation.has(c.iso3)) e.inflation = inflation.get(c.iso3)
    if (e.gdpPerCapita || e.inflation) {
      out.byIso2[c.iso2].economy = e
      ok++
    }
  }
  console.log(`  ${ok}/${countries.length} OK · ${Date.now() - t0}ms\n`)
}

if (want('demography')) {
  console.log('Demography (World Bank fertility + population)…')
  const t0 = Date.now()
  const [fertility, pop] = await Promise.all([
    fetchWorldBank('SP.DYN.TFRT.IN', '1960:2024'),
    fetchWorldBank('SP.POP.TOTL', '1960:2024'),
  ])
  let ok = 0
  for (const c of countries) {
    if (!c.iso3) continue
    const d = {}
    if (fertility.has(c.iso3)) d.fertility = fertility.get(c.iso3)
    if (pop.has(c.iso3)) d.population = pop.get(c.iso3)
    if (d.fertility || d.population) {
      out.byIso2[c.iso2].demography = d
      ok++
    }
  }
  console.log(`  ${ok}/${countries.length} OK · ${Date.now() - t0}ms\n`)
}

if (want('trade')) {
  console.log('Trade (WB exports to high-income share)…')
  const t0 = Date.now()
  const hi = await fetchWorldBank('TX.VAL.MRCH.HI.ZS', '1990:2024')
  let ok = 0
  for (const c of countries) {
    if (!c.iso3) continue
    if (hi.has(c.iso3)) {
      out.byIso2[c.iso2].trade = { highIncomeShare: hi.get(c.iso3) }
      ok++
    }
  }
  console.log(`  ${ok}/${countries.length} OK · ${Date.now() - t0}ms\n`)
}

// ---- 5. Compute global benchmarks (median per year across all countries) ----
// Median rather than mean — robust to outliers (Luxembourg's GDP/cap drags
// the mean; the median tells the user "what does a typical country look
// like"). Computed once at fetch time and stored under `global` so cards
// can render a comparison line without recomputing on every render.
function median(arr) {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function medianSeries(allSeries) {
  // Each item is [year, val][]. Bucket values by year, take median per year.
  const byYear = new Map()
  for (const series of allSeries) {
    for (const [year, val] of series) {
      if (val == null || Number.isNaN(val)) continue
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year).push(val)
    }
  }
  const result = []
  for (const [year, vals] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
    const m = median(vals)
    if (m != null) result.push([year, +m.toFixed(4)])
  }
  return result
}

function medianAnomalies(climateEntries) {
  // Climate anomalies are dense annual arrays starting at sparklineStartYear.
  // Convert each to [year, val] pairs first so medianSeries can bucket them.
  const series = climateEntries
    .filter((c) => Array.isArray(c?.anomalies) && c.sparklineStartYear)
    .map((c) =>
      c.anomalies.map((v, i) => [c.sparklineStartYear + i, v])
    )
  return medianSeries(series)
}

const allCountries = Object.values(out.byIso2)
const economyMedian = medianSeries(
  allCountries.map((c) => c.economy?.gdpPerCapita).filter(Boolean)
)
const inflationMedian = medianSeries(
  allCountries.map((c) => c.economy?.inflation).filter(Boolean)
)
const fertilityMedian = medianSeries(
  allCountries.map((c) => c.demography?.fertility).filter(Boolean)
)
const tradeMedian = medianSeries(
  allCountries.map((c) => c.trade?.highIncomeShare).filter(Boolean)
)
const climateMedian = medianAnomalies(allCountries.map((c) => c.climate).filter(Boolean))

out.global = {
  climate: {
    anomalies: climateMedian.map(([, v]) => v),
    sparklineStartYear: climateMedian[0]?.[0],
    n: allCountries.filter((c) => c.climate).length,
  },
  economy: {
    gdpPerCapita: economyMedian,
    inflation: inflationMedian,
    n: allCountries.filter((c) => c.economy?.gdpPerCapita).length,
  },
  demography: {
    fertility: fertilityMedian,
    n: allCountries.filter((c) => c.demography?.fertility).length,
  },
  trade: {
    highIncomeShare: tradeMedian,
    n: allCountries.filter((c) => c.trade?.highIncomeShare).length,
  },
}
console.log(
  `Globals · climate n=${out.global.climate.n} · economy n=${out.global.economy.n} ` +
    `· demography n=${out.global.demography.n} · trade n=${out.global.trade.n}\n`
)

// ---- 6. Write ----
writeCheckpoint(out)
const sizeKB = Math.round(JSON.stringify(out).length / 1024)
console.log(`Wrote ${OUT}`)
console.log(`  ${sizeKB}KB · ${Object.keys(out.byIso2).length} countries`)
