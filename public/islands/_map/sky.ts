// The sky around the globe: the camera it is drawn against, and the projection
// that makes it visible at all.
//
// ── The measurement this whole file exists to answer ─────────────────────────
//
// MapLibre's globe camera sits about 3.2 earth radii out with a 36.9° vertical
// field of view, so the earth's disc subtends ~36.8° and **the only sky on
// screen is the margin around the disc**. Measured against the built canvas
// (1176x913 at 1920, disc radius 456px) that is **4.8° of sky at the sides and
// 10.1° at the corners — 1.3% of the celestial sphere.**
//
// At true scale that annulus holds about twenty stars to magnitude 5, and the
// sun and moon reach it only when their sub-point is near the antipode of the
// map's centre: the sun for roughly twenty minutes a night, a few weeks a year.
// Correct, and invisible. A sky drawn at true scale is a sky nobody sees.
//
// ── What is compressed, and what is not ──────────────────────────────────────
//
// Three things stay exact, and they are what make this honest rather than
// decorative:
//
//   **Bearing.** Where a body sits *around* the disc is untouched. That is the
//   encoding a reader actually reads off a sky.
//
//   **Occultation.** A body goes behind the limb at the true instant and comes
//   back on the true side. This is free rather than arranged: the sky canvas is
//   painted *behind* MapLibre's, which is transparent outside the limb and
//   opaque on the planet, so the globe mesh occludes the sky in hardware.
//
//   **Scale at the limb itself.** `skyRadius` is `rLimb + a·ln(1 + (α−αLimb)/b)`
//   with `a/b` set to the true perspective scale at the limb, so for the first
//   `SKY_KNEE` degrees off the limb the sky is drawn at true scale — a moon
//   rising over the edge of the earth moves at the right rate and is the right
//   size against it. Only further out does it compress.
//
// What is given up, and the legend says so: **star patterns stretch radially
// with distance from the earth.** Near the limb Orion is right; in the corner
// it is squashed. This is the same bargain a solar-system diagram makes — true
// bodies, compressed distances — and the same bargain this map already makes
// with `GLOBE_FIT`, stated rather than hidden.
//
// Nothing beyond `SKY_SPAN` from the view axis is drawn. Past 90° a body is
// level with or behind the camera, and putting it in a corner of the frame
// would be a claim about direction that is false — the difference between
// compressing a sky and inventing one.

const DEG = Math.PI / 180

/**
 * How wide a band next to the limb is drawn at true scale, in degrees.
 *
 * This is the knee of the logarithm and it is the only tuning number here that
 * is a judgement rather than a measurement. At 3° the first ~85px past the limb
 * on a desktop are honest, which covers a rising moon (0.52° across) with room
 * on both sides, and the whole 90° of sky still lands inside the corner.
 */
export const SKY_KNEE = 3

/**
 * How much sky is drawn, measured from the view axis. 90° is the sky *beyond*
 * the earth — the hemisphere of the celestial sphere on the far side of the
 * camera. See the header for why there is no more than this.
 */
export const SKY_SPAN = 90

/** The last few degrees of `SKY_SPAN` fade rather than ending on an edge. */
export const SKY_EDGE_FADE = 12

/**
 * What the sky is doing, said in one sentence on every card it opens.
 *
 * The same job `PRAYER_NOTE` and `HIJRI_NOTE` do for the two other things on
 * this map that are computed rather than fetched: name the method, because a
 * drawing that is exact in some channels and compressed in one is a drawing a
 * reader is entitled to be told about. Without this the sky is a claim about
 * distances that it does not keep.
 */
export const SKY_NOTE =
  'Positions, sizes and the moment a body goes behind the earth are true. ' +
  'Distance out from the limb is compressed — exact for the first few degrees, ' +
  'then logarithmic, so the whole near sky fits the margin around the globe.'

/**
 * The camera, solved from what MapLibre actually drew.
 *
 * Deliberately **not** read off `transform.fov` / `cameraToCenterDistance`,
 * which are internals: this file would then carry a copy of MapLibre's globe
 * sizing and go quietly wrong on the version bump that changed it. Everything
 * below comes out of two calls to the public `map.project`.
 */
