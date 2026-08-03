// The sky, painted.
//
// A 2D canvas **behind** MapLibre's, and that placement is the whole design
// rather than a detail of it. Below `GLOBE_ZOOM.plane` MapLibre draws the
// `ocean` background layer on the tile meshes — on the planet — and clears the
// canvas to transparent with `alpha: true`, so outside the limb there is no
// MapLibre colour at all and `.map-canvas-host` shows through. Put a canvas
// there and three things come free that would each be work:
//
//   **Occlusion.** The globe mesh covers the sky in hardware. A body goes
//   behind the limb exactly, at the true instant, clipped to the true edge —
//   including the partial clip while it is halfway over.
//   **The atmosphere composites correctly**, because MapLibre's own crescent is
//   drawn over ours by the browser rather than by us.
//   **Nothing touches MapLibre.** No source, no layer, no `addImage`, no
//   `setFeatureState`, no custom layer. So the sky cannot break the invariant
//   that an idle tick writes nothing — the one that was worth 57% of a core.
//
// There is no rAF loop, deliberately. `spacefield.ts` (the article pages' own
// starfield) has one, and this must not: the map is event-driven and still, and
// a loop here would be a fan spinning up on a picture that is not moving. The
// sky repaints on `move`, which is a frame MapLibre is drawing anyway, and on
// the 120-second solar tick that already exists for the terminator.

import { moonIllumination, moonPhaseName, moonPosition } from './lunar'
import { daysSinceJ2000, gmstHours, sunEquatorial } from './solar'
import {
  directionOf,
  EARTH_RADIUS_KM,
  parallaxCorrect,
  place,
  precession,
  type Placed,
  type Project,
  type SkyCamera,
  type SkyFrame,
  skyFrame,
  skyPxPerDegree,
  calibrate,
} from './sky'
import { GLOBE_ZOOM, MAP_COLOURS, STAR_BV_RANGE, STAR_TINT } from './style'

const DEG = Math.PI / 180
const AU_KM = 149597870.7

/**
 * The faintest star drawn.
 *
 * The payload runs to 5.5 and is magnitude-sorted, so this is a prefix slice
 * and lowering it costs no refetch. 5.2 was chosen against the render rather
 * than reasoned to: the compression means the corners of the frame hold ~70° of
 * sky, so the far corner is where crowding shows first, and past 5.2 it stops
 * reading as stars and starts reading as noise on the canvas.
 */
export const STAR_MAG_LIMIT = 5.2

/** How far a pointer may be from a star and still be judged to be on it. */
const STAR_GRAB_PX = 9

/** Angular size of the sun and moon, degrees — the moon's varies and is read. */
const SUN_DIAMETER_DEG = 0.5334

/**
 * The atmosphere outside the limb.
 *
 * MapLibre's `sky.atmosphere-blend` draws the half of the glow that lies *on*
 * the planet, lit from the sun's own direction so it is a crescent along the
 * day limb and unlit everywhere else. It stops at the limb, because there is no
 * geometry past it. This is the outward half of the same glow, on the same
 * falloff and the same crescent rule, so the two meet continuously at the edge
 * and a reader sees one atmosphere.
 *
 * `MAP_COLOURS.horizon` is reused rather than a new token being minted: it is
 * already "the atmosphere at the globe's limb", already measured at 1.45:1
 * against the ocean, and two tokens for one substance is exactly how the two
 * halves would drift apart.
 *
 * Thickness is 5.5% of the disc radius. The real thing is nearer 1% — the
 * troposphere is 10 km on a 6371 km ball — and at 1% it renders as a hairline
 * that reads as an artefact of the circle rather than as air. This is the one
 * number here that is drawn larger than life, and it is stated.
 */
const HALO_THICKNESS = 0.055
/**
 * The alpha at the limb itself, and it is 1 on purpose.
 *
 * `MAP_COLOURS.horizon` is not a hue that then gets a brightness chosen for it
 * — its own note states the measurement the value *is*: 1.45:1 against the
 * ocean, "present and no louder than the prayer hairlines". Drawing it at 0.62
 * composites to about 1.25:1, which is under the register the token was
 * measured at and, on the near-black ground this map keeps, is the difference
 * between an atmosphere and nothing. It was that, and it could not be seen.
 *
 * So the token decides the peak and the gradient decides the falloff. Anything
 * other than 1 here is a second brightness for the atmosphere, in a place no
 * test is reading.
 */
