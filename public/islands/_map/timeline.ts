// The time rail: a story-volume histogram over a dated day axis, with a
// scrubber on top.
//
// A bare slider gives you no sense of *when* — you can drag it, but you can't
// aim. So the rail is drawn as a calendar: one tick and one label per UTC day,
// with the histogram sitting on that axis, and the scrub head snapping to
// six-hour slots so landing on a particular day is easy rather than fiddly.
//
// A real <input type="range"> does the interaction so keyboard, touch and
// screen readers all work without reimplementation; the canvas behind it is
// purely presentational.

import type { MapPoint } from './types'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
/** Scrub granularity. Four slots per day is precise without being fiddly. */
const SLOT_MS = 6 * HOUR_MS
const BUCKET_MS = 2 * HOUR_MS

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface Timeline {
  element: HTMLElement
  setPoints(points: MapPoint[]): void
  /** Current scrub time in ms. Equals `end` when live. */
  now(): number
  isLive(): boolean
  goLive(): void
  destroy(): void
}

export interface TimelineOptions {
  start: number
  end: number
  onChange: (now: number, live: boolean) => void
}

export function createTimeline(opts: TimelineOptions): Timeline {
  const { end } = opts
  // Anchor the axis on a UTC midnight so day columns are real days.
  const start = Math.floor(opts.start / DAY_MS) * DAY_MS
  const span = Math.max(SLOT_MS, end - start)
  const slots = Math.max(1, Math.round(span / SLOT_MS))

  const root = document.createElement('div')
  root.className = 'map-timeline'

  const head = document.createElement('div')
  head.className = 'map-timeline-head'

  const readout = document.createElement('output')
  readout.className = 'map-timeline-readout'

  const liveBtn = document.createElement('button')
  liveBtn.type = 'button'
  liveBtn.className = 'map-timeline-live'
  liveBtn.textContent = 'back to live'
  liveBtn.hidden = true

  head.append(readout, liveBtn)

  const track = document.createElement('div')
  track.className = 'map-timeline-track'

  const canvas = document.createElement('canvas')
  canvas.className = 'map-timeline-canvas'
  canvas.setAttribute('aria-hidden', 'true')

  const range = document.createElement('input')
  range.type = 'range'
  range.min = '0'
  range.max = String(slots)
  range.step = '1'
  range.value = String(slots)
  range.className = 'map-timeline-range'
  range.setAttribute('aria-label', 'Scrub through the last 14 days')

  track.append(canvas, range)
  root.append(head, track)

  let points: MapPoint[] = []
  let value = slots
  let ctx: CanvasRenderingContext2D | null = null

  const scrubTime = () => Math.min(end, start + value * SLOT_MS)
  const live = () => value >= slots

  const fmtDate = (t: number) => {
    const d = new Date(t)
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  }
  const fmtTime = (t: number) => new Date(t).toISOString().slice(11, 16)

  const updateReadout = () => {
    const t = scrubTime()
    if (live()) {
      readout.textContent = `live · ${fmtDate(t)} ${fmtTime(t)} UTC`
    } else {
      const backDays = (end - t) / DAY_MS
      const ago = backDays >= 1 ? `${Math.round(backDays)}d back` : `${Math.round((end - t) / HOUR_MS)}h back`
      readout.textContent = `${fmtDate(t)} ${fmtTime(t)} UTC · ${ago}`
    }
    range.setAttribute('aria-valuetext', `${fmtDate(scrubTime())} ${fmtTime(scrubTime())} UTC`)
  }

  const draw = () => {
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const cs = getComputedStyle(root)
    const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
    // Custom properties resolve to light-dark() strings canvas can't parse, so
    // the probe trick from render.ts applies here too.
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;opacity:0'
    root.appendChild(probe)
    const colour = (name: string, fallback: string) => {
      probe.style.color = fallback
      probe.style.color = `var(${name}, ${fallback})`
      return getComputedStyle(probe).color || fallback
    }
    const dim = colour('--rule', '#ddd')
    const mid = colour('--text-dim', '#777')
    const bright = colour('--text', '#222')

    const axisH = 12
    const barH = h - axisH - 2
    const xOf = (t: number) => ((t - start) / span) * w

    // Day columns first — the axis the histogram sits on.
    ctx.font = '9px var(--font-sans, sans-serif)'
    ctx.textBaseline = 'alphabetic'
    const headT = scrubTime()
    for (let day = start; day <= end; day += DAY_MS) {
      const x = xOf(day)
      const isCurrent = headT >= day && headT < day + DAY_MS
      ctx.strokeStyle = isCurrent ? mid : dim
      ctx.globalAlpha = isCurrent ? 0.9 : 0.5
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, barH + 3)
      ctx.stroke()

      const d = new Date(day)
      const label = d.getUTCDate() === 1 ? MONTHS[d.getUTCMonth()] : String(d.getUTCDate())
      ctx.fillStyle = isCurrent ? bright : mid
      ctx.globalAlpha = isCurrent ? 1 : 0.55
      ctx.textAlign = 'left'
      if (x + 18 < w) ctx.fillText(label, x + 3, h - 2)
    }
    ctx.globalAlpha = 1

    // Volume histogram.
    const buckets = Math.max(1, Math.round(span / BUCKET_MS))
    const counts = new Array(buckets).fill(0)
    for (const p of points) {
      const idx = Math.floor(((p.t - start) / span) * buckets)
      if (idx >= 0 && idx < buckets) counts[idx]++
    }
    const max = Math.max(1, ...counts)
    const barW = w / buckets
    for (let i = 0; i < buckets; i++) {
      if (!counts[i]) continue
      const bh = (counts[i] / max) * barH
      const past = start + i * BUCKET_MS <= headT
      ctx.fillStyle = past ? mid : dim
      ctx.globalAlpha = past ? 0.75 : 0.35
      ctx.fillRect(i * barW, barH - bh, Math.max(1, barW - 0.7), bh)
    }
    ctx.globalAlpha = 1
    probe.remove()
  }

  const emit = () => {
    updateReadout()
    liveBtn.hidden = live()
    root.classList.toggle('is-scrubbed', !live())
    draw()
    opts.onChange(scrubTime(), live())
  }

  const onInput = () => {
    value = Number(range.value)
    emit()
  }

  const onLive = () => {
    value = slots
    range.value = String(slots)
    emit()
  }

  range.addEventListener('input', onInput)
  liveBtn.addEventListener('click', onLive)

  queueMicrotask(() => {
    ctx = canvas.getContext('2d')
    updateReadout()
    draw()
  })

  const onResize = () => draw()
  window.addEventListener('resize', onResize)

  return {
    element: root,
    setPoints(next) {
      points = next
      draw()
    },
    now: scrubTime,
    isLive: live,
    goLive: onLive,
    destroy() {
      range.removeEventListener('input', onInput)
      liveBtn.removeEventListener('click', onLive)
      window.removeEventListener('resize', onResize)
      root.remove()
    },
  }
}
