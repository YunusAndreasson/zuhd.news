// A panel that opens where the question was asked.
//
// Two surfaces carry an indicator strip — the map's story card and the article
// page — and until now they answered a chip in two different ways: the card
// unfolded the series inside itself, the article threw a 44rem dialog and a
// scrim over the story being read. Same gesture, same question, two mechanisms
// and two answers, one of which was the navigation the other had been built to
// stop making.
//
// So the mechanism lives here and the surfaces supply the content. What is
// shared is not the rendering — the card is dark chrome and the article is the
// site palette — but the behaviour: which trigger is open, what happens when a
// second is pressed while the first is still fetching, how the box grows, and
// what has to be unwound when it closes.

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

/**
 * How a card changes size.
 *
 * Long enough to be a movement, short enough that the reader is not waiting on
 * it to start reading. Shared by the story card's preview→article swap and
 * every panel below, because they are the same gesture at two scales: a card
 * admitting it has more to say.
 */
export const GROW_MS = 220
export const GROW_EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animate a box between the height it has and the height its contents want.
 *
 * `mutate` is what changes the contents; everything around it is measurement.
 * `overflow` is clipped for the duration because the content is laid out at
 * full height throughout — without it the new content spills out of the short
 * box and a scrollbar flickers in and out on the way.
 *
 * No `fill`, so the box returns to its own `auto` height the moment this ends
 * and a reader who later opens the chart's own `<details>` is not fighting an
 * inline height left behind. Nothing to unwind but the clip.
 */
export const growTo = async (
  node: HTMLElement,
  from: number,
  mutate: () => void,
): Promise<void> => {
  mutate()
  if (reducedMotion()) return
  const to = node.getBoundingClientRect().height
  // Under a couple of pixels there is nothing to see, and an animation that
  // cannot be perceived is a frame budget spent on nothing.
  if (Math.abs(to - from) < 2) return
  const overflow = node.style.overflow
  node.style.overflow = 'hidden'
  try {
    await node.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: GROW_MS,
      easing: GROW_EASE,
    }).finished
  } catch {
    // A cancelled animation is an ordinary outcome here — a second chip
    // pressed mid-flight — and not a failure to report.
  } finally {
    node.style.overflow = overflow
  }
}

/**
 * What a disclosure puts in its panel, plus whatever has to be unwound when it
 * is replaced or closed. `dispose` exists for the chart, which registers
 * listeners on nodes it created.
 */
export interface Built {
  node: Node
  dispose?: () => void
}

export interface Disclosure {
  /** The panel itself. The caller places it — next to the triggers that own it. */
  panel: HTMLElement
  /** Registers a trigger. `ready` is the payload already in hand, if any. */
  bind(
    id: string,
    node: HTMLElement,
    build: () => Promise<Built>,
    ready?: () => Built | null,
  ): void
  destroy(): void
}

/**
 * One panel, many triggers.
 *
 * One per group rather than one per trigger: two charts, or two country
 * blocks, stacked in a card with room for neither would push the first out of
 * view as the second arrived. The panel sits next to the triggers that own it
 * — the country block under the prose it was clicked in, the series under the
 * strip — because a disclosure that opens somewhere else is a navigation.
 *
 * `scrollHint` is what the surface knows and this does not: the map's card is
 * capped at 50vh and these triggers sit low in it, so a panel there opens below
 * a fold the reader has no reason to think exists, while on an article page the
 * panel opens in ordinary document flow and scrolling it would be the page
 * lurching for no reason.
 */
