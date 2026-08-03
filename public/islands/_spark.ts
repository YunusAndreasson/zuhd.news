// The smallest chart on the site: a line, and nothing else.
//
// `charts.md` says a second shape gets a second module rather than a `type`
// field on the first, and this is that second shape. What it is *not* is a
// second chart: every number here comes from `seriesModel`, so a sparkline and
// the full figure a reader opens from it cannot disagree about where a point
// falls or whether a series is long enough to draw at all.
//
// ── Why not `createChart({ ranges: false, table: false })` ─────────────────
//
// Because those two flags are the only shrink levers it has and neither one
// touches the geometry. A `.chart` always ships a live readout paragraph, three
// axis labels, three date labels, rings on the extremes, a dot on the latest
// and a caption row, inside a 640×112 box whose right 62 units are a y-axis
// gutter — 27% of the width, blank, before anything is drawn. In a rail column
// that is a chart wearing a sparkline's dimensions, which is worse than either.
//
// ── The renormalisation ───────────────────────────────────────────────────
//
// `seriesModel` returns points in its own viewBox units, pads included. Rather
// than re-deriving the domain here — which would be the same scale arithmetic
// written a second time, and `charts.md` records what that cost the last time
// there were three copies — the points are divided back out of that box and
// multiplied into this one. The domain, the windowing and the "too short to
// have a shape" rule all stay in one place.

import { seriesModel } from '@shared/chart/series'
import { svgEl } from './_dom'

/**
 * The spark's own box, which is a *proportion* rather than a size.
 *
 * The rendered element is a fixed height and whatever width the row has left,
 * which is between about 80px in the spine and 240px in an open rail — a 4:1
 * swing. So the viewBox is a unit grid the stylesheet stretches, and the
 * numbers here are only how finely the line is quantised.
 */
export const SPARK_W = 100
export const SPARK_H = 20

/**
 * Room for the stroke at the top and the bottom of the box.
 *
 * The line is `non-scaling-stroke`, so its width is in CSS pixels and does not
 * shrink with the viewBox — a peak drawn exactly on y=0 would lose half its
 * stroke to the edge. Which is the same failure the graticule's `line-width`
 * records one layer down: a half-width under one device pixel loses coverage
 * whatever the antialiasing arithmetic says.
 */
const INSET = 1.5

const round = (n: number): number => Number(n.toFixed(1))

export interface Spark {
  element: SVGSVGElement
  /**
   * Last against first over exactly what is drawn.
   *
   * Returned rather than left to the caller because the caller would have to
   * recompute it from a series this function may have windowed — which is the
   * `reference: 'open'` trap in `charts.md` arriving from the other direction:
   * a figure describing a period the line beside it does not cover.
   */
  windowPct: number
}

export interface SparkOptions {
  values: number[]
  /**
   * How many observations to draw. Required, not optional, and the reason has
   * moved: it used to be the guarantee that a column of sparklines covered one
   * period, and it could not be — an exchange trades five days in seven, so
   * thirty of its points is six weeks against the FX basket's thirty days.
   *
   * The period is `span`'s job now, and this is what it always actually was: a
   * cap on how much of the series is drawn.
   */
  window: number
  /**
   * Where the line sits in the box, as a 0–1 pair, when the series does not
   * fill the window the reader asked for.
   *
   * The honest answer to "90 days please" from a series holding 30 is to draw
   * thirty days' worth in the last third and leave the rest empty. Stretched to
   * the full width instead, it is indistinguishable from a series that really
   * does cover the window — the same picture standing for two different facts.
   *
   * Defaults to the whole box, which is the common case.
   */
  span?: [number, number] | undefined
  /** A fixed vertical domain — see `SeriesOptions.domain`. */
  domain?: [number, number] | undefined
}

/**
 * One series as a bare polyline, or `null` when there is nothing to draw.
 *
 * `null` rather than an empty box: `seriesModel` already decides that fewer
 * than two finite points is a dot pretending to be a trend, and a caller that
 * reserved space for a shape that never arrived would leave a gap reading as a
 * layout fault rather than as missing data.
 */
export const sparkline = (opts: SparkOptions): Spark | null => {
  const model = seriesModel({ values: opts.values, window: opts.window, domain: opts.domain })
  if (!model.ok) return null

  const { pad } = model
  const iw = model.width - pad.l - pad.r
  const ih = model.height - pad.t - pad.b
  if (iw <= 0 || ih <= 0) return null

  const [x0, x1] = opts.span ?? [0, 1]
  const left = x0 * SPARK_W
  const width = Math.max(0, (x1 - x0) * SPARK_W)

  const plot = SPARK_H - INSET * 2
  const points = model.points
    .map((p) => {
      const x = left + ((p.x - pad.l) / iw) * width
      const y = INSET + ((p.y - pad.t) / ih) * plot
      return `${round(x)},${round(y)}`
    })
    .join(' ')

  const svg = svgEl('svg', {
    class: 'spark',
    viewBox: `0 0 ${SPARK_W} ${SPARK_H}`,
    /**
     * `none`, and this is the one place on the site where that is right.
     *
     * `charts.md` bans it, twice diagnosed and twice removed, and the reason it
     * gives is exactly what does not apply here: it was "drawing its axis
     * labels stretched and its end dots as ellipses". This element has no axis
     * labels, no dots, no rings and no text — it is one `<polyline>`, and the
     * stroke is `non-scaling-stroke`, so nothing in it has a shape that a
     * non-uniform scale can distort.
     *
     * What it buys is the only thing that made the first version unusable.
     * Uniform scaling ties the height to the width, and these rows are 80px
     * wide in the spine and 240px in an open rail: at `meet` with a matched
     * `aspect-ratio` the open rail drew a **47px-tall** line per row and the
     * instrument rail overflowed its own column by 436px. Measured, at
     * 2361x984. A sparkline is a fixed height by definition — it is a line in
     * a line of type — and the width is whatever the row has left.
     */
    preserveAspectRatio: 'none',
    // A shape with no scale beside it has nothing to say to a screen reader
    // that the signed figure on the same row does not say better. The row's
    // own `aria-label` carries the numbers.
    'aria-hidden': 'true',
    focusable: 'false',
  })
  // Colour arrives as `currentColor` off the row's tone class — never as an
  // attribute, which would route straight around `colour-system.test.js`.
  svg.append(svgEl('polyline', { class: 'spark-line', points }))

  return { element: svg, windowPct: model.windowPct }
}
