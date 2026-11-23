// The quick switcher: ⌘K, Ctrl+K or `/`, type, Enter.
//
// The map holds a few hundred things a reader can name — this edition's
// stories, the places they happened, the countries, the rail's lists — and the
// only way to any one of them was to find it by eye. This is the way by name.
//
// It floats over the map with no backdrop (no card dims this page), as the
// rail's group panel does, and it is a combobox over a listbox: the focus stays
// in the field and the highlight is `aria-activedescendant`, so typing never
// stops. It is not a search engine: a substring of what is on the page, with
// a name that starts with the query ahead of one that merely contains it.

import { el } from '../_dom'

export type SwitchKind = 'story' | 'place' | 'country' | 'data'

export interface SwitchItem {
  kind: SwitchKind
  /** What is matched and printed. */
  label: string
  /** Matched too, ranked after the label: a story's place. Printed quietly. */
  sub?: string
  /** A modified press (⌘/Ctrl+Enter, ⌘/Ctrl/middle click) opens this instead. */
  href?: string
  run(): void
}

export interface Switcher {
  open(): void
  close(): void
  isOpen(): boolean
  destroy(): void
}

export interface SwitcherOptions {
  /**
   * Everything that can be found, in the order each kind should list in when
   * nothing ranks it higher (stories newest first). Asked at every keystroke,
   * so it is always the current edition, range and rail.
   */
  items: () => SwitchItem[]
}

const HEADINGS: Record<SwitchKind, string> = {
  story: 'Stories',
  place: 'Places',
  country: 'Countries',
  data: 'Data',
}

const KINDS: SwitchKind[] = ['story', 'place', 'country', 'data']

/** How many of each kind a query lists. A switcher, not a results page. */
const LIMIT: Record<SwitchKind, number> = { story: 8, place: 5, country: 5, data: 6 }

/** With nothing typed: the newest stories, so the field is useful at once. */
const IDLE_STORIES = 6

/**
 * Case and accents folded, one character for one, so a match's index in the
 * folded text is its index in the printed one: `turk` finds Türkiye.
 */
const fold = (text: string): string =>
  text
    .split('')
    .map((ch) => (ch.normalize('NFD')[0] ?? ch).toLocaleLowerCase()[0] ?? ch)
    .join('')

/**
 * Where `query` stands in `text`, case- and accent-folded, preferring a word's
 * start; `null` for no match.
 */
export const matchAt = (text: string, query: string): { at: number; start: boolean } | null => {
  if (!query) return null
  const hay = fold(text)
  const q = fold(query)
  let first = -1
  for (let i = hay.indexOf(q); i >= 0; i = hay.indexOf(q, i + 1)) {
    if (first < 0) first = i
    if (i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1] ?? '')) return { at: i, start: true }
  }
  return first < 0 ? null : { at: first, start: false }
}

export interface Ranked {
  item: SwitchItem
  /** Where the label matched, for the highlight; null when only `sub` did. */
  hit: { at: number; length: number } | null
}

/**
 * The listed items, grouped by kind in `KINDS` order and capped per kind.
 *
 * Within a kind: the label starting with the query, then a word in it
 * starting with it, then any match in the label, then a match in `sub`, each
 * in the caller's order. A stable sort,
 * so the newest story wins a tie.
 */
export const rankItems = (items: SwitchItem[], query: string): Ranked[] => {
  const q = query.trim()
  if (!q) {
    return items
      .filter((i) => i.kind === 'story')
      .slice(0, IDLE_STORIES)
      .map((item) => ({ item, hit: null }))
  }
  const out: Ranked[] = []
  for (const kind of KINDS) {
    const scored: Array<{ r: Ranked; score: number }> = []
    for (const item of items) {
      if (item.kind !== kind) continue
      const m = matchAt(item.label, q)
      if (m) {
        const score = m.at === 0 ? 0 : m.start ? 1 : 2
        scored.push({ r: { item, hit: { at: m.at, length: q.length } }, score })
        continue
      }
      if (item.sub && matchAt(item.sub, q)) scored.push({ r: { item, hit: null }, score: 3 })
    }
    scored.sort((a, b) => a.score - b.score)
    for (const s of scored.slice(0, LIMIT[kind])) out.push(s.r)
  }
  return out
}

/** The label with the matched run in a `<mark>`, built as text nodes. */
const labelWith = (label: string, hit: Ranked['hit']): Node[] => {
  if (!hit) return [document.createTextNode(label)]
  const mark = el('mark', 'map-switcher-hit', label.slice(hit.at, hit.at + hit.length))
  return [
    document.createTextNode(label.slice(0, hit.at)),
    mark,
    document.createTextNode(label.slice(hit.at + hit.length)),
  ]
}

const inTextField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select'))

