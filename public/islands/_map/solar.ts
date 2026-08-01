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
 * Sub-solar point (the coordinate where the sun is directly overhead) using the
 * NOAA low-precision solar position equations. Good to a fraction of a degree,
 * which is far beyond what a terminator drawn at 1° steps can show.
 */
export function subsolarPoint(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0

  const meanLong = (280.46 + 0.9856474 * n) % 360
  const meanAnom = ((357.528 + 0.9856003 * n) % 360) * DEG
  const eclipticLong =
    (meanLong + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * DEG
  const obliquity = (23.439 - 0.0000004 * n) * DEG

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLong))
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLong),
    Math.cos(eclipticLong),
  )

  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24
  let lng = rightAscension / DEG - gmstHours * 15
  lng = ((((lng + 180) % 360) + 360) % 360) - 180

  return { lat: declination / DEG, lng }
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
