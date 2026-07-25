// Country preview — small <dialog popover> opened from inline country
// tags in article body copy. Replaces the old country-sheet which was
// only triggered from the (now-removed) globe.
//
// UX contract:
//   - One sheet is open at a time. A second tap on a different country
//     replaces the sheet contents in place; the dialog never re-opens.
//   - Dismiss via: (a) close button, (b) Escape, (c) click on backdrop,
//     (d) clicking another country link (replaces).
//   - Body remains scrolled in place — the sheet is a popover, not a
//     route change.
//   - Browser nav (Cmd-click / middle-click / right-click) still works
//     against the <a href> that triggered us. Island-loader respects
//     modifier keys; only plain primary clicks open this sheet.

import {
  html,
  mountSheetIsland,
  useDialogOutsideClose,
  useEffect,
  useRef,
  useState,
  type Island,
} from './_framework'

interface PreviewHighlight {
  label: string
  value: string | number
  rank: number | null
  total: number
}

interface CoverageItem {
  slug: string
  title: string
  dateFormatted: string
  category: string
}

interface CountryPreviewData {
  iso2: string
  name: string
  flag: string
  region: string
  metaLine: string
  highlights: PreviewHighlight[]
  coverage: CoverageItem[]
}

interface Props {
  iso: string
  href?: string
}

const formatRank = (rank: number, total: number) => {
  // "12 / 145" — read as "12th of 145"
  return `${rank} / ${total}`
}

const CountryPreview: Island<Props> = ({ iso, href }) => {
  const [data, setData] = useState<CountryPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useDialogOutsideClose(dialogRef as { current: HTMLDialogElement | null })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/country/${encodeURIComponent(iso)}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((d: CountryPreviewData) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [iso])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
  }, [])

  const fullProfileHref = href || `/country/${iso}`

  return html`
    <dialog ref=${dialogRef} class="island-sheet country-preview-sheet">
      <form method="dialog" class="island-sheet-close-form" aria-label="Close country preview">
        <button class="island-sheet-close" aria-label="Close">×</button>
      </form>
      <div class="island-sheet-inner">
        ${error
          ? html`<p class="island-sheet-error">Couldn't load country preview.</p>`
          : null}
        ${!data && !error
          ? html`<p class="island-sheet-loading">Loading…</p>`
          : null}
        ${data
          ? html`
              <header class="country-preview-header">
                <span class="country-preview-flag" aria-hidden="true">${data.flag}</span>
                <div class="country-preview-titleblock">
                  <span class="label country-preview-region">${data.region.toUpperCase()}</span>
                  <h2 class="island-sheet-title country-preview-name">${data.name}</h2>
                  <p class="t-caption country-preview-meta">${data.metaLine}</p>
                </div>
              </header>
              ${data.highlights.length
                ? html`
                    <section class="country-preview-highlights">
                      <h3 class="label country-preview-section-title">Highlights</h3>
                      <ul class="country-preview-metric-list">
                        ${data.highlights.map(
                          (h, i) => html`
                            <li class="country-preview-metric" key=${i}>
                              <span class="country-preview-metric-label">${h.label}</span>
                              <span class="country-preview-metric-value t-tabular">${h.value}</span>
                              ${h.rank != null
                                ? html`<span
                                    class="country-preview-metric-rank t-tabular"
                                    >${formatRank(h.rank, h.total)}</span
                                  >`
                                : null}
                            </li>
                          `,
                        )}
                      </ul>
                    </section>
                  `
                : null}
              ${data.coverage.length
                ? html`
                    <section class="country-preview-coverage">
                      <h3 class="label country-preview-section-title">
                        Recent coverage
                      </h3>
                      <ol class="country-preview-coverage-list">
                        ${data.coverage.map(
                          (a, i) => html`
                            <li key=${i}>
                              <a class="country-preview-coverage-row" href=${`/a/${a.slug}`}>
                                <time class="t-tabular">${a.dateFormatted}</time>
                                <span class="country-preview-coverage-title">${a.title}</span>
                              </a>
                            </li>
                          `,
                        )}
                      </ol>
                    </section>
                  `
                : null}
              <footer class="country-preview-footer">
                <a class="country-preview-full-link" href=${fullProfileHref}>
                  Full profile →
                </a>
              </footer>
            `
          : null}
      </div>
    </dialog>
  `
}

export const mount = (container: HTMLElement, props: Props) =>
  mountSheetIsland(CountryPreview, container, props)
