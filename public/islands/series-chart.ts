// Upgrades a server-rendered chart in place.
//
// `/e/{id}` ships a complete chart with no script: the line, the rule, the
// axis, the extremes and every observation in a `<details>` table. This
// replaces it with the interactive one — a cursor that reads a value off the
// line, a range control that rescales the domain, and a copy button — none of
// which mean anything without a script, which is why none of them are in the
// static markup and why this is a replacement rather than a hydration.
//
// The same two-renderings-of-one-row pattern `share-bar` uses, and for the
// same reason: the page has to work when the bundle doesn't.

import { formatTrajectory, type TrajectoryFormat } from '@shared/countries/country-trajectories'
import { createChart } from './_chart'

/**
 * What a page hands this island beside its static figure.
 *
 * An indicator page (`/e/{id}`) sends the series and nothing about how to draw
 * it, and gets the indicator's chart: signed, ruled at the window's open. A
 * page that draws something else says so in `options`, and those are the
 * options its static figure was built with, so the chart that replaces the
 * figure is the same chart with a cursor. `format` is a name because a
 * function cannot travel in JSON.
 */
interface Source {
  /** `null` where the series has no figure: JSON has no NaN. */
  values: Array<number | null>
  periods: string[]
  unit?: string
  kind?: string
  label?: string
  caption?: string
  options?: {
    comparison?: { values: Array<number | null>; label: string }
    domain?: [number, number]
    reference?: number
    referenceLabel?: string
    referenceChange?: boolean
    format?: TrajectoryFormat
    change?: 'percent' | 'points'
    step?: string
  }
}

export const mount = (container: HTMLElement) => {
  const script = container.querySelector('script.chart-source')
  if (!script?.textContent) return

  let source: Source
  try {
    source = JSON.parse(script.textContent)
  } catch {
    return
  }

  const values = (Array.isArray(source.values) ? source.values : []).map((v) =>
    typeof v === 'number' ? v : Number.NaN,
  )
  const periods = Array.isArray(source.periods) ? source.periods : []
  const drawn = source.options
  const format = drawn?.format
  const chart = drawn
    ? createChart({
        values,
        periods,
        comparison: drawn.comparison,
        domain: drawn.domain,
        reference: drawn.reference,
        ...(drawn.referenceLabel ? { referenceLabel: drawn.referenceLabel } : {}),
        referenceChange: drawn.referenceChange,
        change: drawn.change,
        ...(format ? { formatValue: (v: number) => formatTrajectory(format, v) } : {}),
        palette: 'neutral',
        step: drawn.step ?? 'points',
        label: source.label,
        caption: source.caption,
      })
    : createChart({
        values,
        periods,
        reference: 'open',
        referenceLabel: 'the window’s open',
        direction: 'window',
        palette: 'signed',
        unit: source.unit || '',
        step: source.kind === 'MONTHLY' ? 'months' : 'days',
        label: source.label,
        caption: source.caption,
      })
  if (!chart) return

  container.querySelector('figure.chart')?.remove()
  container.prepend(chart.element)
}
