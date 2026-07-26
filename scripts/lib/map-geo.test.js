// Geometry, solar and encoding invariants for the homepage situational map.
//
// These pin the parts that fail *silently*: a night polygon over the lit
// hemisphere, a coastline that sweeps a band across the antimeridian, an
// Antarctica that renders as nothing, a decay curve that inverts, a size
// channel that collapses to one value. All of it renders as "the map looks a
// bit odd" rather than an exception, so it needs assertions.
//
// This suite previously tested the hand-rolled projection and screen-space
// clustering of the canvas map. MapLibre now does both, and those modules were
// deleted — so every test here had been passing against code that no longer
// shipped. What follows targets the modules that do.
//
// The island sources are TypeScript, so the suite bundles the DOM-free ones
// with esbuild into a temp file and imports that.

import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unwrap, closePolar, thin, simplifyRing } from '../build/basemap.js'
// The prayer-time oracle. A devDependency, and deliberately not shipped — the
// island derives its curves in closed form and this is what proves it right.
// See the header of `public/islands/_map/prayer.ts`.
import * as adhan from 'adhan'
// Plain JS, so it needs no bundling — unlike the island modules below.
import {
  MARKET_BY_ID,
  MARKET_CATALOG,
  MARKET_TRACKED,
  instrumentMismatch,
} from './market-metadata.js'

const ROOT = new URL('../..', import.meta.url).pathname

const dir = mkdtempSync(join(tmpdir(), 'zuhd-map-test-'))
const entry = join(dir, 'entry.ts')
writeFileSync(
  entry,
  `export * from '${join(ROOT, 'public/islands/_map/solar.ts')}'\n` +
    // The prayer lines. Pure geometry, and the one layer on this map whose
    // correctness a reader cannot check by looking at it — a Fajr line in the
    // wrong place is still a plausible Fajr line. Pinned against adhan below.
    `export * from '${join(ROOT, 'public/islands/_map/prayer.ts')}'\n` +
    `export * from '${join(ROOT, 'public/islands/_map/types.ts')}'\n` +
    `export * from '${join(ROOT, 'public/islands/_map/format.ts')}'\n` +
    // The Hijri calendar and the Eid closures that hang off it. Pure, and the
    // only thing on the map whose correctness cannot be checked by looking at
    // it — a wrong Hijri date is still a plausible Hijri date.
    `export * from '${join(ROOT, 'public/islands/_map/hijri.ts')}'\n` +
    // Named rather than `export *`: markets.ts re-exports payload types that
    // would collide with types.ts above, and an ambiguous star export resolves
    // to silence rather than an error.
    `export { nisab } from '${join(ROOT, 'public/islands/_map/markets.ts')}'\n` +
    // style.ts only imports maplibre-gl as a type, so it erases and the bundle
    // stays DOM-free. Pulled in for the land ramp constants: the legend and the
    // fill both read them, and so does the contrast test below.
    `export * from '${join(ROOT, 'public/islands/_map/style.ts')}'\n` +
    // The genocide record. Data, not geometry, but it is the one overlay with
    // no upstream feed validating it, so the invariants have to live here.
    `export * from '${join(ROOT, 'shared/genocide.ts')}'\n`,
)
const bundlePath = join(dir, 'bundle.mjs')
await build({
  entryPoints: [entry],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
  // `_map/types.ts` re-exports the payload types from shared/. Those are
  // type-only and erased, but the alias has to match the island bundler's or
  // this suite would be the one place `@shared` fails to resolve.
  alias: { '@shared': join(ROOT, 'shared') },
})
const M = await import(bundlePath)
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

// ---------------------------------------------------------------------------
// Solar geometry and the night polygon
// ---------------------------------------------------------------------------

test('subsolar point tracks the seasons', () => {
  // Northern solstice: sun overhead near the Tropic of Cancer.
  const june = M.subsolarPoint(new Date('2026-06-21T12:00:00Z'))
  assert.ok(june.lat > 22 && june.lat < 24, `June declination ${june.lat}`)
  // Southern solstice: mirrored.
  const dec = M.subsolarPoint(new Date('2026-12-21T12:00:00Z'))
  assert.ok(dec.lat < -22 && dec.lat > -24, `December declination ${dec.lat}`)
  // Equinox: within a degree of the equator.
  const mar = M.subsolarPoint(new Date('2026-03-20T12:00:00Z'))
  assert.ok(Math.abs(mar.lat) < 1.2, `March declination ${mar.lat}`)
})

test('subsolar longitude sweeps westward through the day', () => {
  const base = new Date('2026-06-21T00:00:00Z')
  const a = M.subsolarPoint(base)
  const b = M.subsolarPoint(new Date(base.getTime() + 6 * 3600_000))
  // Six hours is a quarter turn: ~90° west, allowing for wrap.
  let delta = a.lng - b.lng
  if (delta < -180) delta += 360
  if (delta > 180) delta -= 360
  assert.ok(Math.abs(delta - 90) < 3, `6h sweep was ${delta}°`)
})

test('the night polygon covers the pole that is actually dark', () => {
  // Northern summer: the Arctic is in permanent daylight, so the night cap must
  // close over the *south* pole. Getting this backwards shades the wrong half
  // of the planet and nothing throws.
  const june = M.nightPolygon(new Date('2026-06-21T12:00:00Z'))
  assert.ok(june, 'June must produce a polygon')
  const juneLats = june.geometry.coordinates[0].map(([, lat]) => lat)
  assert.ok(Math.min(...juneLats) <= -89, 'June night must reach the south pole')
  assert.ok(Math.max(...juneLats) < 89, 'June night must not reach the north pole')

  const dec = M.nightPolygon(new Date('2026-12-21T12:00:00Z'))
  assert.ok(dec, 'December must produce a polygon')
  const decLats = dec.geometry.coordinates[0].map(([, lat]) => lat)
  assert.ok(Math.max(...decLats) >= 89, 'December night must reach the north pole')
  assert.ok(Math.min(...decLats) > -89, 'December night must not reach the south pole')
})

test('the night polygon spans the full longitude range and closes', () => {
  const f = M.nightPolygon(new Date('2026-08-01T03:00:00Z'))
  assert.ok(f)
  const ring = f.geometry.coordinates[0]
  const lngs = ring.map(([lng]) => lng)
  assert.equal(Math.min(...lngs), -180)
  assert.equal(Math.max(...lngs), 180)
  assert.deepEqual(ring[0], ring[ring.length - 1], 'ring must close')
})

test('day and night close over opposite poles', () => {
  // The lit hemisphere exists so the terminator is visible over water: the
  // night fill is black on a `#080a0d` ocean, which moves it about two values
  // in 255, so day/night used to stop at the coastline and read as something
  // that happened to continents. `dayPolygon` is the same terminator ring
  // closed the other way, drawn under the land so it only reaches the sea.
  //
  // Which pole each one closes over is the whole correctness of it, and getting
  // it backwards renders a perfectly plausible map of the wrong half of the
  // planet. Nothing throws either way.
  for (const iso of ['2026-06-21T12:00:00Z', '2026-12-21T12:00:00Z', '2026-03-20T06:00:00Z']) {
    const when = new Date(iso)
    const night = M.nightPolygon(when)
    const day = M.dayPolygon(when)
    assert.ok(night && day, `both hemispheres must exist at ${iso}`)

    // The closing vertex, not the extreme latitude. `terminatorLat` clamps its
    // own output to ±89.9, and at an equinox the terminator runs pole to pole —
    // so both rings contain latitudes above 89 and "whichever end is higher"
    // calls both of them north. Only the two vertices the polygon is *closed*
    // with are exactly ±90, and those are the ones that say which cap it is.
    const poleOf = (f) => {
      const lats = f.geometry.coordinates[0].map(([, lat]) => lat)
      if (lats.some((lat) => lat === 90)) return 'north'
      if (lats.some((lat) => lat === -90)) return 'south'
      return 'neither'
    }
    const nightPole = poleOf(night)
    const dayPole = poleOf(day)
    assert.notEqual(nightPole, 'neither', `night reaches no pole at ${iso}`)
    assert.notEqual(dayPole, 'neither', `day reaches no pole at ${iso}`)
    assert.notEqual(dayPole, nightPole, `day and night both close over the ${dayPole} pole at ${iso}`)

    // And the sun must be on the day side: whichever pole is lit is the one
    // the sub-solar latitude points at.
    const sun = M.subsolarPoint(when)
    if (Math.abs(sun.lat) > 1) {
      assert.equal(dayPole, sun.lat > 0 ? 'north' : 'south', `lit pole disagrees with the sun at ${iso}`)
    }
  }
})

test('the night polygon puts local midnight in darkness', () => {
  // At 00:00 UTC the antisolar point is near 0° longitude, so Greenwich is
  // dark and the dateline is lit. Test by latitude band to stay away from the
  // terminator itself.
  const when = new Date('2026-08-01T00:00:00Z')
  const f = M.nightPolygon(when)
  assert.ok(f)
  const sun = M.subsolarPoint(when)
  // The sub-solar longitude must sit outside the night polygon's own edge:
  // the terminator latitude there is the boundary, and the sun is on the lit
  // side of it by construction.
  const edge = M.terminatorLat(sun.lng, sun)
  assert.ok(edge !== null)
  // In northern summer night closes south, so the terminator at the sub-solar
  // longitude must lie south of the sub-solar latitude.
  if (sun.lat >= 0) assert.ok(edge < sun.lat, `edge ${edge} vs sun ${sun.lat}`)
  else assert.ok(edge > sun.lat, `edge ${edge} vs sun ${sun.lat}`)
})

// ---------------------------------------------------------------------------
// The prayer lines
//
// The one layer on this map whose correctness cannot be checked by looking at
// it: a Fajr line in the wrong place is still a plausible Fajr line, drawn in
// the right style, sweeping the right way. So it is checked against adhan-js —
// Batoul Apps' library, a devDependency here and deliberately not shipped, for
// the reasons in `_map/prayer.ts`.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180
const HOUR = 3600_000

/** Every vertex of every part, flattened, for a prayer at an instant. */
const prayerVertices = (at, id) => {
  const f = M.prayerLines(at).find((x) => x.properties.id === id)
  assert.ok(f, `${id} is missing at ${at.toISOString()}`)
  return { parts: f.geometry.coordinates, all: f.geometry.coordinates.flat() }
}

/** Local solar hour angle at a point: negative before noon, positive after. */
const hourAngleAt = (lng, sun) => {
  const d = lng - sun.lng
  return ((((d + 180) % 360) + 360) % 360) - 180
}

/** Great-circle separation in degrees. */
const separation = (aLat, aLng, bLat, bLng) =>
  Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(aLat * DEG) * Math.sin(bLat * DEG) +
          Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.cos((aLng - bLng) * DEG),
      ),
    ),
  ) / DEG

/** A spread of instants across a year, at several times of day. */
const YEAR_SAMPLE = []
for (let day = 0; day < 365; day += 11) {
  for (const hour of [0, 5, 11, 17]) {
    YEAR_SAMPLE.push(new Date(Date.UTC(2026, 0, 1) + (day * 24 + hour) * HOUR))
  }
}

test('every prayer line is drawn, everywhere, with no NaN in it', () => {
  for (const at of YEAR_SAMPLE) {
    const ids = M.prayerLines(at).map((f) => f.properties.id)
    assert.deepEqual(
      ids,
      ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
      `missing or reordered at ${at.toISOString()}`,
    )
    for (const f of M.prayerLines(at)) {
      for (const part of f.geometry.coordinates) {
        assert.ok(part.length > 1, `${f.properties.id} has a one-vertex part`)
        for (const [lng, lat] of part) {
          assert.ok(Number.isFinite(lng) && Number.isFinite(lat), `${f.properties.id} NaN`)
          assert.ok(Math.abs(lng) <= 180.000001, `${f.properties.id} lng ${lng}`)
          assert.ok(Math.abs(lat) <= 85.06, `${f.properties.id} lat ${lat}`)
        }
      }
    }
  }
})

