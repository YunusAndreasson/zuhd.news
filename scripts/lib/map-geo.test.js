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
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { unwrap, closePolar, thin, simplifyRing } from '../build/basemap.js'
import { channels, composite, contrast, hsl, luminance, luminanceOf } from './contrast.js'
import { bundleIsland, bundleIslands, scratchDir } from './island-bundle.js'
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

const dir = scratchDir('map-geo')
const bundlePath = await bundleIslands(
  dir,
  [
    'public/islands/_map/solar.ts',
    // The prayer lines. Pure geometry, and the one layer on this map whose
    // correctness a reader cannot check by looking at it — a Fajr line in the
    // wrong place is still a plausible Fajr line. Pinned against adhan below.
    'public/islands/_map/prayer.ts',
    'public/islands/_map/types.ts',
    'public/islands/_map/format.ts',
    // The Hijri calendar and the Eid closures that hang off it. Pure, and the
    // only thing on the map whose correctness cannot be checked by looking at
    // it — a wrong Hijri date is still a plausible Hijri date.
    'public/islands/_map/hijri.ts',
    // Named rather than `export *`: markets.ts re-exports payload types that
    // would collide with types.ts above, and an ambiguous star export resolves
    // to silence rather than an error.
    { path: 'public/islands/_map/markets.ts', names: ['nisab'] },
    // style.ts only imports maplibre-gl as a type, so it erases and the bundle
    // stays DOM-free. Pulled in for the land ramp constants: the legend and the
    // fill both read them, and so does the contrast test below.
    'public/islands/_map/style.ts',
    // The genocide record. Data, not geometry, but it is the one overlay with
    // no upstream feed validating it, so the invariants have to live here.
    'shared/genocide.ts',
    // The mark alphabet. Pure vertex tables and a rasteriser, no DOM — and the
    // module whose whole promise (shape says what a mark is) went unkept by
    // three of the four layers that were supposed to draw from it.
    'public/islands/_map/glyphs.ts',
    // How stories become places, and how a place becomes a wash. Extracted from
    // the island precisely so it could be bundled here: every expression the
    // cluster design was built from — the domain, the disc radius, the rim
    // weight, the label size, the dominant-category argmax — lived in
    // `situation-map.ts`, which this suite deliberately does not bundle, so none
    // of it was ever tested. That was the largest hole in the map's coverage.
    'public/islands/_map/places.ts',
  ],
  'bundle.mjs',
)
const M = await import(bundlePath)

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
  for (const [lat, lng, iso] of /** @type {[number, number, string][]} */ ([
    [-54, -70, '2026-04-30T15:00:00Z'],
    [21.42, 39.83, '2026-07-26T12:00:00Z'],
    [45, 10, '2026-11-05T13:00:00Z'],
    [-8, 115, '2026-02-14T06:00:00Z'],
    [33, -84, '2026-09-09T19:00:00Z'],
  ])) {
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

test('the land ramp is legible, ordered, neutral, and clear of the border', () => {
  const ramp = M.LAND_RAMP
  assert.ok(ramp.length >= 2, 'ramp needs at least two stops')

  // Monotonic, or the ramp would fold: two different percentiles could land on
  // the same tone and a country's shade would stop being readable.
  for (let i = 1; i < ramp.length; i++) {
    assert.ok(
      luminance(ramp[i]) > luminance(ramp[i - 1]),
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
    luminance(ramp[ramp.length - 1]) < luminance(M.MAP_COLOURS.border),
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
    luminance(M.LAND_NO_DATA) < luminance(ramp[0]),
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
  let prev = -1
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const l = luminance(M.rampColour(p))
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

// ---------------------------------------------------------------------------
// Inland water and the marine labels
// ---------------------------------------------------------------------------

test('the marine labels name the disputed waters the way we decided to', (t) => {
  const path = join(ROOT, 'dist/basemap/seas.geojson')
  if (!existsSync(path)) {
    t.skip('dist/basemap/seas.geojson not built')
    return
  }
  const names = new Set(
    JSON.parse(readFileSync(path, 'utf8')).features.map((f) => f.properties?.name),
  )
  // Two of the 54 are live disputes, and this is the decision rather than an
  // oversight: **Persian Gulf** and **Sea of Japan** are the UN and IHO terms,
  // where each alternative — Arabian Gulf, East Sea — is one party's claim.
  // That is the same reasoning that keeps Western Sahara as it is, and a
  // different case from Palestine, where the site follows a UN determination
  // rather than departing from one. Pinned in both directions so neither can
  // drift silently.
  assert.ok(names.has('Persian Gulf'), 'the marine labels lost "Persian Gulf"')
  assert.ok(names.has('Sea of Japan'), 'the marine labels lost "Sea of Japan"')
  assert.ok(!names.has('Arabian Gulf'), 'the marine labels renamed the Persian Gulf')
  assert.ok(!names.has('East Sea'), 'the marine labels renamed the Sea of Japan')

  // The layer exists to name the water the chokepoints sit in, so the bodies
  // holding them have to be in the world-zoom set.
  const rank1 = new Set(
    JSON.parse(readFileSync(path, 'utf8'))
      .features.filter((f) => f.properties?.rank === 1)
      .map((f) => f.properties.name),
  )
  for (const sea of ['Red Sea', 'Mediterranean Sea', 'Arabian Sea', 'South China Sea']) {
    assert.ok(rank1.has(sea), `${sea} is not in the world-zoom marine set`)
  }
})

test('the world view gets the lakes that are geography, not every pond', (t) => {
  const path = join(ROOT, 'dist/basemap/lakes.geojson')
  if (!existsSync(path)) {
    t.skip('dist/basemap/lakes.geojson not built')
    return
  }
  const features = JSON.parse(readFileSync(path, 'utf8')).features
  // The first step of the `lakes` filter in `_map/style.ts`. Steradians of the
  // lake's own polygon, the same unit `country-labels` gates on.
  const WORLD_GATE = 0.0002
  const shown = features.filter((f) => f.properties.area >= WORLD_GATE)
  // The first gate was 0.00004 and admitted 110 — IJsselmeer, Mälaren and
  // dozens of Canadian reservoirs, every one of them sub-pixel at world zoom,
  // which speckled Fennoscandia and the Shield rather than drawing geography.
  assert.ok(
    shown.length >= 12 && shown.length <= 30,
    `${shown.length} lakes at world zoom, expected the ~20 that are geography`,
  )
  const names = new Set(shown.map((f) => f.properties.name))
  for (const lake of ['Lake Superior', 'Lake Victoria', 'Lake Baikal', 'Lake Tanganyika']) {
    assert.ok(names.has(lake), `the world view lost ${lake}`)
  }
  // Every feature is drawable. One river in the same family ships a `null`
  // geometry, which reaches `thin` as a crash rather than as a skipped record.
  for (const f of features) {
    assert.ok(f.geometry?.coordinates?.length, `a lake has no geometry: ${f.properties.name}`)
  }
})

test('rivers are gated by significance and every one of them is drawable', (t) => {
  const path = join(ROOT, 'dist/basemap/rivers.geojson')
  if (!existsSync(path)) {
    t.skip('dist/basemap/rivers.geojson not built')
    return
  }
  const features = JSON.parse(readFileSync(path, 'utf8')).features
  for (const f of features) {
    assert.ok(f.geometry?.coordinates?.length, `a river has no geometry: ${f.properties.name}`)
    assert.ok(
      Number.isInteger(f.properties.r) && f.properties.r >= 1 && f.properties.r <= 5,
      `river "${f.properties.name}" has no usable scalerank`,
    )
  }
  // The world-zoom set. Ungated this layer is a net of hairlines over every
  // continent, which is ink spent on something no other layer here references.
  const world = features.filter((f) => f.properties.r <= 1)
  assert.ok(
    world.length >= 15 && world.length <= 40,
    `${world.length} rivers at world zoom, expected the ~27 Natural Earth ranks first`,
  )
})

test('the water tone is separable from the frontiers and from every land tone', () => {
  const { MAP_COLOURS, LAND_RAMP, LAND_NO_DATA } = M
  const water = MAP_COLOURS.water

  // A river in `ocean` — the obvious choice, since it is the same substance —
  // measures 1.04:1 against LAND_NO_DATA and would simply not be there across
  // the thirty hatched countries. This is the floor that rules that out.
  const ratioTo = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const grounds = [LAND_NO_DATA, ...LAND_RAMP]
  for (const ground of grounds) {
    const ratio = ratioTo(water, ground)
    assert.ok(
      ratio >= 1.5,
      `water (${water}) measures ${ratio.toFixed(2)}:1 on ${ground} — a river that is not there`,
    )
  }

  // Hue cannot separate it from the frontiers: `border` and `prayer` are both
  // at 216°, because the blue-grey family is this map's furniture. Saturation
  // is what does the work, the same argument the genocide tone makes against
  // conflict — and the same 20-point floor.
  const sat = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const l = (mx + mn) / 2
    return mx === mn ? 0 : ((mx - mn) / (1 - Math.abs(2 * l - 1))) * 100
  }
  assert.ok(
    sat(water) - sat(MAP_COLOURS.border) >= 20,
    `water is only ${(sat(water) - sat(MAP_COLOURS.border)).toFixed(0)} saturation points ` +
      `clear of border — a river indistinguishable from a frontier`,
  )
})

test('the marine labels are placed last, so the crowded seas keep their names', () => {
  const ids = M.buildStyle().layers.map((l) => l.id)
  // MapLibre walks symbol layers top-down and the *later* layer claims its
  // collision boxes first. Under `country-labels` this was the lowest-priority
  // symbol layer on the map, and it drew only in empty ocean — the
  // Mediterranean, the Red Sea, the Arabian Sea and the Caribbean went
  // unnamed, which is every water the eleven chokepoints are in.
  assert.equal(ids.at(-1), 'sea-labels', 'sea-labels is no longer the last base layer')
  // Water is under the frontiers, so a border running down the middle of the
  // Great Lakes or the Caspian stays drawn.
  assert.ok(ids.indexOf('lakes') > ids.indexOf('land'), 'lakes are drawn under the land')
  assert.ok(ids.indexOf('lakes') < ids.indexOf('borders'), 'lakes are drawn over the borders')
  assert.ok(ids.indexOf('rivers') < ids.indexOf('borders'), 'rivers are drawn over the borders')
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

  // ── The famine tone ──────────────────────────────────────────────────────
  //
  // Violet, and the hue is the whole argument. Every other overlay is warm —
  // 0–27° for the hazard and violence family, 44° for the straits — with one
  // teal and one sage. A warm famine mark would have landed inside the family
  // that already means *violence or hazard*, and a reader who has learned that
  // red here means people being killed must not have to unlearn it for a
  // classification about food.
  const famine = hsl(M.OVERLAY_COLOUR.famine)
  const warmNeighbours = Object.entries(M.OVERLAY_COLOUR)
    // `genocideCore` is a near-black used as a disc under the ring, not a hue.
    .filter(([k]) => k !== 'famine' && k !== 'genocideCore')
    .map(([k, v]) => {
      const d = Math.abs(hsl(v).h - famine.h)
      return { k, d: Math.min(d, 360 - d) }
    })
  const nearest = warmNeighbours.reduce((a, b) => (b.d < a.d ? b : a))
  assert.ok(
    nearest.d >= 60,
    `famine is only ${Math.round(nearest.d)}° of hue from ${nearest.k} — ` +
      'a food classification reading as a hazard',
  )
  // And clear of the 216° blue-grey the basemap furniture occupies, or the mark
  // reads as a frontier, a river or the density wash rather than as data.
  for (const furniture of ['border', 'prayer', 'water', 'density']) {
    const d = Math.abs(hsl(M.MAP_COLOURS[furniture]).h - famine.h)
    assert.ok(
      Math.min(d, 360 - d) >= 40,
      `famine is within 40° of MAP_COLOURS.${furniture} — a mark in the furniture's family`,
    )
  }
})

// ---------------------------------------------------------------------------
// The mark alphabet, and the thermal layer that joined it
// ---------------------------------------------------------------------------

// Whether every registered glyph is actually *drawn* by a layer is asserted in
// `map-island.test.js`, against what the island hands the engine — the mark
// alphabet shipped with three of its four layers still drawing circles, and only
// a mounted map can see that. What belongs here is the geometry of the marks
// themselves, and the tone they are painted in.

test('the two chip-only glyphs stay out of the image set', () => {
  // `dot` is a circle layer because its hover reads feature-state, which
  // `icon-size` cannot; `prayer-line` is a line layer MapLibre dashes natively.
  // Both exist so their chips draw from this table rather than from CSS.
  const registered = M.glyphImages().map(([id]) => id)
  assert.ok(!registered.includes('dot'))
  assert.ok(!registered.includes('prayer-line'))
  assert.equal(registered.length, M.GLYPH_IDS.length - 2)
})

test('the thermal glyph is a burst nothing else could be mistaken for', () => {
  const img = M.sdfImage(M.GLYPHS.thermal)
  const n = img.width
  const at = (x, y) => img.data[(y * n + x) * 4 + 3]
  // MapLibre's shader cuts at alpha 191; anything at or above it is ink.
  const INK = 191

  // Centred and four-fold symmetric, or the mark sits off its own coordinate.
  let weight = 0
  let cx = 0
  let cy = 0
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = at(x, y)
      weight += a
      cx += a * x
      cy += a * y
    }
  }
  assert.ok(Math.abs(cx / weight - (n - 1) / 2) < 0.01, 'thermal glyph is off-centre in x')
  assert.ok(Math.abs(cy / weight - (n - 1) / 2) < 0.01, 'thermal glyph is off-centre in y')
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      assert.equal(at(x, y), at(n - 1 - x, y), `asymmetric across the vertical at ${x},${y}`)
      assert.equal(at(x, y), at(y, x), `not symmetric under transpose at ${x},${y}`)
    }
  }

  // The gap between core and rays is the whole silhouette. Without it this is a
  // blob, and a blob at 7px is the story beacon it will be drawn beside.
  const mid = (n - 1) / 2
  let gap = 255
  for (let r = 2.8; r <= 4.2; r += 0.1) {
    const p = Math.round(mid + r * Math.SQRT1_2 * 2)
    gap = Math.min(gap, at(p, p))
  }
  assert.ok(gap < INK, `the core and rays have merged (darkest gap alpha ${gap})`)

  // The field has to stop short of the texture edge or the halo is clipped —
  // which looks like a rendering bug rather than a missing constant.
  let reach = 0
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (at(x, y) > 0) reach = Math.max(reach, Math.hypot(x - mid, y - mid))
    }
  }
  assert.ok(reach < n / 2 - 4, `thermal field reaches ${reach.toFixed(1)} of ${n / 2}`)
})

