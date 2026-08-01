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
import type { Feature, Polygon } from 'geojson'

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
function hemisphere(date: Date, side: 1 | -1): Feature<Polygon> | null {
  const sun = subsolarPoint(date)
  if (terminatorLat(0, sun) === null) return null

  const ring: Array<[number, number]> = []
  for (let lng = -180; lng <= 180; lng += 1) {
    const lat = terminatorLat(lng, sun)
    if (lat === null) return null
    ring.push([lng, Math.max(-89.9, Math.min(89.9, lat))])
  }

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
