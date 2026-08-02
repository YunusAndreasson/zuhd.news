// Solar geometry, and the night polygon it produces.
//
// The day/night terminator is the one layer on the map that is not news: it
// says what time it is where the news is happening, which is most of what makes
// a coordinate feel like a place rather than a dot. The canvas map drew it by
// hand; MapLibre wants it as geometry, so the same equations now emit a polygon
// instead of a stroke.

// Imported rather than reached for as the ambient `GeoJSON.*` UMD global:
// @types/geojson only exposes that global to non-module files, so every module
// referencing it was relying on a namespace TypeScript will not resolve here.
// esbuild erases type-only imports, so this costs the bundle nothing.
import type { Feature, LineString, Polygon } from 'geojson'

const DEG = Math.PI / 180

/**
 * Days since J2000.0 (2000-01-01 12:00 UT), the argument every series below is
 * written in terms of.
 *
 * Extracted from `subsolarPoint`, where it and the three functions under it sat
 * inline. Nothing about them is solar — the moon's series, the sidereal frame
 * the stars are drawn in and the sub-point of any body all need exactly these,
 * and the alternative to naming them here was a second copy in `lunar.ts` with
 * no way for a test to notice the two had parted. That is the failure this
 * codebase has recorded eleven times over; see the shared-modules table.
 */
export const daysSinceJ2000 = (date: Date) =>
  date.getTime() / 86400000 + 2440587.5 - 2451545.0

/**
 * Greenwich mean sidereal time, in hours. Not wrapped to [0, 24) — the callers
 * all subtract it from a right ascension and wrap the difference, and wrapping
 * twice is where a sign error hides. Negative for dates before J2000, as the
 * original inline expression was.
 */
export const gmstHours = (n: number) => (18.697374558 + 24.06570982441908 * n) % 24

/** Mean obliquity of the ecliptic, in radians. */
export const obliquity = (n: number) => (23.439 - 0.0000004 * n) * DEG

/**
 * Where on earth a body at this right ascension and declination is directly
 * overhead. Both arguments in degrees; the hour angle *is* the offset from the
 * body's meridian, so the answer is a longitude directly — the same identity
 * `prayer.ts` builds its whole closed form on.
 */
export function subpoint(raDeg: number, decDeg: number, n: number) {
  let lng = raDeg - gmstHours(n) * 15
  lng = ((((lng + 180) % 360) + 360) % 360) - 180
  return { lat: decDeg, lng }
}

/**
 * The sun's geocentric right ascension, declination and distance, using the
 * NOAA low-precision equations. Good to a fraction of a degree, which is far
 * beyond what a terminator drawn at 1° steps can show — and, at the sky's scale
 * at the limb (~28px per degree), about half a pixel.
 *
 * The distance is here for the moon's phase, which is a ratio of the two: the
 * illuminated fraction is a function of the sun–earth–moon triangle and cannot
 * be had from directions alone.
 */