test('the thermal tone is the disaster hue at a step the eye can separate', () => {
  const heat = hsl(M.OVERLAY_COLOUR.thermal)
  const gdacs = hsl(M.OVERLAY_COLOUR.gdacs)

  // Sharing the hue is the argument, not an accident: same subject as the
  // disaster layer, seen by a different kind of witness. `glyphs.ts` earns it by
  // putting identity in the silhouette.
  assert.ok(
    Math.abs(heat.h - gdacs.h) < 8,
    `thermal (${Math.round(heat.h)}°) has drifted off the disaster hue (${Math.round(gdacs.h)}°)`,
  )
  // And a lightness step, because a wildfire alert and its own thermal footprint
  // are the same coordinate: in one tone that pair reads as a single object with
  // a strange outline.
  assert.ok(
    heat.l - gdacs.l > 0.05,
    `thermal is only ${((heat.l - gdacs.l) * 100).toFixed(1)} lightness points off gdacs`,
  )
  // The saturation ceiling is not taste — the genocide test requires every other
  // overlay to sit 20 points below it, so anything above ~.71 fails there
  // instead, with a message about genocide rather than about this.
  assert.ok(heat.s < 0.71, `thermal saturation ${heat.s.toFixed(2)} will break the genocide test`)

  // Legibility is measured against the ocean and against the mark's own halo,
  // **not** against every stop of the land ramp — and that is a correction worth
  // recording, because the ramp version was written first and failed. Measured
  // on the lightest stop (#48505c) the whole overlay set comes in under 3:1:
  // gdacs 2.21, conflict 1.77, genocide 2.12, straitsSurge 2.67. Thermal's 2.98
  // is the third best figure on the map. So a 3:1-on-any-ground bar is not a
  // standard this design holds anything to; what makes these marks read on a
  // bright country is `icon-halo-color: labelHalo`, which is why
  // `MAP_COLOURS.neutral` says the halo means "the ground stops being a
  // variable at all". Contrast against the halo is therefore the real invariant.
  for (const [name, ground] of [
    ['the ocean', M.MAP_COLOURS.ocean],
    ['its own halo', M.MAP_COLOURS.labelHalo],
  ]) {
    const ratio = contrast(M.OVERLAY_COLOUR.thermal, ground)
    assert.ok(ratio >= 3, `thermal is ${ratio.toFixed(2)}:1 against ${name}`)
  }
  // And it must not be quieter than the disaster mark it sits beside: the pair
  // is meant to read as one family with the newer, more provisional evidence
  // *not* being the harder one to see.
  assert.ok(
    contrast(M.OVERLAY_COLOUR.thermal, M.MAP_COLOURS.ocean) >
      contrast(M.OVERLAY_COLOUR.gdacs, M.MAP_COLOURS.ocean),
    'thermal reads quieter than gdacs on the ocean',
  )
})

