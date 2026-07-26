// The five prayers, as lines on a globe.
//
// The map already draws where the sun is. This draws what the sun *means*: at
// any instant the set of places where a given prayer is entering is a curve,
// and five of them sweeping west is the earth as a prayer clock. Maghrib is
// drawn on the terminator's own sunset limb, so the new lines are tied to the
// day and night the reader can already see rather than floating over it.
//
// ── Why the fiqh library is a test dependency and not an import ────────────
//
// adhan-js (Batoul Apps) answers "what time is Fajr at this place". This module
// needs the inverse — "where on earth is Fajr entering right now" — and the
// inverse has a closed form, so inverting adhan per latitude would be more code
// for a worse answer. Three reasons it is worse, in ascending order of weight:
//
//   1. adhan rounds to the nearest minute. A minute is 0.25° of longitude, so
//      the curve would come out as a staircase.
//   2. It reads the calendar day from a `Date`'s *local* components, which
//      makes every call site a timezone trap for the sake of an argument this
//      module already knows exactly.
//   3. Its high-latitude rule substitutes a synthetic time rather than
//      reporting that no such solar moment exists. On a map that is not a
//      convenience, it is a false statement: it would keep drawing a Fajr line
//      across the Arctic in June, through latitudes where the sun does not go
//      18.5° down at all. Here the solution simply ceases to exist and the line
//      ends, which is the truth and is also legible — you can watch the line
//      retreat from the pole as the season turns.
//
// So adhan stays in `devDependencies` and `map-geo.test.js` pins every curve
// against it to within 20 seconds. That is a stronger guarantee than importing
// it would be, and it costs the reader nothing.

// Type-only, so esbuild erases it — see the same note in `solar.ts`.
import type { Feature, MultiLineString, Position } from 'geojson'
import { subsolarPoint } from './solar'

const DEG = Math.PI / 180

/**
 * How a school reads the sky.
 *
 * A parameter rather than a constant because which method a site follows is an
 * editorial claim, and one stated in a named object is one a reader of this
 * file can find. `ishaAngle: null` means the method sets Isha by the clock
 * instead of by the sun.
 */
export interface PrayerParams {
  /** Degrees the sun stands below the horizon at Fajr. */
  fajrAngle: number
  /** Degrees below the horizon at Isha, or `null` if Isha is an interval. */
  ishaAngle: number | null
  /** Minutes after Maghrib, used only when `ishaAngle` is null. */
  ishaIntervalMin: number
  /** Asr enters when an object's shadow exceeds its noon shadow by this much. */
  shadowLength: number
  /**
   * Sunset is the disc's upper limb touching the horizon, not its centre
   * crossing the geometric one — refraction and the solar radius put it about
   * 50 arcminutes lower. This is why the Maghrib line sits a little *outside*
   * the terminator `solar.ts` draws, which is computed at a flat 0°. The two
   * are not meant to coincide.
   */
  horizon: number
}

/**
 * Umm al-Qura — Fajr at 18.5°, Isha ninety minutes after Maghrib, Asr at a
 * shadow length of one.
 *
 * The same authority the map's Hijri date keeps and the same zone its three
 * clocks read (see `hijri.ts` and `MAKKAH_TZ`). No single method is right
 * everywhere and every method is a claim; the point is that this site makes
 * one claim rather than two. The legend names it — see `PRAYER_NOTE`.
 */
export const UMM_AL_QURA: PrayerParams = {
  fajrAngle: 18.5,
  ishaAngle: null,
  ishaIntervalMin: 90,
  shadowLength: 1,
  horizon: -0.833,
}

/** The five, in the order of the day. */
export const PRAYERS = [
  { id: 'fajr', name: 'Fajr' },
  { id: 'dhuhr', name: 'Dhuhr' },
  { id: 'asr', name: 'Asr' },
  { id: 'maghrib', name: 'Maghrib' },
  { id: 'isha', name: 'Isha' },
] as const

export type PrayerId = (typeof PRAYERS)[number]['id']

/** On the legend's `title`, the way `HIJRI_NOTE` sits on the Hijri date. */
export const PRAYER_NOTE =
  'Fajr, Dhuhr, Asr, Maghrib and Isha where each is entering now, by ' +
  'Umm al-Qura — the calendar this map already keeps. Asr at a shadow length ' +
  'of one. A line stops where the prayer has no time: beyond it the sun never ' +
  'reaches that angle.'

