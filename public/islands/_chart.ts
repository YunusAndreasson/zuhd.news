// The series chart, in a browser.
//
// `@shared/chart/series` decides where every mark goes; this puts those marks
// in the document and then adds the half of a chart that only exists once
// there is a pointer and a keyboard: a cursor that reads a value off the line,
// a range control that rescales it, and the numbers themselves.
//
// ── What was missing ──────────────────────────────────────────────────────
//
// The charts on this site drew 86 days of vessel traffic and printed three of
// those numbers. A reader could see that something had fallen and could not
// find out when, by how much, or what it was on any particular day — the shape
// was the whole of the information, and a shape is exactly the part of a chart
// that a reader cannot check. Everything here answers a question the drawn
// line raises and cannot settle.
//
// ── Framework-free, deliberately ──────────────────────────────────────────
//
// This is imported by `situation-map.ts`, which ships no framework at all, so
// it builds DOM directly. The entity sheet is Preact and mounts it through a
// ref rather than the other way round: a second rendering of the same chart is
// the thing this whole refactor exists to delete, and one imperative chart in a
// Preact page costs nothing but a `useEffect`.

import {
  chartDescription,
  pointReadout,
  rangeOptions,
  rowMark,
  seriesModel,
  signedPct,
  stepChange,
  type SceneNode,
  type SeriesModel,
  type SeriesOptions,
  type SeriesPoint,
} from '@shared/chart/series'
import { el, svgEl } from './_dom'



/** One scene node into one SVG element. The whole of the DOM adapter. */
export const renderNode = (n: SceneNode): SVGElement => {
  const node = svgEl(n.tag, n.attrs)
  if (n.text != null) node.textContent = n.text
  return node
}

export interface ChartOptions extends SeriesOptions {
  /**
   * The line under the chart naming what it is — source, cadence, what the
   * rule marks. Static; the readout above the chart is what moves.
   */
  caption?: string | undefined
  /**
   * Offer the range control when the series is long enough for it. Off for a
   * chart in a space too tight to hold a row of buttons.
   */
  ranges?: boolean
  /**
   * Offer the numbers behind the chart, as a closed `<details>`.
   *
   * On by default. A closed disclosure costs one line of type and is the only
   * route this site has ever offered to an individual observation — it is also
   * the accessible equivalent of the cursor, which is why it is not optional
   * where the cursor is present.
   */
  table?: boolean
  /**
   * Extra classes for the `<figure>`, so a surface can place the chart in its
   * own layout. Reapplied on every rebuild, because the tone class is written
   * to `className` wholesale and would otherwise drop it on the first range
   * change.
   */
  className?: string
}

export interface Chart {
  element: HTMLElement
  /** Redraw against a new series without replacing the node. */
  update(next: ChartOptions): void
  destroy(): void
}

/** Ids only have to be unique within a document, and only for `aria-*`. */
let uid = 0

/**
 * A single-series chart with everything a reader needs to check it.
 *
 * Returns null for a series too short to have a shape, so a caller can render
 * nothing rather than an empty box.
 */
