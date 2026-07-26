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

import { createChart } from './_chart'

interface Source {
  values: number[]
  periods: string[]
  unit?: string
  kind?: string
  label?: string
  caption?: string
}

export const mount = (container: HTMLElement) => {
  const script = container.querySelector('script.chart-source')
  if (!script?.textContent) return

  let source: Source
  try {
    source = JSON.parse(script.textContent)
  } catch {
    // The static chart is already on screen and correct. A malformed payload
    // costs the reader the cursor and nothing else, so there is nothing to
    // report and nothing to fall back to.
    return
  }

  const values = Array.isArray(source.values) ? source.values : []
  const chart = createChart({
    values,
    periods: Array.isArray(source.periods) ? source.periods : [],
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

  // The static figure goes only once its replacement exists, so a throw
  // anywhere above leaves the page as the server sent it.
  container.querySelector('figure.chart')?.remove()
  container.prepend(chart.element)
}
