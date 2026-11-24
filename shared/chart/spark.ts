// The sparkline's geometry, and the figure printed beside a story's line.
//
// `public/islands/_spark.ts` drew the line from `seriesModel` in the browser,
// and the article page now prints the same line at build. Two surfaces stating
// one series is how three charts drifted apart before (`charts.md`), so the
// arithmetic is here and each surface is an adapter: the island appends DOM
// nodes, the build writes a string. No DOM in this file.

import { type SeriesModel, seriesModel, signedPct } from './series'

/** The spark's own box: a proportion the stylesheet stretches, not a size. */
export const SPARK_W = 100
export const SPARK_H = 20

/**
 * Room for the stroke at the top and the bottom of the box. The line is
 * `non-scaling-stroke`, so a peak on y=0 would lose half its stroke.
 */
const INSET = 1.5

const round = (n: number): number => Number(n.toFixed(1))

export interface SparkGeometryOptions {
  values: number[]
  /** How many observations to draw, from the end. */
  window: number
  /** Where the line sits in the box, 0–1, when it does not fill the window. */
  span?: [number, number] | undefined
  /** A fixed vertical domain — see `SeriesOptions.domain`. */
  domain?: [number, number] | undefined
}

export interface SparkGeometry {
  /** The drawn points in the spark's box. */
  pts: Array<readonly [number, number]>
  /** The box's floor: where an area closes and a bar stands. */
  floor: number
  /** Width of the drawn run, for a bar's slot. */
  width: number
  /** Last against first over exactly what is drawn. */
  windowPct: number
  /** The first and last values drawn. */
  ends: [number, number]
}

/**
 * `seriesModel`'s points, divided out of its box and into the spark's. The
 * domain, the window and "too short to have a shape" stay in the model.
 */
export const sparkGeometry = (opts: SparkGeometryOptions): SparkGeometry | null => {
  const model: SeriesModel = seriesModel({
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
  const xOf = (x: number) => left + ((x - pad.l) / iw) * width
  const yOf = (y: number) => INSET + ((y - pad.t) / ih) * plot
  const pts = model.points.map((p) => [xOf(p.x), yOf(p.y)] as const)

  const open = model.points[0]
  const close = model.points[model.points.length - 1]
  if (!open || !close || pts.length === 0) return null
  return { pts, floor: SPARK_H - INSET, width, windowPct: model.windowPct, ends: [open.value, close.value] }
}

/** The line's `points` attribute. */
export const sparkLinePoints = (g: SparkGeometry): string =>
  g.pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')

/** The area under the line, closed on the floor. */
export const sparkAreaPath = (g: SparkGeometry): string => {
  const first = g.pts[0]
  const last = g.pts[g.pts.length - 1]
  if (!first || !last) return ''
  return (
    `M${round(first[0])},${round(g.floor)} ` +
    g.pts.map(([x, y]) => `L${round(x)},${round(y)}`).join(' ') +
    ` L${round(last[0])},${round(g.floor)} Z`
  )
}

/** The latest observation, as the end of a zero-length stroke. */
export const sparkDot = (g: SparkGeometry): [number, number] | null => {
  const last = g.pts[g.pts.length - 1]
  return last ? [round(last[0]), round(last[1])] : null
}

/** One bar per bucket, standing on the floor; a gap that scales with the slot. */
export const sparkBars = (g: SparkGeometry): Array<{ x: number; y: number; width: number; height: number }> => {
  const slot = g.width / Math.max(1, g.pts.length)
  const bw = Math.max(0.5, slot * 0.72)
  return g.pts.map(([x, y]) => ({
    x: round(x - bw / 2),
    y: round(Math.min(y, g.floor - 0.5)),
    width: round(bw),
    height: round(Math.max(0.5, g.floor - y)),
  }))
}

/**
 * A move in points, at `places` decimals, signed with a true minus: a rate
 * moves by a difference, never by a percentage of itself.
 */
export const pointsFigure = (delta: number, places: number): string => {
  const body = Math.abs(delta).toFixed(places)
  return Number(body) === 0 ? '0 pts' : `${delta > 0 ? '+' : '−'}${body} pts`
}

/**
 * The move a story's line prints beside it: the line's own, never the
 * record's last step. A series quoted in percent moves in points, to the
 * hundredth under ten (a cut of 1.25 is not `−1 pts`).
 */
export const sparkMove = (
  g: Pick<SparkGeometry, 'windowPct' | 'ends'>,
  unit: string | undefined,
): { delta: number; text: string } => {
  const points = unit === '%'
  const delta = points ? g.ends[1] - g.ends[0] : g.windowPct
  return {
    delta,
    text: points ? pointsFigure(delta, Math.abs(delta) >= 10 ? 1 : 2) : signedPct(delta),
  }
}
