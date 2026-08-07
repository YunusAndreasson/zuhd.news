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

/**
 * Makes each spark's fill gradient a unique target for `url(#…)`.
 *
 * An `id` is document-scoped even when it sits inside its own `<svg>`, so
 * thirteen sparks sharing one would all resolve to whichever was parsed last —
 * and every line on the rail would wear the first row's hue. It only ever
 * increments; a remount continues the sequence rather than restarting it,
 * because a torn-down spark's id may still be referenced by a paint in flight.
 */
let fillSeq = 0

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
  /**
   * `'line'` for a level, `'bars'` for a count. Defaults to a line.
   *
   * These are two different quantities and they were both being drawn as a
   * polyline. A price, an index, a vessel count per day — those are *levels*,
   * and the line between two of them means something: the value passed through
   * it. A count per bucket is not a level, nothing connects one bucket to the
   * next, and joining them draws a slope where there is only a pair of
   * independent tallies. At thirty buckets of story volume that came out as a
   * seismograph: legible as "busy", useless as a shape, and the busiest thing
   * in the rail.
   *
   * Bars are what a count wants, and the map already agrees with itself about
   * that — the scrubber directly below draws story volume as a histogram, from
   * the same points. Two marks, one meaning.
   *
   * `charts.md` says a second shape gets a second module rather than a `type`
   * field on the first, and that rule earned itself: `createChart`'s only
   * shrink levers could not touch its geometry, so a sparkline had to be its
   * own file. It does not reach this case. Bars and line here share the model,
   * the box, the span, the domain, the tone and the renormalisation — every
   * line of it — and differ only in which children get appended. A second
   * module would be a copy of this one with four lines changed.
   */
  shape?: 'line' | 'bars' | undefined
}

/**
 * Last against first over exactly what *would* be drawn — without drawing it.
 *
 * The instrument rail stopped rendering a line on every row (2026-08-07: the
 * shape moved behind a press and the direction moved to a tick), and it still
 * needs this number: it is what the change figure beside the tick states, and
 * on the calendar steps `sparkInput` has no `pct` of its own to offer. Before
 * this existed the only way to obtain it was to call `sparkline()` and throw
 * the `<svg>` away — fourteen built-and-discarded documents per range press,
 * bought for one float.
 *
 * It lives *here*, next to `sparkline`, and `sparkline` returns it, so the two
 * cannot part. That is the whole point: a figure computed from a second
 * `seriesModel` call with its own arguments is the `reference: 'open'` trap in
 * `charts.md` arriving through the back door — a percentage describing a period
 * that the chart a press opens does not cover. One model, one window, one
 * number.
 *
 * `null` on exactly the input `sparkline` returns `null` for, so a caller can
 * treat "no figure" and "no shape" as the same answer, because they are.
 */
