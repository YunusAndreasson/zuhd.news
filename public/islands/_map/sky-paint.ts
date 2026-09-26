// The sky, painted: the sun and the atmosphere outside the limb.
//
// There were stars and a moon here too, from 2026-08-01 until they were
// removed on 2026-09-26 at the owner's request; `sky.md` records what went and
// what the removal left in place.
//
// A 2D canvas **behind** MapLibre's, and that placement is the whole design
// rather than a detail of it. Below `GLOBE_ZOOM.plane` MapLibre draws the
// `ocean` background layer on the tile meshes — on the planet — and clears the
// canvas to transparent with `alpha: true`, so outside the limb there is no
// MapLibre colour at all and `.map-canvas-host` shows through. Put a canvas
// there and three things come free that would each be work:
//
//   **Occlusion.** The globe mesh covers the sky in hardware. The sun goes
//   behind the limb exactly, at the true instant, clipped to the true edge —
//   including the partial clip while it is halfway over.
//   **The atmosphere composites correctly**, because MapLibre's own crescent is
//   drawn over ours by the browser rather than by us.
//   **Nothing touches MapLibre.** No source, no layer, no `addImage`, no
//   `setFeatureState`, no custom layer. So the sky cannot break the invariant
//   that an idle tick writes nothing — the one that was worth 57% of a core.
//
// There is no rAF loop, deliberately: the map is event-driven and still, and a
// loop here would be a fan spinning up on a picture that is not moving. The
// sky repaints on `move`, which is a frame MapLibre is drawing anyway, and on
// the 120-second solar tick that already exists for the terminator.

import { daysSinceJ2000, gmstHours, sunEquatorial } from './solar'
import {
  directionOf,
  place,
  type Placed,
  type Project,
  type SkyCamera,
  skyFrame,
  skyPxPerDegree,
  calibrate,
} from './sky'
import { GLOBE_ZOOM, MAP_COLOURS } from './style'

const DEG = Math.PI / 180
const AU_KM = 149597870.7

/** Angular size of the sun, degrees. */
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

export interface SunHit {
  kind: 'sun'
  /** Where it is directly overhead. */
  sub: { lat: number; lng: number }
  /** Kilometres from the earth's centre. */
  km: number
}

/** What the sky needs from the map, and nothing more. */
export interface SkyView {
  project: Project
  centre(): [number, number]
  bearing(): number
  pitch(): number
  zoom(): number
}

export interface Sky {
  element: HTMLCanvasElement
  /** Repaint. Idempotent and safe to call per `move`. */
  draw(now?: Date): void
  /** Re-read the element's box. Call on resize before `draw`. */
  resize(): void
  /** The sun, if it is under this canvas point. */
  hit(x: number, y: number): SunHit | null
  destroy(): void
}

// --- colour ----------------------------------------------------------------

const rgbOf = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]

const HALO_RGB = rgbOf(MAP_COLOURS.horizon)

// --- the island's half -----------------------------------------------------

export function createSky(view: SkyView): Sky {
  const canvas = document.createElement('canvas')
  canvas.className = 'map-sky'
  // Decorative in the accessibility tree: the one thing it draws that a reader
  // can act on is the sun, and the card its click opens says it in words, like
  // every other mark on this map.
  canvas.setAttribute('aria-hidden', 'true')

  const ctx = canvas.getContext('2d')
  let width = 0
  let height = 0
  let dpr = 1
  let now = new Date()
  let sunHit: { x: number; y: number; r: number; body: SunHit } | null = null

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
    sunHit = null
  }

  /**
   * The atmosphere, outside the limb.
   *
   * Seventy-two wedges rather than one ring with a second gradient over it,
   * because carving a crescent out of a ring on this canvas means
   * `destination-out`, which would also cut the airglow drawn beneath it. Each
   * wedge shares one radial gradient and differs only in alpha, and they are
   * drawn with `lighter` — which is both what light does and what makes
   * adjacent wedges meet with no seam.
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

    // Geocentric, not corrected for the camera's offset from the earth's
    // centre: that parallax is 0.008° for the sun, well under a pixel. It was
    // applied while the moon was drawn, for which it reaches 2°.
    const sunEq = sunEquatorial(now)
    const sunPlaced = place(directionOf(sunEq.ra, sunEq.dec), cam, frame)

    // The halo needs the sun's bearing, and is drawn under it.
    drawHalo(cam, sunPlaced, fade)

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

  const hit = (x: number, y: number): SunHit | null =>
    sunHit && Math.hypot(x - sunHit.x, y - sunHit.y) <= Math.max(sunHit.r, 8) ? sunHit.body : null

  return {
    element: canvas,
    draw,
    resize,
    hit,
    destroy() {
      canvas.remove()
      sunHit = null
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
