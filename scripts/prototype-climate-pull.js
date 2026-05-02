#!/usr/bin/env node
// Prototype: pull Open-Meteo ERA5 archive for one country, compute the
// historical climate change signal, and report what the per-country
// augmentation would look like at scale (storage, shape, latency).
//
// Pick: Islamabad, Pakistan — strong warming signal, ummah-relevant,
// recent flood + heatwave news makes the chart legible.
//
// Run: node scripts/prototype-climate-pull.js

const TARGET = {
  name: 'Islamabad, Pakistan',
  lat: 33.6844,
  lon: 73.0479,
}

const START = '1950-01-01'
const END = '2024-12-31'

const url = new URL('https://archive-api.open-meteo.com/v1/archive')
url.searchParams.set('latitude', TARGET.lat)
url.searchParams.set('longitude', TARGET.lon)
url.searchParams.set('start_date', START)
url.searchParams.set('end_date', END)
url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum')
url.searchParams.set('timezone', 'UTC')

console.log(`Fetching ${TARGET.name} (${START} → ${END})`)
const t0 = Date.now()
const res = await fetch(url)
if (!res.ok) {
  console.error('HTTP', res.status, await res.text())
  process.exit(1)
}
const data = await res.json()
const fetchMs = Date.now() - t0
const payloadKB = Math.round(JSON.stringify(data).length / 1024)
console.log(`  ${data.daily.time.length} days · ${fetchMs}ms · ${payloadKB}KB raw\n`)

const days = data.daily.time
const tmax = data.daily.temperature_2m_max
const tmin = data.daily.temperature_2m_min
const precip = data.daily.precipitation_sum

const yearly = new Map()
for (let i = 0; i < days.length; i++) {
  const year = +days[i].slice(0, 4)
  if (!yearly.has(year)) {
    yearly.set(year, { tmaxSum: 0, tmaxN: 0, tminSum: 0, tminN: 0, precipSum: 0, hotDays: 0, coldNights: 0, heaviest: 0 })
  }
  const y = yearly.get(year)
  if (tmax[i] != null) {
    y.tmaxSum += tmax[i]
    y.tmaxN++
    if (tmax[i] > 35) y.hotDays++
  }
  if (tmin[i] != null) {
    y.tminSum += tmin[i]
    y.tminN++
    if (tmin[i] < 0) y.coldNights++
  }
  if (precip[i] != null) {
    y.precipSum += precip[i]
    if (precip[i] > y.heaviest) y.heaviest = precip[i]
  }
}

const annual = [...yearly.entries()]
  .sort(([a], [b]) => a - b)
  .map(([year, y]) => ({
    year,
    meanT: +(((y.tmaxSum / y.tmaxN) + (y.tminSum / y.tminN)) / 2).toFixed(2),
    meanTmax: +(y.tmaxSum / y.tmaxN).toFixed(2),
    meanTmin: +(y.tminSum / y.tminN).toFixed(2),
    hotDays: y.hotDays,
    coldNights: y.coldNights,
    totalPrecip: Math.round(y.precipSum),
    heaviestDay: +y.heaviest.toFixed(1),
  }))

const mean = (arr, key) => arr.reduce((s, x) => s + x[key], 0) / arr.length

// NASA GISS-standard 1951–1980 baseline vs most-recent decade
const baseline = annual.filter(y => y.year >= 1951 && y.year <= 1980)
const recent = annual.filter(y => y.year >= 2014 && y.year <= 2023)

const baseT = mean(baseline, 'meanT')
const recT = mean(recent, 'meanT')
const baseHot = mean(baseline, 'hotDays')
const recHot = mean(recent, 'hotDays')
const baseCold = mean(baseline, 'coldNights')
const recCold = mean(recent, 'coldNights')
const basePrecip = mean(baseline, 'totalPrecip')
const recPrecip = mean(recent, 'totalPrecip')
const baseHeavy = mean(baseline, 'heaviestDay')
const recHeavy = mean(recent, 'heaviestDay')