export const disclosure = (
  className: string,
  {
    scrollIntoView = false,
    loadingClass = 'map-popup-loading',
    loadingText = 'Loading…',
  }: { scrollIntoView?: boolean; loadingClass?: string; loadingText?: string } = {},
): Disclosure => {
  const panel = el('div', className)
  panel.hidden = true
  const triggers = new Map<string, HTMLElement>()
  let openId: string | null = null
  // A trigger pressed while another's fetch is in flight must win, and the
  // loser must not paint over it when it lands.
  let seq = 0
  let dispose: (() => void) | null = null

  const clear = () => {
    dispose?.()
    dispose = null
  }

  const mark = (id: string | null) => {
    openId = id
    for (const [k, t] of triggers) t.setAttribute('aria-expanded', String(k === id))
  }

  const collapse = () => {
    if (!openId) return
    seq++
    mark(null)
    const from = panel.getBoundingClientRect().height
    const finish = () => {
      panel.hidden = true
      panel.replaceChildren()
      clear()
    }
    if (reducedMotion() || from < 2) return finish()
    const overflow = panel.style.overflow
    panel.style.overflow = 'hidden'
    panel
      .animate([{ height: `${from}px` }, { height: '0px' }], {
        duration: GROW_MS,
        easing: GROW_EASE,
      })
      .finished.finally(() => {
        panel.style.overflow = overflow
        finish()
      })
  }

  /**
   * `build` is async because the payload usually is; `ready` is the escape
   * hatch for the case where it is already in hand, which skips the waiting
   * line entirely rather than flashing one for a frame.
   */
  const expand = async (id: string, build: () => Promise<Built>, ready?: Built | null) => {
    const mine = ++seq
    const from = panel.hidden ? 0 : panel.getBoundingClientRect().height
    mark(id)
    panel.hidden = false

    const show = (built: Built) => {
      clear()
      dispose = built.dispose ?? null
      panel.replaceChildren(built.node)
    }

    if (ready) {
      await growTo(panel, from, () => show(ready))
    } else {
      await growTo(panel, from, () => {
        clear()
        panel.replaceChildren(el('p', loadingClass, loadingText))
      })
      const built = await build()
      if (mine !== seq) {
        built.dispose?.()
        return
      }
      await growTo(panel, panel.getBoundingClientRect().height, () => show(built))
    }

    /**
     * Scroll the panel into the card.
     *
     * Measured on a 1440x900 desktop, a series panel in the map's story card
     * opened 152px of 251px into view — the chart's caption, its range control,
     * "the numbers" and the link to the full record all landing outside a box
     * the reader has no reason to think has scrolled. Growth the reader cannot
     * see is the same as no growth.
     *
     * `nearest` so a panel already in view is left alone, and instant rather
     * than smooth: the expansion has just finished animating and a second
     * movement chasing it reads as the card fidgeting.
     */
    if (scrollIntoView && mine === seq) panel.scrollIntoView({ block: 'nearest' })
  }

  return {
    panel,
    bind(id, node, build, ready) {
      // A disclosure, so a screen reader is told this opens in place rather
      // than being sent to another page by a link that says nothing.
      node.setAttribute('aria-expanded', 'false')
      triggers.set(id, node)
      node.addEventListener('click', (ev) => {
        const e = ev as MouseEvent
        // Modified clicks and the middle button keep the browser's own
        // behaviour, the same rule the wordmark and the rail rows follow.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        // The country tags are `data-island` triggers and the loader is
        // listening on the document. Without this the inline panel and the
        // old dialog would both open.
        e.stopPropagation()
        if (openId === id) collapse()
        else void expand(id, build, ready?.() ?? null)
      })
    },
    destroy: clear,
  }
}

/**
 * "All the details", answered here.
 *
 * Every panel used to end in a link out — `full record →` to `/e/{id}`,
 * `full profile →` to `/country/{ISO2}` — which is the whole disclosure undone
 * at the last line. On the map a reader who followed one abandoned a camera, a
 * time slice, a set of filters and the story they were reading, to answer a
 * question the panel had already started answering. It is the same navigation
 * the chips and the country tags were fixed for; it had simply retreated to the
 * bottom of the panel and put on the word "full".
 *
 * So the second density opens under the first. `box` is the growable ancestor —
 * the disclosure's own panel — because that is what has to be measured for the
 * growth to be animated rather than jump; `fill` is called once, the first
 * time, and what it builds is kept for a reader who folds it and opens it again.
 *
 * The `href` is untouched and stays a real URL: cmd-click, middle-click, a
 * crawler and a JS-less browser all still reach the canonical page, which is
 * the same bargain the rail rows, the wordmark and the chips already make.
 */
export const moreLink = ({
  labels,
  href,
  box,
  linkClass,
  moreClass,
  fill,
}: {
  labels: [more: string, less: string]
  href: string
  /** The growable ancestor whose height is animated — the disclosure's panel. */
  box: HTMLElement
  linkClass: string
  moreClass: string
  fill: (into: HTMLElement) => void
}): Node[] => {
  const link = el('a', linkClass, labels[0])
  link.href = href
  link.setAttribute('aria-expanded', 'false')

  const more = el('div', moreClass)
  more.hidden = true
  let filled = false

  link.addEventListener('click', (ev) => {
    const e = ev as MouseEvent
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    // The country tags in the prose are `data-island` triggers with the loader
    // listening on the document, and this link can sit inside that panel.
    e.stopPropagation()

    const open = link.getAttribute('aria-expanded') === 'true'
    const from = box.getBoundingClientRect().height
    link.setAttribute('aria-expanded', String(!open))
    link.textContent = labels[open ? 0 : 1]

    void growTo(box, from, () => {
      if (open) {
        more.hidden = true
        return
      }
      if (!filled) {
        fill(more)
        filled = true
      }
      more.hidden = false
    }).then(() => {
      // The link sits at the foot of the panel, so what it just opened is
      // below it — and on the map that panel is inside a card capped at 50vh.
      if (!open) more.scrollIntoView({ block: 'nearest' })
    })
  })

  return [link, more]
}
