#!/usr/bin/env node
// One-off (annual-ish) fetch of country-card datasets:
//   1. Economic momentum — World Bank GDP/cap + inflation, 1990-latest
//   2. Demographic curve — World Bank fertility + population, 1960-latest
//   3. Economic complexity — Harvard Growth Lab ECI (HS92), 1995-latest
//
// Output: shared/data/country-cards.json
//
// Run: node scripts/fetch-country-cards.js [--only=economy,demography,complexity]

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COUNTRY_DATA } from '../shared/countries/country-data.ts'
import { CC_TO_TOPOJSON_NAME } from '../shared/countries/iso.ts'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'shared', 'data', 'country-cards.json')

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

// ---- World Bank bulk fetch ----
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

// ---- Run jobs ----
// When --only is set we MERGE with the existing file so partial re-runs
// don't wipe other slices.
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

// Harvard Atlas of Economic Complexity ECI series. Stable Dataverse file
// ID (doi:10.7910/DVN/XTAQMC) — bumps each annual revision. HS92 column is
// the longest-running ECI variant the Atlas publishes (1995→present); the
// HS12 series is shorter and the SITC series is being phased out, so HS92
// is the right anchor for a multi-decade trajectory.
async function fetchECI() {
  const url = 'https://dataverse.harvard.edu/api/access/datafile/13439575'
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Dataverse ECI HTTP ${res.status}`)
  const csv = await res.text()
  const lines = csv.split('\n')
  if (lines.length < 2) throw new Error('Dataverse ECI CSV empty')
  const header = lines[0].split(',')
  const iso3Idx = header.indexOf('country_iso3_code')
  const yearIdx = header.indexOf('year')
  const eciIdx = header.indexOf('eci_hs92')
  const rankIdx = header.indexOf('eci_rank_hs92')
  if (iso3Idx < 0 || yearIdx < 0 || eciIdx < 0 || rankIdx < 0) {
    throw new Error(`Dataverse ECI CSV missing expected columns: ${header.join(',')}`)
  }
  // Two parallel maps so the card can show both rank (focal headline) and
  // value (chart trajectory) without re-deriving rank from value at runtime.
  const eciByIso3 = new Map()
  const rankByIso3 = new Map()
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    // Atlas CSV has no quoted strings, so a plain split is safe.
    const cols = line.split(',')
    const iso3 = cols[iso3Idx]
    const yearStr = cols[yearIdx]
    const eciStr = cols[eciIdx]
    const rankStr = cols[rankIdx]
    if (!iso3 || !yearStr) continue
    const year = parseInt(yearStr, 10)
    if (!Number.isFinite(year)) continue
    if (eciStr) {
      const eci = parseFloat(eciStr)
      if (Number.isFinite(eci)) {
        if (!eciByIso3.has(iso3)) eciByIso3.set(iso3, [])
        eciByIso3.get(iso3).push([year, +eci.toFixed(3)])
      }
    }
    if (rankStr) {
      const rank = parseInt(rankStr, 10)
      if (Number.isFinite(rank)) {
        if (!rankByIso3.has(iso3)) rankByIso3.set(iso3, [])
        rankByIso3.get(iso3).push([year, rank])
      }
    }
  }
  for (const arr of eciByIso3.values()) arr.sort((a, b) => a[0] - b[0])
  for (const arr of rankByIso3.values()) arr.sort((a, b) => a[0] - b[0])
  return { eci: eciByIso3, rank: rankByIso3 }
}

if (want('complexity')) {
  console.log('Complexity (Harvard Atlas ECI HS92)…')
  const t0 = Date.now()
  const { eci, rank } = await fetchECI()
  let ok = 0
  for (const c of countries) {
    if (!c.iso3) continue
    const series = eci.get(c.iso3)
    if (series) {
      out.byIso2[c.iso2].complexity = {
        eci: series,
        eciRank: rank.get(c.iso3) ?? [],
      }
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
const complexityMedian = medianSeries(
  allCountries.map((c) => c.complexity?.eci).filter(Boolean)
)

out.global = {
  economy: {
    gdpPerCapita: economyMedian,
    inflation: inflationMedian,
    n: allCountries.filter((c) => c.economy?.gdpPerCapita).length,
  },
  demography: {
    fertility: fertilityMedian,
    n: allCountries.filter((c) => c.demography?.fertility).length,
  },
  complexity: {
    eci: complexityMedian,
    n: allCountries.filter((c) => c.complexity?.eci).length,
  },
}
console.log(
  `Globals · economy n=${out.global.economy.n} · demography n=${out.global.demography.n} · complexity n=${out.global.complexity.n}\n`
)

// ---- 6. Write ----
writeCheckpoint(out)
const sizeKB = Math.round(JSON.stringify(out).length / 1024)
console.log(`Wrote ${OUT}`)
console.log(`  ${sizeKB}KB · ${Object.keys(out.byIso2).length} countries`)
