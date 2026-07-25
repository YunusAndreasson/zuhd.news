// The left event rail.
//
// A map alone tells you where but never what; every operational display worth
// copying pairs the map with a running list. This is also what brings a
// reading surface back to the homepage after the old split-pane reader was
// retired — the list is scannable on its own, and each row is a link.

import type { MapPoint } from './types'
import { CATEGORY_COLOUR } from './style'
import { relativeTime } from './sheet'

export interface Feed {
  element: HTMLElement
  setItems(points: MapPoint[], now: number): void
  /** Scrolls to and marks a row, e.g. when its marker is clicked on the map. */
  highlight(slug: string | null): void
  destroy(): void
}

export interface FeedOptions {
  onSelect: (point: MapPoint) => void
  onHover: (point: MapPoint | null) => void
}

const MAX_ROWS = 120

export function createFeed(opts: FeedOptions): Feed {
  const root = document.createElement('aside')
  root.className = 'map-feed'
  root.setAttribute('aria-label', 'Latest stories')

  const head = document.createElement('div')
  head.className = 'map-feed-head'
  const count = document.createElement('span')
  count.className = 'map-feed-count'
  // Changing a range or a category rewrites the map and this number, and
  // says nothing out loud. Announcing the new count is the one piece of
  // feedback that confirms the control did anything at all.
  count.setAttribute('aria-live', 'polite')
  count.setAttribute('aria-atomic', 'true')
  head.append(count)

  const list = document.createElement('ol')
  list.className = 'map-feed-list'

  root.append(head, list)

  const rows = new Map<string, HTMLLIElement>()
  let current: MapPoint[] = []

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
        const mouse = e as MouseEvent
        if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return
        if (mouse.button != null && mouse.button !== 0) return
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
      current = [...points].sort((a, b) => b.t - a.t)
      build(current, now)
    },
    highlight(slug) {
      for (const [key, li] of rows) li.classList.toggle('is-active', key === slug)
      if (!slug) return
      const li = rows.get(slug)
      if (li) li.scrollIntoView({ block: 'nearest' })
    },
    destroy() {
      root.remove()
      rows.clear()
      current = []
    },
  }
}
