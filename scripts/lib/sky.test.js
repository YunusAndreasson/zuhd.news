// The sky around the globe: the camera it is solved from, the projection that
// makes it visible, and the two bodies whose positions nothing on screen can
// check.
//
// Every assertion here pins something that fails *silently*. A camera solved
// wrong puts stars in plausible places. A moon a degree out is still a moon. A
// precession left out is a sky that sits quietly askew against a sun and a moon
// that are computed correctly. A screen basis with a sign flipped is a sky that
// is mirrored for half the planet and correct for the other half. None of it
// throws, and none of it looks broken.
//
// The oracle is `astronomy-engine`, a devDependency that is **not shipped** —
// the same arrangement `prayer.ts` has with adhan-js, and for the same reason:
// the island needs three numbers from the moon, the closed form for them is
// published, and 100 KB of library against a 40 KB island is the wrong trade.
// Comparing against it here is a stronger guarantee than importing it and costs
// the reader nothing.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as Astro from 'astronomy-engine'
import { bundleIslands, scratchDir } from './island-bundle.js'
import { loadShared } from '../build/shared-ts.js'

const ROOT = new URL('../..', import.meta.url).pathname

const dir = scratchDir('sky')
const bundlePath = await bundleIslands(
  dir,
  [
    // All three are DOM-free by construction. `starfield.ts` is the fourth and
    // is deliberately absent: it is the canvas painter, it touches `document`,
    // and everything in it that can be reasoned about was put in `sky.ts` for
    // exactly this reason.
    'public/islands/_map/solar.ts',
    'public/islands/_map/lunar.ts',
    'public/islands/_map/sky.ts',
  ],
  'sky.mjs',
)
const M = await import(bundlePath)

const DEG = Math.PI / 180

/** Equatorial degrees to a unit vector, the same convention `sky.ts` uses. */
const dirOf = (raDeg, decDeg) => {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const cd = Math.cos(dec)
  return [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)]
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sep = (ra1, d1, ra2, d2) => {
  const c = Math.sin(d1 * DEG) * Math.sin(d2 * DEG) +
    Math.cos(d1 * DEG) * Math.cos(d2 * DEG) * Math.cos((ra1 - ra2) * DEG)
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG
}

/**
 * The oracle in *our* frame: geocentric, mean-ish equinox of date, no
 * aberration.
 *
 * Getting this wrong is the trap the first run of this suite fell into.
 * `Astro.Equator(body, t, observer, …)` is **topocentric** — it applies the
 * parallax of an observer standing on the surface, up to a degree for the moon
 * — and its default frame is J2000, so comparing against it reported a 1.5°
 * error that was entirely the oracle being asked the wrong question. The
 * residual left after fixing both is nutation (±17″), which `EQD` carries and
 * the mean equinox does not; that is the only slack in the bounds below.
 */
const geoOfDate = (body, t) => {
  const time = Astro.MakeTime(t)
  const v = Astro.RotateVector(Astro.Rotation_EQJ_EQD(time), Astro.GeoVector(body, time, false))
  return Astro.EquatorFromVector(v)
}

/**
 * A synthetic globe camera with a known `f` and `d`, projecting exactly the way
 * MapLibre's sphere does: a surface point θ from the sub-camera point lands at
 * `f·sinθ/(d−cosθ)`. Screen y runs down.
 *
 * This is what makes `calibrate` testable at all — it cannot be checked against
 * MapLibre without a GPU, and the whole point of solving the camera from
 * `map.project` was to avoid depending on MapLibre's internals.
 */
const makeProject = (f, d, centre, cx, cy) => {
  const frame = M.skyFrame(centre[1], centre[0], 0)
  return ([lng, lat]) => {
    const p = dirOf(lng, lat)
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(p, frame.c))))
    const r = (f * Math.sin(theta)) / (d - Math.cos(theta))
    const pe = dot(p, frame.e)
    const pn = dot(p, frame.n)
    const len = Math.hypot(pe, pn) || 1
    return { x: cx + (pe / len) * r, y: cy - (pn / len) * r }
  }
}

/** @type {[number, number]} */
const HOME = [39.826, 21.423] // Makkah, the view the map opens on

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

