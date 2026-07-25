// A sparkline, built as DOM.
//
// This is the repo's third implementation of the same 30 lines of geometry and
// that is not an oversight. `entity-sheet.ts` returns a Preact VNode, so
// importing it would pull preact + hooks + htm into `situation-map.js`, which
// today ships no framework at all; `scripts/build/entity-pages.js` emits an
// HTML string from Node and never reaches the browser. Neither can be called
// from an imperative island. What is shared instead is the *shape* — same
// autoscale, same end-labelled line — so the chokepoint chart reads as a
// relative of the one on an entity page rather than a new idea.
//
// Colour comes from `currentColor` and the CSS on `.map-spark`, because the
// map is a fixed dark surface while the entity sheet follows the theme.

const NS = 'http://www.w3.org/2000/svg'

const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

export interface SparklineOptions {
  values: number[]
  /** Labels parallel to `values`; only the first and last are drawn. */
  periods?: string[]
  /**
   * An optional horizontal rule, in the same units as `values`.
   *
   * For a chokepoint this is the 90-day baseline, and drawing it is the whole
   * point: the sheet can already *say* traffic is running 4.3× normal, but the
   * line is what shows a reader whether that is a step change or a spike they
   * are looking at the tail of. Ignored when it falls outside the series range,
   * where it would flatten the curve against an edge.
   */
  reference?: number
  /** Accessible one-line description. Rendered as <title>. */
  label?: string
  /**
   * Which way the series has moved against `reference`, as a signed fractional
   * change. Tints the line and the fill with the same two colours the marker
   * on the map uses — gold for traffic falling away, cool for a surge — so the
   * chart reads as the thing the reader just clicked rather than a grey line
   * that could belong to anything.
   */
  direction?: number
  /**
   * Which pair of colours `direction` selects between.
   *
   * `straits` (default) is the chokepoint vocabulary — gold for traffic falling
   * away, teal for a surge. `signed` is `--map-pos` / `--map-neg`, for a series
   * where up is simply up. A market index down 2% drawn in the strait-blockage
   * gold would be borrowing a meaning it does not have.
   */
  palette?: 'straits' | 'signed'
}

/**
 * The viewBox is authored at the width the sheet actually gives it, because
 * the geometry is *not* stretched to fit any more.
 *
 * It used to carry `preserveAspectRatio="none"` against a 300-unit box that
 * rendered 704px wide — a 2.35× horizontal stretch. `non-scaling-stroke` hid
 * it on the line, but the axis labels came out 2.35× too wide and the end dot
 * was an ellipse. Scaling uniformly costs nothing here and the type stays
 * type. A 6.4:1 box is also taller than the old 4.4:1 one, which gives 86 days
 * of traffic enough vertical room to have a shape instead of a flat wobble.
 */
const W = 640
const H = 100
const PAD = { l: 3, r: 3, t: 12, b: 20 }

/**
 * Returns null for a series too short to have a shape — one point is a dot
 * pretending to be a trend, and the caller should render nothing rather than
 * an empty box.
 */
export function createSparkline(opts: SparklineOptions): SVGSVGElement | null {
  const { values, periods = [], reference, label, direction, palette = 'straits' } = opts
  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length < 2) return null

  let lo = Math.min(...clean)
  let hi = Math.max(...clean)
  // The reference only widens the domain when it already sits inside a
  // plausible distance of the data; a baseline far outside the window would
  // squash 86 days of real variation into a flat line to make room for a rule.
  const inRange = typeof reference === 'number' && Number.isFinite(reference)
  if (inRange && reference > hi && reference < hi * 1.5) hi = reference
  if (inRange && reference < lo && reference > lo * 0.5) lo = reference
  const span = hi - lo || 1

  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (i / (values.length - 1)) * innerW
  const y = (v: number) => PAD.t + innerH - ((v - lo) / span) * innerH

  // `is-up`/`is-down` (or `is-pos`/`is-neg`) carry the colour; a series with no
  // direction stays the neutral ink it has always been.
  const [down, up] = palette === 'signed' ? [' is-neg', ' is-pos'] : [' is-down', ' is-up']
  const tone =
    typeof direction === 'number' && Number.isFinite(direction) && direction !== 0
      ? direction < 0
        ? down
        : up
      : ''

  const svg = svgEl('svg', {
    class: `map-spark${tone}`,
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
  })
  if (label) {
    const t = document.createElementNS(NS, 'title')
    t.textContent = label
    svg.append(t)
  }

  if (inRange && reference >= lo && reference <= hi) {
    svg.append(
      svgEl('line', {
        class: 'map-spark-ref',
        x1: PAD.l,
        x2: W - PAD.r,
        y1: y(reference),
        y2: y(reference),
      }),
    )
  }

  const pts = values
    .map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : ''))
    .filter(Boolean)

  // The area under the line, so the series carries some weight at a glance.
  // A 1px stroke across 640 units is a hairline you have to hunt for; the fill
  // is what makes "traffic is running high" legible before you read the axis.
  if (pts.length > 1) {
    const floor = (H - PAD.b).toFixed(1)
    svg.append(
      svgEl('polygon', {
        class: 'map-spark-area',
        points: `${x(0).toFixed(1)},${floor} ${pts.join(' ')} ${x(values.length - 1).toFixed(1)},${floor}`,
      }),
    )
  }

  svg.append(svgEl('polyline', { class: 'map-spark-line', points: pts.join(' ') }))

  const lastIdx = values.length - 1
  svg.append(svgEl('circle', { class: 'map-spark-dot', cx: x(lastIdx), cy: y(values[lastIdx]), r: 2.4 }))

  // Only the ends are labelled. A day axis under 86 points is unreadable at
  // this size, and the two that matter are "where this starts" and "now".
  const first = periods[0]
  const last = periods[lastIdx]
  if (first) {
    const t = svgEl('text', { class: 'map-spark-label', x: PAD.l, y: H - 3, 'text-anchor': 'start' })
    t.textContent = first
    svg.append(t)
  }
  if (last) {
    const t = svgEl('text', { class: 'map-spark-label', x: W - PAD.r, y: H - 3, 'text-anchor': 'end' })
    t.textContent = last
    svg.append(t)
  }

  return svg
}