export function createSwitcher(opts: SwitcherOptions): Switcher {
  const root = el('div', 'map-switcher')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', 'Find on the map')

  const field = el('input', 'map-switcher-input')
  field.type = 'text'
  field.placeholder = 'Stories, places, countries, markets'
  field.autocomplete = 'off'
  field.spellcheck = false
  field.setAttribute('role', 'combobox')
  field.setAttribute('aria-expanded', 'true')
  field.setAttribute('aria-autocomplete', 'list')
  field.setAttribute('aria-controls', 'map-switcher-list')
  field.setAttribute('aria-label', 'Find a story, place, country or market')

  const list = el('div', 'map-switcher-list')
  list.id = 'map-switcher-list'
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', 'Matches')

  const empty = el('p', 'map-switcher-empty', 'Nothing in this edition matches.')
  empty.hidden = true

  root.append(field, list, empty)
  document.body.append(root)

  let open = false
  let ranked: Ranked[] = []
  let options: HTMLElement[] = []
  let active = -1
  let returnTo: HTMLElement | null = null

  const setActive = (i: number) => {
    if (i === active || !options.length) return
    options[active]?.setAttribute('aria-selected', 'false')
    active = Math.max(0, Math.min(options.length - 1, i))
    const opt = options[active]
    if (!opt) return
    opt.setAttribute('aria-selected', 'true')
    field.setAttribute('aria-activedescendant', opt.id)
    // The list alone, and no smoothing: the highlight is the keyboard's cursor.
    const top = opt.offsetTop
    const bottom = top + opt.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }

  const render = () => {
    ranked = rankItems(opts.items(), field.value)
    options = []
    active = -1
    field.removeAttribute('aria-activedescendant')
    const groups: Node[] = []
    let kind: SwitchKind | null = null
    let group: HTMLElement | null = null
    ranked.forEach((r, i) => {
      if (r.item.kind !== kind) {
        kind = r.item.kind
        group = el('div', 'map-switcher-group')
        group.setAttribute('role', 'group')
        const head = el('div', 'map-switcher-head', HEADINGS[kind])
        head.id = `map-switcher-head-${kind}`
        head.setAttribute('role', 'presentation')
        group.setAttribute('aria-labelledby', head.id)
        group.append(head)
        groups.push(group)
      }
      const opt = el('div', 'map-switcher-option')
      opt.id = `map-switcher-opt-${i}`
      opt.setAttribute('role', 'option')
      opt.setAttribute('aria-selected', 'false')
      opt.dataset.index = String(i)
      const label = el('span', 'map-switcher-label')
      label.append(...labelWith(r.item.label, r.hit))
      opt.append(label)
      if (r.item.sub) opt.append(el('span', 'map-switcher-sub', r.item.sub))
      group?.append(opt)
      options.push(opt)
    })
    list.replaceChildren(...groups)
    list.hidden = ranked.length === 0
    empty.hidden = ranked.length > 0 || !field.value.trim()
    setActive(0)
  }

  /** Close, and give the focus back unless the choice is taking it somewhere. */
  const close = (restore = true) => {
    if (!open) return
    open = false
    root.classList.remove('is-open')
    document.removeEventListener('pointerdown', onOutside, true)
    if (restore && returnTo?.isConnected) returnTo.focus({ preventScroll: true })
    else if (root.contains(document.activeElement)) field.blur()
    returnTo = null
  }

  const choose = (i: number, modified: boolean) => {
    const r = ranked[i]
    if (!r) return
    if (modified && r.item.href) {
      window.open(r.item.href, '_blank', 'noopener')
      return
    }
    // A story's card takes the focus; anything else leaves it where it was.
    close(r.item.kind !== 'story')
    r.item.run()
  }

  const onOutside = (e: PointerEvent) => {
    if (!root.contains(e.target as Node)) close()
  }

  field.addEventListener('input', render)
  field.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(active + (e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Home' && e.ctrlKey) {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End' && e.ctrlKey) {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(active, e.metaKey || e.ctrlKey)
    } else if (e.key === 'Escape') {
      // Ours, not the page's: the page's Escape resets the camera.
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    }
  })

  // Pressing an option keeps the focus in the field, so the press is a choice
  // and not a blur.
  list.addEventListener('mousedown', (e) => e.preventDefault())
  list.addEventListener('mousemove', (e) => {
    const opt = (e.target as Element).closest<HTMLElement>('.map-switcher-option')
    if (opt) setActive(Number(opt.dataset.index))
  })
  list.addEventListener('click', (e) => {
    const opt = (e.target as Element).closest<HTMLElement>('.map-switcher-option')
    if (opt) choose(Number(opt.dataset.index), e.metaKey || e.ctrlKey)
  })
  list.addEventListener('auxclick', (e) => {
    const opt = (e.target as Element).closest<HTMLElement>('.map-switcher-option')
    if (opt && e.button === 1) choose(Number(opt.dataset.index), true)
  })

  const openSwitcher = () => {
    if (open) {
      field.select()
      return
    }
    open = true
    const was = document.activeElement
    returnTo = was instanceof HTMLElement && was !== document.body ? was : null
    field.value = ''
    render()
    root.classList.add('is-open')
    field.focus({ preventScroll: true })
    document.addEventListener('pointerdown', onOutside, true)
  }

  /**
   * ⌘K and Ctrl+K anywhere, `/` anywhere a reader is not typing. Ctrl+K is
   * the browser's search-bar key in Firefox and Chrome on Linux and Windows;
   * a page that answers it is the convention this follows, and the page is a
   * map with no field of its own to search.
   */
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (open) close()
      else openSwitcher()
      return
    }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !inTextField(e.target)) {
      e.preventDefault()
      openSwitcher()
    }
  }
  document.addEventListener('keydown', onKey)

  return {
    open: openSwitcher,
    close: () => close(),
    isOpen: () => open,
    destroy() {
      close(false)
      document.removeEventListener('keydown', onKey)
      root.remove()
    },
  }
}
