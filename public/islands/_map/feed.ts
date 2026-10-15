// The left event rail.
//
// A map alone tells you where but never what; every operational display worth
// copying pairs the map with a running list. This is also what brings a
// reading surface back to the homepage after the old split-pane reader was
// retired — the list is scannable on its own, and each row is a link.

import { NARROW_PX, type MapPoint } from './types'
import { CATEGORY_COLOUR, FALLBACK_CATEGORY_COLOUR } from './style'
import { MAKKAH_TZ, relativeTime, zoneOffset } from './format'

export interface Feed {
  element: HTMLElement
  /**
   * Where the category filters go.
   *
   * They used to sit in the instrument rail, under a `stories` heading, between
   * the readings and the layers. That put the one control on the page that
   * decides *which stories exist* two panes away from the list of them — and in
   * a column whose every other member is a fact about the world rather than a
   * choice about the news. Here it sits directly over the list it filters and
   * beside the map beacons it filters, which is the whole of the argument.
   *
   * A host owned by the feed rather than an element the island inserts, because
   * the position matters: **outside the scrolling `<ol>` and under the head**,
   * so the filters do not scroll away from the rows they are acting on.
   */
  filterHost: HTMLElement
  setItems(points: MapPoint[], now: number): void
  /** Scrolls to and marks a row, e.g. when its marker is clicked on the map. */
  highlight(slug: string | null): void
  /** Grey a row out without rebuilding the list. */
  setRead(slug: string): void
  /** Give the focus back to a row, when a card opened from it closes. */
  focusRow(slug: string): void
  /**
   * What the refresh control is doing. `idle` restores the button; `busy`
   * disables it; a number reports how many stories arrived, including zero.
   */
  setRefreshState(state: 'idle' | 'busy' | 'error' | number): void
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
  /** `keyboard`: pressed with Enter, so the card should take the focus. */
  onSelect: (point: MapPoint, keyboard: boolean) => void
  onHover: (point: MapPoint | null) => void
  /** The rail changed height, so whatever measured it needs to measure again. */
  onToggle?: (open: boolean) => void
  /** The refresh control was pressed. */
  onRefresh?: () => void
  /** Has this reader already opened the story? Drives the greyed-out state. */
  isRead?: (slug: string) => boolean
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
  // The skip link's target (`templates/index.html`): the rail is after the
  // map's controls and the instrument rail in the tab order. The list, not the
  // rail, so the next Tab is a story and not the rail's refresh and filters.
  list.id = 'stories'
  list.tabIndex = -1

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
   * what decides whether the drawer exists at all — on a desktop the disclosure
   * is inert and the rail has no collapsed height to return to.
   *
   * The head itself is a container rather than that button, because it holds
   * two controls now. A <button> inside a <button> is invalid markup, and
   * browsers resolve it by dropping the inner one — so nesting refresh inside
   * the handle would have left it unclickable on exactly the layout where the
   * handle exists.
   */
  const head = document.createElement('div')
  head.className = 'map-feed-head'

  const disclosure = document.createElement('button')
  disclosure.type = 'button'
  disclosure.className = 'map-feed-disclosure'

  const chevron = document.createElement('span')
  chevron.className = 'map-feed-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  chevron.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" focusable="false">' +
    '<path d="M3.5 10 8 5.5 12.5 10"/></svg>'

  disclosure.append(count, chevron)

  /**
   * Check for new stories without leaving the page.
   *
   * The map is a view a reader builds — a camera position, a time slice, a set
   * of categories, maybe an open card — and reloading to see whether anything
   * broke throws all of it away. So this asks the one question a reload was
   * being used for and answers it in place.
   *
   * It is a glyph and a label, not a glyph alone: an unlabelled circular arrow
   * on a news page is as easily read as "reset" as "reload", and the two would
   * have opposite consequences for the view the reader has set up.
   */
  const refresh = document.createElement('button')
  refresh.type = 'button'
  refresh.className = 'map-feed-refresh'
  refresh.title = 'Check for new stories'

  const refreshIcon = document.createElement('span')
  refreshIcon.className = 'map-feed-refresh-icon'
  refreshIcon.setAttribute('aria-hidden', 'true')
  refreshIcon.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" focusable="false">' +
    '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.6 2.2v2.9h-2.9"/></svg>'

  const refreshLabel = document.createElement('span')
  refreshLabel.className = 'map-feed-refresh-label'
  refreshLabel.textContent = 'Refresh'

  // The result replaces the label, and a reader who cannot see it must hear it.
  refreshLabel.setAttribute('aria-live', 'polite')

