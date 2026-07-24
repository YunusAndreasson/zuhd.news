// Story card, anchored on the map itself.
//
// Two states from one popup. Hovering a marker gives a compact preview; a
// dwell or a click flies in and opens the whole article in place — headline,
// dateline, body, sources. This is the complete story, not a teaser: the
// standalone /a/{slug} page carries the same text, so the card offers no link
// out to it. That page still exists for search engines, shared URLs and
// Cmd-click from the rail.
//
// A centred dialog would hide the geography that gives the story its context;
// a popup pinned to the coordinate keeps the place in view and tracks pan and
// zoom.

import { Popup, type Map as MapLibreMap } from 'maplibre-gl'
import type { MapPoint } from './types'
import { CATEGORY_COLOUR } from './style'
import { relativeTime } from './sheet'

interface Story {
  slug: string
  title: string
  date: string
  dateFormatted: string
  category: string
  location: string
  eventCoverage: number
  bodyHtml: string
  sources: Array<{ name: string; url: string }>
  threadLabel?: string
}

export interface StoryPopup {
  /** Compact card for hover — no fetch, no body. */
  preview(point: MapPoint, leads: Record<string, string>, now: number): void
  /** Full article, fetched on demand and rendered in place. */
  open(point: MapPoint, now: number): Promise<void>
  close(): void
  isOpen(): boolean
  destroy(): void
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

const kickerFor = (p: MapPoint, now: number) => {
  const kicker = el('p', 'map-popup-kicker')
  const dot = el('span', 'map-popup-dot')
  dot.style.background = CATEGORY_COLOUR[p.cat] ?? '#8a8a8a'
  kicker.append(dot, [p.cat, p.loc || null, relativeTime(p.t, now)].filter(Boolean).join(' · '))
  return kicker
}

export function createStoryPopup(map: MapLibreMap): StoryPopup {
  const popup = new Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: 'none',
    offset: 14,
    className: 'map-popup',
  })

  const cache = new Map<string, Story>()
  // Guards against a slow fetch for a story the reader has already moved past.
  let pending: string | null = null

  const fetchStory = async (slug: string): Promise<Story | null> => {
    const hit = cache.get(slug)
    if (hit) return hit
    try {
      const res = await fetch(`/api/story/${slug}.json`, { cache: 'force-cache' })
      if (!res.ok) return null
      const story = (await res.json()) as Story
      cache.set(slug, story)
      return story
    } catch {
      return null
    }
  }

  const shell = (p: MapPoint, now: number, variant: string) => {
    const root = el('div', `map-popup-body map-popup-${variant}`)
    root.append(kickerFor(p, now), el('h2', 'map-popup-title', p.title))
    return root
  }

  return {
    preview(p, leads, now) {
      const root = shell(p, now, 'preview')
      const lead = leads[p.slug]
      if (lead) root.append(el('p', 'map-popup-lead', lead))
      root.append(el('p', 'map-popup-hint', 'Opening…'))
      popup.setLngLat([p.lng, p.lat]).setDOMContent(root).addTo(map)
    },

    async open(p, now) {
      pending = p.slug
      const loading = shell(p, now, 'article')
      loading.append(el('p', 'map-popup-loading', 'Loading…'))
      popup.setLngLat([p.lng, p.lat]).setDOMContent(loading).addTo(map)

      const story = await fetchStory(p.slug)
      if (pending !== p.slug) return

      const root = shell(p, now, 'article')
      if (story) {
        const body = el('div', 'map-popup-prose')
        // Trusted content: this HTML is produced by our own build from the
        // article markdown, the same string the /a/{slug} page renders.
        body.innerHTML = story.bodyHtml
        root.append(body)

        const meta: string[] = [story.dateFormatted]
        if (story.eventCoverage > 0) meta.push(`${story.eventCoverage} outlets`)
        root.append(el('p', 'map-popup-meta', meta.join(' · ')))
      } else {
        // Only when the card itself cannot render does the standalone page
        // become worth offering — otherwise it holds nothing this does not.
        root.append(el('p', 'map-popup-lead', 'Could not load this story.'))
        const link = el('a', 'map-popup-link', 'Open full page') as HTMLAnchorElement
        link.href = `/a/${p.slug}`
        root.append(link)
      }
      popup.setDOMContent(root)
    },

    close() {
      pending = null
      popup.remove()
    },
    isOpen: () => popup.isOpen(),
    destroy() {
      pending = null
      cache.clear()
      popup.remove()
    },
  }
}
