// One series chart, described once.
//
// ── Why this file exists ───────────────────────────────────────────────────
//
// The repo had three implementations of the same thirty lines of geometry, and
// the header of the one in `_map/chart.ts` argued that this was unavoidable:
// `entity-sheet.ts` returns a Preact VNode, `scripts/build/entity-pages.js`
// emits an HTML string from Node, and `_map/chart.ts` builds DOM imperatively
// inside an island that ships no framework at all. Three runtimes, so three
// copies, so "what is shared is the *shape*".
//
// That reasoning holds for the *renderer* and not for the chart. What differs
// between those three surfaces is only the last step — how a node gets made —
// and that step is about ten lines each. Everything before it (the domain, the
// scales, the axis precision, where the extremes fall, which points are
// finite) is arithmetic with no runtime opinion in it at all. So the arithmetic
// lives here, emits a flat list of SVG nodes as plain data, and each surface
// walks that list with the node constructor it happens to have.
//
// The cost of not doing this was not theoretical. The three copies had drifted
// into three different charts: the map's carried a y-axis, an area fill, a
// reference rule and a direction tint; the other two carried a line and two
// dots. `preserveAspectRatio="none"` was diagnosed and removed twice and is
// still in the third — so `/e/{id}`, the one page on this site whose entire
// subject is a chart, has been drawing its axis labels stretched and its end
// dots as ellipses the whole time.
//
// ── What this is not ──────────────────────────────────────────────────────
//
// Not a chart library and not general. It draws one thing: a single numeric
// series over an ordered axis, optionally against one horizontal reference.
// Every series this site holds is that shape — daily vessel transits, daily
// closes, an FX reciprocal, a Wikipedia pageview count — and a second shape
// should get a second module rather than a `type` field here.

/**
 * One SVG element, as data.
 *
 * Flat rather than a tree: nothing this chart draws nests, and a flat list is
 * something a caller can walk with `for` and a ten-line adapter. Attributes are
 * pre-stringified by the renderers, so numbers may be passed through as
 * numbers.
 */
export interface SceneNode {
  tag: 'line' | 'polyline' | 'polygon' | 'circle' | 'text' | 'rect'
  attrs: Record<string, string | number>
  /** Text content, for `text` nodes. Always plain — never markup. */
  text?: string
}

/** Which two-colour vocabulary `direction` selects between. */
export type ChartPalette = 'straits' | 'signed' | 'neutral'