test('no part of a prayer line wraps the antimeridian', () => {
  // These curves are functions of latitude, so unlike the terminator ring they
  // really do cross ±180 — and with `renderWorldCopies` off an uncut segment is
  // not drawn the short way round, it is drawn straight back across the whole
  // map as a horizontal bar. Nothing throws; the map just grows a stripe.
  let split = 0
  for (const at of YEAR_SAMPLE) {
    for (const f of M.prayerLines(at)) {
      if (f.geometry.coordinates.length > 1) split++
      for (const part of f.geometry.coordinates) {
        for (let i = 1; i < part.length; i++) {
          assert.ok(
            Math.abs(part[i][0] - part[i - 1][0]) <= 180,
            `${f.properties.id} steps ${part[i - 1][0]} → ${part[i][0]}`,
          )
        }
      }
    }
  }
  assert.ok(split > 0, 'no curve was ever split — the seam handling is untested')
})

test('a split prayer line meets both edges at the same latitude', () => {
  // The interpolated vertices are what make the two halves land on the same
  // pixel row at the frame. Without them each half stops short of the edge and
  // the line reads as broken rather than as continuing.
  let checked = 0
  for (const at of YEAR_SAMPLE) {
    for (const f of M.prayerLines(at)) {
      const parts = f.geometry.coordinates
      for (let i = 1; i < parts.length; i++) {
        const end = parts[i - 1][parts[i - 1].length - 1]
        const start = parts[i][0]
        // Only the antimeridian cut lands exactly on ±180; a polar break does
        // not, and is the other reason a curve comes in more than one part.
        if (Math.abs(Math.abs(end[0]) - 180) > 1e-9) continue
        assert.equal(Math.abs(start[0]), 180, `${f.properties.id} reopens off-edge`)
        assert.equal(Math.sign(start[0]), -Math.sign(end[0]), 'reopens on the same side')
        assert.ok(
          Math.abs(start[1] - end[1]) < 1e-9,
          `${f.properties.id} seam jumps ${end[1]} → ${start[1]}`,
        )
        checked++
      }
    }
  }
  assert.ok(checked > 0, 'no seam was ever exercised')
})

test('a prayer line is walked finely enough not to draw a chord', () => {
  // A flat 1° latitude walk moves up to 31° of longitude near the poles, where
  // these curves run nearly east-west. That is a chord straight across the
  // Arctic, and it reads as a drawing error rather than as a prayer. The walk
  // bisects where the step is too long; this is the bound it must hold to.
  let worst = 0
  let where = null
  for (const at of YEAR_SAMPLE) {
    for (const f of M.prayerLines(at)) {
      for (const part of f.geometry.coordinates) {
        for (let i = 1; i < part.length; i++) {
          const d = Math.abs(part[i][0] - part[i - 1][0])
          const step = d > 180 ? 360 - d : d
          if (step > worst) {
            worst = step
            where = `${f.properties.id} at ${part[i][1].toFixed(1)}°`
          }
        }
      }
    }
  }
  assert.ok(worst <= 3, `worst chord ${worst.toFixed(2)}° of longitude — ${where}`)
})

test('the prayers fall in the order of the day', () => {
  // The whole geometry turns on which limb of the sun each prayer is solved
  // against, and a flipped limb puts the line half a world away while still
  // looking like a plausible curve. Local solar time runs
  // Fajr → Dhuhr → Asr → Maghrib → Isha, so the hour angles must too.
  for (const at of YEAR_SAMPLE) {
    const sun = M.subsolarPoint(at)
    const angles = {}
    for (const id of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      const near = prayerVertices(at, id).all
        .filter(([, lat]) => Math.abs(lat) < 40)
        .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]
      if (near) angles[id] = hourAngleAt(near[0], sun)
    }
    const stamp = at.toISOString()
    assert.ok(angles.fajr < 0, `Fajr is not before noon at ${stamp}`)
    assert.ok(Math.abs(angles.dhuhr) < 1e-6, `Dhuhr is not the sub-solar meridian at ${stamp}`)
    assert.ok(angles.asr > 0, `Asr is not after noon at ${stamp}`)
    assert.ok(angles.maghrib > angles.asr, `Maghrib is not after Asr at ${stamp}`)
    // Isha is Maghrib carried ninety minutes further round: the sun turns 15°
    // an hour, so the line sits 22.5° deeper into the night.
    assert.ok(
      Math.abs(angles.isha - angles.maghrib - 22.5) < 0.6,
      `Isha is not 22.5° behind Maghrib at ${stamp} (${(angles.isha - angles.maghrib).toFixed(2)}°)`,
    )
  }
})

test('Maghrib rides the terminator, just outside it', () => {
  // Sunset is the disc's upper limb touching the horizon, so the Maghrib curve
  // stands 0.833° beyond the geometric terminator `solar.ts` draws at a flat
  // 0°. On screen that is about three pixels of daylight between the shade
  // edge and the line, and it is correct — the two are not meant to coincide
  // and snapping them together would be a regression, not a tidy-up.
  for (const at of YEAR_SAMPLE) {
    const sun = M.subsolarPoint(at)
    for (const [lng, lat] of prayerVertices(at, 'maghrib').all) {
      const d = separation(lat, lng, sun.lat, sun.lng)
      assert.ok(
        Math.abs(d - 90.833) < 0.02,
        `Maghrib vertex is ${d.toFixed(3)}° from the sub-solar point, not 90.833°`,
      )
    }
    for (const [lng, lat] of prayerVertices(at, 'fajr').all) {
      const d = separation(lat, lng, sun.lat, sun.lng)
      assert.ok(Math.abs(d - 108.5) < 0.02, `Fajr vertex is ${d.toFixed(3)}°, not 108.5°`)
    }
  }
})

test('a prayer line stops where the prayer has no time', () => {
  // The reason adhan is not imported at runtime. Above roughly 48°N on the June
  // solstice the sun never goes 18.5° down, so there is no moment that is
  // Fajr — and adhan's high-latitude rule would hand back a substitute and let
  // the line keep going across the Arctic. Here the solution ceases to exist
  // and the line ends, which is both the truth and legible: you can watch the
  // line retreat from the pole as the season turns.
  const solstice = new Date('2026-06-21T12:00:00Z')
  const fajr = prayerVertices(solstice, 'fajr').all
  const north = Math.max(...fajr.map(([, lat]) => lat))
  assert.ok(north > 44 && north < 52, `Fajr reaches ${north.toFixed(1)}°N, expected about 48`)
  assert.ok(Math.min(...fajr.map(([, lat]) => lat)) < -80, 'Fajr should run to the far south')

  // In December it is the other pole, by the same argument.
  const december = new Date('2026-12-21T12:00:00Z')
  const south = Math.min(...prayerVertices(december, 'fajr').all.map(([, lat]) => lat))
  assert.ok(south < -44 && south > -52, `Fajr reaches ${south.toFixed(1)}°S, expected about -48`)

  // Asr has a failure the others do not: past 90° of separation from the
  // declination, `tan` in the shadow rule goes negative, the reciprocal comes
  // back a negative altitude, and the solve returns a perfectly plausible
  // longitude for a prayer that has no time there at all — a second, entirely
  // fictitious Asr limb across the winter polar cap, every day of the year.
  const asrSouth = Math.min(...prayerVertices(solstice, 'asr').all.map(([, lat]) => lat))
  assert.ok(asrSouth > -67, `Asr reaches ${asrSouth.toFixed(1)}°S — the spurious limb is back`)
})

test('the prayer lines survive the equinox, when the terminator does not', () => {
  // `terminatorLat` bails when |tan δ| < 1e-6, so `nightPolygon`/`dayPolygon`
  // come back null and the shade blinks out for a few hours twice a year. The
  // closed form behind these curves has no such singularity: at δ = 0 it
  // reduces to cos H = sin(alt) / cos φ, defined for every |φ| < 90. So across
  // that instant the Maghrib line is the only terminator on the map, which is
  // the more correct of the two and is deliberate.
  //
  // The window is narrow enough that it has to be hunted rather than scanned:
  // the guard trips inside 6e-5° of declination and the sun crosses that in
  // about twelve seconds, so a per-minute sweep walks straight past it. Bisect
  // the sign change instead.
  let lo = Date.UTC(2026, 2, 19)
  let hi = Date.UTC(2026, 2, 21)
  assert.ok(
    Math.sign(M.subsolarPoint(new Date(lo)).lat) !== Math.sign(M.subsolarPoint(new Date(hi)).lat),
    'the March equinox should fall inside this window',
  )
  const negative = M.subsolarPoint(new Date(lo)).lat < 0
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (M.subsolarPoint(new Date(mid)).lat < 0 === negative) lo = mid
    else hi = mid
  }
  const found = new Date(lo)
  assert.equal(
    M.terminatorLat(0, M.subsolarPoint(found)),
    null,
    'the crossing should be inside the degenerate window',
  )
  assert.equal(M.nightPolygon(found), null, 'the terminator should be gone here')
  assert.equal(M.prayerLines(found).length, 5, 'the prayer lines should not be')
})

/**
 * What adhan says the named prayer is at a place, to the nearest millisecond.
 *
 * adhan reads the calendar day off a `Date`'s **local** components, so the day
 * either side is tried and the closest taken — that is what makes this immune
 * to whatever timezone the test runner happens to be in, which is the trap the
 * island avoids by not importing the library at all.
 */
const adhanPrayerAt = (id, lat, lng, t) => {
  const params = adhan.CalculationMethod.UmmAlQura()
  params.madhab = adhan.Madhab.Shafi
  // Otherwise every answer is quantised to the minute, which is 0.25° of
  // longitude — enough to swamp what is being measured.
  params.rounding = adhan.Rounding.None
  let closest = Infinity
  for (const shift of [-1, 0, 1]) {
    const u = new Date(t + shift * 24 * HOUR)
    const day = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate())
    const got = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), day, params)[id]
    if (!got || Number.isNaN(got.getTime())) continue
    closest = Math.min(closest, Math.abs(got.getTime() - t))
  }
  return closest
}

/**
 * How far the target altitude sits from the day's highest and lowest sun.
 *
 * Two things go wrong as this approaches zero and neither is a defect in the
 * geometry: the solve becomes ill-conditioned (the sun's altitude is flat at
 * its own extremes, so a hundredth of a degree of model difference becomes
 * minutes), and adhan starts substituting its high-latitude rule. Both are
 * excluded here so the comparison measures what it claims to.
 */
const solarMargin = (id, lat, at) => {
  const dec = M.subsolarPoint(at).lat
  const lowest = Math.asin(Math.max(-1, Math.min(1, -Math.cos((lat + dec) * DEG)))) / DEG
  const highest = 90 - Math.abs(lat - dec)
  const target = id === 'fajr' ? -18.5 : id === 'asr' ? M.asrAltitude(lat, dec, 1) : -0.833
  return Math.min(target - lowest, highest - target)
}

test('every prayer line lands where adhan says the prayer is', () => {
  // The load-bearing test, and the reason adhan can stay out of the bundle: it
  // pins the curves against the reference implementation without the reader
  // paying for it. If this passes, "these are Umm al-Qura prayer times" is a
  // checked statement rather than a hopeful one.
  const worst = {}
  let checked = 0
  for (const at of YEAR_SAMPLE) {
    for (const f of M.prayerLines(at)) {
      const id = f.properties.id
      for (const part of f.geometry.coordinates) {
        for (let i = 0; i < part.length; i += 13) {
          const [lng, lat] = part[i]
          if (Math.abs(lat) > 55) continue
          // Isha is Maghrib ninety minutes ago, so its conditioning is that
          // sunset's, not this instant's.
          const shifted = id === 'isha' ? new Date(at.getTime() - 90 * 60_000) : at
          if (solarMargin(id === 'isha' ? 'maghrib' : id, lat, shifted) < 2) continue
          const diff = adhanPrayerAt(id, lat, lng, at.getTime())
          checked++
          if (diff > (worst[id]?.diff ?? -1)) {
            worst[id] = { diff, where: `${lat.toFixed(1)}° ${at.toISOString().slice(0, 10)}` }
          }
        }
      }
    }
  }
  assert.ok(checked > 3000, `only ${checked} points compared`)

  for (const id of ['fajr', 'dhuhr', 'maghrib', 'isha']) {
    assert.ok(
      worst[id].diff <= 20_000,
      `${id} is ${(worst[id].diff / 1000).toFixed(1)}s off adhan at ${worst[id].where}`,
    )
  }
  // Asr is allowed more, for one known and measured reason — see the next test,
  // which pins the reason rather than leaving this as a slop budget.
  assert.ok(
    worst.asr.diff <= 150_000,
    `asr is ${(worst.asr.diff / 1000).toFixed(1)}s off adhan at ${worst.asr.where}`,
  )
})