export function sunEquatorial(date: Date) {
  const n = daysSinceJ2000(date)

  const meanLong = (280.46 + 0.9856474 * n) % 360
  const meanAnom = ((357.528 + 0.9856003 * n) % 360) * DEG
  const eclipticLong =
    (meanLong + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * DEG
  const eps = obliquity(n)

  const declination = Math.asin(Math.sin(eps) * Math.sin(eclipticLong))
  const rightAscension = Math.atan2(
    Math.cos(eps) * Math.sin(eclipticLong),
    Math.cos(eclipticLong),
  )

  // Meeus 25.5 — the radius vector, to about 1e-5 AU. The sun's apparent
  // diameter rides on this, and it is a real 3.4% over the year.
  const au =
    1.00014 - 0.01671 * Math.cos(meanAnom) - 0.00014 * Math.cos(2 * meanAnom)

  return { ra: rightAscension / DEG, dec: declination / DEG, au, n }
}

/**
 * Sub-solar point (the coordinate where the sun is directly overhead).
 *
 * Unchanged in behaviour: the same equations, now assembled from the named
 * pieces above rather than computed inline. `map-geo.test.js` pins the
 * declination at both solstices, the equinox and a 6-hour westward sweep.
 */
export function subsolarPoint(date: Date) {
  const { ra, dec, n } = sunEquatorial(date)
  return subpoint(ra, dec, n)
}

/**
 * MapLibre's `light.position` for the globe's atmosphere, from the real sun.
 *
 * ── The bug this exists to fix ────────────────────────────────────────────
 *
 * The style declared `sky: { 'atmosphere-blend': 0.34 }` and never declared
 * `light`. The note on that number says the atmosphere "is lit from the sun's
 * own direction — `draw_sky.ts` takes a `sunPos` uniform", and it does; what it
 * does not do is get that uniform from the sun. `drawAtmosphere` calls
 * `getSunPos(light, transform)`, and there:
 *
 *     const lightPos = light.getCartesianPosition()
 *     negate(lightPos, lightPos)
 *     const lightMat = identity()
 *     if (light.properties.get('anchor') === 'map') { …camera rotations… }
 *     transformMat4(lightPos, lightPos, lightMat)
 *
 * With no `light` declared the anchor defaults to `'viewport'`, the rotation
 * block is skipped, `lightMat` stays the identity, and `u_sun_pos` is a
 * **constant vector in view space** — the default `position: [1.15, 210, 30]`,
 * which works out to up-and-to-the-left. So the globe wore a lit crescent
 * nailed to the upper-left corner of the screen, the same at every hour, on
 * every date, from every camera: measured across five captures between 01:44
 * and 01:56 Makkah on 2026-08-02, with the whole visible hemisphere in night,
 * it never moved. It also disagreed with the terminator drawn underneath it and
 * with `starfield.ts`'s own crescent, which was computed correctly all along —
 * two atmospheres over one planet, one of them pointing the wrong way.
 *
 * ── Why the antisolar point ───────────────────────────────────────────────
 *
 * `getSunPos` **negates** `position` before the shader sees it, so `position`
 * is the direction *away* from the light. That sign is not read off the docs:
 * it is what the default produces, and the default's crescent is observably
 * upper-left, which is where `−cart([1.15, 210, 30])` points and not where
 * `+cart(…)` does.
 *
 * ── Why this needs no camera argument ─────────────────────────────────────
 *
 * With `anchor: 'map'` MapLibre applies `Rx(centre.lat)·Ry(−centre.lng)` itself,
 * every frame, from the live transform. So `position` belongs in the *world*
 * frame, not relative to the map centre — which is the better arrangement
 * anyway: the light stays correct through a pan with nothing to re-set, and
 * this can ride the 120-second solar tick the terminator already has.
 *
 * Solving `Rx(φc)·Ry(−λc)·v = +Z` for the camera's own sub-point gives that
 * frame exactly: **x = cos φ·sin λ, y = sin φ, z = cos φ·cos λ** — Y-up, +Z
 * through (0°, 0°). The azimuth/polar pair below is then whatever
 * `sphericalToCartesian` needs to produce that vector, which is why it is
 * derived by inverting that function rather than by reading its documented
 * convention: the docs describe azimuth as a compass bearing, and a bearing
 * has a handedness this map cannot afford to guess at.
 */
export function sunLightPosition(date: Date): [number, number, number] {
  const sun = subsolarPoint(date)
  const lat = -sun.lat * DEG
  const lng = (sun.lng + 180) * DEG
  const x = Math.cos(lat) * Math.sin(lng)
  const y = Math.sin(lat)
  const z = Math.cos(lat) * Math.cos(lng)
  // `sphericalToCartesian` adds 90° to the azimuth before taking its cosine for
  // x and its sine for y, so the inverse is `atan2(y, x) − 90`. The `sin(polar)`
  // both components carry divides out of the ratio, and where it does not — at
  // either pole, where x and y are both zero — every azimuth names the same
  // direction and `atan2(0, 0)` returning 0 is as good an answer as any.
  const polar = Math.acos(Math.max(-1, Math.min(1, z))) / DEG
  const azimuth = Math.atan2(y, x) / DEG - 90
  return [1, ((azimuth % 360) + 360) % 360, polar]
}

/**
 * Latitude of the terminator at a given longitude, for a sub-solar point.
 * Returns null when the sun is close enough to the equator that the terminator
 * runs pole to pole and the closed-polygon form below degenerates.
 */
export function terminatorLat(lng: number, sun: { lat: number; lng: number }) {
  const tanDec = Math.tan(sun.lat * DEG)
  if (Math.abs(tanDec) < 1e-6) return null
  const hourAngle = (lng - sun.lng) * DEG
  return Math.atan(-Math.cos(hourAngle) / tanDec) / DEG
}

/**
 * One hemisphere: the terminator ring, closed over a pole.
 *
 * `nightPolygon` and `dayPolygon` were the same twenty lines twice, differing
 * only in the sign of the pole they close over — and that sign is the whole
 * correctness of both. Reversed, the map lights the wrong half of the planet
 * and nothing throws; `map-geo.test.js` pins it precisely because the failure
 * is silent. One copy makes the relationship between the two a `* side` rather
 * than two independently-maintained ternaries free to disagree.
 *
 * `side` is +1 for the lit half and −1 for the dark one. The ring is walked
 * west to east at 1° and closed at the appropriate pole, latitudes clamped to
 * ±89.9 — which is why, at an equinox, the cap can only be identified by the
 * closing vertex being at *exactly* ±90.
 *
 * Returns null where `terminatorLat` degenerates, which is a twelve-second
 * window twice a year; the honest answer there is to draw nothing.
 */
/**
 * The terminator itself, walked west to east at 1°, clamped to ±89.9.
 *
 * Split out when `terminatorBand` needed the same curve *open* rather than
 * closed over a pole. Two copies of this walk would have been two chances to
 * drift on the clamp, the step and the inclusive `<= 180` — and the second copy
 * would have looked exactly like the first while the shade and the band it is
 * drawn against slowly parted.
 */
function terminatorRing(sun: { lat: number; lng: number }): Array<[number, number]> | null {
  if (terminatorLat(0, sun) === null) return null
  const ring: Array<[number, number]> = []
  for (let lng = -180; lng <= 180; lng += 1) {
    const lat = terminatorLat(lng, sun)
    if (lat === null) return null
    ring.push([lng, Math.max(-89.9, Math.min(89.9, lat))])
  }
  return ring
}

function hemisphere(date: Date, side: 1 | -1): Feature<Polygon> | null {
  const sun = subsolarPoint(date)
  const ring = terminatorRing(sun)
  if (!ring) return null

  const pole = (sun.lat >= 0 ? 90 : -90) * side
  ring.push([180, pole], [-180, pole], ring[0])

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

/**
 * The unlit hemisphere as a single GeoJSON polygon.
 *
 * Walking the terminator west to east gives its southern or northern edge; the
 * shape is then closed along whichever pole is currently in darkness. Which
 * pole that is flips with the season — in northern summer the sun never sets
 * over the Arctic, so the night cap is the *southern* one — and getting it
 * backwards lights the wrong half of the planet.
 *
 * At an equinox `terminatorLat` degenerates and this draws nothing. That window
 * is about twelve seconds, twice a year — `prayer.ts` measured it; the comment
 * here used to say "a few hours".
 */
export function nightPolygon(date: Date): Feature<Polygon> | null {
  // Night lies on the far side of the terminator from the sub-solar latitude.
  return hemisphere(date, -1)
}

/**
 * The lit hemisphere — the same terminator ring, closed over the other pole.
 *
 * Needed because the night overlay cannot be seen over water. It is black at
 * 0.28 and the ocean is `#080a0d`, whose luminance is 0.003: darkening that
 * moves it by about two values out of 255. So the terminator read across the
 * land and stopped dead at the coast, which made day and night look like a
 * property of continents rather than of the planet.
 *
 * Darkening the night side further is not available — there is no room below
 * near-black. Lightening the *day* side is, and it costs nothing on land
 * because the land layer is drawn on top of this one. The ocean gets a visible
 * terminator; `--map-ground` and the CSS seam that depends on it are untouched.
 */
export function dayPolygon(date: Date): Feature<Polygon> | null {
  // The mirror of `nightPolygon`: day closes over the pole the sun is on.
  return hemisphere(date, +1)
}

/**
 * The terminator as an open curve, for the twilight band drawn along it.
 *
 * ── Why the shade needed one at all ───────────────────────────────────────
 *
 * `night-shade` is a single fill at 0.28 with a hard boundary, so the map's
 * entire lighting model is a **step function**: every point on the night side
 * is darkened by exactly the same amount, and the change from day to night
 * happens across zero degrees. A sphere lit by a step does not read as a lit
 * sphere; it reads as a disc with a shape painted on it, which is most of why
 * the globe felt flat while every individual layer measured correctly.
 *
 * ── Why a band and not a stack of caps ────────────────────────────────────
 *
 * The obvious fix is the real one: draw civil, nautical and astronomical
 * twilight as their own regions at −6°, −12° and −18°. Each of those is a
 * spherical cap of radius `90° − |alt|` around the antisolar point, and the
 * walk above can only express a cap that **spans every longitude**, which needs
 * `|declination| >= |alt|`. The sun clears 18° of declination for about two
 * months a year and 12° for about five. So a stack of caps built this way would
 * appear and disappear with the season — the night side visibly changing
 * darkness through the year, for a reason no reader could ever recover. Drawing
 * them properly means true geodesic caps split at the antimeridian, which is
 * the failure `prayer.ts` records as a bar across the whole map, and it is a
 * larger piece of work than the thing it fixes.
 *
 * A blurred band laid *along* the terminator gets the ramp with none of that:
 * the curve always exists (outside the twelve-second equinox window the walk
 * already returns null for), it needs no new spherical geometry, and if it ever
 * fails to draw the shade underneath is exactly what shipped before it.
 *
 * ── Why it lightens ───────────────────────────────────────────────────────
 *
 * The same argument `dayPolygon` above makes about water, applied to the edge
 * instead of the hemisphere: there is no room below near-black, so the ramp has
 * to be cut *upward* out of the night rather than downward into the day. Deep
 * night is therefore untouched at 0.28 and every measurement taken against it
 * still holds; what changes is the twenty degrees or so nearest the terminator.
 *
 * `side` carries the offset's sign, because the band belongs on the dark side
 * and which side that is flips with the season. The walk runs west to east and
 * MapLibre offsets a line to the **right** of its direction of travel, which is
 * south — so northern summer, whose night cap is the southern one, offsets
 * positive. Getting this backwards lights the lit half a second time, silently,
 * which is the failure `hemisphere` already keeps a test for.
 */
export function terminatorBand(date: Date): Feature<LineString> | null {
  const sun = subsolarPoint(date)
  const ring = terminatorRing(sun)
  if (!ring) return null
  return {
    type: 'Feature',
    properties: { side: sun.lat >= 0 ? 1 : -1 },
    geometry: { type: 'LineString', coordinates: ring },
  }
}