test('the camera is recovered exactly from two projected points', () => {
  // Three viewports' worth of plausible cameras: a desktop, a phone, and one
  // further out than this map can reach.
  /** @type {Array<[number, number, [number, number]]>} */
  const cameras = [
    [1369, 3.17, HOME],
    [586, 3.2, [-70.6, -33.4]],
    [2000, 4.0, [0, 0]],
  ]
  for (const [f, d, centre] of cameras) {
    const cam = M.calibrate(makeProject(f, d, centre, 500, 400), centre, 0, 0)
    assert.ok(cam, `calibrate returned null for f=${f} d=${d}`)
    // 1e-5 relative, not 1e-12. The solve's denominator is `r1·s2 − r2·s1` — a
    // difference of two large nearly-equal products — so it loses about six
    // digits to cancellation, and that is inherent to a closed-form fit rather
    // than a defect. The bound is set where it is because 1e-5 in `d` moves the
    // limb by under a thousandth of a pixel, and tightening it further would be
    // pinning the arithmetic's rounding rather than the camera.
    assert.ok(Math.abs(cam.f / f - 1) < 1e-5, `f: got ${cam.f}, want ${f}`)
    assert.ok(Math.abs(cam.d / d - 1) < 1e-5, `d: got ${cam.d}, want ${d}`)
    // The two derived quantities the whole sky is placed against.
    assert.ok(Math.abs(cam.limb - Math.asin(1 / cam.d)) < 1e-12)
    assert.ok(Math.abs(cam.r - cam.f / Math.sqrt(cam.d * cam.d - 1)) < 1e-9)
    assert.ok(Math.abs(cam.r / (f / Math.sqrt(d * d - 1)) - 1) < 1e-5)
  }
})

test('the screen basis is orthonormal and points the right way, in both hemispheres', () => {
  // North is measured off a latitude step, which is exactly a meridian; east is
  // that turned a quarter and its *sign* measured. A hemisphere-dependent guess
  // at the sign is how a sky comes out mirrored for half the planet, which is
  // the failure this asserts against — so both hemispheres are checked.
  /** @type {Array<[number, number]>} */
  const centres = [HOME, [-70.6, -33.4], [10, 0]]
  for (const centre of centres) {
    const cam = M.calibrate(makeProject(1369, 3.17, centre, 500, 400), centre, 0, 0)
    assert.ok(cam)
    assert.ok(Math.abs(Math.hypot(...cam.north) - 1) < 1e-9, 'north is a unit vector')
    assert.ok(Math.abs(Math.hypot(...cam.east) - 1) < 1e-9, 'east is a unit vector')
    assert.ok(
      Math.abs(cam.north[0] * cam.east[0] + cam.north[1] * cam.east[1]) < 1e-9,
      'east is perpendicular to north',
    )
    // Screen y runs down, so north is up: negative y.
    assert.ok(cam.north[1] < -0.99, `north points up at ${centre}`)
    assert.ok(cam.east[0] > 0.99, `east points right at ${centre}`)
  }
})

test('a camera that is not a sphere camera draws nothing at all', () => {
  // Once the projection starts interpolating toward Mercator the two-point
  // solve is fitting a model that no longer holds, and a plausible wrong answer
  // is worse than none. The third sample is the check that catches it.
  //
  // The distortion has to be *radial* to be a real test. A uniform scale, or a
  // shear along x, changes nothing the solve can see: both samples are taken
  // along the centre's own meridian, so their offsets are purely vertical and
  // an x-scale leaves every measured radius identical. The first version of
  // this test did exactly that and passed against a camera it meant to refuse.
  const base = makeProject(1369, 3.17, HOME, 500, 400)
  const origin = base(HOME)
  const bent = (lngLat) => {
    const p = base(lngLat)
    const dx = p.x - origin.x
    const dy = p.y - origin.y
    const k = 1 + 0.25 * (Math.hypot(dx, dy) / 600)
    return { x: origin.x + dx * k, y: origin.y + dy * k }
  }
  assert.equal(M.calibrate(bent, HOME, 0, 0), null, 'a radially distorted projection is refused')
  // Bearing and pitch are both zero on this map by construction; a camera that
  // has been turned has no disc centre this file knows how to find.
  const ok = makeProject(1369, 3.17, HOME, 500, 400)
  assert.equal(M.calibrate(ok, HOME, 12, 0), null, 'a bearing is refused')
  assert.equal(M.calibrate(ok, HOME, 0, 30), null, 'a pitch is refused')
})

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

