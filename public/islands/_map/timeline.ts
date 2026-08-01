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

import { MAKKAH_LABEL, MAKKAH_TZ, zoneOffset } from './format'
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
  /**
   * The readout row, exposed so the island can move the markets strip out of it.
   *
   * On a wide screen the strip belongs in the instrument rail, where its four
   * summaries stack instead of competing with the clock for one line — but the
   * rail only exists at some viewports and the scrubber is rebuilt whenever a
   * refresh moves the window, so which parent the strip has is a decision that
   * has to be re-made rather than made once at construction. `lead` still puts
   * it here by default, which is the right answer everywhere else.
   */
  head: HTMLElement
  setPoints(points: MapPoint[]): void
  /**
   * The slice of the rail the map is currently drawing, as a start time.
   * `null` means the whole window. Shaded on the axis so the range chips and
   * the scrubber stop being two unrelated time controls.
   */
  setWindow(from: number | null): void
  /**
   * Is the scrub head at the live edge?
   *
   * Asked rather than tracked. The island used to keep its own `timelineLive`
   * flag written from the `onChange` callback — which is only ever fired by a
   * user gesture, so before the reader had touched the scrubber the flag was an
   * assumption rather than an observation, and a refresh read it as "not live"
   * and left the reader behind the new window. The rail is the only thing that
   * actually knows, so it is the thing that answers.
   */
  isLive(): boolean
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
  /**
   * Where to put the scrub head, as a timestamp. Defaults to the live edge.
   *
   * Only the refresh control uses this. The rail is drawn against a fixed span,
   * so when new stories move the window the whole scrubber is rebuilt — and a
   * rebuild that silently returned a scrubbed reader to "now" would move them
   * somewhere they did not ask to go, which is the one thing this map's
   * interaction rules keep refusing to do.
   */
  value?: number | undefined
}