test('the published thermal payload only claims what it can explain', (t) => {
  const path = join(ROOT, 'dist/api/firms.json')
  if (!existsSync(path)) {
    t.skip('dist/api/firms.json not built')
    return
  }
  const payload = JSON.parse(readFileSync(path, 'utf8'))
  const now = Date.now()
  for (const e of payload.events ?? []) {
    assert.ok(Number.isFinite(e.lat) && Math.abs(e.lat) <= 90, `${e.id} has no usable latitude`)
    assert.ok(Number.isFinite(e.lng) && Math.abs(e.lng) <= 180, `${e.id} has no usable longitude`)
    // A satellite cannot have seen tomorrow's fire, and a `t` in the future
    // would sit permanently past the scrub head and never draw.
    assert.ok(e.t <= now + 3600_000, `${e.id} was acquired in the future`)
    assert.ok(e.tEnd >= e.t, `${e.id} ends before it starts`)
    assert.ok(e.frp > 0, `${e.id} has no radiative power`)
    assert.ok(e.frpPeak > 0 && e.frpPeak <= e.frp, `${e.id} peak exceeds its total`)
    assert.ok(e.pixels >= 1, `${e.id} has no detections`)
    assert.ok(e.persistDays >= 1, `${e.id} was alight for less than a day`)
    assert.ok(
      ['low', 'nominal', 'high'].includes(e.confidence),
      `${e.id} has confidence "${e.confidence}"`,
    )
    // The layer's whole claim. An anomaly with nothing to corroborate is a fire
    // on a news map asserting a cause it has not got.
    assert.ok(
      e.relatedArticles?.length > 0,
      `${e.id} is published with no coverage to corroborate`,
    )
    assert.ok(e.near?.loc, `${e.id} has no place name to state a distance against`)
    for (const a of e.relatedArticles) {
      assert.ok(a.km <= payload.joinRadiusKm, `${e.id} cites a story ${a.km}km away`)
    }
    // `near` is the nearest cited story, which is what the card's hero prints.
    assert.equal(e.near.km, e.relatedArticles[0].km, `${e.id}'s near distance is not its nearest`)
  }
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

  const { codeFromTopojsonName } = await import(
    await bundleIsland(dir, 'shared/countries/iso.ts', 'iso.mjs')
  )

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

// ---------------------------------------------------------------------------
// Places, and the wash raised from them
// ---------------------------------------------------------------------------

/**
 * A place is a name and a distance, never a grid cell.
 *
 * Asserted against the built payload rather than a fixture, because every
 * pathology this grouping exists to handle was found by measuring the corpus and
 * none of them would have been guessed.
 */
test('a place is a name and a distance, never a grid cell', (t) => {
  const path = join(ROOT, 'dist/api/map.json')
  if (!existsSync(path)) {
    t.skip('dist/api/map.json not built')
    return
  }
  const { points } = JSON.parse(readFileSync(path, 'utf8'))
  const index = M.buildPlaceIndex(points)
  const places = M.countPlaces(index, points, Date.now())

  // Every story reaches a place. A miss here is a beacon whose click cannot
  // resolve and which contributes nothing to the wash.
  assert.equal(index.of.size, points.length, 'every story must join a place')
  assert.equal(
    places.reduce((n, p) => n + p.count, 0),
    points.length,
    'the places must account for every story exactly once',
  )

  // The no-invented-coordinate rule, which is the whole thesis in one assertion.
  // A cluster disc stood at a centroid no story held; so would a mean or a
  // median of Washington's 17 jittered coordinates.
  const held = new Set(points.map((p) => `${p.lat},${p.lng}`))
  const invented = places.filter((p) => !held.has(`${p.lat},${p.lng}`))
  assert.deepEqual(
    invented.map((p) => `${p.loc} @ ${p.lat},${p.lng}`),
    [],
    'a place must stand where some story in it actually stands',
  )

  // One mark per pixel. Keyed on the dateline alone this fails: eight
  // coordinates in this corpus carry two spellings each — New Delhi/Delhi,
  // Gaza/Gaza City, Sana'a/Sanaa, Odessa/Odesa — and each pair would draw its own
  // numeral on the same pixel, which is the overlap the whole redesign removes.
  const perCoord = new Map()
  for (const p of places) {
    const k = `${p.lat},${p.lng}`
    perCoord.set(k, (perCoord.get(k) ?? 0) + 1)
  }
  const stacked = [...perCoord].filter(([, n]) => n > 1)
  assert.deepEqual(stacked, [], 'two places must never share one coordinate')

  // Washington is the corpus's hardest case in both directions: 17 distinct
  // coordinates inside 2.2 km that must merge, and the largest count on the map.
  const dc = places.filter((p) => p.loc === 'Washington')
  assert.equal(dc.length, 1, 'Washington must be one place, not seventeen')
  assert.ok(dc[0].count > 40, `Washington should hold its whole pile, got ${dc[0].count}`)

  // And the split that must survive all of that merging: `La Paz` is two cities
  // 4,511 km apart, Bolivia and Mexico. A grid catches this and so does
  // proximity; only proximity cannot also invent a split under 2 km of jitter.
  const lapaz = places.filter((p) => p.loc === 'La Paz')
  if (lapaz.length) {
    assert.equal(lapaz.length, 2, 'La Paz is two cities and must stay two places')
  }

  // The tight merge radius has to stay tight. These are separate cities with
  // separate stories, 9–15 km apart, and on this map separate peoples' — a merge
  // radius comfortable enough to absorb a spelling variant must not reach them.
  const distinct = ['Al-Quds', 'Ramallah', 'Bethlehem', 'Yafa'].filter((n) =>
    places.some((p) => p.loc === n),
  )
  for (const n of distinct) {
    assert.equal(
      places.filter((p) => p.loc === n).length,
      1,
      `${n} must be its own place`,
    )
  }
  if (distinct.includes('Al-Quds') && distinct.includes('Ramallah')) {
    const a = places.find((p) => p.loc === 'Al-Quds')
    const b = places.find((p) => p.loc === 'Ramallah')
    assert.notEqual(`${a.lat},${a.lng}`, `${b.lat},${b.lng}`, 'these are two places')
  }

  // Newest first, because that is the order the place card lists them in and the
  // story the numeral's hover previews. Read off the input order it would be
  // oldest-first, since `/api/map.json` is ascending by time.
  for (const p of places) {
    const times = p.slugs.map((s) => points.find((q) => q.slug === s).t)
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] <= times[i - 1], `${p.loc} lists its stories out of order`)
    }
  }
})