const HALO_PEAK = 1
const HALO_WEDGES = 72

/**
 * Airglow: the thin rim that goes all the way round, including the night side.
 *
 * This map's oldest unsolved problem, stated in its own design record: space
 * and sea are the *same tone by construction* (`--map-ground` is
 * `MAP_COLOURS.ocean`, which is what keeps every chrome scrim meaning what it
 * means), the night wash is black at 0.28 over a near-black ocean and moves it
 * about two values in 255, and the scattering glow above is a crescent that by
 * definition stops at the terminator. So **half the planet had no edge at all**
 * — it ended wherever the last coastline happened to be. The graticule was
 * added as a way round that, and it is a good mark for a different reason; it
 * was never the answer to this.
 *
 * The answer is that the night limb is not actually dark. Oxygen recombining
 * about 90 km up emits continuously, and that band — airglow — is why the dark
 * side of the earth has a visible edge in every photograph taken from orbit. It
 * is real, it is uniform around the whole limb, and it is the one thing that
 * can draw this edge without inventing anything.
 *
 * Drawn as a **line rather than a glow**, which is the whole reason it works
 * here. There is 1.09:1 of room below the ocean and nothing above it worth
 * spending on a wide wash — a soft rim faint enough to be honest is a rim that
 * cannot be seen, which is what a first pass at 0.62 alpha produced.
 *
 * So the tone is fixed at the token's own measurement — `MAP_COLOURS.horizon`
 * at full strength, **1.45:1**, the register of the graticule's 1.44:1 and the
 * prayer hairlines' ~1.5:1 — and **the only free variable is width**. That is
 * the useful half of the trade: brightness is capped by the palette and costs
 * legibility everywhere it is spent, while width costs nothing but its own
 * pixels. 2.2px was swept against the render; 1.6 was a hairline that read as
 * an artefact of the circle, and past ~3 it stops being an edge and becomes a
 * ring drawn around the planet.
 *
 * Day and night still read differently, which is the objection this has to
 * answer: the scattering crescent above is a 25px gradient over it, so the lit
 * limb is a band and the dark limb is a line. The terminator keeps saying what
 * it said.
 *
 * ── The line had two hard edges, and one of them was a lie (2026-08-03) ──────
 *
 * Drawn as a stroke, this was 2.2px of flat `horizon` between a black planet
 * and black space — **hard on both sides**. Measured off a headed render along a
 * ray through the night limb: `(6,7,9)` for the planet, then `(34,46,64)`,
 * `(34,46,64)`, then `(8,10,13)` for space, with nothing in between. Against the
 * day limb on the same frame, which ramps from `(102,113,132)` down to space
 * over 24px, it read as what it literally was — a circle stroked around the
 * globe — and it was the only hard edge anywhere in the sky.
 *
 * The inner edge is right and has to stay: the planet is opaque and its limb is
 * a real discontinuity. The outer one is not. Airglow is a *shell* seen edge-on,
 * so its brightness falls off with the atmosphere above it rather than stopping;
 * that soft outer edge is what the band looks like in every orbital photograph
 * the rest of this note appeals to.
 *
 * So the stroke becomes an annulus with a graded alpha, and **the peak is
 * unchanged and still on the limb** — the token's 1.45:1 measurement is what the
 * first stop is, so nothing measured against it moves. What changes is only what
 * happens outside: half strength half a width out, a sixth at one and a half,
 * gone by `AIRGLOW_REACH`. The area under that curve is 1.73px of full-strength
 * ink against the stroke's 1.65, so it does not read fainter — only softer. The
 * effective width a reader sees is still about two pixels, which is what the
 * sweep found; the ring is now made of light rather than drawn with a pen.
 *
 * `AIRGLOW_REACH` is **not** free to grow into the answer for the day side. Past
 * ~3px of *uniform* width this stopped being an edge and became a ring, and a
 * long enough tail reintroduces that at lower alpha. It is a falloff on a
 * hairline, not a halo.
 */
const AIRGLOW_WIDTH = 2.2
const AIRGLOW_ALPHA = 1
/** How far out the falloff runs before it is gone, px. See above. */
const AIRGLOW_REACH = AIRGLOW_WIDTH * 2.5

