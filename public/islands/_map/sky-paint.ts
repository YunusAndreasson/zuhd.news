// The sky, painted: the atmosphere outside the limb.
//
// There were stars and a moon here too, from 2026-08-01 until they were
// removed on 2026-09-26 at the owner's request, and the sun's disc followed on
// 2026-10-10; `sky.md` records what went and what the removal left in place.
//
// A 2D canvas **behind** MapLibre's, and that placement is the whole design
// rather than a detail of it. Below `GLOBE_ZOOM.plane` MapLibre draws the
// `ocean` background layer on the tile meshes — on the planet — and clears the
// canvas to transparent with `alpha: true`, so outside the limb there is no
// MapLibre colour at all and `.map-canvas-host` shows through. Put a canvas
// there and three things come free that would each be work:
//
//   **Occlusion.** The globe mesh covers the sky in hardware, so the glow
//   starts on the true edge of the planet with nothing here clipping it.
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
  type Project,
  type SkyCamera,
  skyFrame,
  calibrate,
} from './sky'
import { GLOBE_ZOOM, MAP_COLOURS } from './style'

/**
 * The atmosphere outside the limb.
 *
 * MapLibre's `sky.atmosphere-blend` draws the half of the glow that lies *on*
 * the planet, lit from the sun's own direction so it is a crescent along the
 * day limb and unlit everywhere else. It stops at the limb, because there is no
 * geometry past it. This is the outward half, on the same crescent rule, in
 * `MAP_COLOURS.horizon`, measured at 1.45:1 against space. MapLibre's half
 * takes its colour from its own shader, not from that token.
 *
 * Thickness is 5.5% of the disc radius. The real thing is nearer 1% — the
 * troposphere is 10 km on a 6371 km ball — and at 1% it renders as a hairline
 * that reads as an artefact of the circle rather than as air. This is the one
 * number here that is drawn larger than life, and it is stated.
 */
const HALO_THICKNESS = 0.055
/**
 * The alpha at the limb itself, and it is 1 on purpose: the token decides the
 * peak and the gradient decides the falloff. Anything other than 1 here is a
 * second brightness for the atmosphere, in a place no test is reading.
 */
const HALO_PEAK = 1
const HALO_WEDGES = 72

/**
 * Airglow: the thin rim that goes all the way round, including the night side.
 *
 * The scattering crescent stops at the terminator, and on the night side the
 * sea is only a hue step from space. Without this, half the planet has a soft
 * edge where it should have a line. Oxygen
 * recombining about 90 km up glows all round the real limb, which is why the
 * dark side of the earth has an edge in every photograph from orbit.
 *
 * Drawn as a line, not a wash, in its own token (`MAP_COLOURS.airglow`, 2.2:1
 * against space, dimmer than the brightest land). `horizon` at 1.45:1 was
 * tried here first and the night limb still dissolved. Width is 2.2px: 1.6 read
 * as an artefact of the circle, and past ~3 it stops being an edge and becomes
 * a ring drawn round the planet.
 *
 * An annulus with a graded alpha, not a stroke: the inner edge is the planet's
 * opaque limb and stays hard; outside it falls to half at half a width, a sixth
 * at one and a half, and nothing by `AIRGLOW_REACH`, which is a falloff on a
 * hairline and not free to grow into a halo.
 */
const AIRGLOW_WIDTH = 2.2
const AIRGLOW_ALPHA = 1
/** How far out the falloff runs before it is gone, px. See above. */
const AIRGLOW_REACH = AIRGLOW_WIDTH * 2.5

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
  destroy(): void
}

// --- colour ----------------------------------------------------------------

const rgbOf = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]

const HALO_RGB = rgbOf(MAP_COLOURS.horizon)
const AIRGLOW_RGB = rgbOf(MAP_COLOURS.airglow)

// --- the island's half -----------------------------------------------------