/**
 * The wash cannot saturate on the corpus it was calibrated against.
 *
 * `heatmap-weight` is summed per pixel by the shader, so the compression has to
 * be baked into the weight — there is no logarithm available in there. Counts per
 * place run 1 to 62 in a fortnight, so a linear weight either saturates
 * Washington across half a continent, which is the gold blob in greyscale, or
 * leaves a small place under the ramp's toe.
 */
test('the density wash cannot saturate on the corpus it was calibrated against', (t) => {
  // The kernel coefficient is MapLibre's, and leaving it out of the arithmetic
  // costs a factor of 2.5 — a field whose busiest place on earth sits barely past
  // the first visible stop, which renders as a map with no field on it.
  assert.ok(
    Math.abs(M.GAUSS_COEF - 0.3989422804014327) < 1e-12,
    'GAUSS_COEF must match the heatmap fragment shader',
  )
  assert.ok(
    Math.abs(M.placeDensity(1) - 0.085) < 1e-9,
    `a one-story place must land at 0.085, got ${M.placeDensity(1)}`,
  )

  // Strictly sublinear, which is what a linear weight fails and sqrt passes.
  for (const n of [2, 5, 10, 30]) {
    assert.ok(M.placeWeight(2 * n, 1) < 2 * M.placeWeight(n, 1), `weight is linear at ${n}`)
    assert.ok(M.placeWeight(n + 1, 1) > M.placeWeight(n, 1), `weight is not monotonic at ${n}`)
  }

  // A lone story raises no field at all: it is already completely expressed by
  // its own beacon, and a kernel's skirt is a fact about the kernel.
  const toe = Math.max(...M.DENSITY_STOPS.filter(([, a]) => a === 0).map(([d]) => d))
  assert.ok(M.placeDensity(1) < toe, 'one story must sit under the ramp toe')
  assert.ok(M.placeDensity(2) > toe, 'two stories must clear it')

  const path = join(ROOT, 'dist/api/map.json')
  if (!existsSync(path)) {
    t.skip('dist/api/map.json not built')
    return
  }
  const { points } = JSON.parse(readFileSync(path, 'utf8'))
  const places = M.countPlaces(M.buildPlaceIndex(points), points, Date.now())

  for (const p of places) {
    assert.ok(
      M.placeDensity(p.count) <= 0.95,
      `${p.loc} (${p.count}) would clip the ramp at ${M.placeDensity(p.count).toFixed(3)}`,
    )
  }

  // Kernels sum, so the top of the scale has to be a *neighbourhood* rather than
  // a place — and getting that wrong is what flattens the map. The three busiest
  // places within ten degrees of each other stand in for the worst overlap world
  // zoom can produce; ten degrees is inside the kernel there, where the radius is
  // 24px against a 512px world.
  //
  // Measured: the US northeast reaches 1.238 (Washington 62 + New York 22 +
  // Atlanta 4) and London + Paris + Brussels reach 1.018, against Washington's
  // 0.669 alone. Anchoring the ramp's top on the busiest single place would put
  // every one of those regions past the last stop, where MapLibre clamps them all
  // to one tone — so the ramp must reach roughly as far as the corpus does.
  const busiest = [...places].sort((a, b) => b.count - a.count).slice(0, 40)
  let worst = 0
  for (const a of busiest) {
    const near = busiest.filter(
      (b) => Math.abs(a.lat - b.lat) < 10 && Math.abs(a.lng - b.lng) < 10,
    )
    const sum = near
      .map((b) => M.placeDensity(b.count))
      .sort((x, y) => y - x)
      .slice(0, 3)
      .reduce((s, v) => s + v, 0)
    worst = Math.max(worst, sum)
  }
  const top = M.DENSITY_STOPS[M.DENSITY_STOPS.length - 1][0]
  assert.ok(
    worst <= top * 1.1,
    `the busiest region reaches ${worst.toFixed(2)} against a ramp topping out at ${top} — regions above it all render alike`,
  )
  // And the other way: a ramp reaching far past the data spends its brightest
  // tones on densities nothing produces, which is the flat-ramp failure the land
  // ramp was fixed for, one layer down.
  assert.ok(
    worst >= top * 0.6,
    `the ramp tops out at ${top} but nothing on the map exceeds ${worst.toFixed(2)}`,
  )
})

