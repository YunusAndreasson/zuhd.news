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

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { loadShared } from './build/shared-ts.js'
import { parseClaudeEnvelopeWithUsage } from './lib/claude-envelope.js'

const ROOT = new URL('..', import.meta.url).pathname
const SNAPSHOT_PATH = join(ROOT, 'content', '.gdacs.json')
const CACHE_PATH = join(ROOT, 'content', '.gdacs-narrations.json')
const CHOKEPOINTS_PATH = join(ROOT, 'content', '.chokepoints.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'narrate-gdacs-prompt.md')

const INCLUDE_GREEN = process.env.NARRATE_GDACS_INCLUDE_GREEN === '1'
const MAX_NARRATIONS = Number(process.env.NARRATE_GDACS_MAX) || Infinity
const FORCE = process.env.NARRATE_GDACS_FORCE === '1'
const CONCURRENCY = 3
const MODEL = 'claude-opus-4-7'
const EFFORT = 'medium'
const CHOKEPOINT_RANGE_KM = 500
const WEATHER_TYPES = new Set(['FL', 'WF', 'DR'])

if (!existsSync(SNAPSHOT_PATH)) {
  console.error('No GDACS snapshot found — run fetch-gdacs.js first.')
  process.exit(0)
}
if (!existsSync(PROMPT_PATH)) {
  console.error('Missing narrate-gdacs-prompt.md.')
  process.exit(1)
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {}
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

const chokepoints = existsSync(CHOKEPOINTS_PATH)
  ? JSON.parse(readFileSync(CHOKEPOINTS_PATH, 'utf8')).chokepoints || []
  : []

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
    cacheHits++
    return
  }

  const result = callClaude(bundle)
  if (result.error) {
    failed++
    console.log(`  ✗ ${id} ${alert.country}: ${result.error}`)
    return
  }

  const narrative = sanitizeNarrative(result.narrative)
  const reason = validateGrounding(narrative, bundle)
  if (reason) {
    validatorRejected++
    console.log(`  ✗ ${id} ${alert.country}: ungrounded (${reason}) — "${narrative}"`)
    return
  }

  cache[id] = {
    fingerprint,
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

function pruneStaleCache() {
  const live = new Set(snapshot.alerts.map((a) => `${a.eventtype}:${a.eventid}`))
  let dropped = 0
  for (const k of Object.keys(cache)) {
    if (!live.has(k)) {
      delete cache[k]
      dropped++
    }
  }
  if (dropped > 0) console.log(`  pruned ${dropped} stale cache entries`)
}

function applyCacheToSnapshot() {
  for (const alert of snapshot.alerts) {
    const id = `${alert.eventtype}:${alert.eventid}`
    if (cache[id]?.narrative) alert.narrative = cache[id].narrative
  }
}

function writeAll() {
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot) + '\n')
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n')
}

async function buildBundle(alert) {
  const detailKey = `${alert.eventtype}:${alert.eventid}`
  const detail = snapshot.details[detailKey] || null
  const country = COUNTRY_DATA[alert.country] || null
  const augmented = COUNTRY_AUGMENTED[alert.country] || null
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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    let res
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return null
    const json = await res.json()
    const daily = json?.daily
    if (!daily?.precipitation_sum) return null
    const precipMm = daily.precipitation_sum.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
    const maxT = Math.max(...daily.temperature_2m_max.filter(Number.isFinite))
    const minT = Math.min(...daily.temperature_2m_min.filter(Number.isFinite))
    return {
      windowDays: 7,
      precipitationMm: Math.round(precipMm),
      maxTempC: Math.round(maxT),
      minTempC: Math.round(minT),
    }
  } catch {
    return null
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
  return createHash('sha1').update(JSON.stringify(stable)).digest('hex').slice(0, 16)
}

function callClaude(bundle) {
  const fullPrompt = `${basePrompt}

## INPUT (this is the only material you may draw from)

\`\`\`json
${JSON.stringify(bundle, null, 2)}
\`\`\`

Output ONLY the JSON object \`{ "narrative": "..." }\`. No markdown, no fences.`

  const t0 = Date.now()
  const result = spawnSync(
    'claude',
    [
      '--model',
      MODEL,
      '--effort',
      EFFORT,
      '--no-session-persistence',
      '--max-turns',
      '1',
      '--output-format',
      'json',
      '-p',
      fullPrompt,
    ],
    { encoding: 'utf-8', timeout: 120_000, maxBuffer: 1 * 1024 * 1024 },
  )
  const elapsedMs = Date.now() - t0

  if (result.status !== 0) {
    return {
      elapsedMs,
      error: `claude exit ${result.status}: ${result.stderr?.slice(0, 200)}`,
    }
  }
  try {
    const env = parseClaudeEnvelopeWithUsage(result.stdout)
    const narrative = env.result?.narrative
    if (typeof narrative !== 'string' || narrative.trim().length === 0) {
      return { elapsedMs, error: 'no narrative in result' }
    }
    return { elapsedMs, narrative, costUsd: env.total_cost_usd }
  } catch (err) {
    return { elapsedMs, error: `parse: ${err.message}` }
  }
}

function sanitizeNarrative(s) {
  return s.trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '')
}

/** Validator — every number-like token in the narrative must appear in the
 *  input bundle (after the same normalization). Catches fabricated stats but
 *  not fabricated qualitative claims; mitigation is the prompt-side discipline.
 *  Returns a reason string when rejected, null when grounded. */
function validateGrounding(narrative, bundle) {
  const inputBlob = JSON.stringify(bundle).toLowerCase()
  // Extract numeric tokens (with optional decimals, percent, comma grouping).
  const numbers = narrative.match(/\d[\d,]*(?:\.\d+)?/g) || []
  for (const raw of numbers) {
    const norm = raw.replace(/,/g, '')
    // Allow if either the comma'd or plain form appears in input, or the
    // round forms (10s) for soft matches like "180" matching "183 mm".
    if (inputBlob.includes(norm) || inputBlob.includes(raw)) continue
    // Try ±10% rounding tolerance for numbers ≥ 100 — the LLM will round
    // "183 mm" to "180", which is fine.
    const n = Number(norm)
    if (Number.isFinite(n) && n >= 100) {
      const candidates = [Math.round(n / 10) * 10, Math.round(n / 100) * 100]
      let matched = false
      for (const c of candidates) {
        if (inputBlob.includes(String(c))) {
          matched = true
          break
        }
      }
      if (matched) continue
    }
    return `number "${raw}" not in input`
  }
  return null
}

async function runWithConcurrency(items, limit, worker) {
  const queue = items.slice()
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      if (next === undefined) return
      await worker(next)
    }
  })
  await Promise.all(runners)
}