test('the sky is drawn at true scale where it meets the earth', () => {
  const cam = M.calibrate(makeProject(1369, 3.17, HOME, 500, 400), HOME, 0, 0)

  // Exact in position at the limb: the sky starts where the planet ends, with
  // no step. A discontinuity here is a visible ring around the globe.
  assert.ok(Math.abs(M.skyRadius(cam.limb, cam) - cam.r) < 1e-9)

  // Exact in *slope* at the limb, which is what makes the band next to the
  // earth read as a photograph — a moon rising over the edge moves at the right
  // rate and is the right size against it. This is the claim `SKY_NOTE` makes
  // to the reader, so it is the one that has to hold.
  const h = 1e-7
  const slope = (M.skyRadius(cam.limb + h, cam) - M.skyRadius(cam.limb, cam)) / h
  const truth = cam.f / Math.cos(cam.limb) ** 2
  assert.ok(
    Math.abs(slope / truth - 1) < 1e-3,
    `slope at the limb is ${(slope * DEG).toFixed(2)} px/deg, true is ${(truth * DEG).toFixed(2)}`,
  )

  // Monotonic all the way out, or the compression folds the sky over itself and
  // two different directions land on one pixel.
  let prev = -Infinity
  for (let a = cam.limb; a <= M.SKY_SPAN * DEG; a += 0.25 * DEG) {
    const r = M.skyRadius(a, cam)
    assert.ok(r > prev, `skyRadius is not monotonic at ${(a / DEG).toFixed(2)}deg`)
    prev = r
  }

  // And it is a *compression*, not an expansion: past the knee every degree of
  // sky must cost fewer pixels than the one before it.
  const step = (a) => M.skyRadius(a + DEG, cam) - M.skyRadius(a, cam)
  assert.ok(step(cam.limb + 10 * DEG) < step(cam.limb + 2 * DEG))
  assert.ok(step(cam.limb + 45 * DEG) < step(cam.limb + 10 * DEG))
})

test('a body is placed by its bearing, and hidden exactly at the limb', () => {
  const cam = M.calibrate(makeProject(1369, 3.17, HOME, 500, 400), HOME, 0, 0)
  const frame = M.skyFrame(HOME[1], HOME[0], 0)

  // Directly over the antipode of the map centre is dead behind the earth.
  const anti = M.place(dirOf(HOME[0] + 180, -HOME[1]), cam, frame)
  assert.ok(anti.hidden, 'the antipodal direction is behind the earth')
  assert.ok(Math.abs(anti.x - 500) < 1e-6 && Math.abs(anti.y - 400) < 1e-6)

  // Directly over the map centre is behind the camera, which is not a place on
  // screen — drawing it in a corner would be a claim about direction that is
  // false, and that is the line between compressing a sky and inventing one.
  assert.equal(M.place(dirOf(HOME[0], HOME[1]), cam, frame), null)

  // The occultation boundary is `asin(1/d)` and nothing else. Stepped across in
  // both directions, since this is the one moment the reader can check against
  // the picture.
  const east = M.skyFrame(HOME[1], HOME[0], 0)
  const probe = (alpha) => {
    // A direction `alpha` off the view axis, in the plane of the screen's east.
    const v = [
      -Math.cos(alpha) * east.c[0] + Math.sin(alpha) * east.e[0],
      -Math.cos(alpha) * east.c[1] + Math.sin(alpha) * east.e[1],
      -Math.cos(alpha) * east.c[2] + Math.sin(alpha) * east.e[2],
    ]
    return M.place(v, cam, frame)
  }
  assert.ok(probe(cam.limb - 0.001).hidden, 'just inside the limb is hidden')
  assert.ok(!probe(cam.limb + 0.001).hidden, 'just outside the limb is drawn')
  // Bearing is the channel the compression leaves alone, so it has to be exact.
  const p = probe(cam.limb + 20 * DEG)
  assert.ok(Math.abs(p.y - 400) < 1e-6, 'a due-east direction stays on the horizontal')
  assert.ok(p.x > 500, 'and lands to the east')
})