export interface SeriesOptions {
  values: number[]
  /** Labels parallel to `values`. Every one is used by the readout and the
   *  table; only three reach the drawn axis. */
  periods?: string[]
  /**
   * An optional horizontal rule, in the same units as `values`.
   *
   * A number is an *external* quantity that does not move when the reader
   * narrows the range: a chokepoint's 90-day baseline is published, and drawing
   * it is the whole point — the sheet can already *say* traffic is running 4.3×
   * normal, but the line is what shows whether that is a step change or the tail
   * of a spike. Ignored when it falls outside the series range, where it would
   * flatten the curve against an edge.
   *
   * `'open'` is the *intrinsic* one — the first value actually drawn — and it is
   * recomputed whenever the window changes. That distinction is the whole reason
   * this is not just a number: a market card whose rule says "the window's open"
   * while sitting at the opening price of a window three months longer than the
   * one on screen is a chart contradicting its own caption, and it does it
   * silently, because a rule that has drifted off the top of the data still
   * looks like a rule.
   */
  reference?: number | 'open'
  /** What the rule is, in a few words — "the 90-day average", "the window's
   *  open". Read out beside the hovered point's change against it. */
  referenceLabel?: string
  /**
   * What the series *is*, and nothing about its size — "Brent crude", "TASI
   * daily closes", "Daily vessel transits at the Suez Canal".
   *
   * The count belongs to the chart, which is the only thing that knows how much
   * of the series the reader is currently looking at. Callers used to append it
   * themselves and the two then appeared side by side: "Brent crude over 59
   * observations. 30 days." — a label contradicting itself in one breath, and
   * only for the readers who cannot see the chart to check.
   */
  label?: string
  /**
   * Which way the series has moved, as a signed fractional change. Tints the
   * line and the fill, so the chart reads as the thing the reader just clicked
   * rather than a grey line that could belong to anything.
   *
   * `'window'` derives it from what is drawn — last against first — so the tint
   * turns around with the range control rather than reporting the quarter's
   * direction over a fortnight's chart.
   */
  direction?: number | 'window'
  /**
   * `straits` is the chokepoint vocabulary — gold for traffic falling away,
   * teal for a surge. `signed` is `--chart-pos` / `--chart-neg`, for a series
   * where up is simply up. A market index down 2% drawn in the strait-blockage
   * gold would be borrowing a meaning it does not have. `neutral` is the
   * default: no claim.
   */
  palette?: ChartPalette
  /**
   * How to print a value. Defaults to a compact formatter that groups
   * thousands and keeps decimals only where the number is small enough to need
   * them. Worth overriding when the series has a unit the reader needs.
   */
  formatValue?: (v: number) => string
  /**
   * A unit appended to the readout and the table, never to the axis — the axis
   * has room for a number and not for a number and a noun.
   */
  unit?: string
  /**
   * What one step along the x-axis is, as a plural noun: `days`, `sessions`,
   * `months`. Used by the range control's accessible names, which is the only
   * place the chart makes a claim about the axis in words.
   */
  step?: string
  /**
   * Draw only the last `window` observations. `0` or absent means all of them.
   *
   * The domain is recomputed over exactly what is drawn, which is the entire
   * value of the control: 86 days of vessel traffic autoscaled over 86 days
   * flattens a fortnight's collapse into a wobble, and the same fortnight
   * scaled to itself is a cliff.
   */
  window?: number
}

export interface SeriesPoint {
  /** Index into the *windowed* series — what the readout and keyboard walk. */
  i: number
  value: number
  /** viewBox units. */
  x: number
  y: number
  period: string
}

/**
 * The viewBox is authored at roughly the width the sheet gives it, because the
 * geometry is not stretched to fit.
 *
 * `preserveAspectRatio="none"` against a 300-unit box rendering 704px wide is
 * a 2.35× horizontal stretch. `non-scaling-stroke` hides it on the line, and
 * nothing hides it on the type or on a circle. Scaling uniformly costs nothing
 * here. A 5.7:1 box also gives 86 days of traffic enough vertical room to have
 * a shape rather than a flat wobble.
 */
export const CHART_W = 640
export const CHART_H = 112

/**
 * The right pad is a y-axis gutter, not breathing room: wide enough for a
 * grouped thousands value, "3,319,522" being the worst case in the corpus.
 * The bottom pad carries the date row.
 */
export const CHART_PAD = { l: 3, r: 62, t: 14, b: 20 } as const

/**
 * A value for the axis, at a precision that suits its magnitude.
 *
 * The series this draws span six orders of magnitude — a dollar index near 100,
 * an exchange level at 3.3 million, a currency reciprocal at 0.021 — so a fixed
 * number of decimals is wrong for almost all of them.
 */
