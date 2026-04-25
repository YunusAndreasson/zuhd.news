// Entity sheet island — opens in place from an article's entity strip
// (and eventually from any other surface that wants to show a financial
// indicator without yanking the reader away). Mirrors mobile's
// EntitySheet: header, current value + delta, 180-day sparkline, and the
// list of zuhd articles that reference this entity.
//
// Data: /api/entity/{id}.json — precomputed at build time by
// scripts/build/entity-pages.js (same shape that drives /e/{id}.html).
// Progressive fallback: the static /e/{id} page stays a valid direct
// link / no-JS / crawler target.

import {
  html,
  mountIsland,
  useEffect,
  useRef,
  useState,
  useDialogOutsideClose,
  type Island,
} from './_framework'

interface Mention {
  slug: string
  title: string
  date: string
  dateFormatted: string
  source: string
}

interface EntityRecord {
  id: string
  label: string
  kind: string
  sourceLabel: string
  unit: string
  currentFormatted: string
  current: number | null
  deltaLabel: string
  deltaTone: 'pos' | 'neg' | ''
  values: number[]
  periods: string[]
  caption: string
  asOf: string
  mentions: Mention[]
}

interface Props {
  id: string
}

// Inline SVG sparkline — same math as the build-time renderer so the
// sheet and the static /e/ page draw identical charts. Duplicated
// instead of shared so the island stays self-contained (the build's
// CommonJS-ish import shape would drag in Node polyfills via esbuild).
const Sparkline = ({ values, periods }: { values: number[]; periods: string[] }) => {
  if (!values.length || values.length < 2) return null
  const w = 520
  const h = 140
  const pad = { l: 10, r: 10, t: 18, b: 20 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const sx = (i: number) => pad.l + (i / (values.length - 1)) * innerW
  const sy = (v: number) => pad.t + innerH - ((v - min) / range) * innerH
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(2)},${sy(v).toFixed(2)}`)
    .join('')
  const first = values[0]
  const last = values[values.length - 1]
  const firstLabel = periods?.[0] ?? ''
  const lastLabel = periods?.[periods.length - 1] ?? ''

  return html`
    <svg
      class="entity-sheet-spark"
      viewBox="0 0 ${w} ${h}"
      preserveAspectRatio="none"
      role="img"
      aria-label="Series chart"
    >
      <path
        d=${d}
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <circle cx=${sx(0)} cy=${sy(first)} r="3" fill="currentColor" />
      <circle cx=${sx(values.length - 1)} cy=${sy(last)} r="3" fill="currentColor" />
      <text
        x=${sx(0)}
        y=${h - 4}
        class="entity-sheet-spark-label"
        text-anchor="start"
      >${firstLabel}</text>
      <text
        x=${sx(values.length - 1)}
        y=${h - 4}
        class="entity-sheet-spark-label"
        text-anchor="end"
      >${lastLabel}</text>
    </svg>
  `
}

const EntitySheet: Island<Props> = ({ id }) => {
  const [record, setRecord] = useState<EntityRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useDialogOutsideClose(dialogRef as { current: HTMLDialogElement | null })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/entity/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!cancelled) setRecord(data)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
  }, [])

  return html`
    <dialog ref=${dialogRef} class="island-sheet entity-sheet-dialog">
      <form method="dialog" class="island-sheet-close-form" aria-label="Close entity">
        <button class="island-sheet-close" aria-label="Close">×</button>
      </form>
      <div class="island-sheet-inner entity-sheet-inner">
        ${error
          ? html`<p class="island-sheet-error">Couldn't load entity.</p>`
          : !record
          ? html`<p class="island-sheet-loading">Loading…</p>`
          : html`
              <header class="entity-sheet-header">
                <span class="label">${record.kind}${record.sourceLabel ? ` · ${record.sourceLabel}` : ''}</span>
                <h2 class="entity-sheet-label">${record.label}</h2>
                <div class="entity-sheet-hero">
                  <span class="t-data-numeral entity-sheet-current">${record.currentFormatted}</span>
                  <span class=${`entity-sheet-delta t-tabular ${record.deltaTone}`}>
                    ${record.deltaLabel}
                  </span>
                </div>
              </header>
              <figure class="entity-sheet-chart">
                <${Sparkline} values=${record.values} periods=${record.periods} />
                <figcaption class="t-caption">${record.caption}</figcaption>
              </figure>
              ${record.mentions.length
                ? html`
                    <section class="entity-sheet-mentioned">
                      <h3 class="label entity-sheet-section-title">
                        Mentioned in · ${record.mentions.length}
                      </h3>
                      <ol class="entity-sheet-mention-list">
                        ${record.mentions.slice(0, 8).map(
                          (m) => html`
                            <li key=${m.slug}>
                              <a class="entity-sheet-mention-row" href=${`/a/${m.slug}`}>
                                <time datetime=${m.date} class="t-tabular">${m.dateFormatted}</time>
                                <span class="entity-sheet-mention-title">${m.title}</span>
                              </a>
                            </li>
                          `,
                        )}
                      </ol>
                    </section>
                  `
                : null}
              <footer class="entity-sheet-footer">
                <a class="entity-sheet-full-link" href=${`/e/${record.id}`}>
                  Full page →
                </a>
              </footer>
            `}
      </div>
    </dialog>
  `
}

export const mount = (container: HTMLElement, props: Props) =>
  mountIsland(EntitySheet, container, props)