test('parallax is applied, and it is not negligible for the moon', () => {
  const cam = M.calibrate(makeProject(1369, 3.17, HOME, 500, 400), HOME, 0, 0)
  // A camera 3.17 earth radii out looking at a body 60 out is not at the centre
  // of the geometry, and the difference reaches 2° — which at this sky's scale
  // beside the limb is over fifty pixels, and would show as the moon setting
  // behind the wrong part of the earth.
  let worst = 0
  for (let i = 0; i < 360; i += 5) {
    const g = dirOf(i, 12)
    const frame = M.skyFrame(HOME[1], HOME[0], 0)
    const corrected = M.parallaxCorrect(g, 384400 / M.EARTH_RADIUS_KM, cam, frame)
    worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, dot(g, corrected)))) / DEG)
  }
  assert.ok(worst > 1.5, `moon parallax should exceed 1.5deg, measured ${worst.toFixed(2)}`)
  assert.ok(worst < 3.5, `and stay under 3.5deg, measured ${worst.toFixed(2)}`)
})

test('precession is applied, and matches the oracle to nutation', () => {
  // Left out, the J2000 catalogue sits 0.36° from a sun and moon computed for
  // the equinox of date by 2026 — ten pixels at the limb, and a whole sky
  // quietly askew against two bodies that are right.
  let worst = 0
  for (let y = 2000; y <= 2040; y += 2) {
    const t = new Date(Date.UTC(y, 5, 1))
    const m = M.precession(M.daysSinceJ2000(t))
    const rot = Astro.Rotation_EQJ_EQD(Astro.MakeTime(t))
    for (const [ra, dec] of [[0, 0], [90, 45], [210, -60], [300, 80], [180, -20]]) {
      const v = dirOf(ra, dec)
      const mine = [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
      ]
      const o = Astro.RotateVector(rot, new Astro.Vector(v[0], v[1], v[2], Astro.MakeTime(t)))
      worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, dot(mine, [o.x, o.y, o.z])))) / DEG)
    }
  }
  // 0.01° is 36″ — twice the ±17″ of nutation the oracle carries and we do not.
  assert.ok(worst < 0.01, `precession is ${(worst * 3600).toFixed(1)}" from the oracle`)
  // And it is not a no-op, which a matrix built wrong would also satisfy above
  // if it came out as the identity.
  const now = M.precession(M.daysSinceJ2000(new Date(Date.UTC(2026, 0, 1))))
  assert.ok(Math.abs(now[1]) > 1e-4, 'the precession matrix is not the identity')
})

// ---------------------------------------------------------------------------
// The bodies
// ---------------------------------------------------------------------------

test('the moon is where the oracle says, across a decade', () => {
  let worstPos = 0
  let worstKm = 0
  let worstAt = null
  // Every ~33 hours for fifteen years, which walks the synodic month, the
  // draconic month and the 8.85-year apsidal cycle against each other rather
  // than sampling one phase of each.
  const start = Date.UTC(2020, 0, 1)
  for (let i = 0; i < 4000; i++) {
    const t = new Date(start + i * 118_800_000)
    const m = M.moonPosition(t)
    const o = geoOfDate(Astro.Body.Moon, t)
    const s = sep(m.ra, m.dec, o.ra * 15, o.dec)
    if (s > worstPos) {
      worstPos = s
      worstAt = t.toISOString()
    }
    worstKm = Math.max(worstKm, Math.abs(m.km - o.dist * 149597870.7))
  }
  assert.ok(worstPos < 0.05, `moon is ${worstPos.toFixed(4)}deg out at ${worstAt}`)
  assert.ok(worstKm < 200, `moon distance is ${worstKm.toFixed(0)} km out`)
})