export const axisValue = (v: number, decimals: number): string => {
  if (!Number.isFinite(v)) return ''
  if (decimals < 0) return Math.round(v).toLocaleString('en-US')
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * How many decimals the whole axis uses, decided once from the largest value
 * on it rather than per label.
 *
 * Per-label precision reads as an error: a dollar index spanning 99.78 to 101.1
 * straddles 100, so a magnitude rule gave the top of the axis one decimal and
 * the bottom two, and the pair looked like two different quantities. Small
 * reciprocals go the other way — an FX chart in USD-per-lira needs four
 * decimals or the axis reads 0.02 / 0.02 / 0.02.
 */
export const axisDecimals = (hi: number, lo: number): number => {
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
 * How many decimals the *source* published, so the readout and the table can
 * print the number rather than the axis's rounding of it.
 *
 * The axis has a 62px gutter and three labels in it, so it rounds hard — one
 * decimal above 100. That is right for a scale label and wrong everywhere a
 * reader is being shown an individual observation: Brent peaked at 124.24 the
 * day after closing at 124.16, and at the axis's precision the table printed
 * `124.2` twice and put the word "high" beside the second one. A row marked as
 * the maximum whose number equals the row above it reads as a bug in the chart,
 * which is the worst possible thing for a table whose entire job is to let a
 * reader check the picture.
 *
 * Counting the decimals actually present is the honest rule and cannot collide
 * unless the source itself repeated a value. Capped at six, which is past the
 * point any series here carries meaning.
 */
export const dataDecimals = (values: number[]): number => {
  let most = 0
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    const s = String(v)
    // Exponent form only shows up past 1e21 or below 1e-7, neither of which
    // any series here reaches; treating it as integral is the safe answer.
    if (s.includes('e') || s.includes('E')) continue
    const dot = s.indexOf('.')
    if (dot < 0) continue
    most = Math.max(most, Math.min(6, s.length - dot - 1))
    if (most === 6) break
  }
  return most
}

/** A signed percentage at one decimal, with the sign dropped when it rounds to
 *  nothing — `−0.0%` claims a direction the number explicitly does not have. */
export const signedPct = (pct: number): string => {
  if (!Number.isFinite(pct)) return ''
  const abs = Math.abs(pct).toFixed(1)
  return abs === '0.0' ? '0.0%' : `${pct > 0 ? '+' : '−'}${abs}%`
}

/**
 * The windows the range control offers, given how long the series is.
 *
 * Expressed in observations rather than calendar time, because that is what
 * they are: every series here is a run of consecutive publications, so "the
 * last 30" is exactly true where "the last month" would be an approximation on
 * an exchange that trades five days in seven. The `step` noun in
 * `SeriesOptions` is what turns 30 into "30 sessions" for a screen reader.
 *
 * A window is offered only when it would actually cut something. A 30-point
 * series gets no control at all rather than a row of buttons that all show the
 * same chart.
 */
export const WINDOW_STEPS = [30, 90, 180] as const

export const rangeOptions = (length: number): number[] => {
  // A window has to leave enough points to still have a shape, and has to
  // remove enough to be worth a button. Ten either side is the smallest that
  // satisfies both.
  const usable = WINDOW_STEPS.filter((n) => n >= 10 && n <= length - 10)
  return usable.length ? [...usable, 0] : []
}

export interface SeriesModel {
  /** False when the series is too short to have a shape — one point is a dot
   *  pretending to be a trend, and the caller should render nothing. */
  ok: boolean
  width: number
  height: number
  pad: typeof CHART_PAD
  /** Domain of what is drawn, reference included where it widened it. */
  lo: number
  hi: number
  points: SeriesPoint[]
  /** The highest and lowest *observations* — not the domain ends, which the
   *  reference can push past a value anyone actually reported. */
  peak: SeriesPoint | null
  trough: SeriesPoint | null
  latest: SeriesPoint | null
  reference: number | null
  referenceY: number | null
  referenceLabel: string | null
  /** Last against first, over what is drawn. What `direction: 'window'` uses,
   *  exposed so a caption can state it without recomputing it from a series
   *  the range control may have narrowed. */
  windowPct: number
  /** `is-up` / `is-down` / `is-pos` / `is-neg` / `''`. */
  tone: string
  label: string | null
  unit: string
  step: string
  /** Every observation in the chosen window, for the table — including the
   *  non-finite ones, which are a fact about the data and not a gap to hide. */
  windowValues: number[]
  windowPeriods: string[]
  /** How many observations the source series has, whatever the window. */
  totalLength: number
  /** For the axis: terse, because it has three labels and a 62px gutter. */
  format(v: number): string
  /**
   * For the readout and the table: at the precision the source published.
   *
   * A distinct quantity from `format`, not a nicety — see `dataDecimals`. A
   * caller's own `formatValue` overrides both, since a caller that has gone to
   * the trouble of supplying a formatter has already decided.
   */
  formatExact(v: number): string
  /** Nearest drawn point to an x in viewBox units. */
  nearest(x: number): SeriesPoint | null
  scene(): SceneNode[]
}

const clampWindow = (len: number, window?: number) =>
  !window || window <= 0 || window >= len ? len : Math.max(2, window)

/**
 * The whole chart, as arithmetic.
 *
 * Everything a renderer or an interaction layer needs is on the returned model,
 * so neither has to recompute a scale — which is how the crosshair and the line
 * are guaranteed to agree about where a point is, rather than agreeing by
 * having been written on the same afternoon.
 */
export function seriesModel(opts: SeriesOptions): SeriesModel {
  const {
    values: allValues,
    periods: allPeriods = [],
    referenceLabel,
    label,
    palette = 'neutral',
    unit = '',
    step = 'points',
  } = opts

  const total = allValues.length
  const take = clampWindow(total, opts.window)
  const values = take >= total ? allValues : allValues.slice(total - take)
  const periods = take >= total ? allPeriods : allPeriods.slice(Math.max(0, allPeriods.length - take))

  const finite = values.filter((v) => Number.isFinite(v))

  const empty: SeriesModel = {
    ok: false,
    width: CHART_W,
    height: CHART_H,
    pad: CHART_PAD,
    lo: 0,
    hi: 0,
    points: [],
    peak: null,
    trough: null,
    latest: null,
    reference: null,
    referenceY: null,
    referenceLabel: null,
    windowPct: 0,
    tone: '',
    label: label ?? null,
    unit,
    step,
    windowValues: values,
    windowPeriods: periods,
    totalLength: total,
    format: (v) => String(v),
    formatExact: (v) => String(v),
    nearest: () => null,
    scene: () => [],
  }
  if (finite.length < 2) return empty

  let lo = Math.min(...finite)
  let hi = Math.max(...finite)
  const obsLo = lo
  const obsHi = hi

  // Resolved against the *drawn* window, not the source series, so both follow
  // the range control. `'open'` is by construction inside the domain and needs
  // none of the widening below.
  const reference = opts.reference === 'open' ? finite[0] : opts.reference
  const windowPct =
    finite[0] !== 0 ? ((finite[finite.length - 1] - finite[0]) / Math.abs(finite[0])) * 100 : 0
  const direction = opts.direction === 'window' ? windowPct : opts.direction

  // The reference only widens the domain when it already sits inside a
  // plausible distance of the data; a baseline far outside the window would
  // squash 86 days of real variation into a flat line to make room for a rule.
  const hasRef = typeof reference === 'number' && Number.isFinite(reference)
  if (hasRef && reference > hi && reference < hi * 1.5) hi = reference
  if (hasRef && reference < lo && reference > lo * 0.5) lo = reference
  const span = hi - lo || 1

  const innerW = CHART_W - CHART_PAD.l - CHART_PAD.r
  const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b
  const denom = Math.max(1, values.length - 1)
  const xAt = (i: number) => CHART_PAD.l + (i / denom) * innerW
  const yAt = (v: number) => CHART_PAD.t + innerH - ((v - lo) / span) * innerH

  const points: SeriesPoint[] = []
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return
    points.push({ i, value: v, x: xAt(i), y: yAt(v), period: periods[i] ?? '' })
  })

  // The extremes are read off the observations, not off the domain: with a
  // reference outside the data the domain ends belong to the rule, and marking
  // them would put a ring on a value nobody reported.
  let peak = points[0]
  let trough = points[0]
  for (const p of points) {
    if (p.value > peak.value) peak = p
    if (p.value < trough.value) trough = p
  }
  const latest = points[points.length - 1]

  const [down, up] =
    palette === 'signed'
      ? ['is-neg', 'is-pos']
      : palette === 'straits'
        ? ['is-down', 'is-up']
        : ['', '']
  const tone =
    typeof direction === 'number' && Number.isFinite(direction) && direction !== 0
      ? direction < 0
        ? down
        : up
      : ''

  const decimals = axisDecimals(hi, lo)
  const format = opts.formatValue ?? ((v: number) => axisValue(v, decimals))
  const exactDecimals = Math.max(decimals, dataDecimals(values))
  const formatExact = opts.formatValue ?? ((v: number) => axisValue(v, exactDecimals))
  const refInDomain = hasRef && reference >= lo && reference <= hi
  const referenceY = refInDomain ? yAt(reference) : null

  const nearest = (x: number): SeriesPoint | null => {
    if (!points.length) return null
    let best = points[0]
    let bestD = Math.abs(best.x - x)
    for (const p of points) {
      const d = Math.abs(p.x - x)
      if (d < bestD) {
        best = p
        bestD = d
      }
    }
    return best
  }

  const scene = (): SceneNode[] => {
    const nodes: SceneNode[] = []
    const round = (n: number) => Number(n.toFixed(1))

    if (referenceY != null) {
      nodes.push({
        tag: 'line',
        attrs: {
          class: 'chart-ref',
          x1: CHART_PAD.l,
          x2: CHART_W - CHART_PAD.r,
          y1: round(referenceY),
          y2: round(referenceY),
        },
      })
    }

    const pts = points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')

    // The area under the line, so the series carries some weight at a glance.
    // A 1px stroke across 640 units is a hairline you have to hunt for; the
    // fill is what makes "traffic is running high" legible before you read the
    // axis.
    const floor = round(CHART_H - CHART_PAD.b)
    nodes.push({
      tag: 'polygon',
      attrs: {
        class: 'chart-area',
        points: `${round(points[0].x)},${floor} ${pts} ${round(latest.x)},${floor}`,
      },
    })
    nodes.push({ tag: 'polyline', attrs: { class: 'chart-line', points: pts } })

    // --- The extremes -----------------------------------------------------
    // The axis prints the high and the low; on its own that says how far the
    // series travelled and never says *when*. A hollow ring at each is the
    // cheapest possible answer — two marks, no type — and it turns two numbers
    // in the gutter into two events on the line. Suppressed when they land on
    // the same point (a flat series) or on the latest, where the solid end dot
    // already is.
    const marked = new Set<number>()
    for (const p of [peak, trough]) {
      if (!p || p.i === latest.i || marked.has(p.i)) continue
      if (obsHi === obsLo) continue
      marked.add(p.i)
      nodes.push({
        tag: 'circle',
        attrs: { class: 'chart-extreme', cx: round(p.x), cy: round(p.y), r: 2.4 },
      })
    }

    nodes.push({
      tag: 'circle',
      attrs: { class: 'chart-dot', cx: round(latest.x), cy: round(latest.y), r: 2.6 },
    })

    // --- The y-axis -------------------------------------------------------
    // High, low, and the rule if there is one. Three numbers is the most this
    // size can carry, and they are the three that answer "from what, to what,
    // and against what". Placed in priority order, and a label is dropped if it
    // would sit on one already placed — the extremes go first because they
    // define the axis; the rule's value is the one worth losing, since the
    // dashed line still shows where it is and the caption still names it.
    const MIN_GAP = 11
    const placed: number[] = []
    const axisText = (v: number, cls: string) => {
      const at = Math.min(CHART_H - CHART_PAD.b - 1, Math.max(CHART_PAD.t - 3, yAt(v) + 3))
      if (placed.some((p) => Math.abs(p - at) < MIN_GAP)) return
      placed.push(at)
      nodes.push({
        tag: 'text',
        attrs: { class: cls, x: CHART_W - CHART_PAD.r + 6, y: round(at), 'text-anchor': 'start' },
        text: format(v),
      })
    }
    axisText(obsHi, 'chart-axis')
    axisText(obsLo, 'chart-axis')
    if (refInDomain) axisText(reference as number, 'chart-axis is-ref')

    // --- The x-axis -------------------------------------------------------
    // A day tick under 86 points is unreadable at this size, so the axis names
    // the ends and the middle: where this starts, roughly halfway, and now.
    const lastIdx = values.length - 1
    const midIdx = Math.floor(lastIdx / 2)
    const xLabels: Array<[number, string, string]> = [
      [CHART_PAD.l, periods[0] ?? '', 'start'],
      [xAt(midIdx), periods[midIdx] ?? '', 'middle'],
      [CHART_W - CHART_PAD.r, periods[lastIdx] ?? '', 'end'],
    ]
    for (const [x, text, anchor] of xLabels) {
      if (!text) continue
      nodes.push({
        tag: 'text',
        attrs: { class: 'chart-date', x: round(x), y: CHART_H - 3, 'text-anchor': anchor },
        text,
      })
    }

    return nodes
  }

  return {
    ok: true,
    width: CHART_W,
    height: CHART_H,
    pad: CHART_PAD,
    lo,
    hi,
    points,
    peak,
    trough,
    latest,
    reference: hasRef ? (reference as number) : null,
    referenceY,
    referenceLabel: referenceLabel ?? null,
    windowPct,
    tone,
    label: label ?? null,
    unit,
    step,
    windowValues: values,
    windowPeriods: periods,
    totalLength: total,
    format,
    formatExact,
    nearest,
    scene,
  }
}

