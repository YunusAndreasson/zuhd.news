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

import { createChart } from './_chart'
import {
  html,
  mountSheetIsland,
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

/**
 * The chart, mounted rather than rendered.
 *
 * This used to be a second implementation of the map's sparkline in Preact,
 * on the argument that a VNode and an imperative island cannot share a
 * renderer. They cannot — but they can share the chart, which is what
 * `@shared/chart/series` is: the geometry as data, with a ten-line adapter per
 * runtime. `_chart.ts` owns the DOM adapter and everything the reader actually
 * interacts with, so this component's whole job is to hand it a container.
 *
 * The effect owns the chart's lifetime and tears it down on unmount, because
 * the chart registers listeners on nodes Preact does not know it created.
 */
const SeriesChart = ({ record }: { record: EntityRecord }) => {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = host.current
    if (!node) return
    const values = record.values ?? []
    const chart = createChart({
      values,
      periods: record.periods ?? [],
      // The drawn window's opening value, the same rule the market cards draw.
      // A 180-day line with nothing across it can only be read for its shape.
      reference: 'open',
      referenceLabel: 'the window’s open',
      direction: 'window',
      palette: 'signed',
      unit: record.unit,
      step: record.kind === 'MONTHLY' ? 'months' : 'days',
      label: record.label,
      caption: record.caption,
    })
    if (chart) node.append(chart.element)
    return () => chart?.destroy()
  }, [record])

  return html`<div class="entity-sheet-chart-host" ref=${host}></div>`
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
              <${SeriesChart} record=${record} />
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
  mountSheetIsland(EntitySheet, container, props)