test('the hover readout names the right time for the place under the pointer', () => {
  // `prayerInstantAt` reads the curve the other way — "when does this prayer
  // reach here" rather than "where is it now" — and it is what the pointer
  // readout prints. Two things have to hold. It must agree with adhan, which
  // makes the number on screen the same claim the lines are; and it must hold
  // *off* the line as well as on it, because the grab box is seven pixels wide
  // and at world zoom that is a couple of degrees of longitude, which is eight
  // minutes of solar time. A readout that silently reported the time on the
  // line rather than under the cursor would look right and drift.
  let worst = 0
  let where = null
  let checked = 0
  for (const at of YEAR_SAMPLE.slice(0, 16)) {
    for (const f of M.prayerLines(at)) {
      const id = f.properties.id
      for (const part of f.geometry.coordinates) {
        for (let i = 0; i < part.length; i += 23) {
          const [lng, lat] = part[i]
          if (Math.abs(lat) > 55) continue
          const shifted = id === 'isha' ? new Date(at.getTime() - 90 * 60_000) : at
          if (solarMargin(id === 'isha' ? 'maghrib' : id, lat, shifted) < 2) continue
          // Deliberately off the line, in both directions.
          for (const nudge of [0, -2.5, 2.5]) {
            const probe = ((((lng + nudge + 180) % 360) + 360) % 360) - 180
            const when = M.prayerInstantAt(at, id, lat, probe)
            assert.ok(when !== null, `${id} has no time at ${lat},${probe}`)
            const diff = adhanPrayerAt(id, lat, probe, when)
            checked++
            if (diff > worst) {
              worst = diff
              where = `${id} at ${lat.toFixed(1)}° nudged ${nudge}°`
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 500, `only ${checked} points compared`)
  // Asr carries the same known divergence as the forward direction.
  assert.ok(worst <= 150_000, `${(worst / 1000).toFixed(1)}s off adhan — ${where}`)

  // On the line and at the moment it is drawn for, the answer is that moment:
  // that is the whole meaning of the curve, and it is what makes the readout
  // and the line one statement rather than two.
  const at = new Date('2026-05-14T08:00:00Z')
  for (const f of M.prayerLines(at)) {
    for (const [lng, lat] of f.geometry.coordinates[0].filter((_, i) => i % 40 === 0)) {
      const when = M.prayerInstantAt(at, f.properties.id, lat, lng)
      assert.ok(
        Math.abs(when - at.getTime()) < 1000,
        `${f.properties.id} on its own line is ${((when - at.getTime()) / 1000).toFixed(1)}s from now`,
      )
    }
  }
})

test('the Asr difference from adhan is the one we chose, and no other', () => {
  // adhan builds its solar coordinates at **0h UT of the local calendar day**
  // and `SolarTime.afternoon()` reads the declination straight off them, so its
  // shadow rule is anchored up to twelve hours from the prayer it describes.
  // We anchor it at the place's own noon instead, which is what "the shadow an
  // object casts at noon" actually means — and, more to the point, is the only
  // choice that does not tear the curve: which calendar day a place is on
  // changes *along* a line that circles the planet, so adhan's anchor would
  // step the declination by 0.4° at the date line and kink the Asr line in the
  // middle of the Pacific.
  //
  // The gap is up to about two minutes, which is two pixels at world zoom. This
  // asserts where it comes from, comparatively rather than absolutely: the sun
  // at adhan's Asr must be much better explained by the shadow rule at the 0h
  // UT declination than by the same rule at the declination at Asr itself.
  // Comparative because an absolute bound would be measuring the two solar
  // models against each other, which is a different quantity and a smaller one.
  const params = adhan.CalculationMethod.UmmAlQura()
  params.madhab = adhan.Madhab.Shafi
  params.rounding = adhan.Rounding.None

  const altitudeAt = (t, lat, lng) => {
    const sun = M.subsolarPoint(new Date(t))
    const h = (((lng - sun.lng + 180) % 360) + 360) % 360 - 180
    return (
      Math.asin(
        Math.sin(lat * DEG) * Math.sin(sun.lat * DEG) +
          Math.cos(lat * DEG) * Math.cos(sun.lat * DEG) * Math.cos(h * DEG),
      ) / DEG
    )
  }

  let checked = 0
  for (const [lat, lng, iso] of [
    [-54, -70, '2026-04-30T15:00:00Z'],
    [21.42, 39.83, '2026-07-26T12:00:00Z'],
    [45, 10, '2026-11-05T13:00:00Z'],
    [-8, 115, '2026-02-14T06:00:00Z'],
    [33, -84, '2026-09-09T19:00:00Z'],
  ]) {
    const t = Date.parse(iso)
    const u = new Date(t)
    const day = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate())
    const asr = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), day, params).asr.getTime()
    const at0hUT = M.subsolarPoint(
      new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate())),
    ).lat
    const atAsr = M.subsolarPoint(new Date(asr)).lat
    const sun = altitudeAt(asr, lat, lng)
    const byMidnight = Math.abs(sun - M.asrAltitude(lat, at0hUT, 1))
    const byMoment = Math.abs(sun - M.asrAltitude(lat, atAsr, 1))
    assert.ok(
      byMidnight * 2 < byMoment,
      `adhan's Asr at ${lat},${lng} is explained by the 0h UT declination to ` +
        `${byMidnight.toFixed(3)}° and by the declination at Asr to ` +
        `${byMoment.toFixed(3)}° — the anchoring has changed`,
    )
    checked++
  }
  assert.equal(checked, 5)
})

test('Asr is solved against the declination at that place, at its own noon', () => {
  // The other half of the choice, stated positively. Anchoring the shadow rule
  // to the place's own noon is what "the shadow an object casts at noon" means,
  // and it is also the only anchor that keeps the line continuous: which
  // calendar day a place is on changes *along* a curve that circles the planet,
  // so adhan's 0h-UT-of-the-local-day anchor would step the declination by up
  // to 0.4° somewhere in the Pacific and put a corner in the middle of the
  // ocean. Nothing would throw and the line would still look like a line.
  //
  // Checked exactly rather than by smoothness: walk back from each vertex to
  // that meridian's noon and the shadow rule there must give the altitude the
  // sun is actually standing at.
  for (const at of YEAR_SAMPLE.slice(0, 12)) {
    const sun = M.subsolarPoint(at)
    for (const [lng, lat] of prayerVertices(at, 'asr').all) {
      const hours = hourAngleAt(lng, sun) / 15
      const noonDec = M.subsolarPoint(new Date(at.getTime() - hours * HOUR)).lat
      const standing =
        Math.asin(
          Math.sin(lat * DEG) * Math.sin(sun.lat * DEG) +
            Math.cos(lat * DEG) * Math.cos(sun.lat * DEG) * Math.cos(hourAngleAt(lng, sun) * DEG),
        ) / DEG
      assert.ok(
        Math.abs(standing - M.asrAltitude(lat, noonDec, 1)) < 0.02,
        `Asr at ${lat.toFixed(1)}° stands at ${standing.toFixed(3)}° but its noon ` +
          `declination asks for ${M.asrAltitude(lat, noonDec, 1).toFixed(3)}°`,
      )
    }
  }
})

test('the prayer ink is neutral, its own, and legible on the ground', () => {
  const prayer = M.MAP_COLOURS.prayer
  const channels = [16, 8, 0].map((s) => (Number.parseInt(prayer.slice(1), 16) >> s) & 255)
  // No hue, because these lines carry no value. Colour on this map means a
  // category, a direction or a severity; a warm tone was the first instinct and
  // landed six points of hue from `OVERLAY_COLOUR.straits`, which is the exact
  // collision the mark alphabet was built to stop making. Shape says what.
  assert.ok(
    Math.max(...channels) - Math.min(...channels) <= 20,
    `the prayer ink is chromatic (${prayer})`,
  )
  for (const [name, value] of [
    ...Object.entries(M.OVERLAY_COLOUR),
    ...Object.entries(M.CATEGORY_COLOUR),
  ]) {
    assert.notEqual(value, prayer, `the prayer ink is shared with ${name}`)
  }
  // The label is text and is drawn at full strength, so it answers to AA on
  // every ground the ramp can paint. The line itself is the quiet half.
  const contrast = (a, b) => {
    const [hi, lo] = [srgbLuminance(a), srgbLuminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  for (const ground of [M.MAP_COLOURS.ocean, M.MAP_COLOURS.land, ...M.LAND_RAMP]) {
    assert.ok(
      contrast(prayer, ground) >= 4.5,
      `prayer ink is ${contrast(prayer, ground).toFixed(2)}:1 on ${ground}`,
    )
  }
})

// ---------------------------------------------------------------------------
// Story decay
// ---------------------------------------------------------------------------

test('decay halves the weight every half-life', () => {
  const now = Date.UTC(2026, 0, 15, 12)
  const h = M.DECAY_HALF_LIFE_HOURS
  assert.ok(Math.abs(M.decayAt(now, now) - 1) < 1e-9, 'fresh is 1')
  assert.ok(Math.abs(M.decayAt(now - h * 3600_000, now) - 0.5) < 1e-9, 'one half-life')
  assert.ok(Math.abs(M.decayAt(now - 2 * h * 3600_000, now) - 0.25) < 1e-9, 'two half-lives')
  // The future does not brighten: points ahead of the scrub head clamp at 1.
  assert.equal(M.decayAt(now + 5 * 3600_000, now), 1)
})

test('the decay curve spends its range on the window the map shows', () => {
  // The map holds 14 days. A curve tuned for the mobile globe's 72-hour window
  // put almost the whole corpus below 2% and flattened the recency channel to
  // "today or not today", which is the regression this pins.
  const now = Date.UTC(2026, 0, 15, 12)
  const at = (days) => M.decayAt(now - days * 86_400_000, now)
  assert.ok(at(1) > 0.7, `1 day should stay hot, was ${at(1)}`)
  assert.ok(at(3) > 0.35 && at(3) < 0.75, `3 days should be mid, was ${at(3)}`)
  assert.ok(at(7) > 0.08 && at(7) < 0.35, `7 days should be cool, was ${at(7)}`)
  assert.ok(at(14) < 0.1, `14 days should be an ember, was ${at(14)}`)
  // Monotonic, and never negative.
  for (let d = 0; d < 14; d++) assert.ok(at(d) > at(d + 1), `must decrease at day ${d}`)
})

// ---------------------------------------------------------------------------
// Basemap geometry fixes
// ---------------------------------------------------------------------------

test('unwrap keeps a ring crossing the antimeridian continuous', () => {
  // Russia's coast runs +179 → -179. Joined literally that sweeps a band right
  // across the map; unwrapped it simply continues past 180.
  const ring = [
    [178, 66],
    [179.5, 67],
    [-179, 68],
    [-177, 68.5],
  ]
  const out = unwrap(ring)
  for (let i = 1; i < out.length; i++) {
    assert.ok(Math.abs(out[i][0] - out[i - 1][0]) < 180, `step ${i} jumped the meridian`)
  }
  assert.ok(out[2][0] > 180, `expected continuation past 180, got ${out[2][0]}`)
  // Latitudes must be untouched.
  assert.deepEqual(out.map(([, lat]) => lat), ring.map(([, lat]) => lat))
})

test('unwrap leaves an ordinary ring alone', () => {
  const ring = [
    [10, 50],
    [11, 51],
    [12, 50],
  ]
  assert.deepEqual(unwrap(ring), ring)
})

test('closePolar routes an encircling ring via the pole', () => {
  // A ring spanning the full globe below 60°S is Antarctica: with no vertex at
  // the pole there is no closed area, and the fill renders as nothing.
  const ring = []
  for (let lng = -180; lng <= 180; lng += 20) ring.push([lng, -70])
  const out = closePolar(ring)
  assert.ok(out.length > ring.length, 'must add closing vertices')
  assert.ok(
    out.some(([, lat]) => lat === -90),
    'must reach the south pole',
  )
  assert.deepEqual(out[out.length - 1], ring[0], 'must close on the first vertex')
})

test('closePolar leaves a normal country alone', () => {
  const ring = [
    [10, 50],
    [12, 50],
    [12, 52],
    [10, 52],
    [10, 50],
  ]
  assert.deepEqual(closePolar(ring), ring)
})

test('simplifyRing keeps the shape of a closed ring', () => {
  // The bug this pins: a closed ring's first and last vertex are identical, so
  // the baseline Douglas-Peucker measures against has zero length and every
  // point sits exactly on it. Run naively the whole coastline collapses to two
  // points — no exception, just a country that renders as nothing.
  const ring = []
  const N = 64
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    ring.push([10 + 5 * Math.cos(a), 50 + 5 * Math.sin(a)])
  }
  ring.push(ring[0])

  const out = simplifyRing(ring, 0.003)
  assert.ok(out.length > 8, `ring collapsed to ${out.length} points`)
  assert.ok(out.length <= ring.length, 'must not add vertices')
  assert.deepEqual(out[0], out[out.length - 1], 'must stay closed')

  // Every surviving vertex must be one of the originals, and the extent must
  // survive — simplification removes detail, it does not move the shape.
  const xs = out.map(([x]) => x)
  const ys = out.map(([, y]) => y)
  assert.ok(Math.max(...xs) > 14.5 && Math.min(...xs) < 5.5, 'x extent lost')
  assert.ok(Math.max(...ys) > 54.5 && Math.min(...ys) < 45.5, 'y extent lost')

  // A coarse tolerance removes more than a fine one, and zero removes nothing.
  assert.equal(simplifyRing(ring, 0).length, ring.length)
  assert.ok(simplifyRing(ring, 0.5).length < out.length, 'coarser must cut more')
})

test('simplifyRing thins an open chain and leaves tiny rings alone', () => {
  // An open chain that is almost a straight line: the interior points all sit
  // well within tolerance, so only the endpoints need to survive.
  const chain = [
    [0, 0],
    [1, 0.0001],
    [2, -0.0001],
    [3, 0.0002],
    [4, 0],
    [5, 0.0001],
  ]
  assert.equal(simplifyRing(chain, 0.003).length, 2, 'a straight chain reduces to its ends')

  // A real corner must survive the same tolerance.
  const corner = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [2, 3],
  ]
  assert.equal(simplifyRing(corner, 0.003).length, 3, 'the corner vertex must stay')

  // Below five vertices there is no detail that can be removed without
  // destroying the shape, so the ring is returned untouched.
  const tiny = [[0, 0], [1, 1], [0, 1], [0, 0]]
  assert.deepEqual(simplifyRing(tiny, 0.003), tiny)
})