export function createChart(opts: ChartOptions): Chart | null {
  let options: ChartOptions = { ...opts }
  let model = seriesModel(options)
  if (!model.ok) return null

  const id = `chart-${++uid}`
  const figure = el('figure', 'chart')

  // --- The readout ---------------------------------------------------------
  // Always present, always saying something true. At rest it names the latest
  // observation — the current value *and its date*, which is a fact none of
  // these charts stated before and the one most readers came for. Under a
  // pointer or a keyboard cursor it tracks. Reserving the line means moving the
  // pointer over the chart never shifts the layout under it.
  const readout = el('p', 'chart-readout')
  readout.id = `${id}-readout`
  readout.setAttribute('role', 'status')
  readout.setAttribute('aria-live', 'polite')

  // --- The plot ------------------------------------------------------------
  // The focusable, labelled thing is the wrapper, not the SVG. One accessible
  // node carrying the summary, one live region carrying the cursor, and the
  // table for anyone who wants all of it — rather than an `<svg role="img">`
  // that is also a keyboard widget, which is two roles for one element and
  // announces as neither.
  const plot = el('div', 'chart-plot')
  plot.tabIndex = 0
  plot.setAttribute('role', 'img')
  plot.setAttribute('aria-describedby', readout.id)

  const svg = svgEl('svg', {
    class: 'chart-svg',
    viewBox: `0 0 ${model.width} ${model.height}`,
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
    focusable: 'false',
  })
  plot.append(svg)

  // The cursor lives above the scene and outside it — the scene is rebuilt
  // wholesale on every range change and the cursor's state must survive that.
  const cursor = svgEl('g', { class: 'chart-cursor' })
  const cursorRule = svgEl('line', { class: 'chart-cursor-rule' })
  const cursorDot = svgEl('circle', { class: 'chart-cursor-dot', r: 3.2 })
  cursor.append(cursorRule, cursorDot)

  // --- Controls ------------------------------------------------------------
  const controls = el('div', 'chart-controls')
  const ranges = el('div', 'chart-ranges')
  ranges.setAttribute('role', 'group')
  const caption = el('figcaption', 'chart-caption')
  controls.append(ranges, caption)

  // --- The numbers ---------------------------------------------------------
  const details = el('details', 'chart-data')
  const summary = el('summary', 'chart-data-summary')
  const dataBody = el('div', 'chart-data-body')
  details.append(summary, dataBody)

  figure.append(readout, plot, controls, details)

  // -------------------------------------------------------------------------

  let cursorAt: SeriesPoint | null = null

  const restReadout = () => {
    const p = model.latest
    return p ? pointReadout(model, p) : ''
  }

  const showCursor = (p: SeriesPoint | null) => {
    cursorAt = p
    if (!p) {
      cursor.setAttribute('visibility', 'hidden')
      readout.textContent = restReadout()
      readout.classList.remove('is-live')
      return
    }
    cursor.removeAttribute('visibility')
    cursorRule.setAttribute('x1', String(p.x))
    cursorRule.setAttribute('x2', String(p.x))
    cursorRule.setAttribute('y1', String(model.pad.t - 6))
    cursorRule.setAttribute('y2', String(model.height - model.pad.b))
    cursorDot.setAttribute('cx', String(p.x))
    cursorDot.setAttribute('cy', String(p.y))
    readout.textContent = pointReadout(model, p)
    readout.classList.add('is-live')
  }

  /** Client x → viewBox x. The SVG scales uniformly, so one ratio does it. */
  const toViewBoxX = (clientX: number): number => {
    const box = svg.getBoundingClientRect()
    if (!box.width) return 0
    // `xMidYMid meet` letterboxes when the box's aspect differs from the
    // viewBox's; the drawn width is whichever dimension binds. Ignoring that
    // put the cursor a few points off on a squat container, which reads as the
    // chart being wrong rather than as the maths being approximate.
    const scale = Math.min(box.width / model.width, box.height / model.height)
    const drawnW = model.width * scale
    const offset = (box.width - drawnW) / 2
    return (clientX - box.left - offset) / scale
  }

  const onPointerMove = (e: PointerEvent) => {
    showCursor(model.nearest(toViewBoxX(e.clientX)))
  }
  const onPointerLeave = () => {
    // A keyboard cursor survives the pointer leaving: they are the same cursor,
    // and a reader who tabbed to the chart and then happened to move the mouse
    // off it should not lose their place.
    if (document.activeElement !== plot) showCursor(null)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const pts = model.points
    if (!pts.length) return
    const at = cursorAt ? pts.findIndex((p) => p.i === cursorAt?.i) : -1
    let next = at
    switch (e.key) {
      case 'ArrowRight':
        next = at < 0 ? 0 : Math.min(pts.length - 1, at + 1)
        break
      case 'ArrowLeft':
        next = at < 0 ? pts.length - 1 : Math.max(0, at - 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = pts.length - 1
        break
      case 'Escape':
        if (!cursorAt) return
        showCursor(null)
        e.stopPropagation()
        e.preventDefault()
        return
      default:
        return
    }
    e.preventDefault()
    // Escape has to reach the map before the chart's own handler eats it — the
    // map closes its card on Escape and a chart swallowing that would strand a
    // reader inside a sheet. So it only stops propagation when it actually did
    // something, which is the one case where the chart has a claim on the key.
    showCursor(pts[next])
  }

  const onBlur = () => showCursor(null)
  const onFocus = () => {
    // Focus alone shows the latest point rather than nothing, so tabbing here
    // demonstrates what the arrows are for.
    if (!cursorAt) showCursor(model.latest)
  }

  plot.addEventListener('pointermove', onPointerMove)
  plot.addEventListener('pointerdown', onPointerMove)
  plot.addEventListener('pointerleave', onPointerLeave)
  plot.addEventListener('keydown', onKeyDown)
  plot.addEventListener('focus', onFocus)
  plot.addEventListener('blur', onBlur)

  // --- Range control -------------------------------------------------------

  let windowAt = options.window ?? 0

  const drawRanges = () => {
    ranges.replaceChildren()
    const opts = options.ranges === false ? [] : rangeOptions(model.totalLength)
    ranges.hidden = opts.length === 0
    if (!opts.length) return
    ranges.setAttribute('aria-label', `How much of the series to draw`)
    for (const n of opts) {
      const b = el('button', 'chart-range', n === 0 ? 'all' : String(n))
      b.type = 'button'
      const on = n === windowAt || (n === 0 && !windowAt)
      b.setAttribute('aria-pressed', on ? 'true' : 'false')
      b.setAttribute(
        'aria-label',
        n === 0 ? `All ${model.totalLength} ${model.step}` : `Last ${n} ${model.step}`,
      )
      b.addEventListener('click', () => {
        if (windowAt === n) return
        windowAt = n
        rebuild()
      })
      ranges.append(b)
    }
  }

  // --- The table -----------------------------------------------------------

  const drawSummary = () => {
    summary.replaceChildren(
      el('span', 'chart-data-label', 'the numbers'),
      el('span', 'chart-data-count', `${model.windowValues.length}`),
    )
  }

  /**
   * Built on first open, not on render.
   *
   * 86 rows of three cells is not expensive, and the chokepoint sheet builds
   * one of these per marker the reader hovers. Deferring it means the cost is
   * paid by the reader who asked for the numbers rather than by every hover.
   */
  let tableFor: SeriesModel | null = null
  const drawTable = () => {
    if (tableFor === model) return
    tableFor = model
    dataBody.replaceChildren()

    const table = el('table', 'chart-table')
    const thead = el('thead')
    const hrow = el('tr')
    for (const [text, cls] of [
      ['when', 'is-when'],
      ['value', 'is-value'],
      ['change', 'is-change'],
    ] as const) {
      const th = el('th', cls, text)
      th.scope = 'col'
      hrow.append(th)
    }
    thead.append(hrow)
    table.append(thead)

    const tbody = el('tbody')
    // Oldest first, the same direction the line runs. A table reading the
    // other way to the chart above it is a small trap, and it also breaks the
    // change column: "change" means from the previous observation, and in a
    // reversed table the previous observation is the row below.
    model.windowValues.forEach((v, i) => {
      const tr = el('tr')
      if (model.peak && i === model.peak.i) tr.classList.add('is-peak')
      if (model.trough && i === model.trough.i) tr.classList.add('is-trough')
      if (model.latest && i === model.latest.i) tr.classList.add('is-latest')

      const when = el('th', 'is-when')
      when.scope = 'row'
      when.append(el('span', undefined, model.windowPeriods[i] ?? String(i + 1)))
      const mark = rowMark(model, i)
      if (mark) when.append(el('span', 'chart-mark', mark))
      tr.append(when)

      // A gap is a fact about the series, not a row to leave out. PortWatch
      // and Yahoo both publish holes, and a table that silently skipped them
      // would make a fortnight look like it had fewer days in it.
      const value = Number.isFinite(v) ? model.formatExact(v) : '—'
      tr.append(el('td', 'is-value', model.unit && Number.isFinite(v) ? `${value} ${model.unit}` : value))

      const ch = stepChange(model.windowValues, i)
      const td = el(
        'td',
        `is-change${ch == null ? '' : ch > 0 ? ' is-pos' : ch < 0 ? ' is-neg' : ''}`,
        ch == null ? '' : signedPct(ch),
      )
      tr.append(td)
      tbody.append(tr)
    })
    table.append(tbody)

    const scroll = el('div', 'chart-table-scroll')
    scroll.append(table)
    dataBody.append(scroll)

    // Copy, because the point of showing the numbers is that someone might
    // want to do something with them, and re-typing 86 rows out of a scroll box
    // is not that. Tab-separated so it lands in a spreadsheet as columns.
    const copy = el('button', 'chart-copy', 'copy as TSV')
    copy.type = 'button'
    copy.addEventListener('click', async () => {
      const head = ['when', 'value', 'change %'].join('\t')
      const rows = model.windowValues.map((v, i) => {
        const ch = stepChange(model.windowValues, i)
        return [
          model.windowPeriods[i] ?? String(i + 1),
          Number.isFinite(v) ? String(v) : '',
          ch == null ? '' : ch.toFixed(2),
        ].join('\t')
      })
      try {
        await navigator.clipboard.writeText([head, ...rows].join('\n'))
        copy.textContent = 'copied'
      } catch {
        // A clipboard write can be refused by permission or by an insecure
        // context, and a button that silently does nothing is worse than one
        // that says so.
        copy.textContent = "couldn't copy"
      }
      setTimeout(() => {
        copy.textContent = 'copy as TSV'
      }, 1600)
    })
    dataBody.append(copy)
  }

  details.addEventListener('toggle', () => {
    if (details.open) drawTable()
  })

  // --- Render --------------------------------------------------------------

  const rebuild = () => {
    model = seriesModel({ ...options, window: windowAt })
    if (!model.ok) return

    svg.replaceChildren()
    for (const n of model.scene()) svg.append(renderNode(n))
    svg.append(cursor)
    svg.setAttribute('viewBox', `0 0 ${model.width} ${model.height}`)

    figure.className = ['chart', model.tone, options.className].filter(Boolean).join(' ')
    plot.setAttribute('aria-label', chartDescription(model, true))

    caption.textContent = options.caption ?? ''
    caption.hidden = !options.caption

    details.hidden = options.table === false
    drawSummary()
    drawRanges()
    // A rebuilt model invalidates the table; rebuild it now only if it is open.
    tableFor = null
    if (details.open) drawTable()

    showCursor(null)
  }

  rebuild()

  return {
    element: figure,
    update(next) {
      options = { ...next }
      windowAt = next.window ?? 0
      rebuild()
    },
    destroy() {
      plot.removeEventListener('pointermove', onPointerMove)
      plot.removeEventListener('pointerdown', onPointerMove)
      plot.removeEventListener('pointerleave', onPointerLeave)
      plot.removeEventListener('keydown', onKeyDown)
      plot.removeEventListener('focus', onFocus)
      plot.removeEventListener('blur', onBlur)
      figure.remove()
    },
  }
}