export function createTimeline(opts: TimelineOptions): Timeline {
  const { end } = opts
  /**
   * How far Makkah is ahead of UTC, resolved once for this rail.
   *
   * Every date on this component — the axis anchor, the tick labels, the
   * readout and the Hijri date — is shifted by it, so they cannot disagree.
   * Changing only the readout would have been the smaller edit and a worse
   * one: between 21:00 and 24:00 UTC the Makkah date is already tomorrow, so
   * for three hours of every day the readout would have named a day the tick
   * under the scrub head contradicted.
   *
   * Once, not per call: Saudi Arabia has no daylight saving, so the offset is
   * constant across any window this rail can span.
   */
  const tzOffset = zoneOffset(opts.start, MAKKAH_TZ)
  // Anchor the axis on a Makkah midnight so day columns are real local days.
  const start = Math.floor((opts.start + tzOffset) / DAY_MS) * DAY_MS - tzOffset
  const span = Math.max(SLOT_MS, end - start)
  /**
   * Ceiling, not rounding: the last slot must never fall short of the window.
   *
   * `scrubTime` is `Math.min(end, start + value * SLOT_MS)`, so the live
   * position only lands on the true live edge when the final slot boundary sits
   * at or past `end` and the clamp fires. With `Math.round` that depended
   * entirely on where the day anchor happened to fall: under the old UTC anchor
   * the rounding overshot and the clamp fired, and moving the anchor to Makkah
   * midnight flipped it to the short side — the readout then said 00:00 for a
   * window that actually ended at 00:15, and `live()` reported the live edge
   * while the map was filtered to fifteen minutes before it, quietly hiding any
   * story in that sliver.
   *
   * It was correct by luck rather than by construction, which is why this is a
   * ceiling now. The final slot is a sliver rather than a full six hours, which
   * was already true of the first one.
   */
  const slots = Math.max(1, Math.ceil(span / SLOT_MS))

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
  // Clamped into the rail: a held position from a previous window can sit
  // before the new start once the fortnight has rolled forward.
  const initialSlot =
    opts.value === undefined
      ? slots
      : Math.max(0, Math.min(slots, Math.round((opts.value - start) / SLOT_MS)))
  range.value = String(initialSlot)
  range.className = 'map-timeline-range'
  range.setAttribute('aria-label', 'Scrub through the last 14 days')

  track.append(canvas, range)
  root.append(head, track)

  let points: MapPoint[] = []
  let value = initialSlot
  let ctx: CanvasRenderingContext2D | null = null
  let windowFrom: number | null = null

  const scrubTime = () => Math.min(end, start + value * SLOT_MS)
  const live = () => value >= slots

  // Shifted into Makkah, then read with the UTC accessors — which is what the
  // offset is for. Doing it this way keeps one arithmetic frame across the
  // whole file rather than mixing `Intl` formatting into the canvas tick
  // labels, where a per-tick `DateTimeFormat` would also be the expensive way
  // to get one number.
  const local = (t: number) => new Date(t + tzOffset)

  const fmtDate = (t: number) => {
    const d = local(t)
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  }
  const fmtTime = (t: number) => local(t).toISOString().slice(11, 16)

  const updateReadout = () => {
    const t = scrubTime()
    if (live()) {
      readout.textContent = `live · ${fmtDate(t)} ${fmtTime(t)} ${MAKKAH_LABEL}`
    } else {
      const backDays = (end - t) / DAY_MS
      const ago = backDays >= 1 ? `${Math.round(backDays)}d back` : `${Math.round((end - t) / HOUR_MS)}h back`
      readout.textContent = `${fmtDate(t)} ${fmtTime(t)} ${MAKKAH_LABEL} · ${ago}`
    }
    // Read in the same frame as the clock beside it. Mixing frames on one line
    // — a Makkah time against the reader's local Hijri day — would put two
    // different days on the same row for most of the world, which is a worse
    // error than the maghrib approximation `HIJRI_NOTE` states. Makkah is also
    // the frame Umm al-Qura is actually defined in, so this pairing is now the
    // correct one rather than merely the consistent one.
    const hijriText = hijriLabel(t, MAKKAH_TZ)
    hijri.textContent = hijriText
    hijri.hidden = !hijriText
    range.setAttribute(
      'aria-valuetext',
      `${fmtDate(scrubTime())} ${fmtTime(scrubTime())} ${MAKKAH_LABEL}${hijriText ? `, ${hijriText}` : ''}`,
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
   *
   * **The map's tokens, not the site's.** These were `--rule`, `--text-dim` and
   * `--text` — the palette for pages that follow the reader, on the one page
   * that commits to dark regardless of them. `--rule` resolves to `#181818` on
   * this surface: 1.03:1 against the ocean, and *darker than the land*. It was
   * painting the day columns and every bar outside the visible window, so the
   * axis this rail is built around — "a bare slider gives you no sense of
   * *when*", per the header — was drawn in a colour that does not exist on
   * screen. `--text-dim` is a neutral grey where the whole chrome is blue-grey,
   * and it carried the tick labels.
   *
   * The dark-surface palette exists for exactly this: chrome sitting on the
   * map's ground rather than on a CSS surface. `--map-ink-dim` is its floor —
   * 5.52:1 against `--map-ground`, so a label drawn in it at full strength is
   * readable rather than merely present.
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
      dim: colour('--map-line', '#232936'),
      mid: colour('--map-ink-dim', '#7f8896'),
      bright: colour('--map-ink', '#e6eaf0'),
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
    //
    // **It has to be visible to do that.** The band was `--text-dim` at
    // `globalAlpha` 0.12, under a `.map-timeline-track` wrapper at `opacity`
    // 0.6 — 0.072 of a neutral grey over near-black, which is a rectangle
    // nobody can see. On the default 3d view that is the whole answer to "which
    // of these fourteen days am I looking at", and it was not on screen. Now it
    // is `--map-ink-dim` at 0.16 with the wrapper opacity gone, and it carries
    // a rule at its left edge: the right edge is already drawn by the scrub
    // head, so one rule closes the shape.
    const headT = scrubTime()
    const windowStart = windowFrom !== null && windowFrom > start ? windowFrom : start
    if (windowStart > start) {
      const x0 = Math.max(0, xOf(windowStart))
      const x1 = Math.min(w, xOf(headT))
      if (x1 > x0) {
        ctx.fillStyle = mid
        ctx.globalAlpha = 0.16
        ctx.fillRect(x0, 0, x1 - x0, barH + 3)
        ctx.globalAlpha = 0.55
        ctx.fillRect(Math.round(x0), 0, 1, barH + 3)
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
      ctx.globalAlpha = isCurrent ? 0.9 : 1
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, barH + 3)
      ctx.stroke()

      const d = local(day)
      const label = d.getUTCDate() === 1 ? MONTHS[d.getUTCMonth()] : String(d.getUTCDate())
      ctx.fillStyle = isCurrent ? bright : mid
      // 0.9, not the 0.55 this was. These are the dates — the thing that makes
      // the rail a calendar rather than a slider — set at 9px, and under the
      // old stack (site `--text-dim`, 0.55 here, 0.6 on the wrapper) they
      // composited to **1.51:1** against the ground. `--map-ink-dim` at 0.9 is
      // 4.65:1, which clears AA; the day under the head stays `--map-ink` so
      // "which day am I on" is still the loudest thing on the axis.
      ctx.globalAlpha = isCurrent ? 1 : 0.9
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
      // Drawn or not drawn — the same question the band above answers, asked
      // per bar. It used to split on `bucket <= headT`, which is *before or
      // after the scrub head*: two states, and the wrong two. The map draws
      // `windowStart … headT`, so on the 3d view the rail was painting eleven
      // days of bars at the same weight as the three that were on screen, and
      // dimming only the bars in the future of the head — of which, at the live
      // edge, there are none. A reader taking the histogram at its word saw a
      // fortnight of activity claimed for a map showing three days of it.
      const t = start + i * BUCKET_MS
      const shown = t >= windowStart && t <= headT
      ctx.fillStyle = shown ? mid : dim
      // The out-of-window weight is high for a `--map-line` bar rather than low
      // for an ink one: those days are still the shape of the fortnight, which
      // is what makes the window legible as a slice *of* something, and the
      // separation is carried by the two tones being a step apart rather than
      // by fading one of them out.
      ctx.globalAlpha = shown ? 0.85 : 0.9
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
    head,
    setPoints(next) {
      points = next
      scheduleDraw()
    },
    setWindow(from) {
      if (from === windowFrom) return
      windowFrom = from
      scheduleDraw()
    },
    isLive: live,
    destroy() {
      if (drawFrame) cancelAnimationFrame(drawFrame)
      range.removeEventListener('input', onInput)
      liveBtn.removeEventListener('click', onLive)
      window.removeEventListener('resize', onResize)
      root.remove()
    },
  }
}