export interface SkyCamera {
  /** Focal length in CSS px — a direction α off the axis lands at `f·tan α`. */
  f: number
  /** Camera distance from the earth's centre, in earth radii. */
  d: number
  /** The earth's angular radius seen from the camera, radians. */
  limb: number
  /** Disc centre on screen. */
  cx: number
  cy: number
  /** Drawn radius of the disc, px. */
  r: number
  /** Screen unit vector for "east at the map centre". */
  east: readonly [number, number]
  /** Screen unit vector for "north at the map centre". */
  north: readonly [number, number]
}

export type Project = (lngLat: [number, number]) => { x: number; y: number }

/**
 * Solve `f` and `d` from two points whose angular distance from the map centre
 * we chose.
 *
 * A surface point θ from the sub-camera point is drawn at `r = f·sin θ/(d−cos θ)`.
 * Two samples give two equations in two unknowns and a closed solution. A third
 * sample is then *predicted* and checked: if the residual is more than a pixel
 * the camera is not a sphere camera — which is exactly what happens once the
 * projection starts interpolating toward Mercator — and this returns null so
 * nothing is drawn rather than being drawn somewhere plausible and wrong.
 *
 * The samples walk *away* from the nearer pole so a 60° step cannot run over
 * it, and they are taken along the centre's own meridian, where the walk is a
 * pure latitude offset and no bearing arithmetic is needed.
 */
export function calibrate(
  project: Project,
  centre: [number, number],
  bearing: number,
  pitch: number,
): SkyCamera | null {
  // Bearing and pitch are both fixed at 0 on this map (`dragRotate` and
  // `pitchWithRotate` are off and touch rotation is disabled), and the screen
  // basis below is measured rather than assumed — but a camera that has been
  // tilted is one whose disc centre is no longer `project(getCenter())`, and
  // there is no cheap way to find it. Draw nothing instead.
  if (bearing !== 0 || pitch !== 0) return null

  const [lng, lat] = centre
  const away = lat >= 0 ? -1 : 1
  const sample = (theta: number) => {
    const p = project([lng, lat + away * theta])
    return p
  }

  const origin = project(centre)
  const radius = (theta: number) => {
    const p = sample(theta)
    return Math.hypot(p.x - origin.x, p.y - origin.y)
  }

  const t1 = 20
  const t2 = 60
  const t3 = 40
  const r1 = radius(t1)
  const r2 = radius(t2)
  const s1 = Math.sin(t1 * DEG)
  const c1 = Math.cos(t1 * DEG)
  const s2 = Math.sin(t2 * DEG)
  const c2 = Math.cos(t2 * DEG)

  const den = r1 * s2 - r2 * s1
  if (!Number.isFinite(den) || Math.abs(den) < 1e-9) return null
  const d = (r1 * s2 * c1 - r2 * s1 * c2) / den
  if (!Number.isFinite(d) || d <= 1.0001) return null
  const f = (r1 * (d - c1)) / s1
  if (!Number.isFinite(f) || f <= 0) return null

  const predicted = (f * Math.sin(t3 * DEG)) / (d - Math.cos(t3 * DEG))
  if (Math.abs(predicted - radius(t3)) > 1.5) return null

  // The screen basis, measured rather than derived.
  //
  // Only *north* is measured, because only a latitude step is exactly a
  // direction: it runs along the centre's own meridian, which is due north by
  // construction. A longitude step runs along a parallel, which is not a great
  // circle, and at this map's home latitude a half-degree of it comes out 0.1°
  // off due east — small, and small errors in a basis are the ones that get
  // written down as correct.
  //
  // East is then north turned a quarter turn on screen, which is exact for a
  // camera with no bearing and no pitch (both refused above). Its *sign* is the
  // one thing still worth measuring, since which way round the turn goes
  // depends on the y-axis pointing down, and a hemisphere-dependent guess here
  // is how a sky comes out mirrored for half the planet.
  const stepLat = lat >= 0 ? -0.25 : 0.25
  const np = project([lng, lat + stepLat])
  const ndx = (np.x - origin.x) * (stepLat < 0 ? -1 : 1)
  const ndy = (np.y - origin.y) * (stepLat < 0 ? -1 : 1)
  const nlen = Math.hypot(ndx, ndy)
  if (nlen < 1e-6) return null
  const north: [number, number] = [ndx / nlen, ndy / nlen]

  const ep = project([lng + 0.25 / Math.max(0.02, Math.cos(lat * DEG)), lat])
  const turned: [number, number] = [-north[1], north[0]]
  const sign = (ep.x - origin.x) * turned[0] + (ep.y - origin.y) * turned[1] >= 0 ? 1 : -1
  const east: [number, number] = [turned[0] * sign, turned[1] * sign]

  const limb = Math.asin(1 / d)
  return {
    f,
    d,
    limb,
    cx: origin.x,
    cy: origin.y,
    r: f / Math.sqrt(d * d - 1),
    east,
    north,
  }
}