interface Catalogue {
  n: number
  /** Unit vectors in the J2000 equatorial frame, flat: x0,y0,z0,x1,… */
  vec: Float32Array
  mag: Float32Array
  /** B−V, or NaN where the catalogue has none. */
  bv: Float32Array
  ra: Float32Array
  dec: Float32Array
  hr: Int32Array
  /** Distance in light years, 0 where the parallax is not usable. */
  ly: Float32Array
  bayer: string[]
  flamsteed: string[]
  con: string[]
  proper: Record<string, string>
  lore: Record<string, { lang: string; from?: string; meaning: string }>
  conNames: Record<string, string>
  source: string
  names: string
}

export interface StarHit {
  kind: 'star'
  name: string | null
  designation: string
  constellation: string
  magnitude: number
  lightYears: number | null
  lore: { lang: string; from?: string; meaning: string } | null
  source: string
}

export interface BodyHit {
  kind: 'sun' | 'moon'
  /** Where it is directly overhead. */
  sub: { lat: number; lng: number }
  /** Kilometres from the earth's centre. */
  km: number
  /** Moon only. */
  phase?: { fraction: number; name: string }
}

export type SkyHit = StarHit | BodyHit

/** What the sky needs from the map, and nothing more. */
export interface SkyView {
  project: Project
  centre(): [number, number]
  bearing(): number
  pitch(): number
  zoom(): number
}

export interface Starfield {
  element: HTMLCanvasElement
  /** Hand it the parsed `/basemap/stars.json`. Safe to never call. */
  setCatalogue(raw: unknown): void
  /** Repaint. Idempotent, allocation-free, safe to call per `move`. */
  draw(now?: Date): void
  /** Re-read the element's box. Call on resize before `draw`. */
  resize(): void
  /** What is under this canvas point, if anything. */
  hit(x: number, y: number): SkyHit | null
  destroy(): void
}

// --- colour ----------------------------------------------------------------

const rgbOf = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]

const STAR_RGB = rgbOf(MAP_COLOURS.star)
const WARM_RGB = rgbOf(MAP_COLOURS.starWarm)
const COOL_RGB = rgbOf(MAP_COLOURS.starCool)
const HALO_RGB = rgbOf(MAP_COLOURS.horizon)

/**
 * A star's colour from its B−V index, capped at `STAR_TINT` of the way to the
 * anchors. Pre-computed into sixteen buckets rather than per star per frame:
 * the string is what costs, and `rgb(…)` for six hundred stars a frame is six
 * hundred allocations for sixteen distinct answers.
 */
const TINT_STEPS = 16
const TINTS: string[] = Array.from({ length: TINT_STEPS }, (_, i) => {
  const t = (i / (TINT_STEPS - 1)) * 2 - 1 // −1 cool … +1 warm
  const target = t >= 0 ? WARM_RGB : COOL_RGB
  const k = Math.abs(t) * STAR_TINT
  const c = STAR_RGB.map((v, j) => Math.round(v + (target[j] - v) * k))
  return `${c[0]} ${c[1]} ${c[2]}`
})

const tintIndexFor = (bv: number): number => {
  if (!Number.isFinite(bv)) return (TINT_STEPS - 1) >> 1
  const t = Math.max(-1, Math.min(1, bv / STAR_BV_RANGE))
  return Math.round(((t + 1) / 2) * (TINT_STEPS - 1))
}

/**
 * Every `fillStyle` a star can be set to, built once and then only looked up.
 *
 * The draw loop used to compose `rgb(${tint} / ${alpha.toFixed(3)})` per star
 * per frame. Measured on a 40-move drag against the built page: **41 sky
 * repaints of about 200 drawn stars each**, so ~8,000 template strings and
 * ~8,000 `toFixed` calls in under a second, every one of them a CSS colour the
 * canvas then has to parse because it has never seen that exact string before.
 * It is the whole of this file's allocation pressure and it buys nothing — the
 * eye cannot resolve the difference between alpha 0.412 and 0.406.
 *
 * So alpha is quantised to `ALPHA_STEPS` and the product is a flat table filled
 * on first use. After the first frame the loop allocates nothing at all and
 * every string handed to `fillStyle` is one the canvas has already parsed. The
 * table is at most 16 x 65 entries and only the reachable ones are ever built.
 */