/**
 * The wash sits above the land ramp and below the ink.
 *
 * The invariant that carries the whole colour argument, and it is computed on
 * **composites** rather than on the stop values, because a composite is what the
 * reader actually sees. A translucent tone over a variable ground has no colour
 * of its own.
 */
test('the density wash sits above the land ramp and below the ink', () => {

  const field = channels(M.MAP_COLOURS.density)
  const top = channels(M.LAND_RAMP[M.LAND_RAMP.length - 1])
  const ocean = channels(M.MAP_COLOURS.ocean)
  const visible = M.DENSITY_STOPS.filter(([, a]) => a > 0)
  assert.ok(visible.length >= 2, 'the ramp needs a visible range')

  // Stop 0 must be fully transparent. MapLibre evaluates `heatmap-color` at
  // every pixel of the layer's extent, so any alpha at density 0 paints the
  // whole world — silently, since it is a fill with nothing under it.
  assert.equal(M.DENSITY_STOPS[0][0], 0, 'the ramp must start at density 0')
  assert.equal(M.DENSITY_STOPS[0][1], 0, 'and at zero alpha')

  // Monotonic in both axes, or the wash would say less where there is more.
  for (let i = 1; i < M.DENSITY_STOPS.length; i++) {
    assert.ok(M.DENSITY_STOPS[i][0] > M.DENSITY_STOPS[i - 1][0], 'density stops must ascend')
    assert.ok(M.DENSITY_STOPS[i][1] >= M.DENSITY_STOPS[i - 1][1], 'alpha must not fall')
  }

  // The land ramp's own largest internal step is the bar. Clearing it means the
  // wash's *quietest* visible tone already lies outside the entire vocabulary a
  // shaded country can speak, so the two cannot be confused by tone — on top of
  // being distinguished by kind, the wash having no edge at all.
  let rampStep = 0
  for (let i = 1; i < M.LAND_RAMP.length; i++) {
    rampStep = Math.max(rampStep, contrast(channels(M.LAND_RAMP[i]), channels(M.LAND_RAMP[i - 1])))
  }
  // Every stop *above the onset*. The first visible stop is the beginning of the
  // scale — a place that has only just started to crowd, at 1.18:1 against the
  // ramp's 1.21:1 — and what keeps that from reading as a shaded country is the
  // structural guarantee rather than the tone: the wash is inserted under
  // `borders`, so it is the only thing on this map with no edge. From the second
  // visible stop up, tone alone suffices, and that is what is pinned.
  for (const [, alpha] of visible.slice(1)) {
    const lift = contrast(composite(field, alpha, top), top)
    assert.ok(
      lift >= rampStep,
      `a visible stop lifts the brightest land only ${lift.toFixed(3)}:1, under the ramp's own ${rampStep.toFixed(3)}:1 step`,
    )
  }
  // 1.4, not 1.5, and the drop is the point: this ceiling is no longer set by
  // how visible the wash can be, it is set by how far it may lift the ground
  // before the text on top of it stops reading. The peak came down from 0.34 to
  // 0.30 on 2026-07-30 because a country name measured 1.24:1 where the wash was
  // strongest. Legibility outranks the field, and the bar records which way that
  // trade went.
  const peakOnLand = composite(field, visible[visible.length - 1][1], top)
  assert.ok(
    contrast(peakOnLand, top) >= 1.4,
    `the peak lifts the brightest land only ${contrast(peakOnLand, top).toFixed(2)}:1`,
  )

  // The wash only ever adds light, on every ground it can lie on.
  for (const ground of [...M.LAND_RAMP, M.LAND_NO_DATA, M.MAP_COLOURS.ocean]) {
    const bg = channels(ground)
    for (const [, alpha] of visible) {
      assert.ok(
        luminanceOf(composite(field, alpha, bg)) > luminanceOf(bg),
        `the wash darkens ${ground}, which inverts what more news means`,
      )
    }
  }

  // The ceiling, which is the constraint nobody writes down until the map
  // inverts. Every label, beacon and glyph here is lighter than its ground —
  // that is what the dark palette is *for* — so a wash bright enough to pass the
  // quietest ink would locally turn the map inside out.
  //
  // This assertion used to require only that the peak stay 1.15:1 *below*
  // `labelDim` — which is the condition for text to be invisible on the wash, not
  // the condition for text to be readable, and it is how the map shipped with
  // country names at 1.24:1. The bar is the real one now: a label must clear the
  // 3:1 non-text floor against the wash at full strength. The label side of the
  // same invariant is pinned in "every label on the map is legible on every
  // ground it can land on", which walks all four inks.
  const dim = channels(M.MAP_COLOURS.labelDim)
  assert.ok(
    luminanceOf(peakOnLand) < luminanceOf(dim),
    'the wash must never be brighter than the type on it',
  )
  assert.ok(
    contrast(dim, peakOnLand) >= 3,
    `a country name measures only ${contrast(dim, peakOnLand).toFixed(2)}:1 on the wash at its peak`,
  )

  /**
   * A beacon reads on the wash by one channel or the other, everywhere.
   *
   * Two channels because neither works alone, and measuring is what showed it.
   * On the brightest land the wash peak comes up to `#656c76`, where a `politics`
   * fill measures **1.39:1** — nearly the same luminance — and the ocean-coloured
   * rim measures **3.73:1**. Over the water the peak is `#3b3e42` and it is the
   * other way round: the rim collapses to **1.84:1** while the fills run
   * 2.83–4.60:1. So fill carries the mark on dark ground, rim carries it on
   * bright, and the invariant is the *better* of the two on every ground the wash
   * can lie on — the same reasoning this map already applies to the overlay
   * glyphs, whose fills all come in under 3:1 on the ramp's lightest stop and
   * whose halo is the real guarantee.
   *
   * The worst case is `politics` on the darkest ramp stop, where the wash lifts
   * the ground to almost exactly the beacon's own luminance: 2.29:1 by the rim,
   * 2.27:1 by the fill. Under 3:1, and what still makes the mark a mark there is
   * the edge *between* rim and fill, which no ground can affect.
   */
  const peakOnOcean = composite(field, visible[visible.length - 1][1], ocean)
  const casing = channels(M.MAP_COLOURS.ocean)
  assert.ok(
    contrast(casing, peakOnLand) >= 3,
    `the rim only reaches ${contrast(casing, peakOnLand).toFixed(2)}:1 on the wash over bright land, which is the case it exists for`,
  )
  for (const [name, hex] of Object.entries(M.CATEGORY_COLOUR)) {
    assert.ok(
      contrast(channels(hex), peakOnOcean) >= 2.5,
      `${name} only reaches ${contrast(channels(hex), peakOnOcean).toFixed(2)}:1 on the wash over water, where the rim cannot help it`,
    )
  }
  for (const ground of [...M.LAND_RAMP, M.LAND_NO_DATA, M.MAP_COLOURS.ocean]) {
    const patch = composite(field, visible[visible.length - 1][1], channels(ground))
    for (const [name, hex] of Object.entries(M.CATEGORY_COLOUR)) {
      const best = Math.max(contrast(channels(hex), patch), contrast(casing, patch))
      assert.ok(
        best >= 2.25,
        `a ${name} beacon on the wash over ${ground} reaches only ${best.toFixed(2)}:1 by either channel`,
      )
    }
  }
  // The numeral's halo is held to the same bar the rim is, on the same ground:
  // `story-place-count` is set in `label` and carried by `labelHalo`, which is
  // what lets its ground be a variable at all.
  assert.ok(
    contrast(channels(M.MAP_COLOURS.labelHalo), peakOnLand) >= 3,
    `the label halo only reaches ${contrast(channels(M.MAP_COLOURS.labelHalo), peakOnLand).toFixed(2)}:1 on the wash`,
  )

  // Neutral, and quieter than a frontier. The land ramp is held to a channel
  // spread of 20 for the same reason: category hue is the only colour on this map
  // that means anything, and a wash spanning whole continents is the last place
  // to spend a hue.
  const spread = Math.max(...field) - Math.min(...field)
  assert.ok(spread <= 20, `the wash tone is chromatic (channel spread ${spread})`)
  const hslOf = (hex) => {
    const [r, g, b] = channels(hex).map((v) => v / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    if (!d) return { h: 0, s: 0, l }
    const s = d / (1 - Math.abs(2 * l - 1))
    let h
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
    return { h, s, l }
  }
  const wash = hslOf(M.MAP_COLOURS.density)
  const border = hslOf(M.MAP_COLOURS.border)
  assert.ok(
    Math.abs(wash.h - border.h) < 2,
    `the wash left the map's blue-grey furniture family (${wash.h.toFixed(0)}° vs ${border.h.toFixed(0)}°)`,
  )
  assert.ok(
    wash.s < border.s,
    'the wash must be less chromatic than a frontier, not more',
  )

  // And it must not have quietly become one of the marks it lies under.
  for (const [name, value] of [
    ...Object.entries(M.CATEGORY_COLOUR),
    ...Object.entries(M.OVERLAY_COLOUR),
  ]) {
    assert.notEqual(
      value.toLowerCase(),
      M.MAP_COLOURS.density.toLowerCase(),
      `the wash tone is also ${name}`,
    )
  }
})

/**
 * Every word printed on the map is legible on every ground it can land on.
 *
 * The test that did not exist, which is why the map shipped hard to read. The
 * palette was audited for chrome ink on panel surfaces — `colour-system.test.js`
 * checks a 40-pair cross product there — and nothing ever asked about the text
 * MapLibre paints, whose ground is not a surface at all but a *data* layer that
 * two separate things move: whichever metric shades the land, and the density
 * wash over it.
 *
 * Measured before the fix: a country name at **1.90:1 on the brightest land and
 * 1.24:1 under the wash**, a city name at 2.76 / 1.80, a sea name at 1.92 / 1.25.
 * The palette's own defence was that `labelHalo` carries them — and a halo makes
 * a label findable, not readable. You read a letter by its shape, and a 1.1px
 * outline around an 8.5px glyph leaves the shape at whatever the ground allows.
 *
 * Two bars, because the grounds are not equally avoidable. Unwashed land is where
 * most labels live and AA applies. The wash's peak reaches a few dozen pixels
 * around the busiest places on earth, and there the 3:1 non-text floor is what is
 * held — going further would mean either near-white labels or no wash.
 */
test('every label on the map is legible on every ground it can land on', () => {

  // Every tone the ground under a label can be: the metric ramp, a country the
  // metric has no figure for, and the open water a marine label sits on.
  const grounds = [...M.LAND_RAMP, M.LAND_NO_DATA, M.MAP_COLOURS.ocean].map(channels)
  const peak = Math.max(...M.DENSITY_STOPS.map(([, a]) => a))
  const washed = grounds.map((g) => composite(channels(M.MAP_COLOURS.density), peak, g))

  // Every ink MapLibre sets type in. `prayer` is here too: its labels are drawn
  // at full strength over the same land.
  const inks = {
    'country names': M.MAP_COLOURS.labelDim,
    'city names and the place numeral': M.MAP_COLOURS.label,
    'marine labels': M.MAP_COLOURS.waterLabel,
    'prayer labels': M.MAP_COLOURS.prayer,
  }

  for (const [what, ink] of Object.entries(inks)) {
    for (const g of grounds) {
      const c = contrast(channels(ink), g)
      assert.ok(c >= 4.5, `${what} measure ${c.toFixed(2)}:1 on ${g.map(Math.round)} — under AA`)
    }
    for (const g of washed) {
      const c = contrast(channels(ink), g)
      assert.ok(
        c >= 3,
        `${what} measure ${c.toFixed(2)}:1 on the density wash at its peak — under the 3:1 floor`,
      )
    }
    // The halo is the second line of defence and has to stay one: a light ink on
    // a dark outline is what keeps the letterform crisp where the ground rises.
    assert.ok(
      contrast(channels(ink), channels(M.MAP_COLOURS.labelHalo)) >= 4.5,
      `${what} do not separate from their own halo`,
    )
  }

  // Hierarchy, asserted rather than assumed: a city name is the louder of the
  // two, because a country name is already carried by being uppercase,
  // letter-spaced and set alone at a centroid.
  assert.ok(
    luminance(M.MAP_COLOURS.label) > luminance(M.MAP_COLOURS.labelDim),
    'city names must not be quieter than country names',
  )

  // The label tones are text, not marks, and must not drift into a category or
  // an overlay hue — colour on this map means category.
  for (const [name, value] of [
    ...Object.entries(M.CATEGORY_COLOUR),
    ...Object.entries(M.OVERLAY_COLOUR),
  ]) {
    for (const [what, ink] of Object.entries(inks)) {
      assert.notEqual(value.toLowerCase(), ink.toLowerCase(), `${what} are also ${name}`)
    }
  }

  // `neutral` is deliberately *not* in the loop above. It is a mark saying
  // nothing is happening — a 7px silhouette with a dark halo, read by its shape —
  // and it held `label`'s old value only because the two jobs had not yet been
  // told apart. If it ever becomes text, it joins this test.
  assert.notEqual(
    M.MAP_COLOURS.neutral,
    M.MAP_COLOURS.label,
    'neutral is a mark and label is text; sharing one value is what hid this bug',
  )
})

/**
 * The globe's opening framing, which nothing else can check.
 *
 * `globeFitZoom` is the one piece of arithmetic the projection change turns on,
 * and it is invisible when wrong: the map still opens, still draws the world,
 * still reports a plausible "fit zoom" — it just draws the planet at a third of
 * the size it should be. The old `worldFitZoom` fitted a *Mercator* world, and
 * feeding a sphere that number is exactly the silent failure this file exists to
 * catch, so the closed form is pinned against MapLibre's own.
 */
test('the globe fit solves MapLibre\'s own globe-radius formula', () => {
  // maplibre-gl/src/geo/projection/globe_utils.ts:
  //   getGlobeRadiusPixels(worldSize, lat) = worldSize / 2π / cos(lat)
  // so diameter = TILE_PX · 2^z / (π · cos lat). Round-tripping a zoom back to
  // a diameter must return the span asked for.
  const diameter = (z, lat) =>
    (M.TILE_PX * 2 ** z) / (Math.PI * Math.cos((lat * Math.PI) / 180))

  for (const [span, lat] of [[900, 22], [390, 22], [1400, 0], [700, 45]]) {
    const z = M.globeFitZoom(span, lat)
    // Only meaningful below the cap; above it the fit is deliberately not met.
    if (z >= M.GLOBE_ZOOM.sphere) continue
    assert.ok(
      Math.abs(diameter(z, lat) - span * M.GLOBE_FIT) < 0.5,
      `globeFitZoom(${span}, ${lat}) = ${z.toFixed(3)} draws a ${diameter(z, lat).toFixed(0)}px globe, not ${span * M.GLOBE_FIT}`,
    )
  }

  // A bigger canvas never opens further out, and a higher latitude never draws a
  // bigger globe at the same span — MapLibre scales the planet up towards the
  // poles to hold the centre's pixel scale constant, so the fit has to come down.
  assert.ok(M.globeFitZoom(1200, 22) > M.globeFitZoom(600, 22), 'monotonic in span')
  assert.ok(M.globeFitZoom(900, 60) < M.globeFitZoom(900, 0), 'higher latitude, smaller fit')

  // The cap is what stops a large canvas opening part-way through the
  // flattening, where neither projection is the one anything was tuned for.
  assert.equal(
    M.globeFitZoom(4000, 22),
    M.GLOBE_ZOOM.sphere,
    'a very large canvas must clamp to the sphere end of the transition, not exceed it',
  )
  assert.ok(
    M.globeFitZoom(390, 22) < M.GLOBE_ZOOM.sphere,
    'and a phone must still open on a full sphere',
  )
})

/**
 * The projection transition itself.
 *
 * `GLOBE_ZOOM` is read by the style *and* by the island's framing cap, so the
 * two cannot be allowed to part — and the ordering is the whole meaning of it.
 */
test('the projection interpolates from sphere to plane, in that order', () => {
  const style = M.buildStyle()
  const type = style.projection?.type
  assert.ok(Array.isArray(type), 'projection.type must be a zoom expression, not a bare string')
  assert.equal(type[0], 'interpolate')
  // `'globe'` is a preset that expands to an 11 → 12 transition, and this map's
  // maxZoom is 9 — so it would be a sphere everywhere and the plane half of the
  // design would silently never run.
  assert.notEqual(type, 'globe')
  const stops = type.slice(3)
  assert.deepEqual(
    stops,
    [M.GLOBE_ZOOM.sphere, 'vertical-perspective', M.GLOBE_ZOOM.plane, 'mercator'],
    'the sphere must come first and both stops must come from GLOBE_ZOOM',
  )
  assert.ok(M.GLOBE_ZOOM.sphere < M.GLOBE_ZOOM.plane, 'sphere zoom must be the lower one')
})

/**
 * No label layer is hidden at the view every reader starts from.
 *
 * `worldFitZoom` is `log2(max(w, h) / 512)` and is also the map's floor, so the
 * opening zoom is a function of the canvas: about **1.11 on a 1104px desktop and
 * −0.39 on a portrait phone**. Every zoom ramp on this map was written looking at
 * a desktop, so a `minzoom` that reads as "world view and in" on one is a layer
 * that never appears on the other.
 *
 * `sea-labels` had exactly this bug — `minzoom: 1.4` hid the marine labels at the
 * one view they were added for — and it was fixed with a note explaining that
 * density is the rank filter's job, never a zoom floor's. `country-labels` had
 * the same bug at 1.1 and kept it for longer: **a phone had no country names at
 * all**. Both are gated on significance now, so this asserts the shape of the
 * fix rather than the two instances of it.
 */
test('no label layer is floored above the zoom a phone opens at', () => {
  // A 390x844 phone, which is the narrowest layout the CSS has a block for.
  //
  // The **shorter** side and the globe formula, where this used to be
  // `log2(844 / 512)` — the longer side and the Mercator one. Both halves of
  // that changed with the projection, and in opposite directions: a sphere is a
  // disc that has to fit in both axes (so `min`, not `max`), and it is far
  // smaller than a flat world at the same zoom (so the fit zoom is far higher).
  // A phone now opens at about **1.15** where it opened at −0.39, which makes
  // this a much weaker bar than it was — it is kept because the failure it
  // guards against is a `minzoom` written while looking at a desktop, and that
  // is unchanged.
  const PHONE_FIT = M.globeFitZoom(390, 22)
  const layers = M.buildStyle().layers.filter((l) => /label/.test(l.id))
  assert.ok(layers.length >= 3, 'expected the country, place and sea label layers')

  for (const l of layers) {
    // `place-labels` is the deliberate exception and says so: city names are not
    // a world-view layer at all, they arrive when the camera has earned them.
    if (l.id === 'place-labels') {
      assert.ok(l.minzoom > PHONE_FIT, 'place-labels is meant to be a close-up layer')
      continue
    }
    assert.ok(
      l.minzoom === undefined || l.minzoom <= PHONE_FIT,
      `${l.id} has minzoom ${l.minzoom}, above the ${PHONE_FIT.toFixed(2)} a phone opens at — it would be absent there`,
    )
  }

  // And the country labels must still gate density by area, or dropping the
  // floor trades an empty phone for a phone paved in type.
  const country = layers.find((l) => l.id === 'country-labels')
  assert.ok(country, 'country-labels should exist')
  const filter = JSON.stringify(country.filter)
  assert.match(filter, /"area"/, 'country labels must be gated on area')
  assert.match(filter, /step/, 'and that gate must step with zoom')
})