const sgn = n => (n >= 0 ? '+' : '')

console.log(`=== ${TARGET.name} — climate change since 1951–1980 baseline ===\n`)
console.log(`Annual mean T:        ${baseT.toFixed(2)}°C → ${recT.toFixed(2)}°C   (${sgn(recT - baseT)}${(recT - baseT).toFixed(2)}°C)`)
console.log(`Hot days >35°C/yr:    ${baseHot.toFixed(0).padStart(3)}    → ${recHot.toFixed(0).padStart(3)}     (${sgn(recHot - baseHot)}${(recHot - baseHot).toFixed(0)})`)
console.log(`Cold nights <0°C/yr:  ${baseCold.toFixed(0).padStart(3)}    → ${recCold.toFixed(0).padStart(3)}     (${sgn(recCold - baseCold)}${(recCold - baseCold).toFixed(0)})`)
console.log(`Annual precip:        ${basePrecip.toFixed(0)}mm → ${recPrecip.toFixed(0)}mm  (${sgn(((recPrecip - basePrecip) / basePrecip) * 100)}${(((recPrecip - basePrecip) / basePrecip) * 100).toFixed(0)}%)`)
console.log(`Heaviest rain day:    ${baseHeavy.toFixed(1)}mm  → ${recHeavy.toFixed(1)}mm   (${sgn(((recHeavy - baseHeavy) / baseHeavy) * 100)}${(((recHeavy - baseHeavy) / baseHeavy) * 100).toFixed(0)}%)`)

console.log('\n=== Decadal averages ===')
console.log('decade   meanT  hotDays  coldNights  precip(mm)  heaviest(mm)')
for (let d = 1950; d <= 2020; d += 10) {
  const decade = annual.filter(y => y.year >= d && y.year < d + 10)
  if (decade.length === 0) continue
  const m = (k) => mean(decade, k)
  console.log(
    `${d}s   ${m('meanT').toFixed(2)}    ${m('hotDays').toFixed(0).padStart(3)}     ${m('coldNights').toFixed(0).padStart(3)}         ${m('totalPrecip').toFixed(0).padStart(4)}         ${m('heaviestDay').toFixed(1)}`
  )
}

// What the country-augmented entry would look like
const sparkline = annual.map(y => +(y.meanT - baseT).toFixed(2))
const augmentation = {
  climate: {
    baseline: { years: '1951-1980', meanT: +baseT.toFixed(2) },
    recent: { years: '2014-2023', meanT: +recT.toFixed(2) },
    warmingC: +(recT - baseT).toFixed(2),
    hotDaysBaseline: Math.round(baseHot),
    hotDaysRecent: Math.round(recHot),
    coldNightsBaseline: Math.round(baseCold),
    coldNightsRecent: Math.round(recCold),
    precipChangePct: +(((recPrecip - basePrecip) / basePrecip) * 100).toFixed(1),
    heaviestDayChangePct: +(((recHeavy - baseHeavy) / baseHeavy) * 100).toFixed(1),
    anomalySparkline: sparkline,
    sparklineStartYear: annual[0].year,
  },
}

console.log('\n=== country-augmented.ts entry shape ===')
console.log(JSON.stringify(augmentation, null, 2))

// Storage projection for full 145-country corpus
const oneCountryBytes = JSON.stringify(augmentation.climate).length
console.log('\n=== Storage projection ===')
console.log(`Per country: ${oneCountryBytes}B`)
console.log(`145 countries: ${((oneCountryBytes * 145) / 1024).toFixed(0)}KB`)
console.log(`Sparkline only (75 floats): ~${JSON.stringify(sparkline).length}B per country, ~${((JSON.stringify(sparkline).length * 145) / 1024).toFixed(0)}KB total`)
console.log(`\nFetch budget @ ${fetchMs}ms/country: ${(fetchMs * 145 / 1000 / 60).toFixed(1)} min serial, ~${(fetchMs * 145 / 10 / 1000).toFixed(0)}s with 10-way concurrency`)
