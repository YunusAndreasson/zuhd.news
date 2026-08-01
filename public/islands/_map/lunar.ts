// The moon: where it is, how far, and how much of it is lit.
//
// **The library is a test oracle, not an import.** That is the rule
// `prayer.md` states for adhan-js and the reason is the same here: the whole of
// what this map needs from the moon is three numbers, the closed form for them
// is published, and `astronomy-engine` is ~100 KB minified against a map island
// that is 40 KB gzipped in total. It sits in `devDependencies`, and
// `map-geo.test.js` compares every function below against it across a decade of
// sampled instants — which is a stronger guarantee than importing it, and costs
// the reader nothing.
//
// Meeus, *Astronomical Algorithms*, 2nd ed., chapter 47, tables 47.A and 47.B,
// transcribed whole. The tables are the accuracy: they are worth about 10″ in
// longitude and 4″ in latitude, and truncating them was considered and dropped,
// because a truncation is a number somebody has to defend on every future
// reading of this file while the full table is simply the published thing.
//
// What is deliberately left out: nutation in longitude (±17″, which is 0.005°
// and a sixth of a pixel at the sky's scale at the limb) and light-time
// (~1.25 s of the moon's own motion, far below that). Topocentric parallax is
// *not* left out and is not optional — see `_map/sky.ts`, where the camera's own
// position is subtracted. It reaches 2°, which is 56 px.

import { daysSinceJ2000, obliquity, subpoint } from './solar'

const DEG = Math.PI / 180

/** Table 47.A — arguments D, M, M′, F, then Σl (1e-6 deg) and Σr (1e-3 km). */
const TERMS_LR: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950],
  [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616],
  [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117],
  [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423],
  [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571],
  [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
  [2, 0, -1, -2, 0, 8752],
]

/** Table 47.B — arguments D, M, M′, F, then Σb (1e-6 deg). */
const TERMS_B: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
]

export interface MoonPosition {
  /** Geocentric right ascension, degrees. */
  ra: number
  /** Geocentric declination, degrees. */
  dec: number
  /** Geocentric distance, kilometres. */
  km: number
  /** Apparent angular diameter from the earth's centre, degrees. */
  diameter: number
  /** Where the moon is directly overhead. */
  sub: { lat: number; lng: number }
}

/**
 * The moon's geocentric position, from the tables above.
 *
 * `E` is the eccentricity correction, applied once per power of the sun's mean
 * anomaly in a term's argument — Meeus is explicit that terms in M get one
 * factor and terms in 2M get two, and getting it wrong is a slow drift nothing
 * on screen would report.
 */
