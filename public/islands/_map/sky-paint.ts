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
  type Placed,
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
 * `MAP_COLOURS.horizon`, measured at 1.45:1 against the ocean. MapLibre's half
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
 * Space and sea are the same tone by construction (`--map-ground` is
 * `MAP_COLOURS.ocean`), the night wash barely moves the ocean, and the
 * scattering crescent stops at the terminator. Without this, half the planet
 * has no edge and ends wherever the last coastline happens to be. Oxygen
 * recombining about 90 km up glows all round the real limb, which is why the
 * dark side of the earth has an edge in every photograph from orbit.
 *
 * Drawn as a line, not a wash, in its own token (`MAP_COLOURS.airglow`, 2.2:1
 * against the ocean, dimmer than the brightest land). `horizon` at 1.45:1 was
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
    ctx.arc(cam.cx, cam.cy, rimOuter, 0, Math.PI * 2)
    ctx.arc(cam.cx, cam.cy, rimInner, 0, Math.PI * 2, true)
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
      ctx.arc(cam.cx, cam.cy, outer, a0, a1)
      ctx.arc(cam.cx, cam.cy, cam.r, a1, a0, true)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
    }
    ctx.restore()
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

    // The sun itself is not drawn: the halo takes its bearing, which is what
    // puts the crescent on the day limb.
    drawHalo(cam, sunPlaced, fade)
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