/**
 * Where the curve is walked, and how finely.
 *
 * `MAX_LAT` is the Web Mercator limit, so the lines end at the map's own edge
 * rather than at a number of our choosing. `MAX_CHORD` is the reason the walk
 * is adaptive: near the poles these curves run nearly east-west, and a flat 1°
 * latitude step there moves up to **31° of longitude** — a chord straight
 * across the Arctic, which reads as a drawing error rather than as a prayer.
 * Bisecting only where the chord is too long costs nothing everywhere else.
 */
const MAX_LAT = 85.05
const LAT_STEP = 1
const MAX_CHORD = 2
const MAX_DEPTH = 7
/** Bisections used to find the latitude at which a prayer stops occurring. */
const EDGE_STEPS = 12

const wrapLng = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

/** The short way round between two longitudes — never the 358° reading. */
const arc = (a: number, b: number) => {
  const d = Math.abs(b - a)
  return d > 180 ? 360 - d : d
}

/**
 * The altitude the sun stands at when Asr enters, at this latitude.
 *
 * `cot(alt) = shadowLength + tan|lat − declination|`, which is adhan's
 * `SolarTime.afternoon` written out. The absolute difference is the sun's
 * zenith distance at noon, so the term is the noon shadow the rule measures
 * from.
 */
export function asrAltitude(lat: number, dec: number, shadowLength: number): number {
  return Math.atan(1 / (shadowLength + Math.tan(Math.abs(lat - dec) * DEG))) / DEG
}

/** The sun's altitude at local noon — the highest it gets that day. */
const noonAltitude = (lat: number, dec: number) => 90 - Math.abs(lat - dec)

/**
 * The longitude where the sun stands at `altDeg`, at this latitude, now.
 *
 * `sin(alt) = sin φ sin δ + cos φ cos δ cos H` solved for the hour angle, which
 * is the whole of it: the hour angle *is* the offset from the sub-solar
 * meridian, so the answer is a longitude directly. `null` when `|cos H| > 1` —
 * the sun does not reach that altitude at that latitude today, which is exactly
 * the polar case, and the honest answer is no point rather than a substitute.
 */
export function prayerLongitude(
  sun: { lat: number; lng: number },
  lat: number,
  altDeg: number,
  afternoon: boolean,
): number | null {
  const cosH =
    (Math.sin(altDeg * DEG) - Math.sin(lat * DEG) * Math.sin(sun.lat * DEG)) /
    (Math.cos(lat * DEG) * Math.cos(sun.lat * DEG))
  if (!(cosH >= -1 && cosH <= 1)) return null
  const H = Math.acos(cosH) / DEG
  return wrapLng(sun.lng + (afternoon ? H : -H))
}

type Solve = (lat: number) => number | null

