// About, contact, privacy and mcp — shown over the map instead of leaving it.
//
// These pages are short prose that exists to answer a question the reader had
// while looking at the map. Navigating away to answer it throws out the view
// they had built up — the range they picked, where they had panned, the story
// they were half-way through — and makes a footer link feel like leaving the
// site. So the map stays, and the prose arrives on top of it.
//
// The standalone `/about` page is still the canonical one: it is what a shared
// link, a crawler and a JS-less browser get. This only intercepts a plain
// left-click, and pushes the same URL into history so the address bar, the
// back button and a reload all behave as if the page had loaded. The sheet
// lives exactly as long as that history entry is current: closing it steps back
// off the entry, and Forward onto the entry opens it again.

interface Doc {
  page: string
  title: string
  html: string
}

interface Props {
  doc?: string
}

const cache = new Map<string, Doc>()

// `support` and `sources` were retired 2026-04-25 (support folded into contact,
// sources dropped with /search) — build.js's `staticPages` only emits about,
// contact, privacy and mcp. Leaving those two in ALLOWED meant an old bookmark
// or inbound link could still open a sheet here, spend a fetch on
// `/api/doc/{page}.json`, and land on "Could not load this page." instead of
// being told outright that the page doesn't exist.
/** Only these can be opened, so a crafted `data-doc` cannot fetch elsewhere. */
const ALLOWED = new Set(['about', 'contact', 'privacy', 'mcp'])

/**
 * Stamps the entries this document pushed. `history.state` outlives a reload,
 * which makes the same URL a standalone page with no sheet to open or close.
 */
const THIS_DOCUMENT = performance.timeOrigin

/** The doc whose sheet belongs on the current history entry, if any. */
const entryDoc = (): string | null => {
  const state = history.state as { doc?: string; by?: number } | null
  return state?.by === THIS_DOCUMENT && state.doc ? state.doc : null
}

/** The doc with a sheet up. One at a time: the sheet is modal. */
let openDoc: string | null = null

// Closing leaves the pushed entry ahead in history, and the browser offers no
// way to drop it, so Forward lands on it: `/about` over the map, unless the
// sheet comes back. Once, for the page: the loader keeps this module.
window.addEventListener('popstate', () => {
  const doc = entryDoc()
  if (doc && doc !== openDoc) mount(document.createElement('div'), { doc })
})

export function mount(container: HTMLElement, props: Props) {
  const page = String(props.doc || '').toLowerCase()
  if (!ALLOWED.has(page)) {
    container.remove()
    return
  }

  const dialog = document.createElement('dialog')
  dialog.className = 'island-sheet doc-sheet'
  dialog.setAttribute('aria-label', page)

  const closeForm = document.createElement('form')
  closeForm.method = 'dialog'
  closeForm.className = 'island-sheet-close-form'
  const closeBtn = document.createElement('button')
  closeBtn.type = 'submit'
  closeBtn.className = 'island-sheet-close'
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.textContent = '×'
  closeForm.append(closeBtn)

  const inner = document.createElement('div')
  inner.className = 'island-sheet-inner doc-sheet-inner'

  const kicker = document.createElement('p')
  kicker.className = 'doc-sheet-kicker'
  kicker.textContent = page

  const bodyEl = document.createElement('div')
  bodyEl.className = 'about-body doc-sheet-body'
  bodyEl.textContent = 'Loading…'

  // The way out to the real page, for anyone who wants a URL to keep.
  const permalink = document.createElement('a')
  permalink.className = 'doc-sheet-permalink'
  permalink.href = `/${page}`
  permalink.textContent = 'Open as a page →'

  inner.append(kicker, bodyEl, permalink)
  dialog.append(closeForm, inner)
  document.body.append(dialog)

  const close = () => {
    if (dialog.open) dialog.close()
  }

  // A popstate close has already moved history; this one must not move it again.
  let historyMoved = false

  dialog.addEventListener('close', () => {
    window.removeEventListener('popstate', onPop)
    if (openDoc === page) openDoc = null
    // × or Escape: step back off our entry, so the address bar says what it
    // said before and Back goes where the reader came from. A replaceState here
    // left a second copy of the previous URL, and Back did nothing once.
    if (!historyMoved && entryDoc() === page) history.back()
    dialog.remove()
    container.remove()
  })

  // A click on the backdrop — outside the dialog's own box — dismisses.
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return
    const r = dialog.getBoundingClientRect()
    const outside =
      e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    if (outside) close()
  })

  const onPop = () => {
    historyMoved = true
    close()
  }
  window.addEventListener('popstate', onPop)

  dialog.showModal()
  openDoc = page
  // Reopened by Forward, the URL is already ours.
  if (location.pathname !== `/${page}`) {
    history.pushState({ doc: page, by: THIS_DOCUMENT }, '', `/${page}`)
  }

  const render = (doc: Doc) => {
    bodyEl.textContent = ''
    // Trusted content: this HTML is produced by our own build from the same
    // markdown the standalone page renders.
    bodyEl.innerHTML = doc.html
  }

  const hit = cache.get(page)
  if (hit) {
    render(hit)
    return
  }

  void (async () => {
    try {
      const res = await fetch(`/api/doc/${page}.json`, { cache: 'force-cache' })
      if (!res.ok) throw new Error(String(res.status))
      const doc = (await res.json()) as Doc
      cache.set(page, doc)
      if (dialog.open) render(doc)
    } catch {
      // Never leave the reader at a dead end: if the prose cannot be fetched,
      // the page it lives on is still one click away.
      bodyEl.textContent = 'Could not load this page.'
    }
  })()
}
