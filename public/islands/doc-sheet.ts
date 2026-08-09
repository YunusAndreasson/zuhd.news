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
// back button and a reload all behave as if the page had loaded.

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

  // Restore whatever the address bar said before, so closing does not strand
  // the reader on /about while they are looking at the map.
  const previousUrl = location.pathname + location.search
  let pushed = false

  const close = () => {
    if (dialog.open) dialog.close()
  }

  dialog.addEventListener('close', () => {
    // Only rewind history if this sheet is what put the URL there; a popstate
    // close has already moved it.
    if (pushed && location.pathname === `/${page}`) {
      history.replaceState({}, '', previousUrl)
    }
    window.removeEventListener('popstate', onPop)
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

  const onPop = () => close()
  window.addEventListener('popstate', onPop)

  dialog.showModal()
  if (location.pathname !== `/${page}`) {
    history.pushState({ doc: page }, '', `/${page}`)
    pushed = true
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