test('the sun is where the oracle says, and its distance varies as it should', () => {
  let worst = 0
  let minAu = Infinity
  let maxAu = -Infinity
  for (let i = 0; i < 2000; i++) {
    const t = new Date(Date.UTC(2020, 0, 1) + i * 118_800_000)
    const s = M.sunEquatorial(t)
    const o = geoOfDate(Astro.Body.Sun, t)
    worst = Math.max(worst, sep(s.ra, s.dec, o.ra * 15, o.dec))
    minAu = Math.min(minAu, s.au)
    maxAu = Math.max(maxAu, s.au)
  }
  // The NOAA low-precision equations, which `solar.ts` has always used for the
  // terminator. Half a pixel at the scale the sky is drawn beside the limb.
  assert.ok(worst < 0.03, `sun is ${worst.toFixed(4)}deg out`)
  // Perihelion to aphelion is a real 3.4%, and it is what makes the sun's
  // drawn disc change size over the year.
  assert.ok(minAu > 0.98 && minAu < 0.985, `perihelion ${minAu.toFixed(4)} AU`)
  assert.ok(maxAu > 1.015 && maxAu < 1.02, `aphelion ${maxAu.toFixed(4)} AU`)
})

test('the moon’s phase is the sun–earth–moon triangle, not the elongation', () => {
  let worst = 0
  for (let i = 0; i < 3000; i++) {
    const t = new Date(Date.UTC(2024, 0, 1) + i * 91_800_000)
    const m = M.moonPosition(t)
    const s = M.sunEquatorial(t)
    const ours = M.moonIllumination(m, s).fraction
    worst = Math.max(worst, Math.abs(ours - Astro.Illumination(Astro.Body.Moon, t).phase_fraction))
  }
  assert.ok(worst < 0.005, `illuminated fraction is ${worst.toFixed(5)} out`)
})

test('the moon’s apparent size varies, and the phase is named the way a reader would', () => {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < 2000; i++) {
    const m = M.moonPosition(new Date(Date.UTC(2026, 0, 1) + i * 43_200_000))
    min = Math.min(min, m.diameter)
    max = Math.max(max, m.diameter)
  }
  // 29.4′ to 33.5′ over a month — a real 14%, drawn because it is free and true.
  assert.ok(min * 60 > 29 && min * 60 < 30, `smallest ${(min * 60).toFixed(2)} arcmin`)
  assert.ok(max * 60 > 33 && max * 60 < 34.5, `largest ${(max * 60).toFixed(2)} arcmin`)

  // Waxing and waning are the same picture at the same fraction, so the word is
  // the only thing that separates them.
  assert.equal(M.moonPhaseName(0.5, true), 'first quarter')
  assert.equal(M.moonPhaseName(0.5, false), 'last quarter')
  assert.equal(M.moonPhaseName(0.2, true), 'waxing crescent')
  assert.equal(M.moonPhaseName(0.2, false), 'waning crescent')
  assert.equal(M.moonPhaseName(0.005, true), 'new moon')
  assert.equal(M.moonPhaseName(0.995, false), 'full moon')
})

test('the sun and the moon are actually on screen often enough to be worth drawing', () => {
  // The measurement the whole compressed-sky design exists to satisfy. At true
  // scale the visible sky is 1.3% of the celestial sphere and the sun reaches
  // it for about twenty minutes a night, a few weeks a year — correct, and
  // invisible. If a change to `SKY_SPAN` or `SKY_KNEE` takes this back under an
  // hour a day, the feature has quietly stopped existing.
  const cam = M.calibrate(makeProject(1369, 3.17, HOME, 500, 400), HOME, 0, 0)
  let sun = 0
  let moon = 0
  const N = 24 * 60
  for (let i = 0; i < N; i++) {
    const t = new Date(Date.UTC(2026, 7, 1) + i * 60_000)
    const n = M.daysSinceJ2000(t)
    const frame = M.skyFrame(HOME[1], HOME[0], M.gmstHours(n))
    const s = M.sunEquatorial(t)
    const sp = M.place(
      M.parallaxCorrect(dirOf(s.ra, s.dec), (s.au * 149597870.7) / M.EARTH_RADIUS_KM, cam, frame),
      cam,
      frame,
    )
    const m = M.moonPosition(t)
    const mp = M.place(
      M.parallaxCorrect(dirOf(m.ra, m.dec), m.km / M.EARTH_RADIUS_KM, cam, frame),
      cam,
      frame,
    )
    if (sp && !sp.hidden) sun++
    if (mp && !mp.hidden) moon++
  }
  const hours = (n) => (n / N) * 24
  assert.ok(hours(sun) > 6, `the sun is drawn ${hours(sun).toFixed(1)}h a day`)
  assert.ok(hours(moon) > 4, `the moon is drawn ${hours(moon).toFixed(1)}h a day`)
})

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