/**
 * What the readout says about one point.
 *
 * Kept here rather than in the browser layer so the static table rows and the
 * live crosshair phrase a value the same way — the table is the crosshair's
 * no-JS equivalent, and the two disagreeing about a number's precision would
 * make them look like two different series.
 */
export const pointReadout = (model: SeriesModel, p: SeriesPoint): string => {
  const parts: string[] = []
  if (p.period) parts.push(p.period)
  const shown = model.formatExact(p.value)
  parts.push(model.unit ? `${shown} ${model.unit}` : shown)
  if (model.reference != null && model.reference !== 0) {
    const pct = ((p.value - model.reference) / Math.abs(model.reference)) * 100
    const against = model.referenceLabel ? ` vs ${model.referenceLabel}` : ''
    parts.push(`${signedPct(pct)}${against}`)
  }
  return parts.join(' · ')
}

/**
 * The change from one observation to the one before it, as a signed
 * percentage, or null at the first point and across a gap.
 *
 * The table's third column. A column of levels tells a reader where a series
 * was and never what happened on a given day, which is the question anyone
 * scanning 86 rows is actually asking.
 */
/**
 * The chart in a sentence, for a reader who is not looking at it.
 *
 * One description, so the static figure and the interactive one cannot
 * disagree — and so the sentence is composed where the numbers are, rather than
 * from a caller who knows the series but not the window. It names the subject,
 * the span drawn, the range of values, and the latest point, which between them
 * are what a sighted reader takes from a glance. Then it says where the rest is:
 * a chart that announces itself as an image and stops has told a screen-reader
 * user that there is data here and no way to reach it.
 */
