// The hovered story's mark: a gold ring round its dot, or, where the dot cannot
// be seen, a chevron at the globe's limb or the view's edge pointing to it.
//
// One mark, two places: a row in the story list and its dot on the map are the
// same story, and whichever the reader is on, the other has to answer. The
// feature-state halo alone was too small to find among a hundred dots, and a
// story on the far side of the planet showed nothing at all.
//
// DOM over the canvas rather than a layer: a ring that fades out needs a
// transition, which a feature-state paint cannot have, and the far-side
// chevron sits in space, where no layer draws. Hover never moves the camera
// (`map.md`), so the chevron points and the reader decides.

import type { Map as MapLibreMap } from 'maplibre-gl'

/** Where the hovered dot stands: its place, and its petal's offset and radius in pixels. */
export interface HoverTarget {
  lng: number
  lat: number
  /** The flower offset (`flowerOffset`), in screen pixels. */
  dx: number
  dy: number
  /** The drawn dot's radius, in pixels. */
  r: number
  /** The place's name, said beside the chevron when the dot is out of sight. */
  loc: string
}

export interface HoverMark {
  show(target: HoverTarget | null): void
  destroy(): void
}

const RAD = Math.PI / 180
/** How far the chevron stands outside the limb, or inside the view's edge, in pixels. */
const EDGE_GAP = 12
/** The ring stands this far off the dot's rim, so the dot's own colour still shows. */
const RING_GAP = 3

/** Degrees of arc between two places. */
const arc = (a: [number, number], b: [number, number]): number => {
  const [l1, p1] = [a[0] * RAD, a[1] * RAD]
  const [l2, p2] = [b[0] * RAD, b[1] * RAD]
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / RAD
}

/** Initial great-circle bearing from `a` to `b`, radians clockwise from north. */
const bearingTo = (a: [number, number], b: [number, number]): number => {
  const [l1, p1] = [a[0] * RAD, a[1] * RAD]
  const [l2, p2] = [b[0] * RAD, b[1] * RAD]
  const y = Math.sin(l2 - l1) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1)
  return Math.atan2(y, x)
}

/** The place `deg` degrees along bearing `theta` from `a`. */
const along = (a: [number, number], theta: number, deg: number): [number, number] => {
  const [l1, p1] = [a[0] * RAD, a[1] * RAD]
  const d = deg * RAD
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(theta))
  const l2 = l1 + Math.atan2(Math.sin(theta) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return [((((l2 / RAD + 540) % 360) + 360) % 360) - 180, p2 / RAD]
}

export function createHoverMark(map: MapLibreMap, host: HTMLElement): HoverMark {
  const ring = document.createElement('div')
  ring.className = 'map-hover-ring'
  ring.setAttribute('aria-hidden', 'true')

  // The chevron turns; the name beside it stays level.
  const edge = document.createElement('div')
  edge.className = 'map-hover-edge'
  edge.setAttribute('aria-hidden', 'true')
  const chevron = document.createElement('span')
  chevron.className = 'map-hover-edge-mark'
  chevron.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M4 2.5 7.5 6 4 9.5"/></svg>'
  const name = document.createElement('span')
  name.className = 'map-hover-edge-name'
  edge.append(chevron, name)

  host.append(ring, edge)

  let target: HoverTarget | null = null

  /**
   * Whether a place is on the planet's near side.
   *
   * A far-side place still projects, to the screen point behind the near
   * surface; unprojecting that point answers with the near surface. So the
   * round trip lands where it started only for a place the reader can see.
   * On the plane it is exact everywhere.
   */
  const seen = (ll: [number, number]): boolean => {
    const back = map.unproject(map.project(ll))
    return arc(ll, [back.lng, back.lat]) < 0.5
  }

  /** The canvas between the rails and above the scrubber: what the camera's padding leaves. */
  const viewBox = () => {
    const pad = map.getPadding()
    const w = map.getContainer().clientWidth
    const h = map.getContainer().clientHeight
    return { l: pad.left ?? 0, t: pad.top ?? 0, r: w - (pad.right ?? 0), b: h - (pad.bottom ?? 0) }
  }

  /**
   * Walk the ray from the view's centre toward `(x, y)` to the box's edge, inset
   * by `EDGE_GAP`. Returns the point unchanged when it is already inside.
   */
  const clampToView = (x: number, y: number, box = viewBox()): [number, number, number] => {
    const cx = (box.l + box.r) / 2
    const cy = (box.t + box.b) / 2
    const dx = x - cx
    const dy = y - cy
    const angle = Math.atan2(dy, dx)
    const hw = Math.max(0, (box.r - box.l) / 2 - EDGE_GAP)
    const hh = Math.max(0, (box.b - box.t) / 2 - EDGE_GAP)
    const k = Math.min(1, dx ? hw / Math.abs(dx) : 1, dy ? hh / Math.abs(dy) : 1)
    return [cx + dx * k, cy + dy * k, angle]
  }

  const hideRing = () => ring.classList.remove('is-on')
  const hideEdge = () => edge.classList.remove('is-on')

  const place = () => {
    if (!target) return
    const ll: [number, number] = [target.lng, target.lat]
    const box = viewBox()
    if (seen(ll)) {
      const p = map.project(ll)
      const x = p.x + target.dx
      const y = p.y + target.dy
      if (x >= box.l && x <= box.r && y >= box.t && y <= box.b) {
        const d = 2 * (target.r + RING_GAP)
        ring.style.width = `${d}px`
        ring.style.height = `${d}px`
        ring.style.transform = `translate(${x - d / 2}px, ${y - d / 2}px)`
        ring.classList.add('is-on')
        hideEdge()
        return
      }
      // On the near side but out of the view: the plane zoomed in, or a
      // place under a rail. The chevron stands on the view's edge.
      const [ex, ey, angle] = clampToView(x, y, box)
      pointAt(ex, ey, angle)
      return
    }
    // The far side. Follow the great circle from the camera's centre toward the
    // place to the last point still on the near side, which is the limb in
    // that direction, and stand the chevron just outside it.
    const c = map.getCenter()
    const from: [number, number] = [c.lng, c.lat]
    const theta = bearingTo(from, ll)
    let lo = 0
    let hi = arc(from, ll)
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      if (seen(along(from, theta, mid))) lo = mid
      else hi = mid
    }
    const centre = map.project(from)
    const limb = map.project(along(from, theta, lo))
    const angle = Math.atan2(limb.y - centre.y, limb.x - centre.x)
    const [ex, ey] = clampToView(
      limb.x + Math.cos(angle) * EDGE_GAP,
      limb.y + Math.sin(angle) * EDGE_GAP,
      box,
    )
    pointAt(ex, ey, angle)
  }

  const pointAt = (x: number, y: number, angle: number) => {
    edge.style.transform = `translate(${x}px, ${y}px)`
    chevron.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`
    // The name goes on the side away from the edge it points at.
    edge.classList.toggle('is-low', Math.sin(angle) > 0.5)
    const label = target?.loc ?? ''
    if (name.textContent !== label) name.textContent = label
    edge.classList.add('is-on')
    hideRing()
  }

  let following = false
  const follow = (on: boolean) => {
    if (on === following) return
    following = on
    if (on) map.on('move', place)
    else map.off('move', place)
  }

  return {
    show(next) {
      target = next
      if (!next) {
        follow(false)
        hideRing()
        hideEdge()
        return
      }
      place()
      follow(true)
    },
    destroy() {
      follow(false)
      ring.remove()
      edge.remove()
    },
  }
}