export function createSky(view: SkyView): Sky {
  const canvas = document.createElement('canvas')
  canvas.className = 'map-sky'
  // Decorative in the accessibility tree: it draws nothing a reader can act on.
  canvas.setAttribute('aria-hidden', 'true')

  const ctx = canvas.getContext('2d')
  let width = 0
  let height = 0
  let dpr = 1
  let now = new Date()

  /**
   * What is on the canvas: the disc it was painted round, the fade, and the
   * sun's bearing it was painted at (null for the full ring).
   *
   * A pan at one zoom moves neither the disc's centre nor its radius (MapLibre
   * holds the planet's size), only the sun's bearing on screen. So a `move`
   * that leaves the disc where it was turns the painted canvas with a CSS
   * rotation, which the compositor applies without a repaint, instead of
   * filling 72 gradient wedges again. Measured on a spin: the fills were a
   * quarter of the GPU process's time per frame.
   */
  let painted: { cx: number; cy: number; r: number; fade: number; dpr: number; toSun: number | null } | null =
    null
  /** The canvas's side and where it sits, in CSS px. */
  let side = 0

  const resize = () => {
    // The canvas is a square round the disc; the frame it can be seen in is
    // its parent's.
    const frame = canvas.parentElement
    dpr = Math.min(2, window.devicePixelRatio || 1)
    width = frame?.clientWidth ?? 0
    height = frame?.clientHeight ?? 0
    painted = null
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
    painted = null
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  /**
   * The atmosphere, outside the limb, round a disc at (`c`, `c`) of radius `r`.
   *
   * Seventy-two wedges rather than one ring with a second gradient over it,
   * because carving a crescent out of a ring on this canvas means
   * `destination-out`, which would also cut the airglow drawn beneath it. Each
   * wedge shares one radial gradient and differs only in alpha, and they are
   * drawn with `lighter` — which is both what light does and what makes
   * adjacent wedges meet with no seam.
   */
  const drawHalo = (c: number, r: number, toSun: number | null, fade: number) => {
    if (!ctx) return
    const thickness = Math.max(3, r * HALO_THICKNESS)
    const outer = r + thickness
    const grad = ctx.createRadialGradient(c, c, r, c, c, outer)
    grad.addColorStop(0, `rgb(${HALO_RGB[0]} ${HALO_RGB[1]} ${HALO_RGB[2]} / 1)`)
    grad.addColorStop(0.45, `rgb(${HALO_RGB[0]} ${HALO_RGB[1]} ${HALO_RGB[2]} / 0.34)`)
    grad.addColorStop(1, `rgb(${HALO_RGB[0]} ${HALO_RGB[1]} ${HALO_RGB[2]} / 0)`)

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
    const rimInner = r - 0.6
    const rimOuter = r + AIRGLOW_REACH
    const span = rimOuter - rimInner
    // Where a radius lands on the gradient's 0..1 parameter.
    const at = (px: number) => (r + px - rimInner) / span
    const rim = ctx.createRadialGradient(c, c, rimInner, c, c, rimOuter)
    const glow = `rgb(${AIRGLOW_RGB[0]} ${AIRGLOW_RGB[1]} ${AIRGLOW_RGB[2]}`
    rim.addColorStop(0, `${glow} / 1)`)
    // Full through the limb, so the peak is exactly the token's measurement.
    rim.addColorStop(at(0), `${glow} / 1)`)
    rim.addColorStop(at(AIRGLOW_WIDTH * 0.5), `${glow} / 0.5)`)
    rim.addColorStop(at(AIRGLOW_WIDTH * 1.5), `${glow} / 0.16)`)
    rim.addColorStop(1, `${glow} / 0)`)
    ctx.globalAlpha = AIRGLOW_ALPHA * fade
    ctx.fillStyle = rim
    ctx.beginPath()
    ctx.arc(c, c, rimOuter, 0, Math.PI * 2)
    ctx.arc(c, c, rimInner, 0, Math.PI * 2, true)
    ctx.fill()

    const step = (Math.PI * 2) / HALO_WEDGES
    for (let i = 0; i < HALO_WEDGES; i++) {
      const a0 = i * step
      const a1 = a0 + step
      let lit = 1
      if (toSun !== null) {
        // The sun's bearing is exact — bearing is the one thing the
        // compression leaves alone — so the lit fraction is honest even though
        // the sun's distance from the limb is not.
        const d = Math.cos(a0 + step / 2 - toSun)
        lit = Math.max(0, d) ** 0.7
      }
      const alpha = lit * HALO_PEAK * fade
      if (alpha < 0.004) continue
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(c, c, outer, a0, a1)
      ctx.arc(c, c, r, a1, a0, true)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
    }
    ctx.restore()
  }

  /** A square canvas round the disc, painted with the crescent at `toSun`. */
  const paint = (cam: SkyCamera, toSun: number | null, fade: number) => {
    if (!ctx) return
    // Room for the halo and the airglow's falloff, and a pixel to spare.
    const reach = Math.max(3, cam.r * HALO_THICKNESS, AIRGLOW_REACH) + 2
    const next = Math.ceil(2 * (cam.r + reach))
    if (next !== side || canvas.width !== Math.round(next * dpr)) {
      side = next
      canvas.width = Math.round(side * dpr)
      canvas.height = Math.round(side * dpr)
      canvas.style.width = `${side}px`
      canvas.style.height = `${side}px`
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawHalo(side / 2, cam.r, toSun, fade)
    painted = { cx: cam.cx, cy: cam.cy, r: cam.r, fade, dpr, toSun }
    pose(cam, 0)
  }

  /** Puts the canvas's centre on the disc's, turned by `turn` radians. */
  const pose = (cam: SkyCamera, turn: number) => {
    const x = cam.cx - side / 2
    const y = cam.cy - side / 2
    canvas.style.transform = turn ? `translate(${x}px, ${y}px) rotate(${turn}rad)` : `translate(${x}px, ${y}px)`
  }

  /** Whether the painted canvas still fits this camera, so turning it will do. */
  const fits = (cam: SkyCamera, toSun: number | null, fade: number) =>
    painted !== null &&
    painted.dpr === dpr &&
    Math.abs(painted.cx - cam.cx) < 0.25 &&
    Math.abs(painted.cy - cam.cy) < 0.25 &&
    Math.abs(painted.r - cam.r) < 0.25 &&
    Math.abs(painted.fade - fade) < 0.002 &&
    (painted.toSun === null) === (toSun === null)

  const draw = (at?: Date) => {
    if (!ctx) return
    now = at ?? new Date()
    if (width === 0 || height === 0) return clear()
    if (typeof document !== 'undefined' && document.hidden) return clear()

    const fade = zoomFade()
    if (fade <= 0) return clear()

    const cam = calibrate(view.project, view.centre(), view.bearing(), view.pitch())
    if (!cam) return clear()

    const n = daysSinceJ2000(now)
    const [lng, lat] = view.centre()
    const frame = skyFrame(lat, lng, gmstHours(n))

    // Geocentric, not corrected for the camera's offset from the earth's
    // centre: that parallax is 0.008° for the sun, well under a pixel. It was
    // applied while the moon was drawn, for which it reaches 2°.
    const sunEq = sunEquatorial(now)
    const sun = place(directionOf(sunEq.ra, sunEq.dec), cam, frame)
    // Which way the sun lies on screen. When it is off the drawn sky the day
    // side is still knowable — the sun is then behind the camera, which is to
    // say the whole visible face is lit — so the crescent becomes a full ring.
    // The sun itself is not drawn.
    const toSun = sun ? Math.atan2(sun.y - cam.cy, sun.x - cam.cx) : null

    if (painted && fits(cam, toSun, fade)) {
      pose(cam, toSun === null || painted.toSun === null ? 0 : toSun - painted.toSun)
      return
    }
    paint(cam, toSun, fade)
  }

  return {
    element: canvas,
    draw,
    resize,
    destroy() {
      canvas.remove()
    },
  }
}