const starsFile = join(ROOT, 'shared/data/stars.json')
const stars = existsSync(starsFile) ? JSON.parse(readFileSync(starsFile, 'utf8')) : null

test('the star catalogue is well formed, and sorted by magnitude', { skip: !stars }, () => {
  const n = stars.count
  assert.ok(n > 2000 && n < 6000, `${n} stars`)
  for (const key of ['ra', 'dec', 'mag', 'bv', 'plx', 'hr', 'bayer', 'flamsteed', 'con']) {
    assert.equal(stars[key].length, n, `${key} is not ${n} long`)
  }
  for (let i = 0; i < n; i++) {
    assert.ok(stars.ra[i] >= 0 && stars.ra[i] < 360_000, `ra out of range at ${i}`)
    assert.ok(stars.dec[i] >= 0 && stars.dec[i] <= 180_000, `dec out of range at ${i}`)
  }
  // **The sort is load-bearing, not cosmetic.** The island applies its
  // magnitude cut by breaking out of the draw loop, so an unsorted payload
  // silently draws a different set from the one the cut names.
  for (let i = 1; i < n; i++) {
    assert.ok(stars.mag[i] >= stars.mag[i - 1], `magnitudes are not sorted at index ${i}`)
  }
  // The brightest is Sirius, which is the cheapest end-to-end check there is
  // that the coordinate parse did not silently produce a plausible sky.
  assert.equal(stars.proper['0'], 'Sirius')
  assert.equal(stars.con[0], 'CMa')
  assert.ok(Math.abs(stars.ra[0] / 1000 - 101.287) < 0.01, 'Sirius is at RA 6h45m')
  assert.ok(Math.abs((stars.dec[0] - 90_000) / 1000 + 16.716) < 0.01, 'Sirius is at Dec −16°43′')
})

test('every star name the lore describes is a star in the catalogue', { skip: !stars }, async () => {
  const { STAR_LORE, CONSTELLATIONS } = await loadShared('star-lore.ts')
  const named = new Set(Object.values(stars.proper))
  const orphans = Object.keys(STAR_LORE).filter((k) => !named.has(k))
  // A key matching nothing is an etymology that will never be shown, and the
  // most likely cause is the IAU revising a spelling — which should surface
  // here rather than as a card that quietly stops carrying its best line.
  assert.deepEqual(orphans, [], `lore keys matching no star: ${orphans.join(', ')}`)

  // Every constellation the catalogue uses has a name, or a card prints the
  // three-letter abbreviation twice and says nothing.
  const used = [...new Set(stars.con.filter(Boolean))]
  const missing = used.filter((c) => !CONSTELLATIONS[c])
  assert.deepEqual(missing, [], `constellations with no name: ${missing.join(', ')}`)
  assert.equal(Object.keys(CONSTELLATIONS).length, 88, 'the IAU recognises 88 constellations')

  // The reason this table exists at all: the brightest stars are the ones a
  // reader will click, and most of their names came through Arabic. If that
  // stops being true of the file, the card has lost the one thing it can say
  // that a picture of a star cannot.
  const bright = Object.entries(stars.proper)
    .filter(([i]) => (stars.mag[i] - 200) / 100 <= 2.5)
    .map(([, name]) => name)
  const covered = bright.filter((name) => STAR_LORE[name])
  assert.ok(
    covered.length / bright.length > 0.9,
    `${covered.length} of ${bright.length} stars brighter than mag 2.5 have an etymology`,
  )
  const arabic = covered.filter((name) => STAR_LORE[name].lang.includes('Arabic'))
  assert.ok(
    arabic.length / covered.length > 0.6,
    `${arabic.length} of ${covered.length} are Arabic-derived`,
  )
})

test('the catalogue stays small enough to be idle-deferred', { skip: !stars }, () => {
  const kb = readFileSync(starsFile).length / 1024
  // ~123 KB raw, ~45 KB gzipped, fetched after first paint. The bound is here
  // because a magnitude cut is one flag on the generator and the payload is the
  // only thing that would report the change.
  assert.ok(kb < 260, `stars.json is ${kb.toFixed(0)}KB`)
})
