// The left event rail.
//
// A map alone tells you where but never what; every operational display worth
// copying pairs the map with a running list. This is also what brings a
// reading surface back to the homepage after the old split-pane reader was
// retired — the list is scannable on its own, and each row is a link.

import { NARROW_PX, type MapPoint } from './types'
import { CATEGORY_COLOUR } from './style'
import { relativeTime } from './format'

export interface Feed {
  element: HTMLElement
  setItems(points: MapPoint[], now: number): void
  /** Scrolls to and marks a row, e.g. when its marker is clicked on the map. */
  highlight(slug: string | null): void
  /** Phone layout only — the rail is a column on a desktop and always open. */
  isExpanded(): boolean
  /**
   * `instant` skips the slide and leaves the rail at its final height before
   * this call returns, so a caller that is about to measure the layout gets
   * the geometry it is going to keep rather than a frame of the animation.
   */
  setExpanded(open: boolean, instant?: boolean): void
  destroy(): void
}

export interface FeedOptions {
  onSelect: (point: MapPoint) => void
  onHover: (point: MapPoint | null) => void
  /** The rail changed height, so whatever measured it needs to measure again. */
  onToggle?: (open: boolean) => void
}

const MAX_ROWS = 120

export function createFeed(opts: FeedOptions): Feed {
  const root = document.createElement('aside')
  root.className = 'map-feed'
  root.setAttribute('aria-label', 'Latest stories')

  const count = document.createElement('span')
  count.className = 'map-feed-count'
  // Changing a range or a category rewrites the map and this number, and
  // says nothing out loud. Announcing the new count is the one piece of
  // feedback that confirms the control did anything at all.
  count.setAttribute('aria-live', 'polite')
  count.setAttribute('aria-atomic', 'true')

  const list = document.createElement('ol')
  list.className = 'map-feed-list'
  list.id = 'map-feed-list'

  /**
   * On a phone the rail is a drawer, and the head is its handle.
   *
   * The rail is a 21rem column beside the map on a desktop, which costs the
   * map nothing. Reproduced on a phone it became a 42vh slab across the
   * bottom: four stories visible, permanently, over a map already cut to 58vh
   * — so neither half was usable and there was no gesture that gave the map
   * its screen back. Collapsed to its own header it costs one line, and the
   * whole head is the target: a 2.8rem bar is easy to hit, a chevron alone is
   * not.
   *
   * A <button> wrapping the count rather than a click handler on the div, so
   * it is reachable by keyboard and announces its state. The stylesheet is
   * what decides whether the drawer exists at all — on a desktop the button is
   * `display: none` and the rail has no collapsed height to return to.
   */
  const head = document.createElement('button')
  head.type = 'button'
  head.className = 'map-feed-head'

  const chevron = document.createElement('span')
  chevron.className = 'map-feed-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  chevron.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" focusable="false">' +
    '<path d="M3.5 10 8 5.5 12.5 10"/></svg>'

  head.append(count, chevron)

  root.append(head, list)

  let expanded = false

  /**
   * Whether the header is a disclosure at all.
   *
   * On a desktop the rail is a column that is always open and the header is a
   * caption — so `aria-expanded="false"` there would announce a collapsed list
   * that is in fact fully on screen, which is worse than saying nothing. The
   * attributes are added and removed with the layout rather than left standing
   * and hoped over, and the stylesheet's breakpoint is the one that decides.
   */
  const narrowQuery = matchMedia(`(max-width: ${NARROW_PX}px)`)

  const syncDisclosure = () => {
    if (!narrowQuery.matches) {
      head.removeAttribute('aria-expanded')
      head.removeAttribute('aria-controls')
      return
    }
    head.setAttribute('aria-controls', 'map-feed-list')
    head.setAttribute('aria-expanded', String(expanded))
  }

  const setExpanded = (open: boolean, instant = false) => {
    if (open === expanded) return
    expanded = open
    // `.is-instant` is `transition: none`. Added before the height changes and
    // removed after a forced reflow, so the browser resolves the new height in
    // one go and no transition is ever started — which means `onToggle` below
    // reports a rail that has already finished moving.
    if (instant) root.classList.add('is-instant')
    root.classList.toggle('is-open', open)
    syncDisclosure()
    if (instant) {
      void root.offsetHeight
      root.classList.remove('is-instant')
    }
    opts.onToggle?.(open)
  }

  head.addEventListener('click', () => setExpanded(!expanded))
  syncDisclosure()
  narrowQuery.addEventListener('change', syncDisclosure)

  // The drawer animates its height, so the measurement taken the instant it is
  // toggled is of a rail mid-slide. Reporting again when it settles is what
  // makes the map's padding match where the list actually stopped.
  root.addEventListener('transitionend', (e) => {
    if (e.target === root && e.propertyName === 'height') opts.onToggle?.(expanded)
  })

  const rows = new Map<string, HTMLLIElement>()

  const build = (points: MapPoint[], now: number) => {
    rows.clear()
    const frag = document.createDocumentFragment()

    for (const p of points.slice(0, MAX_ROWS)) {
      const li = document.createElement('li')
      li.className = 'map-feed-item'
      li.dataset.slug = p.slug

      const dot = document.createElement('span')
      dot.className = 'map-feed-dot'
      dot.style.background = CATEGORY_COLOUR[p.cat] ?? '#888'

      const body = document.createElement('div')
      body.className = 'map-feed-body'

      const link = document.createElement('a')
      link.className = 'map-feed-title'
      link.href = `/a/${p.slug}`
      link.textContent = p.title

      const meta = document.createElement('p')
      meta.className = 'map-feed-meta'
      meta.textContent = [p.loc, relativeTime(p.t, now)].filter(Boolean).join(' · ')

      body.append(link, meta)
      li.append(dot, body)

      // Clicking anywhere in the row — headline included — flies to the story
      // and opens it on the map rather than navigating away. The href stays a
      // real URL so Cmd-click, middle-click and right-click still open the
      // full page, and the link works with JS disabled.
      li.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        opts.onSelect(p)
      })
      li.addEventListener('mouseenter', () => opts.onHover(p))
      li.addEventListener('mouseleave', () => opts.onHover(null))

      rows.set(p.slug, li)
      frag.append(li)
    }

    // Nothing matched. A rail that just goes blank reads as a failure to load
    // rather than a filter that excluded everything — and leaves the reader
    // with no idea which of the three controls to move to get back.
    if (!points.length) {
      const empty = document.createElement('li')
      empty.className = 'map-feed-empty'
      empty.textContent = 'No stories in this slice. Widen the range, or turn a category back on.'
      frag.append(empty)
    }

    list.replaceChildren(frag)
    const n = points.length
    // The count describes the map; the rail stops at MAX_ROWS. Saying "722
    // stories" over a list that ends at 120 makes the reader think they have
    // reached the end of the corpus, so the cap is stated rather than hidden.
    count.textContent =
      n > MAX_ROWS
        ? `${n} stories · newest ${MAX_ROWS} listed`
        : `${n} ${n === 1 ? 'story' : 'stories'}`
  }

  return {
    element: root,
    setItems(points, now) {
      build([...points].sort((a, b) => b.t - a.t), now)
    },
    highlight(slug) {
      for (const [key, li] of rows) li.classList.toggle('is-active', key === slug)
      if (!slug) return
      const li = rows.get(slug)
      // Only when the list can be seen. Collapsed, the list has no height to
      // scroll and the browser walks up to the nearest scrollable ancestor
      // instead — which on the map page is the document, and the document is
      // the map.
      if (li && list.clientHeight > 0) li.scrollIntoView({ block: 'nearest' })
    },
    isExpanded: () => expanded,
    setExpanded,
    destroy() {
      narrowQuery.removeEventListener('change', syncDisclosure)
      root.remove()
      rows.clear()
    },
  }
}