export function moonPosition(date: Date): MoonPosition {
  const n = daysSinceJ2000(date)
  const t = n / 36525

  const lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t +
    (t * t * t) / 538841 - (t * t * t * t) / 65194000
  const d = 297.8501921 + 445267.1114034 * t - 0.0018819 * t * t +
    (t * t * t) / 545868 - (t * t * t * t) / 113065000
  const m = 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t +
    (t * t * t) / 24490000
  const mp = 134.9633964 + 477198.8675055 * t + 0.0087414 * t * t +
    (t * t * t) / 69699 - (t * t * t * t) / 14712000
  const f = 93.2720950 + 483202.0175233 * t - 0.0036539 * t * t -
    (t * t * t) / 3526000 + (t * t * t * t) / 863310000

  const a1 = 119.75 + 131.849 * t
  const a2 = 53.09 + 479264.290 * t
  const a3 = 313.45 + 481266.484 * t
  const e = 1 - 0.002516 * t - 0.0000074 * t * t

  let sumL = 0
  let sumR = 0
  for (const [cd, cm, cmp, cf, cl, cr] of TERMS_LR) {
    const arg = (cd * d + cm * m + cmp * mp + cf * f) * DEG
    const ecc = cm === 0 ? 1 : e ** Math.abs(cm)
    sumL += cl * ecc * Math.sin(arg)
    sumR += cr * ecc * Math.cos(arg)
  }
  let sumB = 0
  for (const [cd, cm, cmp, cf, cb] of TERMS_B) {
    const arg = (cd * d + cm * m + cmp * mp + cf * f) * DEG
    const ecc = cm === 0 ? 1 : e ** Math.abs(cm)
    sumB += cb * ecc * Math.sin(arg)
  }

  // The additive terms, from Venus (A1), Jupiter (A2) and the earth's flattening.
  sumL += 3958 * Math.sin(a1 * DEG) + 1962 * Math.sin((lp - f) * DEG) +
    318 * Math.sin(a2 * DEG)
  sumB += -2235 * Math.sin(lp * DEG) + 382 * Math.sin(a3 * DEG) +
    175 * Math.sin((a1 - f) * DEG) + 175 * Math.sin((a1 + f) * DEG) +
    127 * Math.sin((lp - mp) * DEG) - 115 * Math.sin((lp + mp) * DEG)

  const lambda = (lp + sumL / 1e6) * DEG
  const beta = (sumB / 1e6) * DEG
  const km = 385000.56 + sumR / 1000

  const eps = obliquity(n)
  const sinB = Math.sin(beta)
  const cosB = Math.cos(beta)
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps),
    Math.cos(lambda),
  )
  const dec = Math.asin(sinB * Math.cos(eps) + cosB * Math.sin(eps) * Math.sin(lambda))

  const raDeg = ((ra / DEG) % 360 + 360) % 360
  const decDeg = dec / DEG

  return {
    ra: raDeg,
    dec: decDeg,
    km,
    // 3474.8 km across. The apparent diameter runs 29.4′ to 33.5′ over a month
    // and the map draws it, because a supermoon is a real 14% and free.
    diameter: 2 * Math.atan(1737.4 / km) / DEG,
    sub: subpoint(raDeg, decDeg, n),
  }
}

/**
 * How much of the moon's disc is lit, and which way the lit side faces.
 *
 * `fraction` is Meeus 48.1–48.3: the elongation from the sun, then the phase
 * angle at the moon from the sun–earth–moon triangle, then `(1 + cos i)/2`. It
 * is **not** derivable from the elongation alone — the earth is not at the
 * centre of the moon's illumination geometry, and treating it as though it were
 * puts the quarters a few hours out.
 *
 * `waxing` is the sign of the moon's elongation east of the sun, which is what
 * says whether the lit limb is the leading or the trailing one. The map does
 * not use it to place the terminator (that comes out of the sun's direction
 * vector directly, in `_map/sky.ts`) — it uses it to name the phase in words,
 * where "waxing crescent" and "waning crescent" are the same picture.
 */
export function moonIllumination(
  moon: { ra: number; dec: number; km: number },
  sun: { ra: number; dec: number; au: number },
) {
  const sunKm = sun.au * 149597870.7
  const dRa = (sun.ra - moon.ra) * DEG
  const cosPsi =
    Math.sin(sun.dec * DEG) * Math.sin(moon.dec * DEG) +
    Math.cos(sun.dec * DEG) * Math.cos(moon.dec * DEG) * Math.cos(dRa)
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)))
  const i = Math.atan2(sunKm * Math.sin(psi), moon.km - sunKm * Math.cos(psi))
  const fraction = (1 + Math.cos(i)) / 2

  // Elongation east of the sun, wrapped to (−180, 180]. Positive is waxing.
  const elong = (((moon.ra - sun.ra + 540) % 360) - 180)
  return { fraction, waxing: elong > 0, elongation: psi / DEG }
}

/** The phase, in the words a reader uses for it. */
export function moonPhaseName(fraction: number, waxing: boolean): string {
  if (fraction < 0.02) return 'new moon'
  if (fraction > 0.98) return 'full moon'
  if (fraction < 0.45) return waxing ? 'waxing crescent' : 'waning crescent'
  if (fraction < 0.55) return waxing ? 'first quarter' : 'last quarter'
  return waxing ? 'waxing gibbous' : 'waning gibbous'
}
