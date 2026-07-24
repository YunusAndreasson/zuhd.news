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

/** `/api/country/{ISO2}.json` — the same payload the inline country tags use. */
interface CountryProfile {
  iso2: string
  name: string
  flag: string
  region: string
  metaLine: string
  highlights: Array<{ label: string; value: string | number; rank: number | null; total: number }>
  coverage: Array<{ slug: string; title: string; dateFormatted: string; category: string }>
}

export interface StoryPopup {
  /** Compact card for hover — no fetch, no body. */
  preview(point: MapPoint, leads: Record<string, string>, now: number): void
  /** Full article, fetched on demand and rendered in place. */
  open(point: MapPoint, now: number): Promise<void>
  /** Country profile, anchored where the reader clicked. */
  openCountry(iso: string, at: [number, number]): Promise<void>
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

  const countryCache = new Map<string, CountryProfile>()

  const fetchCountry = async (iso: string): Promise<CountryProfile | null> => {
    const hit = countryCache.get(iso)
    if (hit) return hit
    try {
      const res = await fetch(`/api/country/${encodeURIComponent(iso)}.json`, {
        cache: 'force-cache',
      })
      if (!res.ok) return null
      const data = (await res.json()) as CountryProfile
      countryCache.set(iso, data)
      return data
    } catch {
      return null
    }
  }

  /**
   * The country card.
   *
   * Deliberately the same popup shell as a story rather than a centred dialog:
   * a country profile is a statement about a *place*, and a modal that covers
   * the map takes away the one thing that makes the statement legible. Anchored
   * where the reader clicked, so the answer appears where the question was
   * asked, and built from the same `/api/country/{ISO2}.json` the inline
   * country tags already use — one payload, two surfaces.
   */
  const countryCard = (data: CountryProfile) => {
    const root = el('div', 'map-popup-body map-popup-country')

    const kicker = el('p', 'map-popup-kicker')
    kicker.append(data.region || 'country')
    root.append(kicker)

    const head = el('div', 'map-country-head')
    if (data.flag) head.append(el('span', 'map-country-flag', data.flag))
    head.append(el('h2', 'map-popup-title', data.name))
    root.append(head)

    if (data.metaLine) root.append(el('p', 'map-popup-meta', data.metaLine))

    if (data.highlights?.length) {
      const list = el('ul', 'map-country-metrics')
      for (const h of data.highlights) {
        const li = el('li', 'map-country-metric')
        li.append(
          el('span', 'map-country-metric-label', h.label),
          el('span', 'map-country-metric-value', String(h.value)),
        )
        // A rank is what turns a number into a comparison — "82 years" says
        // little, "82 years · 6 / 145" says where that sits in the world.
        if (h.rank != null) {
          li.append(el('span', 'map-country-metric-rank', `${h.rank}/${h.total}`))
        }
        list.append(li)
      }
      root.append(list)
    }

    if (data.coverage?.length) {
      root.append(el('p', 'map-country-section', 'Recent coverage'))
      const list = el('ul', 'map-country-coverage')
      for (const a of data.coverage.slice(0, 5)) {
        const li = el('li')
        const link = el('a', undefined, a.title) as HTMLAnchorElement
        link.href = `/a/${a.slug}`
        li.append(link, el('time', 'map-country-coverage-time', a.dateFormatted))
        list.append(li)
      }
      root.append(list)
    }

    const full = el('a', 'map-popup-link', 'Full profile →') as HTMLAnchorElement
    full.href = `/country/${data.iso2}`
    root.append(full)
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

    async openCountry(iso, at) {
      const key = `country:${iso}`
      pending = key
      const loading = el('div', 'map-popup-body map-popup-country')
      loading.append(el('p', 'map-popup-loading', 'Loading…'))
      popup.setLngLat(at).setDOMContent(loading).addTo(map)

      const data = await fetchCountry(iso)
      // The reader may have clicked elsewhere while this was in flight.
      if (pending !== key) return

      if (!data) {
        const miss = el('div', 'map-popup-body map-popup-country')
        miss.append(el('p', 'map-popup-lead', 'No profile for this territory.'))
        popup.setDOMContent(miss)
        return
      }
      popup.setDOMContent(countryCard(data))
    },

    close() {
      pending = null
      popup.remove()
    },
    isOpen: () => popup.isOpen(),
    destroy() {
      pending = null
      cache.clear()
      countryCache.clear()
      popup.remove()
    },
  }
}