test('thin rounds coordinates without changing the geometry type', () => {
  const g = thin(
    {
      type: 'Polygon',
      coordinates: [
        [
          [10.123456789, 50.987654321],
          [12.111111111, 50.5],
          [12, 52],
          [10.123456789, 50.987654321],
        ],
      ],
    },
    4,
  )
  assert.equal(g.type, 'Polygon')
  assert.equal(g.coordinates[0][0][0], 10.1235)
  assert.equal(g.coordinates[0][0][1], 50.9877)
})

// ---------------------------------------------------------------------------
// The built payload the map actually consumes
// ---------------------------------------------------------------------------

test('map.json points carry usable geometry and a live size channel', (t) => {
  const path = join(ROOT, 'dist/api/map.json')
  if (!existsSync(path)) {
    t.skip('dist/api/map.json not built')
    return
  }
  const { window: win, points } = JSON.parse(readFileSync(path, 'utf8'))
  assert.ok(points.length > 0, 'expected at least one point')
  assert.ok(win.start <= win.end, 'window must not run backwards')

  for (const p of points) {
    assert.ok(p.lat >= -90 && p.lat <= 90, `lat out of range: ${p.lat}`)
    assert.ok(p.lng >= -180 && p.lng <= 180, `lng out of range: ${p.lng}`)
    assert.ok(Number.isFinite(p.t), `bad time on ${p.slug}`)
    assert.ok(p.slug && p.title, 'slug and title are required')
  }

  // Points are emitted in event order, which the timeline histogram assumes.
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i].t >= points[i - 1].t, `points must be sorted by time at ${i}`)
  }

  // The size channel is a percentile rank, so it must actually spread. The bug
  // this pins: a log curve against a hardcoded ceiling left two thirds of the
  // corpus at exactly 0 and a handful of bad rows saturated at 1.
  const ranked = points.map((p) => p.w).filter((w) => typeof w === 'number')
  if (ranked.length > 20) {
    for (const w of ranked) assert.ok(w >= 0 && w <= 1, `w out of range: ${w}`)
    const distinct = new Set(ranked).size
    assert.ok(distinct > 10, `size channel collapsed to ${distinct} distinct values`)
    const saturated = ranked.filter((w) => w >= 1).length
    assert.ok(
      saturated / ranked.length < 0.1,
      `${saturated}/${ranked.length} points saturate the size channel`,
    )
  }

  // Divergence, when present, is a plain 0..~1 spread.
  for (const p of points) {
    if (p.d !== undefined) assert.ok(p.d > 0 && p.d <= 2, `divergence out of range: ${p.d}`)
  }
})

test('every map point has a story card to open', (t) => {
  const mapPath = join(ROOT, 'dist/api/map.json')
  if (!existsSync(mapPath)) {
    t.skip('dist/api/map.json not built')
    return
  }
  const { points } = JSON.parse(readFileSync(mapPath, 'utf8'))
  const missing = points
    .filter((p) => !existsSync(join(ROOT, 'dist/api/story', `${p.slug}.json`)))
    .map((p) => p.slug)
  assert.equal(missing.length, 0, `story cards missing for: ${missing.slice(0, 5).join(', ')}`)
})

// ---------------------------------------------------------------------------
// What the overlay layers encode
// ---------------------------------------------------------------------------

// The bug this pins: `alertlevel` was the only input to the disaster mark's
// size, and 98 of 100 alerts are Green — so an M6.2 and an M4.5 drew as the
// same dot. The fix ranks `severityValue` within each event type, which only
// works while the pipeline keeps populating it. If it stops, the layer goes
// flat again in a way nothing else would report.
test('gdacs alerts carry a severity value that spreads within each event type', (t) => {
  const path = join(ROOT, 'dist/api/gdacs.json')
  if (!existsSync(path)) {
    t.skip('dist/api/gdacs.json not built')
    return
  }
  const { alerts } = JSON.parse(readFileSync(path, 'utf8'))
  assert.ok(alerts.length > 0, 'expected at least one alert')

  const byType = new Map()
  for (const a of alerts) {
    if (typeof a.severityValue !== 'number' || !(a.severityValue > 0)) continue
    if (!byType.has(a.eventtype)) byType.set(a.eventtype, [])
    byType.get(a.eventtype).push(a.severityValue)
  }
  assert.ok(byType.size > 0, 'no alert carries a usable severityValue')

  // Floods legitimately publish no scalar, so this asserts per type rather than
  // over the feed: every type that *does* report a magnitude must vary in it.
  for (const [type, values] of byType) {
    if (values.length < 3) continue
    assert.ok(
      new Set(values).size > 1,
      `${type} severity collapsed to a single value across ${values.length} alerts`,
    )
  }
})

// The `details` map is keyed `${eventtype}:${eventid}`. Keying it on the bare
// event id silently finds nothing — which is exactly how the population figures
// went unread on the web map while the app rendered them.
test('gdacs detail keys resolve to alerts', (t) => {
  const path = join(ROOT, 'dist/api/gdacs.json')
  if (!existsSync(path)) {
    t.skip('dist/api/gdacs.json not built')
    return
  }
  const { alerts, details } = JSON.parse(readFileSync(path, 'utf8'))
  if (!details) return
  const keys = new Set(alerts.map((a) => `${a.eventtype}:${a.eventid}`))
  const orphans = Object.keys(details).filter((k) => !keys.has(k))
  assert.equal(orphans.length, 0, `detail keys match no alert: ${orphans.slice(0, 3).join(', ')}`)
})

// UCDP records an event as a pair, and the sheet titles it with both. Dropping
// `actor2` is what made a card read "6 killed · JNIM" — as though JNIM had lost
// the six people it in fact killed.
test('conflict events name both sides', (t) => {
  const path = join(ROOT, 'dist/api/conflict.json')
  if (!existsSync(path)) {
    t.skip('dist/api/conflict.json not built')
    return
  }
  const { events } = JSON.parse(readFileSync(path, 'utf8'))
  assert.ok(events.length > 0, 'expected at least one event')
  const missing = events.filter((e) => !e.actor1 || !e.actor2)
  assert.ok(
    missing.length / events.length < 0.05,
    `${missing.length}/${events.length} conflict events name only one actor`,
  )
  // Civilian deaths never exceed the total — the card renders "N killed, all
  // civilians" off this comparison.
  const impossible = events.filter((e) => (e.deathsCivilians ?? 0) > (e.fatalities ?? 0))
  assert.equal(impossible.length, 0, `${impossible.length} events report more civilians than dead`)
})

// The story card annotates a contested story with each outlet's country and
// tone. Both fields exist on essentially every source in frontmatter, and both
// were being dropped by this endpoint while feed.json forwarded them.
test('story cards forward the per-source country the card renders', (t) => {
  const mapPath = join(ROOT, 'dist/api/map.json')
  if (!existsSync(mapPath)) {
    t.skip('dist/api/map.json not built')
    return
  }
  const { points } = JSON.parse(readFileSync(mapPath, 'utf8'))
  let cards = 0
  let withCountry = 0
  for (const p of points) {
    const path = join(ROOT, 'dist/api/story', `${p.slug}.json`)
    if (!existsSync(path)) continue
    const story = JSON.parse(readFileSync(path, 'utf8'))
    if (!story.sources?.length) continue
    cards++
    if (story.sources.some((s) => s.country)) withCountry++
    // The card renders its own attribution from `sources[]`, so the body must
    // not also end in a flat "Sources: …" line or both would show.
    assert.ok(
      !/article-sources-flat/.test(story.bodyHtml || ''),
      `${p.slug} still carries the flat sources line in bodyHtml`,
    )
  }
  assert.ok(cards > 0, 'no story cards with sources')
  assert.ok(
    withCountry / cards > 0.9,
    `only ${withCountry}/${cards} story cards forward a source country`,
  )
})

// ---------------------------------------------------------------------------
// The land tint — per-metric country payloads and the ramp that draws them
// ---------------------------------------------------------------------------

const srgbLuminance = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16)
  const lin = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  )
}

