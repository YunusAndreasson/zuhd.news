// Ambient globe — atmospheric stippled globe in the lower-right corner.
// Implementation copied from the official cobe v2 demo:
// https://github.com/shuding/cobe/blob/main/website/app/page.tsx
//
// Key facts the README hides:
//   1. cobe v2.0.1 has NO internal animation loop. Drive `globe.update`
//      from your own requestAnimationFrame.
//   2. Pass canvas CSS width to cobe; it multiplies by `devicePixelRatio`
//      internally. Don't pre-multiply or set canvas.width yourself.
//   3. The land-mask texture is an inline `data:` URL — make sure the
//      page's CSP `img-src` allows `data:`.
//
// Smooth focus: listens for a `zuhd:globe-focus` CustomEvent with
// `{ detail: { lat, lng } }` and tweens phi/theta to that point with a
// cubic-out easing over a duration that scales with arc distance.

import createGlobe from 'cobe'

// Convert a (lat, lng) pair to cobe's (phi, theta) rotation angles.
// Pulled directly from cobe's "Focus Location" recipe.
const locationToAngles = (lat: number, lng: number): [number, number] => [
  Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2),
  (lat * Math.PI) / 180,
]

// Cubic ease-out — the smoothest curve that lands exactly on target
// without overshoot. (1 - (1 - t)^3) feels like Apple Maps panning.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

// Wrap a phi delta to take the shorter rotation path. Without this, going
// from phi=π to phi=−π (same longitude!) would spin the globe 360° instead
// of staying put.
const shortestPhiPath = (from: number, to: number): number => {
  let dx = to - from
  while (dx > Math.PI) dx -= 2 * Math.PI
  while (dx < -Math.PI) dx += 2 * Math.PI
  return from + dx
}

export const mount = (container: HTMLElement) => {
  const canvas = document.createElement('canvas')
  canvas.className = 'ambient-globe-canvas'
  container.appendChild(canvas)
  container.classList.add('ambient-globe-root')

  const start = () => {
    const width = container.offsetWidth || 600
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const darkPage = typeof matchMedia === 'function' &&
      matchMedia('(prefers-color-scheme: dark)').matches

    let phi = -0.7  // initial rotation puts central Asia / Mid-East in view
    let theta = 0.2

    // Idle-drift speed when no article is focused. When focused === true
    // (an article is open), we stop idle drift and stay locked at target.
    const IDLE_PHI_PER_FRAME = 0.0015
    let focused = false

    // Tween state — when not null, we're actively easing toward a target.
    let tween: {
      startPhi: number
      startTheta: number
      targetPhi: number
      targetTheta: number
      startTime: number
      duration: number
    } | null = null

    // Active marker — a single white pin at the focused article's location.
    // We give it `id: 'focus'` so cobe registers a CSS anchor at its on-
    // screen position. A separate DOM pulsar element (rendered outside the
    // masked globe container) tracks that anchor via CSS anchor-positioning
    // and provides the modern expanding-ring halo effect — cobe's marker
    // shader only draws solid filled dots, so rings are not possible inside
    // the canvas itself.
    let activeLocation: [number, number] | null = null

    // Pulsar host — a fixed-position sibling of the globe container.
    // CSS uses `position-anchor: --cobe-focus` to track the marker.
    const pulsar = document.createElement('div')
    pulsar.className = 'globe-pulsar'
    pulsar.innerHTML =
      '<span class="globe-pulsar-core"></span>' +
      '<span class="globe-pulsar-ring"></span>' +
      '<span class="globe-pulsar-ring globe-pulsar-ring-delay"></span>'
    document.body.appendChild(pulsar)

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width,
      height: width,
      phi: 0,
      theta,
      dark: darkPage ? 1 : 0,
      diffuse: 1.5,
      // Softer dots (was 14) — country shapes still legible but no
      // longer punchy. mapBrightness 7 balances visibility vs subtlety.
      mapSamples: 24000,
      mapBrightness: 7,
      baseColor: [1, 1, 1],
      // Default marker color — pure white to match the monochrome UI.
      markerColor: [1, 1, 1],
      glowColor: darkPage ? [0.05, 0.05, 0.06] : [0.94, 0.93, 0.91],
      markers: [],
      opacity: 1,
      context: { antialias: false },
    })

    let animationId = 0
    const tick = () => {
      const now = performance.now()
      if (tween) {
        const t = Math.min(1, (now - tween.startTime) / tween.duration)
        const eased = easeOutCubic(t)
        phi = tween.startPhi + (tween.targetPhi - tween.startPhi) * eased
        theta = tween.startTheta + (tween.targetTheta - tween.startTheta) * eased
        if (t >= 1) tween = null
      } else if (!focused) {
        // Idle drift around the equator (only when no article is open).
        phi += IDLE_PHI_PER_FRAME
      }
      // The cobe canvas marker is invisible (size 0) — it exists only to
      // register an `id` so cobe positions a CSS anchor we can track. The
      // visible pulse is rendered by the DOM pulsar element via CSS.
      const markers = activeLocation
        ? [{ id: 'focus', location: activeLocation, size: 0 }]
        : []
      globe.update({ phi, theta, markers })
      animationId = requestAnimationFrame(tick)
    }
    tick()

    // Apply a focus state — used both for incoming events and for any
    // focus that was buffered before the island finished mounting.
    const applyFocus = (lat: number, lng: number) => {
      focused = true
      activeLocation = [lat, lng]
      const [rawTargetPhi, targetTheta] = locationToAngles(lat, lng)
      const targetPhi = shortestPhiPath(phi, rawTargetPhi)
      const arcDistance = Math.hypot(targetPhi - phi, targetTheta - theta)
      // Duration scales with rotation distance — short hops feel snappy,
      // long swings still take their time. 700ms minimum, ~1800ms max.
      const duration = Math.min(1800, 700 + arcDistance * 600)
      tween = {
        startPhi: phi,
        startTheta: theta,
        targetPhi,
        targetTheta,
        startTime: performance.now(),
        duration,
      }
    }

    // Public API: dispatch `zuhd:globe-focus` with { detail: { lat, lng } }
    // to smoothly rotate to that point and pin a marker. Pass `{ detail: null }`
    // (or no detail) to release focus and resume idle drift.
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ lat: number; lng: number } | null>).detail
      if (!detail || typeof detail.lat !== 'number' || typeof detail.lng !== 'number') {
        focused = false
        activeLocation = null
        tween = null
        return
      }
      applyFocus(detail.lat, detail.lng)
    }
    document.addEventListener('zuhd:globe-focus', onFocus)

    // Pick up any focus that was dispatched before this listener attached.
    // reader.js writes the last focus to a window global on every dispatch,
    // so a hash-loaded page (which fires `openArticle` synchronously at boot,
    // potentially before the island mounts) still gets the rotation.
    const pending = (window as unknown as { __zuhdGlobeLastFocus?: { lat: number; lng: number } | null }).__zuhdGlobeLastFocus
    if (pending && typeof pending.lat === 'number' && typeof pending.lng === 'number') {
      applyFocus(pending.lat, pending.lng)
    }

    return () => {
      cancelAnimationFrame(animationId)
      document.removeEventListener('zuhd:globe-focus', onFocus)
      pulsar.remove()
      globe.destroy()
    }
  }

  let dispose: (() => void) | null = null
  requestAnimationFrame(() => {
    dispose = start()
  })

  return () => {
    dispose?.()
    canvas.remove()
    container.classList.remove('ambient-globe-root')
  }
}