/**
 * Screen radius, in px from the disc centre, for a direction `alpha` radians
 * off the view axis.
 *
 * Exact at `alpha === cam.limb`, and exact in slope there too, which is what
 * makes the band next to the earth read as a photograph rather than a diagram.
 */
export function skyRadius(alpha: number, cam: SkyCamera): number {
  const past = alpha - cam.limb
  if (past <= 0) return cam.r
  // True radial scale at the limb, px per radian: d/dα of f·tan α.
  const slope = cam.f / Math.cos(cam.limb) ** 2
  const knee = SKY_KNEE * DEG
  return cam.r + slope * knee * Math.log(1 + past / knee)
}

/**
 * Px per degree of *angular size* at the limb — the scale a body's own disc is
 * drawn at, everywhere.
 *
 * This is the azimuthal scale (`f·sec α`), not the radial one (`f·sec² α`):
 * gnomonic projection is not conformal and the two differ by 5% at this limb,
 * and a disc is the azimuthal case. Expressed off the *measured* disc radius so
 * it cannot disagree with the earth drawn beside it.
 *
 * A body keeps this size wherever it is drawn, and does not shrink into the
 * compressed sky. Stated as a decision: the compression is of distances, and
 * shrinking the moon with it would make it a second, silent encoding of how far
 * out it is.
 */
export const skyPxPerDegree = (cam: SkyCamera) => (cam.r / Math.sin(cam.limb)) * DEG

/** A celestial direction, placed. */
export interface Placed {
  x: number
  y: number
  /** Radians off the view axis. */
  alpha: number
  /** Behind the earth. */
  hidden: boolean
  /** 0 at the outer edge of the drawn sky, 1 well inside it. */
  edge: number
}

/**
 * The local frame at the map centre, as celestial unit vectors.
 *
 * Everything is done in the equatorial frame of date, because that is the frame
 * the star catalogue precesses into and the frame `subpoint` already inverts.
 * The centre of the map is a direction in it: declination is the latitude, and
 * right ascension is the longitude plus the sidereal time.
 */
export interface SkyFrame {
  /** Zenith at the map centre — also the direction the camera sits along. */
  c: readonly [number, number, number]
  /** East at the map centre. */
  e: readonly [number, number, number]
  /** North at the map centre. */
  n: readonly [number, number, number]
}

const dirOf = (raDeg: number, decDeg: number): [number, number, number] => {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const cd = Math.cos(dec)
  return [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)]
}

export function skyFrame(lat: number, lng: number, gmstHours: number): SkyFrame {
  const ra = lng + gmstHours * 15
  const c = dirOf(ra, lat)
  // North is the pole direction with the zenith component removed; east closes
  // the right-handed triple. At the poles this degenerates and the map cannot
  // reach them (`maxZoom` aside, the camera is never there), so no guard.
  const zc = c[2]
  const nx = -zc * c[0]
  const ny = -zc * c[1]
  const nz = 1 - zc * c[2]
  const nl = Math.hypot(nx, ny, nz) || 1
  const n: [number, number, number] = [nx / nl, ny / nl, nz / nl]
  const e: [number, number, number] = [
    n[1] * c[2] - n[2] * c[1],
    n[2] * c[0] - n[0] * c[2],
    n[0] * c[1] - n[1] * c[0],
  ]
  return { c, e, n }
}

/**
 * Place a celestial direction on the canvas.
 *
 * `dir` is a unit vector in the same equatorial frame as `frame`, already
 * corrected for the camera's own position where that matters — see
 * `parallaxCorrect`, which is not optional for the moon.
 */