test('the land ramp is legible, ordered, neutral, and clear of the border', () => {
  const ramp = M.LAND_RAMP
  assert.ok(ramp.length >= 2, 'ramp needs at least two stops')

  // Monotonic, or the ramp would fold: two different percentiles could land on
  // the same tone and a country's shade would stop being readable.
  for (let i = 1; i < ramp.length; i++) {
    assert.ok(
      srgbLuminance(ramp[i]) > srgbLuminance(ramp[i - 1]),
      `ramp stop ${i} (${ramp[i]}) is not lighter than ${ramp[i - 1]}`,
    )
  }

  // The one nobody was asking, and the reason a flat ramp shipped.
  //
  // The previous stops were monotonic, neutral and under the border, so every
  // assertion here passed — while measuring 1.04:1 between adjacent stops and
  // 1.22:1 across the entire scale. The land was uniformly dark and switching
  // metrics changed nothing a reader could see. Monotonic is not the same as
  // legible: an encoding has to be *perceptible*, not merely ordered.
  const contrast = (a, b) => {
    const [hi, lo] = [srgbLuminance(a), srgbLuminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  for (let i = 1; i < ramp.length; i++) {
    const c = contrast(ramp[i], ramp[i - 1])
    assert.ok(
      c >= 1.12,
      `ramp step ${i} (${ramp[i - 1]} → ${ramp[i]}) is ${c.toFixed(3)}:1 — not a visible step`,
    )
  }
  // And the scale as a whole has to be worth reading, not just its steps.
  const span = contrast(ramp[ramp.length - 1], ramp[0])
  assert.ok(span >= 1.8, `the whole ramp spans only ${span.toFixed(3)}:1 worst to best`)

  // `borders` is a single line layer drawn over the fill, and it doubles as the
  // coastline. Land tinted to the border's own lightness erases both the
  // frontier and the shore, so the top of the ramp has to stay clear of it —
  // and the border has to stay clear of the ocean, or the coast goes with it.
  assert.ok(
    contrast(M.MAP_COLOURS.border, ramp[ramp.length - 1]) >= 1.25,
    `border ${M.MAP_COLOURS.border} is not distinguishable from ramp top ${ramp[ramp.length - 1]}`,
  )
  assert.ok(
    srgbLuminance(ramp[ramp.length - 1]) < srgbLuminance(M.MAP_COLOURS.border),
    `ramp top ${ramp[ramp.length - 1]} is not darker than border ${M.MAP_COLOURS.border}`,
  )
  assert.ok(
    contrast(M.MAP_COLOURS.border, M.MAP_COLOURS.ocean) >= 2.5,
    'the border is not visible against the ocean, so coastlines disappear',
  )

  // No-data is off the scale, not at the bottom of it — and the gap saying so
  // has to be wider than the step between two adjacent stops, or "we have no
  // figure" reads as "the lowest figure". Compared as a ratio, like every other
  // distance here: an absolute luminance difference is not comparable between
  // the dark end of the ramp and the light end.
  assert.ok(
    srgbLuminance(M.LAND_NO_DATA) < srgbLuminance(ramp[0]),
    'no-data tone is not below the ramp floor',
  )
  assert.ok(
    contrast(ramp[0], M.LAND_NO_DATA) >= contrast(ramp[1], ramp[0]),
    'the no-data gap is narrower than one ramp step, so off-scale reads as low',
  )

  // Neutral. Category hue is the only colour on this map that means anything;
  // a chromatic ramp would take that back. Allow a slight blue cast, which is
  // the base palette's own, but nothing that reads as a hue.
  for (const hex of [...ramp, M.LAND_NO_DATA]) {
    const n = Number.parseInt(hex.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    assert.ok(
      Math.max(r, g, b) - Math.min(r, g, b) <= 20,
      `${hex} is chromatic enough to compete with the category colours`,
    )
  }
})

test('every metric payload places its countries on a 0..1 scale', (t) => {
  const indexPath = join(ROOT, 'dist/api/metric/index.json')
  if (!existsSync(indexPath)) {
    t.skip('dist/api/metric/ not built')
    return
  }
  const { metrics } = JSON.parse(readFileSync(indexPath, 'utf8'))
  assert.ok(metrics.length >= 20, `only ${metrics.length} metrics emitted`)

  const iso2s = new Set(
    JSON.parse(readFileSync(join(ROOT, 'dist/basemap/countries.geojson'), 'utf8')).features.map(
      (f) => f.properties?.iso2,
    ),
  )

  for (const m of metrics) {
    const payload = JSON.parse(
      readFileSync(join(ROOT, 'dist/api/metric', `${m.key}.json`), 'utf8'),
    )
    const entries = Object.entries(payload.values)
    assert.ok(entries.length > 0, `${m.key} has no countries`)

    // The description is what tells the reader which end of the ramp is which.
    // Without it the tint is a shade with no direction, so it is not optional.
    assert.ok(payload.description, `${m.key} ships no description for the key to print`)

    let lowest = 1
    let highest = 0
    for (const [iso2, v] of entries) {
      assert.ok(v.p >= 0 && v.p <= 1, `${m.key}/${iso2} has p=${v.p} outside 0..1`)
      assert.ok(v.r >= 1 && v.r <= payload.total, `${m.key}/${iso2} has rank ${v.r} of ${payload.total}`)
      // Every code must route somewhere — either to a polygon the map can tint
      // or to a country page. Not every code does both: the basemap merges the
      // Natural Earth Israel and Palestine geometries into one feature carrying
      // `PS`, so `IL` has a profile page and no polygon. That is the map's
      // cartography working as intended, and the payload is also a
      // general-purpose endpoint, so `IL` stays. A code matching neither would
      // be a genuine dead entry.
      assert.ok(
        iso2s.has(iso2) || existsSync(join(ROOT, 'dist/api/country', `${iso2}.json`)),
        `${m.key} carries ${iso2}, which has neither a polygon nor a country page`,
      )
      if (v.p < lowest) lowest = v.p
      if (v.p > highest) highest = v.p
    }
    // The position is computed over the set the map can draw, so both ends of
    // the ramp must belong to somebody — if they don't, the projection is being
    // taken over a wider set than the one being painted, and the ramp is
    // spending its range on countries that never appear. The least populous
    // entry in COUNTRY_DATA is Antarctica, which has no ISO2 and is never
    // drawn; computed over the raw ranking, p=0 went to nobody.
    //
    // Both are exact now. Under the old percentile the light end was loose —
    // ties shared the lower position, so literacy topped out at 0.92 — but the
    // ramp is the value now, and the largest value is the top of the scale by
    // definition however many countries hold it.
    assert.equal(lowest, 0, `${m.key} never reaches p=0`)
    assert.equal(highest, 1, `${m.key} tops out at p=${highest}, so the ramp's light end is unused`)
  }
})

test('the polygon the map actually draws for Palestine can be tinted', (t) => {
  const indexPath = join(ROOT, 'dist/api/metric/index.json')
  const basePath = join(ROOT, 'dist/basemap/countries.geojson')
  if (!existsSync(indexPath) || !existsSync(basePath)) {
    t.skip('dist/api/metric or dist/basemap not built')
    return
  }
  // The basemap dissolves Israel and Palestine into a single feature labelled
  // Palestine and keyed `PS`. That is the only polygon covering the territory,
  // so `PS` is the only code that can paint it — a metric table that carried
  // the figures under `IL` alone would leave the map blank there while every
  // neighbour was shaded, which reads as "no data" about a place we do hold
  // data about.
  const features = JSON.parse(readFileSync(basePath, 'utf8')).features
  const codes = new Set(features.map((f) => f.properties?.iso2))
  assert.ok(codes.has('PS'), 'the basemap has no PS polygon')
  assert.ok(!codes.has('IL'), 'the basemap has a separate IL polygon, so the merge regressed')

  const { metrics } = JSON.parse(readFileSync(indexPath, 'utf8'))
  let withPs = 0
  for (const m of metrics) {
    const payload = JSON.parse(
      readFileSync(join(ROOT, 'dist/api/metric', `${m.key}.json`), 'utf8'),
    )
    if (payload.values.PS) withPs++
  }
  assert.ok(withPs >= 15, `only ${withPs} of ${metrics.length} metrics can tint PS`)
})

test('a metric with no figure for a country omits it rather than scoring it zero', (t) => {
  const path = join(ROOT, 'dist/api/metric/pressFreedomScore.json')
  if (!existsSync(path)) {
    t.skip('dist/api/metric/ not built')
    return
  }
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  const covered = Object.keys(payload.values)

  // country-augmented covers ~144 countries against country-data's 176, so
  // this gap is real and permanent rather than a build accident. The countries
  // in it must be absent, because p=0 is a claim — "least of this metric" —
  // and we have no figure to make it with.
  assert.ok(
    covered.length < 176,
    'press freedom covers every country, so the no-data path is untested',
  )
  assert.ok(!('SS' in payload.values) || payload.values.SS.p != null, 'South Sudan carries a null p')
  for (const v of Object.values(payload.values)) {
    assert.equal(typeof v.p, 'number', 'a covered country carries a non-numeric p')
    assert.ok(Number.isFinite(v.p), 'a covered country carries a non-finite p')
  }
})

test('rank 1 goes to the country the metric calls best, not worst', (t) => {
  const path = join(ROOT, 'dist/api/metric/pressFreedomScore.json')
  if (!existsSync(path)) {
    t.skip('dist/api/metric/ not built')
    return
  }
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  const byRank = Object.entries(payload.values).sort((a, b) => a[1].r - b[1].r)
  const [bestIso] = byRank[0]
  const [worstIso] = byRank[byRank.length - 1]

  // getRanking() already applies METRICS[key].ascending; country-pages.js used
  // to flip it a second time, which inverted exactly the three metrics the flag
  // exists to correct — the page awarded rank 1 of 139 to Eritrea for press
  // freedom. RSF scores 0 as most free, so rank 1 belongs at the low end.
  assert.ok(payload.ascending, 'press freedom should be flagged ascending')
  assert.ok(
    Number.parseFloat(payload.values[bestIso].v) < Number.parseFloat(payload.values[worstIso].v),
    `rank 1 (${bestIso}, ${payload.values[bestIso].v}) does not hold a lower RSF score than rank last (${worstIso}, ${payload.values[worstIso].v})`,
  )
  // And the ramp now turns around with the flag, so the *freest* country is
  // the light end. It used to be the other way: the ramp encoded magnitude
  // only, so a picker labelled "press freedom" painted Eritrea as the world's
  // brightest example of it and Norway as its darkest — on the metric the map
  // opens with, which is the first thing every reader sees.
  assert.ok(
    payload.values[bestIso].p > payload.values[worstIso].p,
    `press freedom is not flipped: ${bestIso} (${payload.values[bestIso].v}) sits at p=${payload.values[bestIso].p}, below ${worstIso} at ${payload.values[worstIso].p}`,
  )
  assert.equal(payload.values[bestIso].p, 1, 'the freest country is not the lightest tone')
})

test('the map tells the time in Makkah, and the day turns there too', () => {
  const HOUR = 3_600_000
  // Saudi Arabia is UTC+3 and has never observed daylight saving, so the offset
  // has to be the same in January and July. A seasonal wobble here would slide
  // the rail's day columns by an hour twice a year.
  for (const iso of [
    '2026-01-15T00:00:00Z',
    '2026-03-29T12:00:00Z', // the European DST switch, which must not matter
    '2026-07-26T13:00:00Z',
    '2026-10-25T02:00:00Z',
  ]) {
    assert.equal(
      M.zoneOffset(Date.parse(iso), M.MAKKAH_TZ),
      3 * HOUR,
      `Makkah is not +03:00 at ${iso}`,
    )
  }

  // And the helper has to be reading the zone rather than returning a constant
  // that happens to be right. London moves; if this passes for Riyadh and fails
  // here, the offset is hardcoded somewhere.
  assert.equal(M.zoneOffset(Date.parse('2026-01-15T12:00:00Z'), 'Europe/London'), 0)
  assert.equal(M.zoneOffset(Date.parse('2026-07-15T12:00:00Z'), 'Europe/London'), HOUR)
  // A zone offset by a non-whole hour, and one behind UTC.
  assert.equal(M.zoneOffset(Date.parse('2026-01-15T12:00:00Z'), 'Asia/Kolkata'), 5.5 * HOUR)
  assert.equal(M.zoneOffset(Date.parse('2026-01-15T12:00:00Z'), 'America/New_York'), -5 * HOUR)

  // Midnight is the case that breaks: some ICU builds answer `hour: "24"` for
  // it, which puts the offset a full day out once a day, in the hour nobody
  // looks at. This is that hour — 21:00Z is 00:00 in Makkah.
  assert.equal(M.zoneOffset(Date.parse('2026-07-26T21:00:00Z'), M.MAKKAH_TZ), 3 * HOUR)
  assert.equal(M.zoneOffset(Date.parse('2026-07-26T21:30:00Z'), M.MAKKAH_TZ), 3 * HOUR)

  // The label names the place, not the abbreviation: `AST` is also Atlantic
  // Standard Time, and the place is the point.
  assert.equal(M.MAKKAH_LABEL, 'Makkah')
  assert.ok(!/AST|UTC|GMT/.test(M.MAKKAH_LABEL))

  // The Hijri date beside the clock must read in the same frame, or the row
  // states two different days at once. Umm al-Qura is Saudi Arabia's own civil
  // calendar, so this is the frame it is defined in — and between 21:00Z and
  // midnight the Makkah day is already the next one.
  const late = Date.parse('2026-07-26T22:00:00Z')
  assert.notEqual(
    M.hijriLabel(late, M.MAKKAH_TZ),
    M.hijriLabel(late, 'UTC'),
    'the Hijri day does not turn at Makkah midnight, so the frame is not being applied',
  )
})

test('the live scrub position is the real live edge, whatever the day anchor', () => {
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const SLOT = 6 * HOUR

  // `createTimeline` needs a DOM, so this reproduces its three lines of axis
  // arithmetic rather than importing it. They are copied deliberately: the
  // point is to pin the *relationship* between the anchor, the slot count and
  // the clamp, which is what broke.
  const liveHead = (start, end, tzOffset) => {
    const anchored = Math.floor((start + tzOffset) / DAY) * DAY - tzOffset
    const span = Math.max(SLOT, end - anchored)
    const slots = Math.max(1, Math.ceil(span / SLOT))
    return Math.min(end, anchored + slots * SLOT)
  }

  // The window that exposed it: a build finishing at 21:15Z, which is 00:15 the
  // next day in Makkah. Against a Makkah-midnight anchor the rounded slot count
  // landed on 21:00Z — fifteen minutes short — so the rail said "live" while
  // filtering out anything newer than 21:00.
  const end = Date.parse('2026-07-25T21:15:00Z')
  const start = Date.parse('2026-07-11T20:19:00Z')
  for (const tz of [0, 3 * HOUR, -5 * HOUR, 5.5 * HOUR]) {
    assert.equal(
      liveHead(start, end, tz),
      end,
      `the live head misses the window end at offset ${tz / HOUR}h`,
    )
  }

  // And it must hold for any end time, not just this one — a build lands
  // wherever it lands. Every minute of a day, against the Makkah anchor.
  for (let m = 0; m < 1440; m++) {
    const e = Date.parse('2026-07-25T00:00:00Z') + m * 60_000
    assert.equal(
      liveHead(e - 14 * DAY, e, 3 * HOUR),
      e,
      `the live head misses the window end for a build at minute ${m}`,
    )
  }
})

test('the ramp is the value, not the ranking', (t) => {
  const indexPath = join(ROOT, 'dist/api/metric/index.json')
  if (!existsSync(indexPath)) {
    t.skip('dist/api/metric/ not built')
    return
  }
  const { metrics } = JSON.parse(readFileSync(indexPath, 'utf8'))

  // A percentile is uniform by construction: a fifth of the world in each fifth
  // of the ramp, on every metric, forever. That is what this used to be, and it
  // meant the *distribution of tones on screen was identical* whichever metric
  // was showing — only which country held which tone changed. So the test is
  // that the world is NOT evenly spread: real distributions are lumpy, and the
  // ramp's job is to show the lump.
  let lumpy = 0
  for (const m of metrics) {
    const payload = JSON.parse(
      readFileSync(join(ROOT, 'dist/api/metric', `${m.key}.json`), 'utf8'),
    )
    const ps = Object.values(payload.values).map((v) => v.p)
    const bins = [0, 0, 0, 0, 0]
    for (const p of ps) bins[Math.min(4, Math.floor(p * 5))]++
    const share = Math.max(...bins) / ps.length

    // Under a percentile every one of these lands within a rounding error of
    // 0.2. Anything meaningfully above it means the tone is tracking the value.
    if (share > 0.3) lumpy++

    // The other side of the same coin, and the failure the `scale` field exists
    // to prevent: a linear ramp on GDP put 99% of countries in one bin, which
    // is a flat map wearing a gradient. Nothing may be that bunched.
    assert.ok(
      share <= 0.7,
      `${m.key} (${payload.scale}) puts ${(share * 100).toFixed(0)}% of countries in one fifth of the ramp — the wrong scale for this distribution`,
    )
  }
  assert.ok(
    lumpy >= 10,
    `only ${lumpy} of ${metrics.length} metrics have a non-uniform spread, so the ramp is still a percentile`,
  )
})

test('every metric declares a scale and both ends of it', (t) => {
  const indexPath = join(ROOT, 'dist/api/metric/index.json')
  if (!existsSync(indexPath)) {
    t.skip('dist/api/metric/ not built')
    return
  }
  const { metrics } = JSON.parse(readFileSync(indexPath, 'utf8'))
  for (const m of metrics) {
    const payload = JSON.parse(
      readFileSync(join(ROOT, 'dist/api/metric', `${m.key}.json`), 'utf8'),
    )
    assert.ok(
      payload.scale === 'linear' || payload.scale === 'log',
      `${m.key} ships scale=${payload.scale}`,
    )
    // The legend prints these either side of the gradient. Without them it is
    // 72px of bare colour — a scale with no units, readable only by someone who
    // already knows the distribution. They also carry the direction, which
    // prose no longer can now that three metrics turn the ramp around.
    assert.ok(payload.domain?.dark, `${m.key} has no dark-end label`)
    assert.ok(payload.domain?.light, `${m.key} has no light-end label`)
    assert.notEqual(
      payload.domain.dark,
      payload.domain.light,
      `${m.key} prints the same value at both ends of the ramp`,
    )

    // The ends have to be the ends. A country lighter than the light-end label
    // means the legend is understating what the ramp can mean — which is how
    // the log floor first showed up: Niger's 0% youth unemployment shared the
    // lightest tone with a country at 1%, and the tie printed the 1%.
    const entries = Object.values(payload.values)
    const darkest = entries.reduce((a, b) => (b.p < a.p ? b : a))
    const lightest = entries.reduce((a, b) => (b.p > a.p ? b : a))
    assert.equal(darkest.p, 0, `${m.key} never reaches the darkest tone`)
    assert.equal(lightest.p, 1, `${m.key} never reaches the lightest tone`)
  }
})

test('a country lands on the same tone the card shows it', () => {
  // `rampColour` reimplements the land layer's interpolate expression, because
  // there is no way to ask MapLibre what colour a feature came out. The two can
  // only be kept honest by pinning the ends and the shape.
  assert.equal(M.rampColour(0), M.LAND_RAMP[0])
  assert.equal(M.rampColour(1), M.LAND_RAMP[M.LAND_RAMP.length - 1])
  for (let i = 0; i < M.LAND_RAMP.length; i++) {
    assert.equal(
      M.rampColour(i / (M.LAND_RAMP.length - 1)),
      M.LAND_RAMP[i],
      `ramp stop ${i} is not reproduced at its own position`,
    )
  }
  // Out of range clamps rather than extrapolating into a colour off the scale.
  assert.equal(M.rampColour(-1), M.LAND_RAMP[0])
  assert.equal(M.rampColour(2), M.LAND_RAMP[M.LAND_RAMP.length - 1])

  // Monotonic in luminance between the stops, or an intermediate value would
  // read as a position it isn't.
  const lum = (hex) => {
    const c = [1, 3, 5]
      .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  let prev = -1
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const l = lum(M.rampColour(p))
    assert.ok(l > prev, `ramp is not monotonic at p=${p.toFixed(2)}`)
    prev = l
  }
})

test('the country card and the land tint agree about where a country sits', (t) => {
  const metricPath = join(ROOT, 'dist/api/metric/pressFreedomScore.json')
  const countryDir = join(ROOT, 'dist/api/country')
  if (!existsSync(metricPath) || !existsSync(countryDir)) {
    t.skip('dist/api/metric or dist/api/country not built')
    return
  }
  const payload = JSON.parse(readFileSync(metricPath, 'utf8'))
  let checked = 0
  for (const [iso2, v] of Object.entries(payload.values)) {
    const cardPath = join(countryDir, `${iso2}.json`)
    if (!existsSync(cardPath)) continue
    const card = JSON.parse(readFileSync(cardPath, 'utf8'))
    const row = card.metrics?.find((m) => m.label === payload.label)
    if (!row) continue
    checked++
    // Two surfaces, one number. A reader who clicks a country to ask why it is
    // shaded that way must not be told something different by the card.
    assert.equal(row.value, v.v, `${iso2} value differs: card ${row.value} vs metric ${v.v}`)
    assert.equal(row.rank, v.r, `${iso2} rank differs: card ${row.rank} vs metric ${v.r}`)
    assert.equal(row.total, payload.total, `${iso2} total differs`)
  }
  assert.ok(checked > 100, `only ${checked} countries cross-checked`)
})

test('the basemap flags national capitals and not provincial ones', (t) => {
  const path = join(ROOT, 'dist/basemap/places.geojson')
  if (!existsSync(path)) {
    t.skip('dist/basemap/places.geojson not built')
    return
  }
  const { features } = JSON.parse(readFileSync(path, 'utf8'))
  const flagged = features.filter((f) => f.properties?.ncap === 1)

  // Natural Earth's own `cap` is set on 796 of 1251 places — it marks admin
  // seats as readily as national ones, which is why this is a separate flag
  // joined from capitals-50m rather than a rename of that one.
  assert.ok(
    flagged.length > 150 && flagged.length < 250,
    `${flagged.length} places flagged as national capitals, expected ~194`,
  )
  const byName = (n) => features.find((f) => f.properties?.n === n)?.properties?.ncap
  assert.equal(byName('New Delhi'), 1, 'New Delhi is not flagged as a national capital')
  assert.equal(byName('Mumbai'), 0, 'Mumbai is flagged as a national capital')
  // The join runs against the untranslated source name, so the place-name
  // policy and the capital flag cannot knock each other out.
  assert.equal(byName('Al-Quds'), 1, 'Al-Quds lost its capital flag to the rename')
})

// ---------------------------------------------------------------------------
// Card formatting
// ---------------------------------------------------------------------------

test('the basemap labels territories with the name of the people whose land it is', (t) => {
  const path = join(ROOT, 'dist/basemap/country-labels.geojson')
  if (!existsSync(path)) {
    t.skip('dist/basemap/country-labels.geojson not built')
    return
  }
  const names = new Set(
    JSON.parse(readFileSync(path, 'utf8')).features.map((f) => f.properties?.name).filter(Boolean),
  )
  // Natural Earth ships the coloniser's name; `displayCountryName` is what
  // replaces it, and it is easy to bypass by reading `properties.name`
  // straight off the source data.
  for (const gone of ['Falkland Islands', 'Falkland Is.', 'New Caledonia', 'Greenland']) {
    assert.ok(!names.has(gone), `basemap still labels "${gone}"`)
  }
  for (const kept of ['Malvinas', 'Kanaky', 'Kalaallit Nunaat']) {
    assert.ok(names.has(kept), `basemap lost "${kept}"`)
  }
  // Two that are already right and must not be "tidied" back:
  // Palestine is the merged historic geometry, and Western Sahara is the UN's
  // term for a Non-Self-Governing Territory — not Morocco's "Southern Provinces".
  assert.ok(names.has('Palestine'), 'basemap lost Palestine')
  assert.ok(names.has('Western Sahara'), 'basemap lost Western Sahara')
})

test('a chokepoint delta reads against its baseline in the right direction', () => {
  // `delta7vs90` is a SIGNED FRACTIONAL CHANGE — `last7 / baseline - 1` — not
  // a ratio. This test used to assert the ratio reading, which is how the
  // label shipped inverted: Panama running 9.1 container ships/day against a
  // baseline of 8 (delta 0.141, i.e. +14%) printed as "86% below baseline",
  // and a strait down 17% printed as an impossible "-117%". The companion
  // test below reads the convention off the built payload so it cannot drift.
  assert.equal(M.deltaLabel(0.141), '+14% vs 90-day baseline')
  assert.equal(M.deltaLabel(0.052), '+5% vs 90-day baseline')
  assert.equal(M.deltaLabel(-0.174), '-17% vs 90-day baseline')
  // Big moves are stated as multiples: +428% is 5.3× the baseline.
  assert.equal(M.deltaLabel(4.281), '5.3× the 90-day baseline')
  // Traffic at 40% of normal is a 60% fall.
  assert.equal(M.deltaLabel(-0.6), '60% below baseline')
  assert.equal(M.deltaLabel(0), 'level with the 90-day baseline')
  assert.equal(M.deltaLabel(Number.NaN), null)
})

test('the published chokepoint delta really is a signed fractional change', (t) => {
  // The units are not a matter of taste — read them off the payload the sheet
  // actually renders, so the label can never quietly invert again.
  const path = join(ROOT, 'dist/api/chokepoints.json')
  if (!existsSync(path)) {
    t.skip('dist/api/chokepoints.json not built')
    return
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const list = Array.isArray(raw) ? raw : (raw.chokepoints ?? Object.values(raw)[0])
  let checked = 0
  for (const cp of list) {
    const f = cp.primaryField
    const last7 = cp.last7Avg?.[f]
    const base = cp.baseline90Avg?.[f]
    const delta = cp.delta7vs90?.[f]
    if (![last7, base, delta].every(Number.isFinite) || !base) continue
    checked++
    assert.ok(
      Math.abs(delta - (last7 / base - 1)) < 0.02,
      `${cp.id}: delta ${delta} is not ${(last7 / base - 1).toFixed(3)} (last7 ${last7} / base ${base})`,
    )
  }
  assert.ok(checked > 5, `only ${checked} chokepoints carried a comparable delta`)
})

// --- the markets layer -----------------------------------------------------

test('an exchange is open on its own week, not on a Western one', () => {
  // The single fact this layer gets wrong most easily. Riyadh trades Sunday to
  // Thursday; London Monday to Friday. A rule written against one of them is
  // wrong about the other on two days in seven, and "is this market open" is
  // precisely what the filled/hollow mark is claiming.
  const riyadh = MARKET_BY_ID.tadawul
  const london = MARKET_BY_ID.lse
  const at = (iso) => Date.parse(iso)

  // Sunday, 14:00 in Riyadh and 12:00 in London.
  assert.equal(M.isTrading(riyadh, at('2026-07-19T11:00:00Z')), true, 'Riyadh trades on Sunday')
  assert.equal(M.isTrading(london, at('2026-07-19T11:00:00Z')), false, 'London does not')

  // Wednesday — both inside their sessions.
  assert.equal(M.isTrading(riyadh, at('2026-07-22T11:00:00Z')), true)
  assert.equal(M.isTrading(london, at('2026-07-22T11:00:00Z')), true)

  // Saturday — nobody.
  assert.equal(M.isTrading(riyadh, at('2026-07-25T11:00:00Z')), false)
  assert.equal(M.isTrading(london, at('2026-07-25T11:00:00Z')), false)

  // Riyadh's session ends at 15:00 local; 15:00 itself is already shut.
  assert.equal(M.isTrading(riyadh, at('2026-07-22T12:00:00Z')), false, '15:00 local is closed')
  assert.equal(M.isTrading(riyadh, at('2026-07-22T06:59:00Z')), false, '09:59 local is closed')
  assert.equal(M.isTrading(riyadh, at('2026-07-22T07:01:00Z')), true, '10:01 local is open')

  // A zone Intl cannot parse is a data problem, not a reason to throw inside a
  // paint expression that runs for every mark.
  assert.equal(
    M.isTrading({ ...riyadh, tz: 'Not/AZone' }, at('2026-07-22T11:00:00Z')),
    false,
  )
})

// --- the Hijri calendar ----------------------------------------------------

test('the Hijri date is Umm al-Qura, and not one of the three calendars beside it', () => {
  // `Intl` exposes four Islamic calendars and they disagree by up to two days
  // on the same instant. Picking the wrong one produces a date that is wrong
  // and completely plausible — there is no shape to the error, nothing renders
  // oddly, and no reader can catch it from the page. So the choice is pinned.
  //
  // 2026-07-26 is 12 Safar 1448 in Umm al-Qura; islamic-civil says 10 and
  // islamic-tbla says 11.
  const at = Date.parse('2026-07-26T12:00:00Z')
  assert.deepEqual(M.hijriDate(at), { day: 12, month: 2, year: 1448, monthName: 'Safar' })
  assert.equal(M.hijriLabel(at), '12 Safar 1448')

  // Month names come from our own table, not the engine's: ICU spells Safar
  // "Ṣafar" in some builds and emits the numeral in others, and the readout
  // should not change shape by browser.
  assert.equal(M.hijriDate(Date.parse('2026-02-18T12:00:00Z')).monthName, 'Ramadan')
  assert.equal(M.hijriDate(Date.parse('2026-03-20T12:00:00Z')).monthName, 'Shawwal')

  // A Hijri date is a local fact. The same instant is two different days on
  // either side of the date line, and the frame is the caller's to state.
  const evening = Date.parse('2026-07-26T20:00:00Z')
  assert.equal(M.hijriDate(evening, 'UTC').day, 12)
  assert.equal(M.hijriDate(evening, 'Asia/Jakarta').day, 13)
})

test('an exchange that shuts for Eid is not drawn as trading', () => {
  // The defect this replaces: five exchanges shut for the better part of a week
  // twice a year and the map drew every one of them as a live disc with the
  // previous week's number inside it.
  const at = (iso) => Date.parse(iso)
  const riyadh = MARKET_BY_ID.tadawul
  const london = MARKET_BY_ID.lse

  // 1 Shawwal 1447 — Eid al-Fitr — falls on Friday 2026-03-20, so reach for a
  // day Riyadh would otherwise be trading. Sunday 22 March is 3 Shawwal.
  const eidFitr = at('2026-03-22T11:00:00Z')
  assert.equal(M.eidWindow(eidFitr), 'Eid al-Fitr')
  assert.equal(M.isTrading(riyadh, eidFitr), false, 'Tadawul is shut for Eid al-Fitr')
  assert.equal(M.sessionLabel({ ...riyadh, asOf: '2026-03-18' }, eidFitr), 'closed · Eid al-Fitr')

  // 10 Dhu al-Hijja 1447 — Eid al-Adha — is 2026-05-27, a Wednesday.
  const eidAdha = at('2026-05-27T11:00:00Z')
  assert.equal(M.eidWindow(eidAdha), 'Eid al-Adha')
  assert.equal(M.isTrading(riyadh, eidAdha), false, 'Tadawul is shut for Eid al-Adha')

  // The flag is opt-in and nothing else observes it. London trades straight
  // through both, which is the whole reason `holidays` is an editorial field
  // on the catalog rather than something derived from the country code.
  // Monday 23 March is 4 Shawwal — still inside the window, and a day both
  // exchanges would otherwise be open, which is what makes the contrast mean
  // something. (The 22nd is a Sunday: London is shut for the ordinary reason.)
  const eidFitrWeekday = at('2026-03-23T11:00:00Z')
  assert.equal(M.eidWindow(eidFitrWeekday), 'Eid al-Fitr')
  assert.equal(M.isTrading(riyadh, eidFitrWeekday), false, 'Tadawul still shut on 4 Shawwal')
  assert.equal(M.isTrading(london, eidFitrWeekday), true, 'London trades through Eid')
  assert.equal(M.isTrading(london, eidAdha), true)

  // And the ordinary week is untouched: an exchange outside the window behaves
  // exactly as it did before the calendar existed.
  assert.equal(M.eidWindow(at('2026-07-22T11:00:00Z')), null)
  assert.equal(M.isTrading(riyadh, at('2026-07-22T11:00:00Z')), true)
})

test('Eid closure follows the editorial flag, not the trading week', () => {
  // The trap this guards. TASE runs Sunday–Thursday exactly as Tadawul does,
  // so any rule that infers Eid from the trading week — or from "Gulf-shaped
  // hours" — closes the Tel Aviv exchange for Eid al-Fitr. The flag is set by
  // hand for that reason, and this asserts the hand was steady.
  const observes = MARKET_TRACKED.filter((e) => e.holidays === 'islamic').map((e) => e.id)
  assert.deepEqual(observes.sort(), ['bist', 'bursa-malaysia', 'dfm', 'idx', 'tadawul'])

  const tase = MARKET_BY_ID.tase
  assert.deepEqual(tase.days, [0, 1, 2, 3, 4], 'TASE keeps a Sunday–Thursday week')
  assert.equal(tase.holidays, undefined, 'and is still not flagged for Eid')
  assert.equal(M.eidClosure(tase, Date.parse('2026-03-22T11:00:00Z')), null)

  // No other holiday is modelled anywhere, and the file says so. Christmas Day
  // must still read as trading, or the comment is lying.
  assert.equal(M.isTrading(MARKET_BY_ID.lse, Date.parse('2026-12-25T11:00:00Z')), true)
})

test('nisab is derived from the metal price the card already prints', () => {
  // Gold at $4,057.62/oz — the figure published on 2026-07-24 — puts the
  // threshold near $11,100–11,400. The range is the schools' conversions of
  // the classical weight, so it is a property of fiqh, not of the market, and
  // it must not collapse to a single number.
  const gold = M.nisab({ id: 'paxg', unit: '$/oz', level: 4057.62 })
  assert.equal(gold.metal, 'gold')
  assert.deepEqual(gold.grams, [85, 87.48])
  assert.ok(gold.value[0] > 11_000 && gold.value[0] < 11_200, `low was ${gold.value[0]}`)
  assert.ok(gold.value[1] > 11_300 && gold.value[1] < 11_500, `high was ${gold.value[1]}`)
  assert.ok(gold.value[1] > gold.value[0], 'the heavier weight is the larger threshold')

  // Silver's threshold is the lower one, which is why it is the consequential
  // figure — and it is the one this site cannot currently compute, because the
  // `xag` series is in the registry and absent from the published payload.
  // Pinned so that landing the series is what turns this on, not a code change.
  const silver = M.nisab({ id: 'xag', unit: '$/oz', level: 56.7 })
  assert.equal(silver.metal, 'silver')
  assert.ok(silver.value[0] < gold.value[0], 'silver nisab sits below gold')

  // Everything else on the ribbon is not a weight of metal and gets no line.
  assert.equal(M.nisab({ id: 'fx-try', unit: 'TRY / USD', level: 47.3 }), null)
  assert.equal(M.nisab({ id: 'btc', unit: '$', level: 90_000 }), null)
  // A metal quoted in something other than $/oz would silently produce a
  // threshold in the wrong unit, which is worse than producing none.
  assert.equal(M.nisab({ id: 'paxg', unit: '$/g', level: 130 }), null)
  assert.equal(M.nisab({ id: 'paxg', unit: '$/oz', level: 0 }), null)
})

test('the wrong-instrument guard rejects a healthy series from the wrong exchange', () => {
  // Yahoo answers an unknown symbol with a *different* instrument rather than a
  // 404. The three impostors found while building this catalog (`^PSI` → a
  // PIMCO fund, `^NGX` → Nasdaq Next Generation 100, `^MSI` → a USD figure that
  // is not Muscat) all carry too little history to pass the ≥5-closes rule in
  // stocks.js — so this guard exists for the case that rule cannot see, and
  // that is the case tested here: a full, healthy series that is simply not the
  // instrument we asked for.
  const nyse = MARKET_BY_ID.nyse
  assert.equal(instrumentMismatch(nyse, { currencyReported: 'USD', timezone: 'America/New_York' }), null)
  assert.match(
    instrumentMismatch(nyse, { currencyReported: 'JPY', timezone: 'Asia/Tokyo' }),
    /currency JPY/,
    'the Nikkei must not be publishable as the S&P',
  )
  assert.match(
    instrumentMismatch(nyse, { currencyReported: 'USD', timezone: 'Europe/London' }),
    /timezone Europe\/London/,
    'a right-currency, wrong-venue instrument must still be caught',
  )
  // Yahoo reports no currency at all for ^MERV. Silence is not a contradiction,
  // and treating it as one would drop a good series.
  assert.equal(
    instrumentMismatch(MARKET_BY_ID.byma, {
      currencyReported: '',
      timezone: 'America/Argentina/Buenos_Aires',
    }),
    null,
  )
})

test('exchanges that cannot be sourced are recorded rather than deleted', () => {
  // The exchanges with no free daily series are concentrated in the Gulf, South
  // Asia and North Africa — exactly the part of the world this layer exists to
  // cover. Keeping the rows, each with a reason, is what stops a gap in the
  // data commons from quietly becoming a gap in our stated coverage.
  const absent = MARKET_CATALOG.filter((m) => !m.available)
  assert.ok(absent.length >= 10, `only ${absent.length} unavailable exchanges recorded`)
  for (const m of absent) {
    assert.ok(m.reason && m.reason.length > 20, `${m.id} is not drawn but says nothing about why`)
    assert.ok(m.iso2 && /^[A-Z]{2}$/.test(m.iso2), `${m.id} has no country`)
    assert.ok(Number.isFinite(m.lat) && Number.isFinite(m.lng), `${m.id} has no location`)
  }
  // The catalog must not lose the markets this feature is for.
  for (const id of ['qse', 'adx', 'psx', 'dse', 'egx', 'casablanca']) {
    assert.ok(MARKET_BY_ID[id], `${id} dropped out of the catalog`)
  }
  const ids = MARKET_CATALOG.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate exchange id in the catalog')
})

test('every tracked exchange pins the expectations the fetcher asserts on', () => {
  for (const m of MARKET_TRACKED) {
    assert.ok(m.symbol, `${m.id} is tracked with no symbol`)
    assert.ok(m.currency, `${m.id} has no expected currency to check against`)
    assert.ok(m.tz, `${m.id} has no expected timezone to check against`)
    assert.doesNotThrow(
      () => new Intl.DateTimeFormat('en-US', { timeZone: m.tz }),
      `${m.id}: ${m.tz} is not a zone Intl can resolve`,
    )
    assert.ok(/^\d{1,2}:\d{2}$/.test(m.sessionStart), `${m.id} has no session start`)
    assert.ok(/^\d{1,2}:\d{2}$/.test(m.sessionEnd), `${m.id} has no session end`)
    assert.ok(m.days.length > 0 && m.days.every((d) => d >= 0 && d <= 6), `${m.id} has no week`)
    assert.ok(Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180, `${m.id} is off the earth`)
  }
  // The point of the exercise: the map must not be a Western markets map.
  const ummah = ['tadawul', 'bist', 'dfm', 'bursa-malaysia', 'idx']
  for (const id of ummah) {
    assert.ok(
      MARKET_TRACKED.some((m) => m.id === id),
      `${id} is no longer drawn — the layer's whole premise is that it is`,
    )
  }
})

test('the published market change really is a signed percent move', (t) => {
  // Same discipline as the chokepoint delta above: read the units off the
  // payload the sheet renders, so a percent can never quietly become a ratio.
  const path = join(ROOT, 'dist/api/markets.json')
  if (!existsSync(path)) {
    t.skip('dist/api/markets.json not built')
    return
  }
  const { exchanges } = JSON.parse(readFileSync(path, 'utf8'))
  assert.ok(exchanges.length > 20, `only ${exchanges.length} exchanges published`)

  const seen = new Set()
  for (const e of exchanges) {
    assert.ok(!seen.has(e.id), `${e.id} published twice`)
    seen.add(e.id)

    const v = e.series?.values ?? []
    assert.ok(v.length >= 2, `${e.id}: ${v.length} closes, cannot carry a change`)
    const expected = ((v[v.length - 1] - v[v.length - 2]) / v[v.length - 2]) * 100
    assert.ok(
      Math.abs(e.changePct - expected) < 0.01,
      `${e.id}: changePct ${e.changePct} is not ${expected.toFixed(3)}`,
    )
    // The level shown must be the close the change was computed from — not the
    // live price, which would leave the two disagreeing on the card.
    assert.equal(e.level, v[v.length - 1], `${e.id}: level is not the last close`)
    assert.equal(e.series.periods.length, v.length, `${e.id}: periods and values differ in length`)
    assert.ok(Math.abs(e.lat) <= 90 && Math.abs(e.lng) <= 180, `${e.id} is off the earth`)
    assert.ok(e.currency && e.tz && e.indexName, `${e.id} is missing its identifying fields`)

    // An exchange the catalog says we cannot source must never appear here.
    assert.ok(MARKET_BY_ID[e.id]?.available, `${e.id} is published but marked unavailable`)
  }

  // Yafa, not Tel Aviv — the payload is the display layer for this field.
  const tase = exchanges.find((e) => e.id === 'tase')
  if (tase) assert.equal(tase.city, 'Yafa', 'the TASE marker must print Yafa')
})

test('the exchange size channel actually varies', (t) => {
  // The GDACS lesson: a layer whose marks all draw identically is a layer that
  // has silently stopped saying anything, and it looks fine. `mag` saturates at
  // a 3% move, so this also fails if the divisor is ever set so wide that a
  // normal day flattens every mark to the floor.
  const path = join(ROOT, 'dist/api/markets.json')
  if (!existsSync(path)) {
    t.skip('dist/api/markets.json not built')
    return
  }
  const { exchanges } = JSON.parse(readFileSync(path, 'utf8'))
  const mags = exchanges.map((e) => Math.min(1, Math.abs(e.changePct) / 3))
  assert.ok(
    new Set(mags.map((m) => m.toFixed(3))).size > 5,
    `only ${new Set(mags.map((m) => m.toFixed(3))).size} distinct sizes across ${exchanges.length} exchanges`,
  )
  assert.ok(
    mags.filter((m) => m >= 1).length / mags.length < 0.5,
    'more than half the exchanges are saturated — the 3% divisor is too tight',
  )
})

test('exposure figures abbreviate above ten thousand and stay exact below', () => {
  assert.equal(M.population(124), '124')
  assert.equal(M.population(9_319), '9,319')
  assert.equal(M.population(25_712), '26K')
  assert.equal(M.population(888_676), '889K')
  assert.equal(M.population(9_319_328), '9.3M')
  assert.equal(M.population(0), '')
})

// ---------------------------------------------------------------------------
// The genocide record
//
// This is the only overlay with no machine behind it: no feed validates it, no
// upstream schema rejects a malformed entry, and a mistake here is not a broken
// pixel but the map attributing a finding to a body that did not make it. The
// checks below are the substitute for the validation the other layers get for
// free — that every marked situation is citable, locatable and dated, and that
// the bar between "determined" and "warned about" holds.
// ---------------------------------------------------------------------------

test('every marked genocide situation carries the citation that justifies it', () => {
  assert.ok(M.GENOCIDE_MARKED.length > 0, 'expected at least one marked situation')

  for (const s of M.GENOCIDE_MARKED) {
    assert.equal(s.finding, 'determination', `${s.id} reached the map without a determination`)

    // A mark whose provenance is "the UN" is a mark a reader cannot check. The
    // body has to be a named organ, the document has to be a document, and the
    // link has to go to the body that made the finding.
    assert.ok(s.body && s.body.length > 12, `${s.id}: no naming body`)
    assert.ok(s.document && s.document.length > 8, `${s.id}: no document cited`)
    assert.ok(/^https:\/\//.test(s.url), `${s.id}: finding must link somewhere readable`)
    assert.ok(s.summary && s.summary.length > 60, `${s.id}: summary too thin to stand alone`)

    assert.ok(s.lat >= -90 && s.lat <= 90, `${s.id}: lat out of range`)
    assert.ok(s.lng >= -180 && s.lng <= 180, `${s.id}: lng out of range`)
    assert.ok(s.name, `${s.id}: the mark's label is what says what it is`)

    // Both dates are real and in order: a finding cannot predate the situation
    // it is a finding about.
    const found = Date.parse(s.date)
    const since = Date.parse(`${s.since}-01`)
    assert.ok(Number.isFinite(found), `${s.id}: unparseable finding date ${s.date}`)
    assert.ok(Number.isFinite(since), `${s.id}: unparseable start ${s.since}`)
    assert.ok(found >= since, `${s.id}: finding dated before the situation began`)

    // The link label and the page it opens have to agree — the Gaza mark opens
    // Palestine's profile, and labelling it "Gaza in profile" would have the
    // map misnaming its own country page.
    if (s.iso2) {
      assert.match(s.iso2, /^[A-Z]{2}$/, `${s.id}: iso2 must be a two-letter code`)
      assert.ok(s.profile, `${s.id}: a country link needs the country's name`)
    }
  }
})

test('warnings are recorded but never drawn as findings', () => {
  const risks = M.GENOCIDE_SITUATIONS.filter((s) => s.finding === 'risk')
  const markedIds = new Set(M.GENOCIDE_MARKED.map((s) => s.id))
  for (const s of risks) {
    assert.ok(!markedIds.has(s.id), `${s.id} is a warning and must not reach the map`)
    // Still fully cited, so promoting one is a one-word edit and not research
    // done a second time under pressure.
    assert.ok(s.body && s.document && /^https:\/\//.test(s.url), `${s.id}: warning uncited`)
  }
  assert.equal(
    M.GENOCIDE_MARKED.length + risks.length,
    M.GENOCIDE_SITUATIONS.length,
    'every situation is either a determination or a warning',
  )
})

test('the published genocide payload is exactly what cleared the bar', (t) => {
  const path = join(ROOT, 'dist/api/genocide.json')
  if (!existsSync(path)) {
    t.skip('dist/api/genocide.json not built')
    return
  }
  const { situations } = JSON.parse(readFileSync(path, 'utf8'))
  assert.deepEqual(
    situations.map((s) => s.id).sort(),
    M.GENOCIDE_MARKED.map((s) => s.id).sort(),
    'the endpoint and the record disagree about what is marked',
  )
  for (const s of situations) {
    assert.equal(s.finding, 'determination', `${s.id} was published without a determination`)
  }
})

test('the genocide mark owns its colour outright', () => {
  // Prominence here is not a size — it is the only unmuted tone on the map. If
  // another overlay ever takes the same colour, the mark stops being the one
  // thing that reads differently and the layer quietly loses its point.
  const others = Object.entries(M.OVERLAY_COLOUR)
    .filter(([k]) => k !== 'genocide' && k !== 'genocideCore')
    .map(([, v]) => v.toLowerCase())
  assert.ok(
    !others.includes(M.OVERLAY_COLOUR.genocide.toLowerCase()),
    'the genocide tone is shared with another overlay',
  )

  const hsl = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    if (!d) return { h: 0, s: 0, l }
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
    return { h, s, l }
  }

  const mark = hsl(M.OVERLAY_COLOUR.genocide)

  // It shares conflict's hue on purpose — same subject, far end of it — so the
  // separation has to come from saturation. Muted next to muted is two marks
  // the reader has to compare rather than one that arrives first.
  assert.ok(mark.h < 20 || mark.h > 340, `genocide mark is not red (hue ${Math.round(mark.h)})`)
  for (const c of others) {
    assert.ok(
      mark.s > hsl(c).s + 0.2,
      `${c} is within 20 points of the genocide mark's saturation`,
    )
  }

  // And it still has to survive the ground it is drawn on, which is #080a0d.
  assert.ok(mark.l > 0.42, `genocide mark too dark for the map's ground (l ${mark.l.toFixed(2)})`)
})

// ---------------------------------------------------------------------------
// The join between Natural Earth's names and our ISO codes
// ---------------------------------------------------------------------------

/**
 * Every country on the map has to be reachable.
 *
 * `CC_TO_TOPOJSON_NAME` is a *join key* onto Natural Earth's `properties.name`,
 * and the basemap build turns it into each feature's `iso2`. A feature whose
 * name is not in the table gets no `iso2` at all, and everything keyed on that
 * id silently stops working for it: the metric tint can never shade it, and
 * clicking it cannot open its profile. The country is drawn, labelled, and
 * inert — nothing throws, nothing logs.
 *
 * Two shipped that way. `MK` was keyed `'North Macedonia'` — the country's
 * current name, which is right for a label and wrong for this table, because
 * the 1:110m file still says `Macedonia`. `VU` was missing outright. Both were
 * invisible failures for as long as they existed.
 *
 * The exceptions are enumerated rather than tolerated: each is a feature with
 * no ISO-3166-1 code of its own, so it has nothing to join to. If a real
 * country ever lands in this list, that is the bug this test exists to catch.
 */
test('every ISO-coded country on the basemap resolves to its code', async () => {
  // Checked against the 1:110m name set even though the basemap now ships
  // 1:50m. That set is exactly the ~176 sovereign states this site holds data
  // for; 50m adds another 64 features that are almost all dependencies and
  // specks we knowingly have no figures for, and enumerating those as
  // exceptions would bury the signal. A code missing from *this* list is a
  // country the map cannot shade or open — which is the bug being pinned.
  const topo = JSON.parse(
    readFileSync(join(ROOT, 'shared/data/countries-110m.json'), 'utf8'),
  )
  const names = topo.objects.countries.geometries
    .map((g) => g.properties?.name)
    .filter(Boolean)

  const isoEntry = join(dir, 'iso-entry.ts')
  writeFileSync(isoEntry, `export * from '${join(ROOT, 'shared/countries/iso.ts')}'\n`)
  const isoBundle = join(dir, 'iso.mjs')
  await build({
    entryPoints: [isoEntry],
    outfile: isoBundle,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  })
  const { codeFromTopojsonName } = await import(isoBundle)

  // Not countries with codes of their own: two are Antarctic, one is a
  // dependency the map names Malvinas, and two are unrecognised states.
  const NO_CODE = new Set([
    'Antarctica',
    'Fr. S. Antarctic Lands',
    'Falkland Is.',
    'N. Cyprus',
    'Somaliland',
  ])

  const unreachable = names.filter((n) => !NO_CODE.has(n) && !codeFromTopojsonName(n))
  assert.deepEqual(
    unreachable,
    [],
    `these countries are drawn but carry no iso2, so nothing can shade or open them: ${unreachable.join(', ')}`,
  )

  // The reverse direction — table entries pointing at names the basemap does
  // not carry — is deliberately *not* asserted. It looks like the same check
  // wearing the other shoe and is not: `AD`/`BH` are microstates the 1:110m
  // tier drops but the finer tiers keep, and `IL` no longer names a feature at
  // all because `basemap.js` merges it into Palestine. All three are correct.
  // A test that fires on correct behaviour is a test people learn to delete.
})