export const chartDescription = (model: SeriesModel, interactive: boolean): string => {
  const unit = model.unit ? ` ${model.unit}` : ''
  const parts = [
    model.label ?? 'Series chart',
    `line chart, ${model.points.length} ${model.step}`,
    `ranging ${model.formatExact(model.trough?.value ?? model.lo)} to ${model.formatExact(model.peak?.value ?? model.hi)}${unit}`,
  ]
  if (model.latest) parts.push(`latest ${pointReadout(model, model.latest)}`)
  parts.push(
    interactive
      ? 'use arrow keys to read individual values, or open the table below'
      : 'every value is in the table below',
  )
  return `${parts.join('. ')}.`
}

export const stepChange = (values: number[], i: number): number | null => {
  if (i <= 0) return null
  const now = values[i]
  const prev = values[i - 1]
  if (!Number.isFinite(now) || !Number.isFinite(prev) || prev === 0) return null
  return ((now - prev) / Math.abs(prev)) * 100
}

// --- The chart with no JavaScript ------------------------------------------

/**
 * An element, as data — the same trick `SceneNode` plays, one level up.
 *
 * `/e/{id}` is a static page whose entire subject is a chart, so that chart has
 * to be complete before any island loads: the line, the axis, the caption, and
 * the numbers behind it. `<details>` and `<table>` need no script, so the only
 * thing a reader without JavaScript loses is the cursor and the range control —
 * and they lose nothing at all that the page ever stated.
 *
 * Defined here rather than in the build so the class vocabulary has one
 * author. The interactive figure in `_chart.ts` is a different figure — it
 * carries controls that are meaningless without a script — and the island
 * replaces this one wholesale rather than trying to graft onto it.
 */
