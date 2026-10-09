#!/usr/bin/env node
// Disaster narrator. For each Orange/Red alert in content/.gdacs.json, build a
// grounded INPUT bundle (country profile + weather window for FL/WF/DR + nearby
// chokepoint when geography matters + alert detail), call Sonnet 4.6 medium
// for a 2-3 sentence narrative, validate that every number/proper-noun in the
// output appears in the input, and write `narrative` back onto the alert.
//
// Cache: content/.gdacs-narrations.json keyed by `${eventtype}:${eventid}`.
// Fingerprint hashes the inputs that should trigger a re-narrate (alert level,
// severity, affected countries, population, rounded weather), so multi-day
// floods aren't re-narrated each cycle. Stale entries (events that fell off
// the feed) are pruned at the end.
//
// Env overrides for development:
//   NARRATE_GDACS_INCLUDE_GREEN=1   also narrate Green alerts (testing)
//   NARRATE_GDACS_MAX=N             cap total narrations this run
//   NARRATE_GDACS_FORCE=1           ignore the cache (re-narrate everything)

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadShared } from './build/shared-ts.js'
import { callClaudeJson, cleanProse } from './lib/claude-envelope.js'
import { runWithConcurrency } from './lib/concurrency.js'
import { countryNameFromIso3 } from './lib/country-codes.js'
import { promptWithInput, staleKeys } from './lib/dispatch.js'
import { narrativeFor } from './lib/gdacs-narrations.js'
import { validateGrounding } from './lib/grounding.js'
import { ROOT } from './lib/paths.js'
import { readJson, writeJson } from './lib/json-file.js'
import { sha1Hex } from './lib/hash.js'
import { modelFor } from './lib/models.js'

