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
    `export * from '${join(ROOT, 'public/islands/_map/types.ts')}'\n` +
    `export * from '${join(ROOT, 'public/islands/_map/format.ts')}'\n` +
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
    // The percentile positions a country within the set the map can draw, so
    // the darkest tone must belong to somebody — if it doesn't, percentiles are
    // being computed over a wider set than the one being painted, and the ramp
    // is spending its range on countries that never appear.
    assert.equal(lowest, 0, `${m.key} never reaches p=0`)
    // The top is looser on purpose. Ties share the lower position, so where
    // several countries hold the highest value none of them lands on exactly 1
    // — literacy tops out at 0.92 because a great many countries report the
    // same high figure. That is the tie rule working, not a broken scale; the
    // top group still gets the lightest tone in use.
    assert.ok(highest > 0.85, `${m.key} tops out at p=${highest}, so the ramp's light end is unused`)
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
  // And the ramp is magnitude, so the least free country is the light end.
  assert.ok(
    payload.values[worstIso].p > payload.values[bestIso].p,
    'the higher RSF score does not sit higher on the ramp',
  )
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