const ALPHA_STEPS = 64
const STAR_STYLES: string[] = new Array(TINT_STEPS * (ALPHA_STEPS + 1))

const starStyle = (tint: number, alpha: number): string => {
  const step = Math.round(Math.max(0, Math.min(1, alpha)) * ALPHA_STEPS)
  const key = tint * (ALPHA_STEPS + 1) + step
  const hit = STAR_STYLES[key]
  if (hit !== undefined) return hit
  const built = `rgb(${TINTS[tint]} / ${(step / ALPHA_STEPS).toFixed(3)})`
  STAR_STYLES[key] = built
  return built
}

/**
 * A star's alpha and radius from its magnitude.
 *
 * Magnitude is a logarithm of flux already, so a linear ramp over it is a
 * sensible perceptual curve and the usual `pow(2.512, −m)` is not: applied
 * straight it renders Sirius at 190 times Polaris and everything past magnitude
 * 3 at nothing.
 *
 * Radius is capped at 1.6px and floors at 0.7px, and the *floor is drawn by
 * alpha rather than by radius* — a browser rounds a 0.4px arc up to a pixel and
 * paints it at full strength, so a size ramp below one pixel silently becomes
 * no ramp at all. That is the same failure `glyphs.ts` records at 3.2px, one
 * order of magnitude down.
 */
const MAG_BRIGHT = -1.5
/**
 * Split into three, and the reason is allocation rather than taste: this used
 * to return `{ alpha, radius }`, which is an object per star per frame — about
 * 200 of them per repaint, on the same hot path as the colour strings above.
 * `t` is three operations, so computing it once at the call site and passing it
 * to two pure functions costs nothing and allocates nothing.
 */
const starRamp = (mag: number) =>
  Math.max(0, Math.min(1, (STAR_MAG_LIMIT - mag) / (STAR_MAG_LIMIT - MAG_BRIGHT)))
const starAlpha = (t: number) => 0.16 + 0.74 * t * t
const starRadius = (t: number) => 0.7 + 0.9 * t

// --- the island's half -----------------------------------------------------