export interface MarkupNode {
  tag: string
  attrs?: Record<string, string | number | boolean | null | undefined>
  text?: string
  children?: MarkupNode[]
}

const escapeText = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

/** A node tree into an HTML string. Everything is escaped; nothing is raw.
 *  Null renders as nothing, so `renderMarkup(staticFigure(…))` is safe on a
 *  series with no shape. */
export const renderMarkup = (node: MarkupNode | MarkupNode[] | null | undefined): string => {
  if (node == null) return ''
  if (Array.isArray(node)) return node.map(renderMarkup).join('')
  const attrs = Object.entries(node.attrs ?? {})
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeAttr(String(v))}"`))
    .join('')
  const inner = node.children?.length
    ? renderMarkup(node.children)
    : node.text != null
      ? escapeText(node.text)
      : ''
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`
}

export interface StaticFigureOptions {
  caption?: string
  /** Extra classes for the `<figure>`, matching `_chart.ts`'s `className`. */
  className?: string
  /** Whether to emit the `<details>` table. On by default. */
  table?: boolean
}

/**
 * Which of the three rows worth finding this is, in a word.
 *
 * The chart rings the high and the low and fills the latest; a table that
 * marked none of them would make the two look like different series, and would
 * leave "when was the peak" answerable only by reading all 86 rows. A word and
 * not a glyph: Source Sans has no triangle, and a character this family lacks
 * falls back to a system font — a second typeface on a site whose first
 * principle is that the typography is the design.
 */
export const rowMark = (model: SeriesModel, i: number): string => {
  if (model.latest && i === model.latest.i) return 'latest'
  if (model.peak && i === model.peak.i) return 'high'
  if (model.trough && i === model.trough.i) return 'low'
  return ''
}

/** Every observation as a table row, oldest first — the direction the line
 *  runs, which is also the direction that makes the change column mean
 *  "change from the row above". */
const tableRows = (model: SeriesModel): MarkupNode[] =>
  model.windowValues.map((v, i) => {
    const cls = [
      model.peak && i === model.peak.i ? 'is-peak' : '',
      model.trough && i === model.trough.i ? 'is-trough' : '',
      model.latest && i === model.latest.i ? 'is-latest' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const change = stepChange(model.windowValues, i)
    const shown = Number.isFinite(v) ? model.formatExact(v) : '—'
    const mark = rowMark(model, i)
    return {
      tag: 'tr',
      attrs: cls ? { class: cls } : undefined,
      children: [
        {
          tag: 'th',
          attrs: { scope: 'row', class: 'is-when' },
          children: [
            { tag: 'span', text: model.windowPeriods[i] ?? String(i + 1) },
            ...(mark ? [{ tag: 'span', attrs: { class: 'chart-mark' }, text: mark } as MarkupNode] : []),
          ],
        },
        {
          tag: 'td',
          attrs: { class: 'is-value' },
          text: model.unit && Number.isFinite(v) ? `${shown} ${model.unit}` : shown,
        },
        {
          tag: 'td',
          attrs: {
            class: `is-change${change == null ? '' : change > 0 ? ' is-pos' : change < 0 ? ' is-neg' : ''}`,
          },
          text: change == null ? '' : signedPct(change),
        },
      ],
    }
  })

/**
 * Null for a series too short to have a shape, matching `createChart` — one
 * point is a dot pretending to be a trend, and the caller should render nothing
 * rather than an empty box.
 *
 * It used to draw one anyway: an empty `<svg>`, an axis with nothing on it and
 * a `<details>` promising numbers that were not there. Callers checked
 * `model.ok` first and so never saw it, which is precisely the kind of
 * guarantee that holds until someone adds a fourth caller.
 */
export const staticFigure = (
  model: SeriesModel,
  opts: StaticFigureOptions = {},
): MarkupNode | null => {
  if (!model.ok) return null
  const children: MarkupNode[] = []

  // The readout, at rest: the latest observation and its date. On the
  // interactive chart this line tracks a cursor; here it states the one point
  // a reader most wants named, which is more than any of these charts said
  // before whether or not a script ever runs.
  if (model.latest) {
    children.push({
      tag: 'p',
      attrs: { class: 'chart-readout' },
      text: pointReadout(model, model.latest),
    })
  }

  children.push({
    tag: 'div',
    attrs: {
      class: 'chart-plot',
      role: 'img',
      'aria-label': chartDescription(model, false),
    },
    children: [
      {
        tag: 'svg',
        attrs: {
          class: 'chart-svg',
          viewBox: `0 0 ${model.width} ${model.height}`,
          preserveAspectRatio: 'xMidYMid meet',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        children: model.scene().map((n) => ({ tag: n.tag, attrs: n.attrs, text: n.text })),
      },
    ],
  })

  if (opts.caption) {
    children.push({
      tag: 'div',
      attrs: { class: 'chart-controls' },
      children: [{ tag: 'figcaption', attrs: { class: 'chart-caption' }, text: opts.caption }],
    })
  }

  if (opts.table !== false) {
    children.push({
      tag: 'details',
      attrs: { class: 'chart-data' },
      children: [
        {
          tag: 'summary',
          attrs: { class: 'chart-data-summary' },
          children: [
            { tag: 'span', attrs: { class: 'chart-data-label' }, text: 'the numbers' },
            {
              tag: 'span',
              attrs: { class: 'chart-data-count' },
              text: String(model.windowValues.length),
            },
          ],
        },
        {
          tag: 'div',
          attrs: { class: 'chart-data-body' },
          children: [
            {
              tag: 'div',
              attrs: { class: 'chart-table-scroll' },
              children: [
                {
                  tag: 'table',
                  attrs: { class: 'chart-table' },
                  children: [
                    {
                      tag: 'thead',
                      children: [
                        {
                          tag: 'tr',
                          children: [
                            { tag: 'th', attrs: { scope: 'col', class: 'is-when' }, text: 'when' },
                            { tag: 'th', attrs: { scope: 'col', class: 'is-value' }, text: 'value' },
                            {
                              tag: 'th',
                              attrs: { scope: 'col', class: 'is-change' },
                              text: 'change',
                            },
                          ],
                        },
                      ],
                    },
                    { tag: 'tbody', children: tableRows(model) },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
  }

  return {
    tag: 'figure',
    attrs: { class: ['chart', model.tone, opts.className].filter(Boolean).join(' ') },
    children,
  }
}