  refresh.append(refreshIcon, refreshLabel)
  refresh.addEventListener('click', () => {
    if (refresh.getAttribute('aria-disabled') === 'true') return
    opts.onRefresh?.()
  })

  head.append(disclosure, refresh)

  // Between the head and the list, and outside both: see `filterHost`.
  const filterHost = document.createElement('div')
  filterHost.className = 'map-feed-filters'

  root.append(head, filterHost, list)

  /**
   * The result of a refresh, said once and then withdrawn.
   *
   * "No new stories" is the answer most presses deserve and the one a spinner
   * alone never gives — without it a refresh that found nothing is
   * indistinguishable from a refresh that failed. It replaces the button's own
   * label for a few seconds rather than opening a toast, because the reader is
   * already looking at the thing they pressed.
   */
  let resultTimer = 0
  const setRefreshState = (state: 'idle' | 'busy' | 'error' | number) => {
    clearTimeout(resultTimer)
    refresh.classList.toggle('is-busy', state === 'busy')
    // `aria-disabled`, not `disabled`: a disabled button drops the focus of
    // the reader who pressed it to `<body>`.
    refresh.setAttribute('aria-disabled', String(state === 'busy'))
    if (state === 'busy') {
      refreshLabel.textContent = 'Checking'
      return
    }
    if (state === 'idle') {
      refreshLabel.textContent = 'Refresh'
      return
    }
    refreshLabel.textContent =
      state === 'error' ? 'Try again' : state === 0 ? 'Nothing new' : `+${state} new`
    resultTimer = self.setTimeout(() => {
      refreshLabel.textContent = 'Refresh'
    }, 4000)
  }

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
      disclosure.removeAttribute('aria-expanded')
      disclosure.removeAttribute('aria-controls')
      // The count is said and not shown on the desktop, so this button is an
      // empty box there: out of the tab order, or focus lands on nothing.
      disclosure.tabIndex = -1
      return
    }
    disclosure.removeAttribute('tabindex')
    disclosure.setAttribute('aria-controls', 'stories')
    disclosure.setAttribute('aria-expanded', String(expanded))
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

  disclosure.addEventListener('click', () => setExpanded(!expanded))
  syncDisclosure()
  narrowQuery.addEventListener('change', syncDisclosure)

  // The drawer animates its height, so the measurement taken the instant it is
  // toggled is of a rail mid-slide. Reporting again when it settles is what
  // makes the map's padding match where the list actually stopped.
  root.addEventListener('transitionend', (e) => {
    if (e.target === root && e.propertyName === 'height') opts.onToggle?.(expanded)
  })

  const rows = new Map<string, HTMLLIElement>()

  /**
   * Mark a row read, in both channels a reader might have.
   *
   * The greying is colour and the hollow dot is shape, and neither reaches
   * somebody listening to the page — so the state is also said in words. Once:
   * `is-read` guards the insert so a rebuild over an already-marked row cannot
   * stack them.
   */
  const applyRead = (li: HTMLLIElement) => {
    if (li.classList.contains('is-read')) return
    li.classList.add('is-read')
    const note = document.createElement('span')
    note.className = 'sr-only'
    note.textContent = ' (read)'
    li.querySelector('.map-feed-body')?.append(note)
  }

  /**
   * The list is patched in place now, not rebuilt (2026-08-03).
   *
   * Measured with a 40-move scrubber drag against the built page: this list was
   * torn down and rebuilt **17 times**, and a rebuild is 120 rows x 4 elements x
   * 3 listeners — about 2,000 nodes and 6,000 listeners created and discarded
   * per gesture. That is the rail's flicker: `replaceChildren` drops scroll
   * anchoring, any running transition, the hover the pointer is sitting on and
   * the `is-active` mark, so the rail strobes under the cursor while the map
   * underneath moves smoothly.
   *
   * **The first attempt was to skip identical rebuilds, and it collected
   * nothing**, which is the useful part of the record: scrubbing changes the set
   * on every frame by construction — the head moves, so the count moves and the
   * newest row drops out — so all 17 rebuilds were "necessary" and every one of
   * them re-made 120 rows to change one. The waste was never redundancy, it was
   * that the unit of work was the whole list.
   *
   * So: a keyed patch. Rows are reused by slug, their mutable text is written
   * only when it differs, survivors are moved into place and the rest removed.
   * Scrubbing back takes rows off the top and adds them at the bottom, so nearly
   * every row survives every frame and the DOM work per frame goes from 2,000
   * nodes to a handful.
   *
   * **`moveBefore` where it exists** — the state-preserving move (Chrome 133+):
   * `insertBefore` unloads and reloads the node it moves, which restarts CSS
   * transitions and drops focus, and a row being moved is exactly a row the
   * reader may be pointing at. `insertBefore` is the fallback and is correct,
   * just less kind.
   */
  const moveInto = (parent: Element, node: Element, before: Node | null) => {
    // `moveBefore` throws if the node is not already in a document; a fresh row
    // has to be inserted the ordinary way. Feature-detected per call rather than
    // once, because the check is a property read and the branch is predictable.
    const mv = (parent as unknown as { moveBefore?: (n: Node, b: Node | null) => void }).moveBefore
    if (mv && node.isConnected) mv.call(parent, node, before)
    else parent.insertBefore(node, before)
  }

  /**
   * Days, in Makkah's frame like every date on the map. A range of three to
   * ninety days was one undivided column, and "9h ago" under "1d ago" is the
   * only place a reader could find where yesterday began.
   */
  const dayRows = new Map<string, HTMLLIElement>()
  const DAY_MS = 86_400_000
  const dayKey = (t: number) => new Date(t + zoneOffset(t, MAKKAH_TZ)).toISOString().slice(0, 10)
  const dayName = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: MAKKAH_TZ,
  })
  // Against the wall clock, not the scrub head: "today" is the reader's today.
  const dayLabel = (key: string, t: number) => {
    const wall = Date.now()
    if (key === dayKey(wall)) return 'Today'
    if (key === dayKey(wall - DAY_MS)) return 'Yesterday'
    return dayName.format(t)
  }
  const dayRowFor = (key: string, t: number): HTMLLIElement => {
    let li = dayRows.get(key)
    if (!li) {
      li = document.createElement('li')
      li.className = 'map-feed-day'
      li.dataset.day = key
      dayRows.set(key, li)
    }
    const label = dayLabel(key, t)
    if (li.textContent !== label) li.textContent = label
    return li
  }

  const metaOf = (p: MapPoint, now: number) =>
    [p.loc, relativeTime(p.t, now)].filter(Boolean).join(' \u00b7 ')

  /**
   * The points currently on screen, by slug.
   *
   * This exists because the row listeners are **delegated to the list** rather
   * than bound per row. Three listeners on 120 rows is 360 registrations thrown
   * away on every rebuild, and — worse for a patch — a per-row closure captures
   * the `MapPoint` it was built with, so a reused row would go on reporting the
   * object it first saw. One listener reading the live map cannot go stale.
   */
  const points = new Map<string, MapPoint>()

  let emptyRow: HTMLLIElement | null = null

  const rowFor = (p: MapPoint, now: number): HTMLLIElement => {
    const existing = rows.get(p.slug)
    if (existing) {
      // Only the part that can change. `title` and `href` are fixed for a
      // slug; the dateline moves because `relativeTime` is relative to the
      // scrub head, and writing it unconditionally would dirty the row on
      // every frame.
      const meta = existing.querySelector<HTMLElement>('.map-feed-meta')
      const text = metaOf(p, now)
      if (meta && meta.textContent !== text) meta.textContent = text
      if (opts.isRead?.(p.slug)) applyRead(existing)
      return existing
    }

    const li = document.createElement('li')
    li.className = 'map-feed-item'
    li.dataset.slug = p.slug

    const dot = document.createElement('span')
    dot.className = 'map-feed-dot'
    // Handed in as `--cat` rather than written straight to `background`, the
    // same way the HUD chips take their layer's colour — so a read row can
    // switch the dot from a disc to a ring in the stylesheet without the
    // stylesheet ever naming a category hue.
    dot.style.setProperty('--cat', CATEGORY_COLOUR[p.cat] ?? FALLBACK_CATEGORY_COLOUR)

    const body = document.createElement('div')
    body.className = 'map-feed-body'

    const link = document.createElement('a')
    link.className = 'map-feed-title'
    link.href = `/a/${p.slug}`
    link.textContent = p.title

    const meta = document.createElement('p')
    meta.className = 'map-feed-meta'
    meta.textContent = metaOf(p, now)

    // The headline and where it happened, and no sentence between them: the
    // rail is scanned for a story to open, and the story's card has its prose.
    body.append(link, meta)
    li.append(dot, body)

    // Already opened. Greyed rather than hidden or reordered: the rail is a
    // chronological record of what happened, and dropping a story because
    // this reader has seen it would make the list disagree with the map it
    // is captioning — the beacon stays exactly where it was.
    if (opts.isRead?.(p.slug)) applyRead(li)

    rows.set(p.slug, li)
    return li
  }

  const build = (sorted: MapPoint[], now: number) => {
    const shown = sorted.slice(0, MAX_ROWS)

    points.clear()
    for (const p of shown) points.set(p.slug, p)

    // Walk the wanted order against the DOM's order, moving only what is out of
    // place. `cursor` is the node the next row should land before; when it is
    // already the right row, nothing is touched at all.
    let cursor = list.firstChild
    const place = (li: HTMLLIElement) => {
      if (cursor === li) cursor = li.nextSibling
      else moveInto(list, li, cursor)
    }
    let day = ''
    for (const p of shown) {
      const key = dayKey(p.t)
      if (key !== day) {
        day = key
        place(dayRowFor(key, p.t))
      }
      place(rowFor(p, now))
    }

    // Whatever the walk did not claim is no longer in the slice. Collected
    // first and removed after, because removing while walking `nextSibling`
    // steps off the node that was just detached.
    const stale: ChildNode[] = []
    for (let n = cursor; n; n = n.nextSibling) stale.push(n)
    for (const n of stale) {
      n.remove()
      const { slug, day: staleDay } = (n as HTMLElement).dataset ?? {}
      if (slug) rows.delete(slug)
      if (staleDay) dayRows.delete(staleDay)
    }
    // Nothing matched. A rail that just goes blank reads as a failure to load
    // rather than a filter that excluded everything — and leaves the reader
    // with no idea which of the three controls to move to get back.
    if (!sorted.length) {
      // Reused across empties rather than recreated: the sweep above detaches
      // it with everything else, and re-appending the same node is one DOM op.
      emptyRow ??= document.createElement('li')
      emptyRow.className = 'map-feed-empty'
      emptyRow.textContent =
        'No stories in this slice. Widen the range, or turn a category back on.'
      list.append(emptyRow)
    }

    const n = sorted.length
    // The count describes the map; the rail stops at MAX_ROWS. Saying "722
    // stories" over a list that ends at 120 makes the reader think they have
    // reached the end of the corpus, so the cap is stated rather than hidden.
    const label =
      n > MAX_ROWS
        ? `${n} stories \u00b7 newest ${MAX_ROWS} listed`
        : `${n} ${n === 1 ? 'story' : 'stories'}`
    // Guarded because `count` is an `aria-live` region: writing the same text
    // back into it re-announces it, and a scrub would then read the story count
    // aloud on every frame.
    if (count.textContent !== label) count.textContent = label
  }

  /**
   * One set of listeners on the list, resolving the row from the event.
   *
   * See `points` for why these are not per row. `closest` walks at most four
   * levels here and only on events the reader actually generates.
   */
  const pointAt = (target: EventTarget | null): MapPoint | null => {
    const li = (target as Element | null)?.closest?.('.map-feed-item')
    const slug = (li as HTMLElement | null)?.dataset?.slug
    return slug ? points.get(slug) ?? null : null
  }

  // Clicking anywhere in the row — headline included — flies to the story and
  // opens it on the map rather than navigating away. The href stays a real URL
  // so Cmd-click, middle-click and right-click still open the full page, and
  // the link works with JS disabled.
  // Whether the click that follows was made by Enter. Gecko gives a keyed
  // click a `detail` of 1, so that cannot say.
  let keyed = false
  list.addEventListener('keydown', (e) => {
    keyed = e.key === 'Enter'
  })
  list.addEventListener('pointerdown', () => {
    keyed = false
  })
  list.addEventListener('click', (e) => {
    const keyboard = keyed || e.detail === 0
    keyed = false
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    const p = pointAt(e.target)
    if (!p) return
    e.preventDefault()
    opts.onSelect(p, keyboard)
  })
  // `mouseover`/`mouseout` rather than `mouseenter`/`mouseleave`: the enter pair
  // does not bubble, so it cannot be delegated. The guard is that a move
  // *within* one row reports the same slug, so the hover is only re-sent when
  // the row under the pointer actually changes.
  let hovered: string | null = null
  list.addEventListener('mouseover', (e) => {
    const p = pointAt(e.target)
    if (p?.slug === hovered) return
    hovered = p?.slug ?? null
    opts.onHover(p)
  })
  list.addEventListener('mouseleave', () => {
    if (hovered === null) return
    hovered = null
    opts.onHover(null)
  })

  return {
    element: root,
    filterHost,
    setItems(points, now) {
      build([...points].sort((a, b) => b.t - a.t), now)
    },
    setRead(slug) {
      const li = rows.get(slug)
      if (li) applyRead(li)
    },
    setRefreshState,
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
    focusRow(slug) {
      rows.get(slug)?.querySelector<HTMLElement>('a')?.focus()
    },
    isExpanded: () => expanded,
    setExpanded,
    destroy() {
      clearTimeout(resultTimer)
      narrowQuery.removeEventListener('change', syncDisclosure)
      root.remove()
      rows.clear()
      points.clear()
    },
  }
}
