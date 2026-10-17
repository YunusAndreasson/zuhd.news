// The sun's position, for the web map and the app's globe alike.
//
// Moved out of `public/islands/_map/solar.ts` so the app draws its terminator,
// city lights and prayer lines from the same sun the web does: two
// approximations of one sun put the Maghrib line on one side of the terminator
// in one surface and across it in the other.

const DEG = Math.PI / 180

/**
 * Days since J2000.0 (2000-01-01 12:00 UT), the argument every series below is
 * written in terms of.
 *
 * Extracted from `subsolarPoint`, where it and the three functions under it sat
 * inline. Nothing about them is solar — the sidereal frame the sky is drawn in
 * and the sub-point of any body need exactly these, and the alternative to
 * naming them here was a second copy (there was once a `lunar.ts` that needed
 * them) with no way for a test to notice the two had parted. That is the failure this
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
