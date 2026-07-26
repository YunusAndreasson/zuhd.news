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

import { HIJRI_NOTE, hijriLabel } from './hijri'
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
  /**
   * The slice of the rail the map is currently drawing, as a start time.
   * `null` means the whole window. Shaded on the axis so the range chips and
   * the scrubber stop being two unrelated time controls.
   */
  setWindow(from: number | null): void
  destroy(): void
}

export interface TimelineOptions {
  start: number
  end: number
  onChange: (now: number, live: boolean) => void
  /**
   * Something to sit at the left-hand end of the head row.
   *
   * The head is `justify-content: flex-end` with the readout and the back-to-
   * live button on the right, so the left two thirds of it are empty on every
   * viewport. That is the map's readout row — the one line already saying what
   * time it is — and it is where the markets strip goes, rather than becoming a
   * third row of HUD over the map or hiding behind the phone disclosure.
   */
  lead?: HTMLElement
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

  /**
   * The same instant in the other calendar.
   *
   * This is the map's one line saying what time it is, so it is the only place
   * on the site a second calendar can go without repeating itself — the
   * article kicker says "3h ago" and has no date to double up, and the footer
   * date would be a third statement of a fact already made twice.
   *
   * It earns the space by moving: the rail spans fourteen days, so scrubbing
   * it walks half a lunar month, and the Hijri date is the only thing on the
   * readout that makes that visible. A static badge would just be a badge.
   *
   * Its own element rather than more text, because it is a different kind of
   * fact from the clock beside it and the narrow-viewport rule needs something
   * to hide.
   */
  const hijri = document.createElement('span')
  hijri.className = 'map-timeline-hijri'
  hijri.title = HIJRI_NOTE

  const liveBtn = document.createElement('button')
  liveBtn.type = 'button'
  liveBtn.className = 'map-timeline-live'
  liveBtn.textContent = 'back to live'
  liveBtn.hidden = true

  if (opts.lead) head.append(opts.lead)
  head.append(readout, hijri, liveBtn)

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
  let windowFrom: number | null = null

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
    // Read in the same frame as the clock beside it. Mixing frames on one line
    // — a UTC time against the reader's local Hijri day — would put two
    // different days on the same row for anyone east of the Atlantic, which is
    // a worse error than the maghrib approximation `HIJRI_NOTE` states.
    const hijriText = hijriLabel(t)
    hijri.textContent = hijriText
    hijri.hidden = !hijriText
    range.setAttribute(
      'aria-valuetext',
      `${fmtDate(scrubTime())} ${fmtTime(scrubTime())} UTC${hijriText ? `, ${hijriText}` : ''}`,
    )
  }

  /**
   * The palette, resolved once.
   *
   * Custom properties resolve to `light-dark()` strings canvas cannot parse, so
   * each colour has to be round-tripped through a real element that has a
   * computed style. Canvas has the same problem with `font`: it parses the
   * shorthand with no element to resolve against, so a `var()` in it is invalid
   * and the assignment is silently dropped — the day labels were falling back
   * to default sans while the rest of the map ran on Source Sans.
   *
   * This used to run *inside* `draw`, which meant appending a probe element to
   * the document, four `getComputedStyle` reads and a removal on every frame of
   * a scrub — a forced style recalculation per pointer move, on the one
   * interaction where the frame budget is already spent rebuilding the story
   * layer. None of these values can change while the map is open: the page
   * commits to `color-scheme: dark` and the tokens are static.
   */
  const readPalette = () => {
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;opacity:0'
    root.append(probe)
    const colour = (name: string, fallback: string) => {
      probe.style.color = fallback
      probe.style.color = `var(${name}, ${fallback})`
      return getComputedStyle(probe).color || fallback
    }
    const palette = {
      dim: colour('--rule', '#ddd'),
      mid: colour('--text-dim', '#777'),
      bright: colour('--text', '#222'),
      family: getComputedStyle(probe).fontFamily || 'sans-serif',
    }
    probe.remove()
    return palette
  }

  let palette: ReturnType<typeof readPalette> | null = null

  const draw = () => {
    if (!ctx) return
    const dpr = Math.min(devicePixelRatio, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    // Assigning `width`/`height` reallocates the backing store and clears it,
    // so it is only worth doing when the size actually moved — otherwise every
    // scrub frame threw away a buffer to draw the same-sized one again.
    const bw = Math.round(w * dpr)
    const bh = Math.round(h * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    palette ??= readPalette()
    const { dim, mid, bright, family } = palette

    const axisH = 12
    const barH = h - axisH - 2
    const xOf = (t: number) => ((t - start) / span) * w

    // The slice the map is actually drawing. Without it the chips say "24h"
    // while the rail shows fourteen days of bars, and nothing connects the
    // two — the reader has no way to see that most of this histogram is not
    // on the map.
    const headT = scrubTime()
    if (windowFrom !== null && windowFrom > start) {
      const x0 = Math.max(0, xOf(windowFrom))
      const x1 = Math.min(w, xOf(headT))
      if (x1 > x0) {
        ctx.fillStyle = mid
        ctx.globalAlpha = 0.12
        ctx.fillRect(x0, 0, x1 - x0, barH + 3)
        ctx.globalAlpha = 1
      }
    }

    // Day columns first — the axis the histogram sits on.
    ctx.font = `9px ${family}`
    ctx.textBaseline = 'alphabetic'
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
  }

  /**
   * Coalesces redraws onto the next frame.
   *
   * `input` fires far faster than a canvas repaint is worth doing, and the
   * island's own refresh is already rAF-batched for exactly this reason — the
   * rail was the one part of a scrub still running synchronously per event.
   */
  let drawFrame = 0
  const scheduleDraw = () => {
    if (drawFrame) return
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0
      draw()
    })
  }

  const emit = () => {
    updateReadout()
    liveBtn.hidden = live()
    root.classList.toggle('is-scrubbed', !live())
    scheduleDraw()
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

  const onResize = () => scheduleDraw()
  window.addEventListener('resize', onResize, { passive: true })

  return {
    element: root,
    setPoints(next) {
      points = next
      scheduleDraw()
    },
    setWindow(from) {
      if (from === windowFrom) return
      windowFrom = from
      scheduleDraw()
    },
    destroy() {
      if (drawFrame) cancelAnimationFrame(drawFrame)
      range.removeEventListener('input', onInput)
      liveBtn.removeEventListener('click', onLive)
      window.removeEventListener('resize', onResize)
      root.remove()
    },
  }
}