export const sparkPct = (opts: Pick<SparkOptions, 'values' | 'window' | 'domain'>): number | null => {
  const model = seriesModel({
    values: opts.values,
    window: opts.window,
    domain: opts.domain,
  })
  return model.ok ? model.windowPct : null
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
  const shape = opts.shape ?? 'line'
  const model = seriesModel({
    values: opts.values,
    window: opts.window,
    domain: opts.domain,
  })
  if (!model.ok) return null

  const { pad } = model
  const iw = model.width - pad.l - pad.r
  const ih = model.height - pad.t - pad.b
  if (iw <= 0 || ih <= 0) return null

  const [x0, x1] = opts.span ?? [0, 1]
  const left = x0 * SPARK_W
  const width = Math.max(0, (x1 - x0) * SPARK_W)

  const plot = SPARK_H - INSET * 2
  const floor = SPARK_H - INSET
  const xOf = (x: number) => left + ((x - pad.l) / iw) * width
  const yOf = (y: number) => INSET + ((y - pad.t) / ih) * plot
  const pts = model.points.map((p) => [xOf(p.x), yOf(p.y)] as const)
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (!first || !last) return null

  const svg = svgEl('svg', {
    class: 'spark',
    viewBox: `0 0 ${SPARK_W} ${SPARK_H}`,
    /**
     * `none`, and this is the one place on the site where that is right.
     *
     * `charts.md` bans it, twice diagnosed and twice removed, and the reason it
     * gives is what has to keep being true here: it was "drawing its axis
     * labels stretched and its end dots as ellipses". There are no axis labels
     * and no text. **There is now an end dot, and it is not a `<circle>`** —
     * see `spark-dot` below, which is a zero-length stroke with a round cap, so
     * `non-scaling-stroke` renders it as a circle of exactly its stroke width
     * whatever the horizontal scale is doing. A `<circle>` here would be the
     * banned ellipse, immediately.
     *
     * What `none` buys is the only thing that made the first version unusable.
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

  if (shape === 'bars') {
    /**
     * One bar per bucket, standing on the floor of the box.
     *
     * The gap is a *fraction* of the slot rather than a constant, because the
     * slot itself is between 2.5px in the spine and 8px in an open rail — a
     * fixed 1px gap is invisible at one end and a third of the bar at the
     * other. 0.72 leaves the bars reading as separate tallies at every width
     * without the run turning into a comb.
     *
     * A floor of 0.5 units on the height so an empty bucket still marks itself.
     * Zero stories in an hour is an observation; a gap in the run reads as a
     * bucket that was never measured.
     */
    const slot = width / Math.max(1, pts.length)
    const bw = Math.max(0.5, slot * 0.72)
    for (const [x, y] of pts) {
      svg.append(
        svgEl('rect', {
          class: 'spark-bar',
          x: String(round(x - bw / 2)),
          y: String(round(Math.min(y, floor - 0.5))),
          width: String(round(bw)),
          height: String(round(Math.max(0.5, floor - y))),
        }),
      )
    }
  } else {
    /**
     * Weight under the line, and nothing else drawn behind it.
     *
     * Two things were tried here and both are worth recording because both
     * looked reasonable written down. The fill was first drawn *between* the
     * line and the window's open, on the sound reasoning that area to the floor
     * measures from an arbitrary place — the floor is the window's minimum, not
     * zero. These series mostly move one way across a short window, so that
     * region came out a wedge with a hard horizontal lid and every row read as
     * a shaded rectangle with a diagonal cut.
     *
     * The open then survived as a hairline across the fill, to keep the
     * reference on screen. It sat at the top edge of every falling row, where
     * it read as a box lid rather than as a datum — and it was the third thing
     * on the row saying which way the series went, after the tone and the
     * printed figure. Same fact three times is the objection this map already
     * makes about the density glow.
     *
     * So: area under the curve, plainly decoration, at a strength that makes a
     * 17px shape findable and states nothing. The sign is the tone's job and
     * the magnitude is the figure's.
     */
    const d =
      `M${round(first[0])},${round(floor)} ` +
      pts.map(([x, y]) => `L${round(x)},${round(y)}`).join(' ') +
      ` L${round(last[0])},${round(floor)} Z`

    /**
     * The fill fades downward, and a flat one is what made this look wrong.
     *
     * At the range the map opens on, a money series is **four points** — three
     * segments of daily closes — so a fill of constant alpha under it is not an
     * area under a curve, it is a trapezoid: hard top, hard sides, hard floor,
     * occupying most of a 17px box. Every row read as a filled bar with a
     * diagonal lid, which is what it geometrically was.
     *
     * A gradient makes it behave like what it is for. Strongest against the
     * line, gone by the floor, so what the reader sees is the line carrying a
     * shadow rather than a block carrying an edge — and at four points or at
     * sixty it is the same treatment, which a conditional fill would not be.
     *
     * The stops take `currentColor`, so the row's hue still arrives the one way
     * this component allows and no literal enters the markup. `fill` has to be
     * an attribute rather than a class because the target is per-instance;
     * `charts.md`'s "colour is a class, never an attribute" is about colour, and
     * a `url(#…)` is a reference to where the colour is already coming from.
     */
    const gid = `spark-fill-${++fillSeq}`
    const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' })
    grad.append(svgEl('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '0.3' }))
    grad.append(svgEl('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }))
    const defs = svgEl('defs', {})
    defs.append(grad)
    svg.append(defs)
    svg.append(svgEl('path', { class: 'spark-area', d, fill: `url(#${gid})` }))
    svg.append(
      svgEl('polyline', {
        class: 'spark-line',
        points: pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' '),
      }),
    )
    /**
     * The latest observation, which is the one the reader came for.
     *
     * A zero-length line with a round cap, never a `<circle>`: the box is
     * scaled non-uniformly, so a circle renders as an ellipse whose eccentricity
     * depends on how wide the rail happens to be. A stroke carrying
     * `non-scaling-stroke` is measured in CSS pixels and a round cap on a
     * zero-length subpath is a disc of exactly that diameter, so this is round
     * at every width — the one construction that gets a dot past the
     * `preserveAspectRatio` trade.
     */
    svg.append(
      svgEl('line', {
        class: 'spark-dot',
        x1: String(round(last[0])),
        y1: String(round(last[1])),
        x2: String(round(last[0])),
        y2: String(round(last[1])),
      }),
    )
  }

  return { element: svg, windowPct: model.windowPct }
}