/** One prayer's rule, as a function of latitude, for a fixed instant. */
function solverFor(id: PrayerId, at: Date, params: PrayerParams): Solve {
  const sun = subsolarPoint(at)

  if (id === 'dhuhr') {
    // Solar noon is the sub-solar meridian at every latitude, so this is a
    // straight line of longitude — but only where there is a noon to have. It
    // goes through the same walk as the others so that it stops at the polar
    // night the same way they do.
    return (lat) => (noonAltitude(lat, sun.lat) > params.horizon ? sun.lng : null)
  }

  if (id === 'fajr') return (lat) => prayerLongitude(sun, lat, -params.fajrAngle, false)

  if (id === 'asr') {
    return (lat) => {
      // Beyond 90° of separation the noon sun is below the horizon and the
      // shadow rule inverts: `tan` goes negative, the reciprocal comes back a
      // negative altitude, and the solve below would hand back a plausible
      // longitude for a prayer that has no time there at all.
      if (Math.abs(lat - sun.lat) >= 90) return null
      if (noonAltitude(lat, sun.lat) <= params.horizon) return null

      // The rule measures from the shadow an object casts *at noon*, so the
      // declination it wants is the one at that place's noon, not the one now
      // three or four hours later. One pass is enough: the provisional hour
      // angle gives the longitude, the longitude gives when that meridian had
      // its noon, and a second pass moves the answer by less than the width of
      // the line.
      //
      // This is the one place the curves and adhan deliberately part company,
      // by up to about two minutes — 0.5° of longitude, two pixels at world
      // zoom. `SolarTime` builds its solar coordinates at **0h UT of the local
      // calendar day** and `afternoon()` reads the declination straight off
      // them, so adhan's shadow rule is anchored up to twelve hours from the
      // prayer it is describing. (Measured: the sun's altitude at adhan's Asr
      // is explained several times better by the shadow rule at the 0h UT
      // declination than by the same rule at the declination at Asr itself.
      // `map-geo.test.js` pins both that and this, so the gap stays a known
      // quantity rather than a mystery.)
      //
      // Matching it exactly is not available and would not be wanted: which
      // calendar day a place is on changes *along* this curve, so anchoring to
      // 0h UT of the local day would step the declination by 0.4° at the date
      // line and put a visible kink in the middle of the Pacific. A table for
      // one city can afford that; a locus across the whole planet cannot.
      const provisional = prayerLongitude(
        sun,
        lat,
        asrAltitude(lat, sun.lat, params.shadowLength),
        true,
      )
      if (provisional === null) return null
      const hours = wrapLng(provisional - sun.lng) / 15
      const noonDec = subsolarPoint(new Date(at.getTime() - hours * 3_600_000)).lat
      return prayerLongitude(sun, lat, asrAltitude(lat, noonDec, params.shadowLength), true)
    }
  }

  if (id === 'maghrib') return (lat) => prayerLongitude(sun, lat, params.horizon, true)

  // Isha. An angle makes it a curve of its own; an interval makes it the
  // Maghrib curve of ninety minutes ago — the same sunset, still travelling
  // west, drawn where it was. Both are exact; neither is an approximation of
  // the other.
  const ishaAngle = params.ishaAngle
  if (ishaAngle !== null) {
    return (lat) => prayerLongitude(sun, lat, -ishaAngle, true)
  }
  const earlier = subsolarPoint(new Date(at.getTime() - params.ishaIntervalMin * 60_000))
  return (lat) => prayerLongitude(earlier, lat, params.horizon, true)
}

/**
 * When this prayer enters at a place — the curve read the other way.
 *
 * The lines say *where* a prayer is entering now; a pointer resting on one is
 * asking the neighbouring question, *when* does it enter here. That is the same
 * equation solved for time instead of longitude, and it converges immediately
 * because the answer's derivative is essentially a constant: the line sweeps
 * west at 15° an hour, so a line standing at `on` when we want it at `lng`
 * wants `(on − lng) / 15` hours. Three passes is well past enough; the only
 * thing the later ones are correcting is the declination's drift over the
 * minutes moved, which is why one would nearly do.
 *
 * The difference is wrapped, so the answer is the *nearest* occurrence rather
 * than one a day out — which is what a reader pointing at a line means.
 *
 * `null` when the prayer has no time at that latitude, the same as everywhere
 * else here.
 */
export function prayerInstantAt(
  at: Date,
  id: PrayerId,
  lat: number,
  lng: number,
  params: PrayerParams = UMM_AL_QURA,
): number | null {
  let t = at.getTime()
  for (let pass = 0; pass < 3; pass++) {
    const on = solverFor(id, new Date(t), params)(lat)
    if (on === null) return null
    t += (wrapLng(on - lng) / 15) * 3_600_000
  }
  return t
}

type Sample = { lat: number; lng: number }

/**
 * Push `b`, bisecting first if the step between the two would draw a chord.
 *
 * Depth-capped rather than tolerance-only: right at the latitude where a prayer
 * ceases, the longitude runs away faster than any bound can follow, and that
 * happens above 80° where Mercator has already stretched the pixel past
 * meaning. Everywhere a reader is actually looking, one or two bisections is
 * the whole cost.
 */
function refine(solve: Solve, a: Sample, b: Sample, depth: number, out: Sample[]) {
  if (depth >= MAX_DEPTH || arc(a.lng, b.lng) <= MAX_CHORD) {
    out.push(b)
    return
  }
  const lat = (a.lat + b.lat) / 2
  const lng = solve(lat)
  if (lng === null) {
    out.push(b)
    return
  }
  const mid = { lat, lng }
  refine(solve, a, mid, depth + 1, out)
  refine(solve, mid, b, depth + 1, out)
}

