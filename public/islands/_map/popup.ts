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
import { CONTESTED_D, type MapPoint } from './types'
import { CATEGORY_COLOUR } from './style'
import { relativeTime } from './sheet'
import * as fmt from './format'

interface StorySource {
  name: string
  url: string
  country?: string | null
  sentiment?: number | null
}

interface Story {
  slug: string
  title: string
  date: string
  dateFormatted: string
  category: string
  location: string
  eventCoverage: number
  bodyHtml: string
  sentimentDivergence?: number | null
  sources: StorySource[]
  threadLabel?: string
}

interface CountryMetric {
  label: string
  value: string | number
  rank: number | null
  total: number
}

/** `/api/country/{ISO2}.json` — the same payload the inline country tags use. */
interface CountryProfile {
  iso2: string
  name: string
  flag: string
  region: string
  metaLine: string
  /** The six best-ranked metrics — what the card opens on. */
  highlights: CountryMetric[]
  /** Every metric, in page order. Read when the card expands in place. */
  metrics?: CountryMetric[]
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

// A "how long has this been running" kicker was built here and then removed
// after looking at what the ledger actually holds for the map's window: all 61
// threaded stories carry `threadArticleCount: 1`, `threadDay` never exceeds 2,
// and `threadLabel` is the upstream source headline rather than a thread name —
// frequently describing a different story than ours ("Interview: How Tragedy
// Changed the FDA" against "FDA Weighs Unapproved Peptides"). There is no
// running-story signal in there to surface yet, and a kicker built on it would
// be noise at best and wrong at worst. `build.js` still computes the fields; if
// the ledger starts grouping properly this is a small change to reinstate.

/** An outlet, linked to its own reporting when we hold the URL. */
const sourceName = (s: StorySource): Node => {
  if (!s.url) return el('span', 'map-popup-source-name', s.name)
  const a = el('a', 'map-popup-source-name', s.name) as HTMLAnchorElement
  a.href = s.url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  return a
}

/**
 * Attribution — and, on a story the map has already ringed, the disagreement
 * itself rather than a word for it.
 *
 * The build has always shipped a `country` and a `sentiment` per source; the
 * story endpoint dropped both, so the card could show the ring but never what
 * produced it. A contested story is the one place the tone numbers are worth
 * printing: they are a machine estimate, and putting one beside every outlet on
 * every story would read as a verdict we do not stand behind story by story.
 * Where the ring is on, the spread *is* the story, and the outlet's country is
 * usually the shape of it.
 */
const sourceBlock = (story: Story, p: MapPoint): Node[] => {
  const sources = story.sources ?? []
  if (!sources.length) return [el('p', 'map-popup-meta', story.dateFormatted)]

  const divergence = story.sentimentDivergence ?? p.d ?? 0
  const rated = sources.filter((s) => typeof s.sentiment === 'number')
  const nodes: Node[] = []

  if (divergence >= CONTESTED_D && rated.length >= 2) {
    // Ordered by tone so the spread reads down the list rather than needing to
    // be reconstructed from scattered numbers.
    const ordered = [...rated].sort((a, b) => (b.sentiment as number) - (a.sentiment as number))
    nodes.push(el('p', 'map-popup-section', 'Sources diverge'))
    const list = el('ul', 'map-popup-sources')
    for (const s of ordered) {
      const li = el('li', 'map-popup-source')
      li.append(sourceName(s))
      if (s.country) li.append(el('span', 'map-popup-source-cc', s.country))
      const v = s.sentiment as number
      const tone = v > 0 ? ' is-pos' : v < 0 ? ' is-neg' : ''
      li.append(el('span', `map-popup-source-tone${tone}`, fmt.sentiment(v)))
      list.append(li)
    }
    nodes.push(list)
  } else {
    const line = el('p', 'map-popup-sources-flat')
    line.append(el('span', 'map-popup-sources-label', 'Sources'))
    sources.forEach((s, i) => {
      if (i) line.append(', ')
      line.append(sourceName(s))
    })
    nodes.push(line)
  }

  // `eventCoverage` is a different number from the list above — how many
  // outlets carried the event at all, against the handful we read — and it is
  // what the beacon's radius encodes, so the card is where that channel gets
  // decoded.
  const meta = [story.dateFormatted]
  if (story.eventCoverage > 0) meta.push(`${story.eventCoverage} outlets covering`)
  nodes.push(el('p', 'map-popup-meta', meta.join(' · ')))
  return nodes
}

const kickerFor = (p: MapPoint, now: number, extra?: string | null) => {
  const kicker = el('p', 'map-popup-kicker')
  const dot = el('span', 'map-popup-dot')
  dot.style.background = CATEGORY_COLOUR[p.cat] ?? '#8a8a8a'
  kicker.append(
    dot,
    [p.cat, p.loc || null, relativeTime(p.t, now), extra || null].filter(Boolean).join(' · '),
  )
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

  const shell = (p: MapPoint, now: number, variant: string, extra?: string | null) => {
    const root = el('div', `map-popup-body map-popup-${variant}`)
    root.append(kickerFor(p, now, extra), el('h2', 'map-popup-title', p.title))
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
  const metricRow = (m: CountryMetric) => {
    const li = el('li', 'map-country-metric')
    li.append(
      el('span', 'map-country-metric-label', m.label),
      el('span', 'map-country-metric-value', String(m.value)),
    )
    // The percentile strip, same arithmetic the country page uses: rank 1 of
    // 145 is a full bar, last is empty. A bar makes a column of rankings
    // scannable in a way that 26 pairs of numbers never is.
    const strip = el('span', 'map-country-metric-strip')
    if (m.rank != null && m.total > 1) {
      const pct = 1 - (m.rank - 1) / (m.total - 1)
      const fill = el('span', 'map-country-metric-fill')
      fill.style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`)
      strip.append(fill)
    }
    li.append(strip)
    // A rank is what turns a number into a comparison — "82 years" says
    // little, "82 years · 6 / 145" says where that sits in the world.
    li.append(el('span', 'map-country-metric-rank', m.rank != null ? fmt.rank(m.rank, m.total) : ''))
    return li
  }

  const countryCard = (data: CountryProfile, expanded = false) => {
    const root = el('div', `map-popup-body map-popup-country${expanded ? ' is-expanded' : ''}`)

    const kicker = el('p', 'map-popup-kicker')
    kicker.append(data.region || 'country')
    root.append(kicker)

    const head = el('div', 'map-country-head')
    if (data.flag) head.append(el('span', 'map-country-flag', data.flag))
    head.append(el('h2', 'map-popup-title', data.name))
    root.append(head)

    if (data.metaLine) root.append(el('p', 'map-popup-meta', data.metaLine))

    const shown = expanded ? (data.metrics ?? data.highlights) : data.highlights
    if (shown?.length) {
      const list = el('ul', 'map-country-metrics')
      for (const m of shown) list.append(metricRow(m))
      root.append(list)
    }

    if (data.coverage?.length) {
      root.append(el('p', 'map-country-section', 'Recent coverage'))
      const list = el('ul', 'map-country-coverage')
      for (const a of data.coverage.slice(0, expanded ? 20 : 5)) {
        const li = el('li')
        const link = el('a', undefined, a.title) as HTMLAnchorElement
        link.href = `/a/${a.slug}`
        li.append(link, el('time', 'map-country-coverage-time', a.dateFormatted))
        list.append(li)
      }
      root.append(list)
    }

    /**
     * The full profile opens *here*, not at /country/{iso2}.
     *
     * A reader clicks a country because of something they can see on the map;
     * sending them to a standalone page to answer that question throws away the
     * view that raised it, and the way back is a browser button. The card grows
     * instead. The `href` stays a real URL so cmd-click, middle-click and a
     * JS-less browser still reach the canonical page — the same bargain the
     * rail rows and the wordmark already make.
     */
    if (!expanded && (data.metrics?.length ?? 0) > (data.highlights?.length ?? 0)) {
      const full = el('a', 'map-popup-link', 'Full profile →') as HTMLAnchorElement
      full.href = `/country/${data.iso2}`
      full.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        const expandedCard = countryCard(data, true)
        popup.setDOMContent(expandedCard)
        // The link that was just clicked sat at the bottom of the old content,
        // and the browser keeps the focused element in view — which lands the
        // reader at the *end* of the profile they just asked to see.
        expandedCard.scrollTop = 0
      })
      root.append(full)
    }
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
        root.append(...sourceBlock(story, p))
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