export function createStarfield(view: SkyView): Starfield {
  const canvas = document.createElement('canvas')
  canvas.className = 'map-sky'
  // Decorative in the accessibility tree: everything it draws that a reader can
  // act on is reachable through the card the click opens, and a canvas has no
  // other way to say what is on it. The sun, the moon and the named stars are
  // announced there, in words, like every other mark on this map.
  canvas.setAttribute('aria-hidden', 'true')

  const ctx = canvas.getContext('2d')
  let width = 0
  let height = 0
  let dpr = 1
  let cat: Catalogue | null = null
  let now = new Date()

  // Drawn star positions, kept for the hit test. Grown, never re-allocated per
  // frame — a click is rare and a repaint is not.
  let hitX = new Float32Array(0)
  let hitY = new Float32Array(0)
  let hitIndex = new Int32Array(0)
  let hitCount = 0
  let sunHit: { x: number; y: number; r: number; body: BodyHit } | null = null
  let moonHit: { x: number; y: number; r: number; body: BodyHit } | null = null

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    dpr = Math.min(2, window.devicePixelRatio || 1)
    width = rect.width
    height = rect.height
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
  }

  /**
   * The sky is a fact about the globe, so it goes when the globe does — on the
   * same two constants the graticule fades between, read rather than typed. A
   * flat Mercator map has no limb for a sky to sit outside of.
   */
  const zoomFade = () => {
    const z = view.zoom()
    if (z <= GLOBE_ZOOM.sphere) return 1
    if (z >= GLOBE_ZOOM.plane) return 0
    return 1 - (z - GLOBE_ZOOM.sphere) / (GLOBE_ZOOM.plane - GLOBE_ZOOM.sphere)
  }

  const clear = () => {
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hitCount = 0
    sunHit = null
    moonHit = null
  }

  /** Sixteen thousand stars would still be one path each; batching by tint is
   *  what makes this a handful of fills instead. */
  const drawStars = (cam: SkyCamera, frame: SkyFrame, fade: number) => {
    if (!ctx || !cat) return
    // The frame vectors are rotated *backwards* into J2000 rather than every
    // star being rotated forwards into the frame of date. A rotation is
    // orthogonal, so `dot(P·v, c) === dot(v, Pᵀ·c)` — three vectors transformed
    // once, instead of three thousand.
    const m = precession(daysSinceJ2000(now))
    const back = (v: readonly [number, number, number]): [number, number, number] => [
      m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
      m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
      m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
    ]
    const j2000: SkyFrame = { c: back(frame.c), e: back(frame.e), n: back(frame.n) }

    if (hitX.length < cat.n) {
      hitX = new Float32Array(cat.n)
      hitY = new Float32Array(cat.n)
      hitIndex = new Int32Array(cat.n)
    }
    hitCount = 0

    const vec = cat.vec
    const pad = 4
    for (let i = 0; i < cat.n; i++) {
      if (cat.mag[i] > STAR_MAG_LIMIT) break // magnitude-sorted: a prefix slice
      const x = vec[i * 3]
      const y = vec[i * 3 + 1]
      const z = vec[i * 3 + 2]
      const uc = x * j2000.c[0] + y * j2000.c[1] + z * j2000.c[2]
      // Cheap rejects before any trigonometry: behind the earth, or past the
      // sky's outer edge. `−uc` is the cosine of the angle off the view axis.
      if (-uc > Math.cos(cam.limb)) continue
      if (-uc < 0) continue // beyond 90°, which is SKY_SPAN
      const p = place([x, y, z], cam, j2000)
      if (!p || p.hidden) continue
      if (p.x < -pad || p.y < -pad || p.x > width + pad || p.y > height + pad) continue

      const t = starRamp(cat.mag[i])
      ctx.fillStyle = starStyle(tintIndexFor(cat.bv[i]), starAlpha(t) * fade * p.edge)
      ctx.beginPath()
      ctx.arc(p.x, p.y, starRadius(t), 0, Math.PI * 2)
      ctx.fill()

      hitX[hitCount] = p.x
      hitY[hitCount] = p.y
      hitIndex[hitCount] = i
      hitCount++
    }
  }

  /**
   * The atmosphere, outside the limb.
   *
   * Seventy-two wedges rather than one ring with a second gradient over it,
   * because carving a crescent out of a ring on this canvas means
   * `destination-out`, and `destination-out` would take the stars underneath
   * with it. Each wedge shares one radial gradient and differs only in alpha,
   * and they are drawn with `lighter` — which is both what light does and what
   * makes adjacent wedges meet with no seam.
   */
  const drawHalo = (cam: SkyCamera, sun: Placed | null, fade: number) => {
    if (!ctx) return
    const thickness = Math.max(3, cam.r * HALO_THICKNESS)
    const outer = cam.r + thickness
    const grad = ctx.createRadialGradient(cam.cx, cam.cy, cam.r, cam.cx, cam.cy, outer)
    grad.addColorStop(0, `rgb(${HALO_RGB[0]} ${HALO_RGB[1]} ${HALO_RGB[2]} / 1)`)
    grad.addColorStop(0.45, `rgb(${HALO_RGB[0]} ${HALO_RGB[1]} ${HALO_RGB[2]} / 0.34)`)
    grad.addColorStop(1, `rgb(${HALO_RGB[0]} ${HALO_RGB[1]} ${HALO_RGB[2]} / 0)`)

    // Which way the sun lies on screen. When it is off the drawn sky the day
    // side is still knowable — the sun is then behind the camera, which is to
    // say the whole visible face is lit — so the crescent becomes a full ring.
    const toSun = sun
      ? Math.atan2(sun.y - cam.cy, sun.x - cam.cx)
      : null

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // Airglow first, uniform around the whole limb. Inside the wedge loop it
    // would be a floor on the crescent's alpha, which is a different picture:
    // the two are separate emissions and the scattering adds to this one.
    //
    // An annulus rather than a stroke, and it starts *inside* the limb: the
    // globe covers the inner ramp in hardware, so the profile a reader sees
    // begins at full strength on the edge itself with no seam where MapLibre's
    // antialiased disc ends. Outside, it falls off — see `AIRGLOW_REACH`.
    const rimInner = cam.r - 0.6
    const rimOuter = cam.r + AIRGLOW_REACH
    const span = rimOuter - rimInner
    // Where a radius lands on the gradient's 0..1 parameter.
    const at = (px: number) => (cam.r + px - rimInner) / span
    const rim = ctx.createRadialGradient(cam.cx, cam.cy, rimInner, cam.cx, cam.cy, rimOuter)
    const horizon = `rgb(${HALO_RGB[0]} ${HALO_RGB[1]} ${HALO_RGB[2]}`
    rim.addColorStop(0, `${horizon} / 1)`)
    // Full through the limb, so the peak is exactly the token's measurement.
    rim.addColorStop(at(0), `${horizon} / 1)`)
    rim.addColorStop(at(AIRGLOW_WIDTH * 0.5), `${horizon} / 0.5)`)
    rim.addColorStop(at(AIRGLOW_WIDTH * 1.5), `${horizon} / 0.16)`)
    rim.addColorStop(1, `${horizon} / 0)`)
    ctx.globalAlpha = AIRGLOW_ALPHA * fade
    ctx.fillStyle = rim
    ctx.beginPath()
    ctx.arc(cam.cx, cam.cy, rimOuter, 0, Math.PI * 2)
    ctx.arc(cam.cx, cam.cy, rimInner, 0, Math.PI * 2, true)
    ctx.fill()

    const step = (Math.PI * 2) / HALO_WEDGES
    for (let i = 0; i < HALO_WEDGES; i++) {
      const a0 = i * step
      const a1 = a0 + step
      let lit = 1
      if (toSun !== null) {
        // The sun's *drawn* bearing is exact — bearing is the one thing the
        // compression leaves alone — so the lit fraction is honest even though
        // the sun's distance from the limb is not.
        const d = Math.cos(a0 + step / 2 - toSun)
        lit = Math.max(0, d) ** 0.7
      }
      const alpha = lit * HALO_PEAK * fade
      if (alpha < 0.004) continue
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(cam.cx, cam.cy, outer, a0, a1)
      ctx.arc(cam.cx, cam.cy, cam.r, a1, a0, true)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
    }
    ctx.restore()
  }

  const drawSun = (p: Placed, cam: SkyCamera, fade: number) => {
    if (!ctx) return 0
    const r = Math.max(2, (skyPxPerDegree(cam) * SUN_DIAMETER_DEG) / 2)
    const glow = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 3.2)
    glow.addColorStop(0, `rgb(255 236 204 / ${(0.30 * fade * p.edge).toFixed(3)})`)
    glow.addColorStop(1, 'rgb(255 236 204 / 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = MAP_COLOURS.sun
    ctx.globalAlpha = fade * p.edge
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    return r
  }

  /**
   * The moon, at its true angular size and in its true phase.
   *
   * The terminator on a drawn disc is a half-ellipse whose semi-axis along the
   * sun direction is `R·(2k − 1)`: positive past half, when the ellipse bulges
   * *away* from the sun and the shape is gibbous; negative before it, when it
   * cuts *toward* the sun and the shape is a crescent. One path either way,
   * with the sweep direction carrying the sign — which is why there is no
   * branch on "crescent or gibbous" here, only on which way the arc runs.
   *
   * `toSun` is the direction of the sun *in the plane of the sky at the moon*,
   * resolved from the two unit vectors rather than from the two drawn
   * positions: under the radial compression the drawn pair are not at their
   * true relative bearing, and a crescent tipped a few degrees wrong is the one
   * error about the moon that everybody can see.
   */
  const drawMoon = (
    p: Placed,
    cam: SkyCamera,
    fade: number,
    diameterDeg: number,
    fraction: number,
    toSun: number,
  ) => {
    if (!ctx) return 0
    const r = Math.max(2, (skyPxPerDegree(cam) * diameterDeg) / 2)
    ctx.globalAlpha = fade * p.edge

    // Earthshine. The face the moon turns to us is the face the earth lights,
    // so the unlit part is not black — and a floating crescent with no disc
    // behind it reads as a logo.
    ctx.fillStyle = MAP_COLOURS.moonDark
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()

    const b = r * (2 * fraction - 1)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(toSun)
    ctx.beginPath()
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
    ctx.ellipse(0, 0, Math.abs(b), r, 0, Math.PI / 2, -Math.PI / 2, b > 0)
    ctx.closePath()
    ctx.fillStyle = MAP_COLOURS.moon
    ctx.fill()
    ctx.restore()
    ctx.globalAlpha = 1
    return r
  }

  const draw = (at?: Date) => {
    if (!ctx) return
    now = at ?? new Date()
    clear()
    if (width === 0 || height === 0) return
    if (typeof document !== 'undefined' && document.hidden) return

    const fade = zoomFade()
    if (fade <= 0) return

    const cam = calibrate(view.project, view.centre(), view.bearing(), view.pitch())
    if (!cam) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const n = daysSinceJ2000(now)
    const [lng, lat] = view.centre()
    const frame = skyFrame(lat, lng, gmstHours(n))

    // The sun first: the halo needs its bearing, and the moon needs its
    // direction to point a crescent at.
    const sunEq = sunEquatorial(now)
    const sunGeo = directionOf(sunEq.ra, sunEq.dec)
    const sunDir = parallaxCorrect(sunGeo, (sunEq.au * AU_KM) / EARTH_RADIUS_KM, cam, frame)
    const sunPlaced = place(sunDir, cam, frame)

    drawStars(cam, frame, fade)
    drawHalo(cam, sunPlaced, fade)

    const moon = moonPosition(now)
    const moonGeo = directionOf(moon.ra, moon.dec)
    const moonDir = parallaxCorrect(moonGeo, moon.km / EARTH_RADIUS_KM, cam, frame)
    const moonPlaced = place(moonDir, cam, frame)
    const ill = moonIllumination(moon, sunEq)

    if (moonPlaced && !fullyBehind(moonPlaced, cam, moon.diameter)) {
      // The sun's direction projected into the sky plane at the moon, then read
      // through the same screen basis everything else is placed with.
      const dot = sunDir[0] * moonDir[0] + sunDir[1] * moonDir[1] + sunDir[2] * moonDir[2]
      const px = sunDir[0] - dot * moonDir[0]
      const py = sunDir[1] - dot * moonDir[1]
      const pz = sunDir[2] - dot * moonDir[2]
      const pe = px * frame.e[0] + py * frame.e[1] + pz * frame.e[2]
      const pn = px * frame.n[0] + py * frame.n[1] + pz * frame.n[2]
      const sx = pe * cam.east[0] + pn * cam.north[0]
      const sy = pe * cam.east[1] + pn * cam.north[1]
      const r = drawMoon(moonPlaced, cam, fade, moon.diameter, ill.fraction, Math.atan2(sy, sx))
      moonHit = {
        x: moonPlaced.x,
        y: moonPlaced.y,
        r,
        body: {
          kind: 'moon',
          sub: moon.sub,
          km: moon.km,
          phase: { fraction: ill.fraction, name: moonPhaseName(ill.fraction, ill.waxing) },
        },
      }
    }

    if (sunPlaced && !fullyBehind(sunPlaced, cam, SUN_DIAMETER_DEG)) {
      const r = drawSun(sunPlaced, cam, fade)
      sunHit = {
        x: sunPlaced.x,
        y: sunPlaced.y,
        r,
        body: {
          kind: 'sun',
          // The sub-solar point — the pole of the terminator already drawn on
          // the globe below, which is what makes the two one statement.
          sub: subOfSun(sunEq, n),
          km: sunEq.au * AU_KM,
        },
      }
    }
  }

  const hit = (x: number, y: number): SkyHit | null => {
    // Bodies first: they are drawn over the stars and they are larger, so a
    // pointer inside one is unambiguously on it. The moon leads the sun for the
    // same reason it is drawn first — the two are never within a degree of each
    // other except at a new moon, when the sun is the safer answer.
    for (const b of [moonHit, sunHit]) {
      if (b && Math.hypot(x - b.x, y - b.y) <= Math.max(b.r, 8)) return b.body
    }
    if (!cat) return null
    let best = -1
    let bestD = STAR_GRAB_PX * STAR_GRAB_PX
    for (let i = 0; i < hitCount; i++) {
      const dx = x - hitX[i]
      const dy = y - hitY[i]
      const d = dx * dx + dy * dy
      // Ties on distance go to the brighter star, which is the one a reader was
      // aiming at — the catalogue is magnitude-sorted, so a lower index is it.
      if (d < bestD || (d === bestD && best >= 0 && hitIndex[i] < hitIndex[best])) {
        bestD = d
        best = i
      }
    }
    if (best < 0) return null
    return describe(cat, hitIndex[best])
  }

  return {
    element: canvas,
    setCatalogue(raw) {
      cat = decode(raw)
    },
    draw,
    resize,
    hit,
    destroy() {
      canvas.remove()
      cat = null
      hitCount = 0
    },
  }
}

