// Solar geometry, and the night polygon it produces.
//
// The day/night terminator is the one layer on the map that is not news: it
// says what time it is where the news is happening, which is most of what makes
// a coordinate feel like a place rather than a dot. The canvas map drew it by
// hand; MapLibre wants it as geometry, so the same equations now emit a polygon
// instead of a stroke.

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
 * The unlit hemisphere as a single GeoJSON polygon.
 *
 * Walking the terminator west to east gives its southern or northern edge; the
 * shape is then closed along whichever pole is currently in darkness. Which
 * pole that is flips with the season — in northern summer the sun never sets
 * over the Arctic, so the night cap is the *southern* one — and getting it
 * backwards lights the wrong half of the planet.
 *
 * At an equinox `terminatorLat` degenerates, and the honest answer is to draw
 * nothing for the few hours it takes the declination to move off zero.
 */
export function nightPolygon(date: Date): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const sun = subsolarPoint(date)
  const probe = terminatorLat(0, sun)
  if (probe === null) return null

  const ring: Array<[number, number]> = []
  for (let lng = -180; lng <= 180; lng += 1) {
    const lat = terminatorLat(lng, sun)
    if (lat === null) return null
    ring.push([lng, Math.max(-89.9, Math.min(89.9, lat))])
  }

  // Night lies on the far side of the terminator from the sub-solar latitude.
  const nightPole = sun.lat >= 0 ? -90 : 90
  ring.push([180, nightPole], [-180, nightPole], ring[0])

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}