/** The last latitude at which the prayer still has a time, by bisection. */
function edgeSample(solve: Solve, valid: Sample, beyond: number): Sample {
  let lo = valid.lat
  let hi = beyond
  let best = valid
  for (let i = 0; i < EDGE_STEPS; i++) {
    const lat = (lo + hi) / 2
    const lng = solve(lat)
    if (lng === null) hi = lat
    else {
      lo = lat
      best = { lat, lng }
    }
  }
  return best
}

/** Every latitude the coarse walk visits, both map edges included. */
function walkLatitudes(): number[] {
  const lats: number[] = []
  for (let lat = -MAX_LAT; lat < MAX_LAT; lat += LAT_STEP) lats.push(lat)
  lats.push(MAX_LAT)
  return lats
}

/** Walk the curve pole to pole, adaptively, stopping where it stops. */
function trace(solve: Solve): Sample[][] {
  const lats = walkLatitudes()
  const runs: Sample[][] = []
  let run: Sample[] = []
  let prev: Sample | null = null

  for (let i = 0; i < lats.length; i++) {
    const lat = lats[i]
    const lng = solve(lat)

    if (lng === null) {
      // The prayer has just run out. Find where, so the line ends at the
      // latitude it really ends at rather than up to a degree short of it.
      if (prev) {
        refine(solve, prev, edgeSample(solve, prev, lat), 0, run)
        runs.push(run)
        run = []
        prev = null
      }
      continue
    }

    const here = { lat, lng }
    if (prev) {
      refine(solve, prev, here, 0, run)
    } else {
      // Opening a run. If there is a latitude below this one it was a gap, so
      // reach back into it for the real start the same way.
      const start = i > 0 ? edgeSample(solve, here, lats[i - 1]) : here
      run = [start]
      if (start.lat !== here.lat) refine(solve, start, here, 0, run)
    }
    prev = here
  }

  if (run.length) runs.push(run)
  return runs.filter((r) => r.length > 1)
}

/**
 * Cut a run wherever it crosses the antimeridian, landing a vertex on each
 * edge.
 *
 * These curves are functions of latitude, so unlike the terminator ring they do
 * cross ±180 — and `renderWorldCopies` is off, so an uncut segment is not drawn
 * the short way round, it is drawn straight back across the entire map as a
 * horizontal bar. The interpolated vertices are what make the two halves meet
 * the frame instead of stopping a degree short of it.
 */
function splitAtAntimeridian(run: Sample[]): Position[][] {
  const parts: Position[][] = []
  let part: Position[] = [[run[0].lng, run[0].lat]]

  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]
    const b = run[i]
    const d = b.lng - a.lng
    if (Math.abs(d) <= 180) {
      part.push([b.lng, b.lat])
      continue
    }
    // Unwrap b onto a's side, find where the straight run meets the edge.
    const edgeA = d > 180 ? -180 : 180
    const unwrapped = d > 180 ? b.lng - 360 : b.lng + 360
    const t = (edgeA - a.lng) / (unwrapped - a.lng)
    const lat = a.lat + t * (b.lat - a.lat)
    part.push([edgeA, lat])
    parts.push(part)
    part = [[-edgeA, lat], [b.lng, b.lat]]
  }

  parts.push(part)
  return parts.filter((p) => p.length > 1)
}

/**
 * The five prayer lines for an instant.
 *
 * One feature per prayer, `MultiLineString` because a curve can be broken twice
 * over — once by the antimeridian and once by a pole where the prayer has no
 * time. `properties.id` is what `promoteId` hangs feature state off, so hover
 * addresses a whole prayer rather than a segment of one.
 */
export function prayerLines(at: Date, params: PrayerParams = UMM_AL_QURA): Feature<MultiLineString>[] {
  const out: Feature<MultiLineString>[] = []

  for (const prayer of PRAYERS) {
    const solve = solverFor(prayer.id, at, params)
    const coordinates = trace(solve).flatMap(splitAtAntimeridian)
    if (!coordinates.length) continue
    out.push({
      type: 'Feature',
      properties: { id: prayer.id, name: prayer.name },
      geometry: { type: 'MultiLineString', coordinates },
    })
  }

  return out
}