/** Whether the whole disc of a body is behind the earth. */
const fullyBehind = (p: Placed, cam: SkyCamera, diameterDeg: number) =>
  p.alpha < cam.limb - (diameterDeg / 2) * DEG

const subOfSun = (sun: { ra: number; dec: number }, n: number) => {
  let lng = sun.ra - gmstHours(n) * 15
  lng = ((((lng + 180) % 360) + 360) % 360) - 180
  return { lat: sun.dec, lng }
}

// --- the catalogue ---------------------------------------------------------

/**
 * Decode `/basemap/stars.json` into typed arrays.
 *
 * Once, on arrival. Unit vectors are precomputed because the hot loop wants
 * three dot products per star and nothing else — the right ascension and
 * declination are kept only for the card, which asks for one star at a time.
 */
function decode(raw: unknown): Catalogue | null {
  const d = raw as Record<string, never> | null
  if (!d || !Array.isArray(d.ra) || !Array.isArray(d.dec) || !Array.isArray(d.mag)) return null
  const ras = d.ra as unknown as number[]
  const decs = d.dec as unknown as number[]
  const mags = d.mag as unknown as number[]
  const bvs = (d.bv as unknown as number[]) ?? []
  const plx = (d.plx as unknown as number[]) ?? []
  const n = Math.min(ras.length, decs.length, mags.length)

  const vec = new Float32Array(n * 3)
  const mag = new Float32Array(n)
  const bv = new Float32Array(n)
  const ra = new Float32Array(n)
  const dec = new Float32Array(n)
  const ly = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const raDeg = ras[i] / 1000
    const decDeg = (decs[i] - 90000) / 1000
    const v = directionOf(raDeg, decDeg)
    vec[i * 3] = v[0]
    vec[i * 3 + 1] = v[1]
    vec[i * 3 + 2] = v[2]
    mag[i] = (mags[i] - 200) / 100
    bv[i] = bvs[i] === 9999 || bvs[i] === undefined ? Number.NaN : (bvs[i] - 100) / 100
    ra[i] = raDeg
    dec[i] = decDeg
    // Parallax in milliarcseconds → light years. 3.2616 ly per parsec.
    ly[i] = plx[i] ? 3261.564 / plx[i] : 0
  }

  return {
    n,
    vec,
    mag,
    bv,
    ra,
    dec,
    ly,
    hr: Int32Array.from((d.hr as unknown as number[]) ?? []),
    bayer: (d.bayer as unknown as string[]) ?? [],
    flamsteed: (d.flamsteed as unknown as string[]) ?? [],
    con: (d.con as unknown as string[]) ?? [],
    proper: (d.proper as unknown as Record<string, string>) ?? {},
    lore: (d.lore as unknown as Catalogue['lore']) ?? {},
    conNames: (d.conNames as unknown as Record<string, string>) ?? {},
    source: (d.source as unknown as string) ?? '',
    names: (d.names as unknown as string) ?? '',
  }
}

/**
 * One star, as the card needs it.
 *
 * The designation is Bayer, then Flamsteed, then the Harvard Revised number,
 * in that order of preference — 766 of the 2,887 stars at this magnitude have
 * neither of the first two, and "HR 4523" is a real designation while a blank
 * line is a card that could not answer the click it opened for.
 *
 * The abbreviated constellation is kept in the designation and the full name is
 * given separately, so the card reads `α Tau · in Taurus` and no genitive table
 * is needed to avoid writing "Alpha Taurus".
 */
function describe(cat: Catalogue, i: number): StarHit {
  const con = cat.con[i] ?? ''
  const bayer = cat.bayer[i] ?? ''
  const flam = cat.flamsteed[i] ?? ''
  const designation = bayer && con
    ? `${bayer} ${con}`
    : flam && con
      ? `${flam} ${con}`
      : `HR ${cat.hr[i] ?? 0}`
  const name = cat.proper[String(i)] ?? null
  return {
    kind: 'star',
    name,
    designation,
    constellation: cat.conNames[con] ?? con,
    magnitude: cat.mag[i],
    lightYears: cat.ly[i] > 0 ? cat.ly[i] : null,
    lore: (name && cat.lore[name]) || null,
    source: cat.source,
  }
}
