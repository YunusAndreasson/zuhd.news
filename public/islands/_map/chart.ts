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
  /**
   * How to print a value on the y-axis. Defaults to a compact formatter that
   * groups thousands and keeps decimals only where the number is small enough
   * to need them.
   *
   * Worth overriding when the series has a unit the reader needs — a chokepoint
   * in vessels a day reads differently from an index level.
   */
  formatValue?: (v: number) => string
}

/**
 * A value for the axis, at a precision that suits its magnitude.
 *
 * The series this draws span six orders of magnitude — a dollar index near 100,
 * an exchange level at 3.3 million, a currency reciprocal at 0.021 — so a fixed
 * number of decimals is wrong for almost all of them.
 */
const axisValue = (v: number, decimals: number): string => {
  if (!Number.isFinite(v)) return ''
  if (decimals < 0) return Math.round(v).toLocaleString('en-US')
  return v.toFixed(decimals)
}

/**
 * How many decimals the whole axis uses, decided once from the largest value on
 * it rather than per label.
 *
 * Per-label precision reads as an error: a dollar index spanning 99.78 to 101.1
 * straddles 100, so a magnitude rule gave the top of the axis one decimal and
 * the bottom two, and the pair looked like two different quantities. Small
 * reciprocals go the other way — an FX chart in USD-per-lira needs four
 * decimals or the axis reads 0.02 / 0.02 / 0.02.
 */
const axisDecimals = (hi: number, lo: number): number => {
  const mag = Math.max(Math.abs(hi), Math.abs(lo))
  if (mag >= 1000) return -1
  if (mag >= 100) return 1
  if (mag >= 1) return 2
  // Enough decimals to separate the ends of the axis, capped so it stays type.
  const span = Math.abs(hi - lo)
  if (span <= 0) return 4
  return Math.min(6, Math.max(2, Math.ceil(-Math.log10(span)) + 2))
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
/**
 * The right pad is a y-axis gutter, not breathing room.
 *
 * The chart used to carry no y-axis at all — a shape with no numbers on it, so
 * a reader could see that something had fallen but not from what to what, and
 * the only figure anywhere near it was the hero's percentage. The gutter is
 * wide enough for a grouped thousands value ("3,319,522" is the worst case in
 * the corpus and gets abbreviated by `axisValue`).
 */
const PAD = { l: 3, r: 62, t: 14, b: 20 }

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

  // --- The y-axis ---------------------------------------------------------
  // High, low, and the rule if there is one. Three numbers is the most this
  // size can carry, and they are the three that answer "from what, to what,
  // and against what".
  const decimals = axisDecimals(hi, lo)
  const fmt = opts.formatValue ?? ((v: number) => axisValue(v, decimals))
  // Placed in priority order, and a label is dropped if it would sit on one
  // already placed. The extremes go first because they define the axis; the
  // rule's value is the one worth losing, since the dashed line still shows
  // where it is and the caption still names it. Without this a reference near
  // the low — which is the common case, the window's own opening value —
  // printed straight through it.
  const MIN_GAP = 11
  const placed: number[] = []
  const axisText = (v: number, cls: string) => {
    const at = Math.min(H - PAD.b - 1, Math.max(PAD.t - 3, y(v) + 3))
    if (placed.some((p) => Math.abs(p - at) < MIN_GAP)) return
    placed.push(at)
    const t = svgEl('text', { class: cls, x: W - PAD.r + 6, y: at, 'text-anchor': 'start' })
    t.textContent = fmt(v)
    svg.append(t)
  }
  axisText(hi, 'map-spark-axis')
  axisText(lo, 'map-spark-axis')
  if (inRange && reference >= lo && reference <= hi) {
    // The rule already carries a caption naming what it is; this is the number
    // it sits at, so "above the baseline" stops being a purely visual claim.
    axisText(reference, 'map-spark-axis is-ref')
  }

  // --- The x-axis ---------------------------------------------------------
  // A day tick under 86 points is unreadable at this size, so the axis names
  // the ends and the middle: where this starts, roughly halfway, and now.
  const midIdx = Math.floor(lastIdx / 2)
  const xLabels: Array<[number, string, string]> = [
    [PAD.l, periods[0] ?? '', 'start'],
    [x(midIdx), periods[midIdx] ?? '', 'middle'],
    [W - PAD.r, periods[lastIdx] ?? '', 'end'],
  ]
  for (const [px, text, anchor] of xLabels) {
    if (!text) continue
    const t = svgEl('text', {
      class: 'map-spark-label',
      x: px,
      y: H - 3,
      'text-anchor': anchor,
    })
    t.textContent = text
    svg.append(t)
  }

  return svg
}
