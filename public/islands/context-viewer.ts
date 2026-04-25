// Context viewer island — fetches /api/context/{id}.json and renders the
// timeline into a <dialog popover>. Entry point for the web equivalent of
// mobile's ContextSheet.tsx. The fuller port with embedded block
// renderers (trend, compare, locations, quote, actors, quiz) lands in
// Track 3 when the block adapter is ready; this is the working scaffold
// that the lazy loader in reader.js activates.

import {
  html,
  mountIsland,
  useEffect,
  useRef,
  useState,
  useDialogOutsideClose,
  type Island,
} from './_framework'
import { Block, type ArticleBlock } from './_blocks'

interface TimelineEntry {
  year?: string
  heading?: string
  body: string
  blocks?: ArticleBlock[]
}

interface ContextBrief {
  id: string
  label: string
  category: string
  timeline: TimelineEntry[]
  blocks?: ArticleBlock[]
  sources?: string[]
}

interface Props {
  threadId: string
  threadLabel?: string
}

const ContextViewer: Island<Props> = ({ threadId, threadLabel }) => {
  const [brief, setBrief] = useState<ContextBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useDialogOutsideClose(dialogRef as { current: HTMLDialogElement | null })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/context/${encodeURIComponent(threadId)}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setBrief(data)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [threadId])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
  }, [])

  const entries = brief?.timeline ?? []

  return html`
    <dialog ref=${dialogRef} class="island-sheet context-sheet">
      <form method="dialog" class="island-sheet-close-form" aria-label="Close context brief">
        <button class="island-sheet-close" aria-label="Close">×</button>
      </form>
      <div class="island-sheet-inner">
        <header class="context-sheet-header">
          <span class="label">CONTEXT BRIEF</span>
          <h2 class="island-sheet-title">${brief?.label ?? threadLabel ?? 'Context'}</h2>
          ${brief?.category
            ? html`<p class="t-caption context-sheet-meta">${brief.category.toUpperCase()}</p>`
            : null}
          <a class="context-sheet-thread-link" href=${`/s/${threadId}`}>
            See every article in this story →
          </a>
        </header>
        ${error ? html`<p class="island-sheet-error">Couldn't load context brief.</p>` : null}
        ${!brief && !error ? html`<p class="island-sheet-loading">Loading…</p>` : null}
        ${brief?.blocks?.length
          ? html`<div class="context-spanning-blocks">
              ${brief.blocks.map(
                (b, i) => html`<${Block} block=${b} sources=${brief.sources} key=${i} />`,
              )}
            </div>`
          : null}
        ${entries.length
          ? html`
              <ol class="context-timeline">
                ${entries.map(
                  (entry, i) => html`
                    <li class="context-timeline-entry" key=${i}>
                      ${entry.year ? html`<span class="context-year">${entry.year}</span>` : null}
                      ${entry.heading
                        ? html`<p class="context-heading">${entry.heading}</p>`
                        : null}
                      <p class="context-body">${entry.body}</p>
                      ${entry.blocks?.length
                        ? html`<div class="context-entry-blocks">
                            ${entry.blocks.map(
                              (b, j) => html`<${Block} block=${b} sources=${brief?.sources} key=${j} />`,
                            )}
                          </div>`
                        : null}
                    </li>
                  `,
                )}
              </ol>
            `
          : null}
        ${brief?.sources?.length
          ? html`
              <footer class="context-sources">
                <span class="label">SOURCES</span>
                <ul>
                  ${brief.sources.map(
                    (src, i) => html`<li key=${i}>${src}</li>`,
                  )}
                </ul>
              </footer>
            `
          : null}
      </div>
    </dialog>
  `
}

// Lazy-loader entry point. reader.js imports this module and calls mount().
export const mount = (container: HTMLElement, props: Props) =>
  mountIsland(ContextViewer, container, props)