export function place(
  dir: readonly [number, number, number],
  cam: SkyCamera,
  frame: SkyFrame,
): Placed | null {
  const uc = dir[0] * frame.c[0] + dir[1] * frame.c[1] + dir[2] * frame.c[2]
  // The view axis is −c, so the angle off it is the angle from the *antipode*
  // of the map centre. A body over the centre is behind the reader's head
  // (α = 180°) and a body over the antipode is behind the earth (α = 0).
  const alpha = Math.acos(Math.max(-1, Math.min(1, -uc)))
  if (alpha >= SKY_SPAN * DEG) return null

  const fadeFrom = (SKY_SPAN - SKY_EDGE_FADE) * DEG
  const span = SKY_SPAN * DEG
  const edge = alpha <= fadeFrom ? 1 : Math.max(0, (span - alpha) / (span - fadeFrom))

  const ue = dir[0] * frame.e[0] + dir[1] * frame.e[1] + dir[2] * frame.e[2]
  const un = dir[0] * frame.n[0] + dir[1] * frame.n[1] + dir[2] * frame.n[2]
  const len = Math.hypot(ue, un)
  // Exactly on the axis — a body directly over the antipode of the map centre,
  // which is dead behind the earth. It has no bearing, so it is placed at the
  // disc centre and reported hidden rather than returned as absent: `hidden`
  // and "not on the sky" are different answers and the caller acts on both.
  if (len < 1e-9) {
    return { x: cam.cx, y: cam.cy, alpha, hidden: alpha < cam.limb, edge }
  }

  const r = skyRadius(alpha, cam)
  const dx = (ue / len) * cam.east[0] + (un / len) * cam.north[0]
  const dy = (ue / len) * cam.east[1] + (un / len) * cam.north[1]
  return {
    x: cam.cx + dx * r,
    y: cam.cy + dy * r,
    alpha,
    hidden: alpha < cam.limb,
    edge,
  }
}

/**
 * The direction of a body at finite distance, as seen from the camera rather
 * than from the earth's centre.
 *
 * **Not optional for the moon.** The camera is ~2.2 earth radii above the
 * surface and the moon is ~60 out, so the geocentric and camera-centric
 * directions differ by up to 2° — which is 56 px at the scale this sky is drawn
 * at next to the limb, and would show as the moon setting behind the wrong part
 * of the earth. The sun's own parallax from here is 0.008° and it gets the same
 * treatment for free.
 *
 * `rho` is the body's distance in earth radii.
 */
export function parallaxCorrect(
  dir: readonly [number, number, number],
  rho: number,
  cam: SkyCamera,
  frame: SkyFrame,
): [number, number, number] {
  const x = rho * dir[0] - cam.d * frame.c[0]
  const y = rho * dir[1] - cam.d * frame.c[1]
  const z = rho * dir[2] - cam.d * frame.c[2]
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

/** Mean earth radius, km — the unit `SkyCamera.d` and `parallaxCorrect` use. */
export const EARTH_RADIUS_KM = 6371.0088

/**
 * Rotation from J2000 equatorial coordinates to the mean equinox of date, as a
 * flat row-major 3x3.
 *
 * The catalogue is J2000 and `gmstHours` is measured from the equinox *of
 * date*, so leaving this out is a systematic 0.36° by 2026 — ten pixels at the
 * limb, and a whole sky sitting slightly wrong against a sun and moon that are
 * computed correctly. Meeus 21.3, rigorous rather than the small-angle form,
 * because it costs nine multiplies once per frame instead of per star.
 */
export function precession(n: number): Float64Array {
  const t = n / 36525
  const asec = (1 / 3600) * DEG
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * asec
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * asec
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * asec

  const cz = Math.cos(zeta)
  const sz = Math.sin(zeta)
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const cZ = Math.cos(z)
  const sZ = Math.sin(z)

  const m = new Float64Array(9)
  m[0] = cz * ct * cZ - sz * sZ
  m[1] = -sz * ct * cZ - cz * sZ
  m[2] = -st * cZ
  m[3] = cz * ct * sZ + sz * cZ
  m[4] = -sz * ct * sZ + cz * cZ
  m[5] = -st * sZ
  m[6] = cz * st
  m[7] = -sz * st
  m[8] = ct
  return m
}

/** Equatorial right ascension and declination (degrees) to a unit vector. */
export const directionOf = dirOf