const SNAPSHOT_PATH = join(ROOT, 'content', '.gdacs.json')
const CACHE_PATH = join(ROOT, 'content', '.gdacs-narrations.json')
const CHOKEPOINTS_PATH = join(ROOT, 'content', '.chokepoints.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'narrate-gdacs-prompt.md')

const INCLUDE_GREEN = process.env.NARRATE_GDACS_INCLUDE_GREEN === '1'
const MAX_NARRATIONS = Number(process.env.NARRATE_GDACS_MAX) || Infinity
const FORCE = process.env.NARRATE_GDACS_FORCE === '1'
const CONCURRENCY = 3
const MODEL = modelFor('gdacs')
const EFFORT = 'medium'
const CHOKEPOINT_RANGE_KM = 500
const WEATHER_TYPES = new Set(['FL', 'WF', 'DR'])

if (!existsSync(SNAPSHOT_PATH)) {
  console.error('No GDACS snapshot found — run fetch-gdacs.js first.')
  process.exit(0)
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
const cache = readJson(CACHE_PATH, {})

// The narratives already written go back onto the snapshot first, before the
// prompt is looked for or a model is called. `fetch-gdacs.js` writes the
// snapshot fresh each cycle, with no `narrative` on any alert, and the build
// publishes the file as it stands. So until this stage reached its last line
// every paragraph in the cache was missing from the site: a run killed at its
// timeout, or one that stopped on the way, published every disaster bare.
// Degrade to the previous narratives, never to none.
applyCacheToSnapshot()
writeJson(SNAPSHOT_PATH, snapshot, { pretty: false })

if (!existsSync(PROMPT_PATH)) {
  console.error('Missing narrate-gdacs-prompt.md.')
  process.exit(1)
}
const basePrompt = readFileSync(PROMPT_PATH, 'utf8')

const candidates = snapshot.alerts
  .filter((a) => INCLUDE_GREEN || a.alertlevel === 'Orange' || a.alertlevel === 'Red')
  .slice(0, MAX_NARRATIONS)

console.log(
  `Narrating ${candidates.length} alert(s) (level filter: ${INCLUDE_GREEN ? 'all' : 'Orange/Red'})`,
)

if (candidates.length === 0) {
  pruneStaleCache()
  applyCacheToSnapshot()
  writeAll()
  process.exit(0)
}

// ── load shared country data ─────────────────────────────────────────────
const countryDataMod = await loadShared('countries/country-data.ts')
const countryAugMod = await loadShared('countries/country-augmented.ts')
const COUNTRY_DATA = countryDataMod.COUNTRY_DATA
const COUNTRY_AUGMENTED = countryAugMod.COUNTRY_AUGMENTED

const chokepoints = readJson(CHOKEPOINTS_PATH)?.chokepoints || []

// ── build bundles + run LLM with concurrency cap ─────────────────────────

const stageT0 = Date.now()
let cacheHits = 0
let generated = 0
let failed = 0
let validatorRejected = 0
let totalCostUsd = 0

await runWithConcurrency(candidates, CONCURRENCY, async (alert) => {
  const id = `${alert.eventtype}:${alert.eventid}`
  const bundle = await buildBundle(alert)
  const fingerprint = hashFingerprint(bundle)

  if (!FORCE && cache[id] && cache[id].fingerprint === fingerprint) {
    // The fingerprint carries the level, so a hit says which level an entry
    // from before `alertlevel` was recorded had been written for.
    cache[id].alertlevel ??= alert.alertlevel
    cacheHits++
    return
  }

  const result = await callClaude(bundle)
  if (result.error) {
    failed++
    console.log(`  ✗ ${id} ${alert.country}: ${result.error}`)
    return
  }

  const narrative = cleanProse(result.narrative)
  const reason = validateGrounding(narrative, bundle)
  if (reason) {
    validatorRejected++
    console.log(`  ✗ ${id} ${alert.country}: ungrounded (${reason}) — "${narrative}"`)
    return
  }

  cache[id] = {
    fingerprint,
    // The level the paragraph was written for: it is applied at no other
    // (`narrativeFor`).
    alertlevel: alert.alertlevel,
    narrative,
    generatedAt: new Date().toISOString(),
  }
  generated++
  if (typeof result.costUsd === 'number') totalCostUsd += result.costUsd
  console.log(`  ✓ ${id} ${alert.country}: ${narrative}`)
})

pruneStaleCache()
applyCacheToSnapshot()
writeAll()

const elapsed = ((Date.now() - stageT0) / 1000).toFixed(1)
console.log(
  `  Narration: ${generated} new, ${cacheHits} cached, ${validatorRejected} rejected, ${failed} failed; $${totalCostUsd.toFixed(3)} in ${elapsed}s`,
)

// ── helpers ──────────────────────────────────────────────────────────────

// An event that has left the feed takes its narrative with it. One source,
// the snapshot's alerts, and `staleKeys` holds everything when it carries
// none: GDACS always lists the month's green earthquakes, so an empty list is
// a feed that did not load, and it used to empty the cache to match.
function pruneStaleCache() {
  const { drop, held } = staleKeys(Object.keys(cache), snapshot.alerts.map((a) => `${a.eventtype}:${a.eventid}`))
  for (const k of drop) delete cache[k]
  if (drop.length > 0) console.log(`  pruned ${drop.length} stale cache entries`)
  for (const n of Object.values(held)) console.log(`  ⚠ prune held ${n} narratives: the snapshot carries no alerts`)
}

function applyCacheToSnapshot() {
  for (const alert of snapshot.alerts) {
    const narrative = narrativeFor(cache[`${alert.eventtype}:${alert.eventid}`], alert)
    if (narrative) alert.narrative = narrative
  }
}

function writeAll() {
  writeJson(SNAPSHOT_PATH, snapshot, { pretty: false })
  writeJson(CACHE_PATH, cache)
}

async function buildBundle(alert) {
  const detailKey = `${alert.eventtype}:${alert.eventid}`
  const detail = snapshot.details[detailKey] || null
  const profile = profileKey(alert)
  const country = profile ? COUNTRY_DATA[profile] : null
  const augmented = profile ? COUNTRY_AUGMENTED[profile] || null : null
  const choke = nearestChokepoint(alert.lat, alert.lng)
  const weather = WEATHER_TYPES.has(alert.eventtype) ? await fetchWeather(alert.lat, alert.lng) : null

  return {
    alert: {
      eventtype: humanEventType(alert.eventtype),
      alertlevel: alert.alertlevel,
      name: alert.name,
      country: alert.country,
      affectedCountries: alert.affectedCountries,
      severityText: alert.severityText,
      severityValue: alert.severityValue,
      severityUnit: alert.severityUnit,
      fromDate: alert.fromDate,
      lat: alert.lat,
      lng: alert.lng,
    },
    detail: detail
      ? {
          criticalPopulation: detail.criticalPopulation,
          criticalClause: detail.criticalClause,
          widerPopulation: detail.widerPopulation,
          widerClause: detail.widerClause,
        }
      : null,
    countryProfile: country
      ? {
          official: country.official,
          capital: country.capital,
          region: country.region,
          population: country.population,
          area: country.area,
          gdp: country.gdp,
          gdpPerCapita: country.gdpPerCapita,
          lifeExpectancy: country.lifeExpectancy,
          urbanPct: augmented?.urbanPct ?? null,
          populationDensity: augmented?.populationDensity ?? null,
          giniIndex: augmented?.giniIndex ?? null,
          hdi: augmented?.hdi ?? null,
          literacyPct: augmented?.literacyPct ?? null,
          refugeesHosted: augmented?.refugeesHosted ?? null,
        }
      : null,
    chokepoint: choke,
    weather,
  }
}

/**
 * The key an alert's country profile is under, or null.
 *
 * By the alert's `iso3`, which is a join key, and only then by `country`,
 * which is GDACS's display name and matches a profile's key by luck: it missed
 * the United States, Russia and every alert over two countries (see
 * `lib/country-codes.js`). An alert over two carries one code: `PNG` beside
 * "Papua New Guinea, Indonesia".
 *
 * A miss is logged. An alert with a country and no profile is narrated on the
 * storm alone, and nothing else would say why.
 */
function profileKey(alert) {
  const byCode = countryNameFromIso3(alert.iso3)
  const key = [byCode, alert.country].find((k) => k && Object.hasOwn(COUNTRY_DATA, k)) ?? null
  if (!key && (alert.iso3 || alert.country)) {
    console.log(`  · ${alert.eventtype}:${alert.eventid}: no country profile for "${alert.country}" (${alert.iso3 || 'no code'})`)
  }
  return key
}

function humanEventType(t) {
  return (
    {
      EQ: 'Earthquake',
      TC: 'Tropical cyclone',
      FL: 'Flood',
      VO: 'Volcano',
      DR: 'Drought',
      WF: 'Wildfire',
    }[t] || t
  )
}

function nearestChokepoint(lat, lng) {
  let best = null
  for (const c of chokepoints) {
    const km = haversineKm(lat, lng, c.lat, c.lng)
    if (km <= CHOKEPOINT_RANGE_KM && (!best || km < best.km)) {
      const totalDelta = c.delta7vs90?.[c.primaryField] ?? c.delta7vs90?.n_total ?? null
      best = {
        name: c.name,
        km: Math.round(km),
        primaryField: c.primaryField,
        deltaPct: totalDelta == null ? null : Math.round(totalDelta * 100),
      }
    }
  }
  return best
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function fetchWeather(lat, lng) {
  // Open-Meteo: free, no key. Past 7 days of daily totals at the alert
  // location. Cached effectively by fingerprint rounding (10mm / 1°C).
  //
  // A failure is logged, because it is not free: `weather: null` is a
  // different fingerprint from the one a good fetch gives, so the alert is
  // narrated again on a thinner bundle, and again when the weather returns.
  const without = (why) => {
    console.error(`  ⚠ weather at ${lat},${lng}: ${why} — narrating without it`)
    return null
  }
  try {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive')
    const today = new Date()
    const end = today.toISOString().slice(0, 10)
    const startD = new Date(today.getTime() - 7 * 86400_000).toISOString().slice(0, 10)
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('start_date', startD)
    url.searchParams.set('end_date', end)
    url.searchParams.set('daily', 'precipitation_sum,temperature_2m_max,temperature_2m_min')
    url.searchParams.set('timezone', 'UTC')
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return without(`HTTP ${res.status}`)
    const json = await res.json()
    const daily = json?.daily
    if (!daily?.precipitation_sum) return without('no daily block in the answer')
    const precipMm = daily.precipitation_sum.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
    const maxT = Math.max(...daily.temperature_2m_max.filter(Number.isFinite))
    const minT = Math.min(...daily.temperature_2m_min.filter(Number.isFinite))
    return {
      windowDays: 7,
      precipitationMm: Math.round(precipMm),
      maxTempC: Math.round(maxT),
      minTempC: Math.round(minT),
    }
  } catch (err) {
    return without(/** @type {Error} */ (err).message)
  }
}

function hashFingerprint(bundle) {
  // Round weather aggressively so cosmetic wobble doesn't bust the cache.
  const w = bundle.weather
    ? {
        precipitation10mm: Math.round(bundle.weather.precipitationMm / 10),
        maxTempC: bundle.weather.maxTempC,
        minTempC: bundle.weather.minTempC,
      }
    : null
  const stable = {
    eventtype: bundle.alert.eventtype,
    alertlevel: bundle.alert.alertlevel,
    severityValue: bundle.alert.severityValue,
    affectedCountries: [...bundle.alert.affectedCountries].sort(),
    detail: bundle.detail
      ? {
          c: bundle.detail.criticalPopulation,
          w: bundle.detail.widerPopulation,
        }
      : null,
    chokepoint: bundle.chokepoint
      ? { name: bundle.chokepoint.name, deltaPct: bundle.chokepoint.deltaPct }
      : null,
    weather: w,
  }
  return sha1Hex(stable)
}

async function callClaude(bundle) {
  const fullPrompt = promptWithInput(basePrompt, bundle, {
    note: 'this is the only material you may draw from',
    shape: '{ "narrative": "..." }',
  })

  const res = await callClaudeJson(fullPrompt, { model: MODEL, effort: EFFORT })
  if (res.error) return { elapsedMs: res.elapsedMs, error: res.error }
  const narrative = res.out.narrative
  if (typeof narrative !== 'string' || narrative.trim().length === 0) {
    return { elapsedMs: res.elapsedMs, error: 'no narrative in result' }
  }
  return { elapsedMs: res.elapsedMs, narrative, costUsd: res.costUsd }
}

/* The numeric validator moved to `lib/grounding.js` on 2026-08-08, unchanged in
   behaviour, when `narrate-indicators.js` needed the same check. It is imported
   at the top of this file. The name scan that module also exports is
   deliberately *not* switched on here: a disaster narrative's whole job is to
   name the country and the storm, and this stage already constrains those
   through the prompt's iron rule plus a bundle that carries every name it is
   allowed to use. */
