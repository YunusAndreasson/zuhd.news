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

const ROOT = new URL('../..', import.meta.url).pathname

const dir = mkdtempSync(join(tmpdir(), 'zuhd-map-test-'))
const entry = join(dir, 'entry.ts')
writeFileSync(
  entry,
  `export * from '${join(ROOT, 'public/islands/_map/solar.ts')}'\n` +
    `export * from '${join(ROOT, 'public/islands/_map/types.ts')}'\n` +
    `export * from '${join(ROOT, 'public/islands/_map/format.ts')}'\n`,
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

test('exposure figures abbreviate above ten thousand and stay exact below', () => {
  assert.equal(M.population(124), '124')
  assert.equal(M.population(9_319), '9,319')
  assert.equal(M.population(25_712), '26K')
  assert.equal(M.population(888_676), '889K')
  assert.equal(M.population(9_319_328), '9.3M')
  assert.equal(M.population(0), '')
})
