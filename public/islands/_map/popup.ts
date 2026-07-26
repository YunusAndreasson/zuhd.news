// Story card, anchored on the map itself.
//
// Two states from one popup. Committing to a story — a click on the beacon or
// on a rail row — opens a compact preview at once and replaces it with the
// whole article as soon as the camera lands: headline, dateline, body,
// sources. This is the complete story, not a teaser: the standalone
// /a/{slug} page carries the same text, so the card offers no link out to it.
// That page still exists for search engines, shared URLs and Cmd-click from
// the rail.
//
// A centred dialog would hide the geography that gives the story its context;
// a popup pinned to the coordinate keeps the place in view and tracks pan and
// zoom.

import { rankStrip } from '@shared/chart/rank-strip'
import { Popup, type Map as MapLibreMap } from 'maplibre-gl'
import { appPrompt } from '../_app-prompt'
import { renderShare } from '../_share'
import { CONTESTED_D, type MapPoint } from './types'
import { CATEGORY_COLOUR, rampColour } from './style'
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
  /** Indicators this story is about, already filtered to ones we publish a
   *  series for. Absent on the ~90% of stories with no entities. */
  entities?: Array<{ id: string; label: string }>
  threadLabel?: string
}

interface CountryMetric {
  label: string
  value: string | number
  rank: number | null
  total: number
}

/**
 * Where a country stands on the metric currently shading the land.
 *
 * The card used to open on `highlights` — that country's six *best-ranked*
 * metrics, sorted flattering-first — no matter what the map was painted by. So
 * a reader could shade the world by press freedom, click Egypt to find out why
 * it looked the way it did, and be shown Egypt's six proudest numbers, which
 * will not include press freedom. The one gesture that could have calibrated
 * their eye never mentioned the thing they were looking at.
 *
 * `p` is carried so the card can print the country's actual tone beside the
 * figure. That is what closes the loop: this shade, this number, this rank.
 */
export interface CountryStanding {
  label: string
  /** Formatted as the country pages print it, or null where there is no figure. */
  value: string | null
  rank: number | null
  total: number
  /** Ramp position, 0..1. Null where the country is hatched. */
  p: number | null
  /** The metric's scale sentence — which end is which, in words. */
  description: string
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

export interface StoryPopupOptions {
  /**
   * The reader dismissed the card themselves — the popup's own × button, which
   * nothing else on the map can see.
   *
   * Without this the island went on believing the story was open: `openSlug`
   * stayed set, and `flyToStory` opens with `if (openSlug === p.slug) return`,
   * so clicking the very same beacon (or its rail row) again did *nothing*. The
   * only way back into a story you had just closed was to open a different one
   * first.
   */
  onClose?: () => void
}

export interface StoryPopup {
  /** Compact card shown while the camera flies — no fetch, no body. */
  preview(point: MapPoint, leads: Record<string, string>, now: number): void
  /** Full article, fetched on demand and rendered in place. */
  open(point: MapPoint, now: number): Promise<void>
  /**
   * Country profile, anchored where the reader clicked.
   *
   * `standing` is the metric currently shading the land — passed in rather
   * than fetched, because the island already holds the whole payload and the
   * card must never be able to name a different metric than the one on screen.
   */
  openCountry(
    iso: string,
    at: [number, number],
    standing?: CountryStanding | null,
  ): Promise<void>
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
  const a = el('a', 'map-popup-source-name', s.name)
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

  // Where the reporting was filed from.
  //
  // The build has always carried a `country` per source, and until now the card
  // only revealed it on the ~17% of stories the ring marks as contested — so
  // the one fact that is true of every story was shown on almost none of them.
  // Three wires filing from one country is a different kind of account from
  // three outlets in three countries, whether or not they end up disagreeing,
  // and on a map whose whole subject is where things happen it matters that
  // this is often nowhere near the dateline.
  const filedFrom = [...new Set(sources.map((s) => s.country).filter(Boolean))]
  if (filedFrom.length) meta.push(`filed from ${filedFrom.join(', ')}`)

  nodes.push(el('p', 'map-popup-meta', meta.join(' · ')))
  return nodes
}

/**
 * The card's foot: pass it on, and — occasionally — where the alerts are.
 *
 * The map deliberately never changes its URL, which is right for the view and
 * wrong for the story: a reader who wants to send this one to someone has
 * nothing to copy, because the address bar says `/` and always has. So the
 * share targets the canonical `/a/{slug}` page, which is also the URL carrying
 * the generated OG card, so what arrives at the other end is the headline over
 * its own patch of globe rather than a bare link.
 */
const cardFoot = (path: string, title: string): Node[] => {
  const nodes: Node[] = []
  const row = document.createElement('div')
  row.className = 'map-popup-share'
  renderShare(row, { url: new URL(path, location.origin).href, title })
  nodes.push(row)
  const prompt = appPrompt()
  if (prompt) nodes.push(prompt)
  return nodes
}

const kickerFor = (p: MapPoint, now: number, extra?: string | null) => {
  const kicker = el('p', 'map-popup-kicker')
  const dot = el('span', 'map-popup-dot')
  dot.style.background = CATEGORY_COLOUR[p.cat] ?? '#8a8a8a'
  kicker.append(
    dot,
    [p.cat, p.loc || null, fmt.relativeTime(p.t, now), extra || null].filter(Boolean).join(' · '),
  )
  return kicker
}

export function createStoryPopup(map: MapLibreMap, opts: StoryPopupOptions = {}): StoryPopup {
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

  /**
   * Attach the popup, without the close event that re-attaching would fire.
   *
   * `Popup.addTo` begins with `if (this._map) this.remove()`, and `remove()`
   * fires `close` synchronously. So every re-render of an already-open card —
   * which is what `preview()` → `open()` is — announced itself as the reader
   * dismissing the card, one frame before the card actually appeared.
   *
   * That was not cosmetic. `close` clears `pending`, and `open()` re-checks
   * `pending` after awaiting the story to make sure the reader has not moved
   * on; with `pending` nulled by its own `addTo`, the check failed every time
   * and the function returned before `setDOMContent`. The result was that the
   * story card never rendered a story at all — it opened, said "Loading…",
   * fetched the article successfully, and then threw it away. No exception, no
   * failed request, nothing in the console: the card simply sat there.
   *
   * The flag says what the event cannot: whether this close is ours.
   */
  let reattaching = false
  const attach = () => {
    reattaching = true
    try {
      popup.addTo(map)
    } finally {
      reattaching = false
    }
  }

  // Fires for the × button and for a real `popup.remove()` alike, so the island
  // is told even when it is the one doing the closing — that is harmless, it
  // clears state that is already being cleared, and it is the only way to hear
  // about the button, which lives inside MapLibre's own DOM.
  popup.on('close', () => {
    if (reattaching) return
    pending = null
    opts.onClose?.()
  })

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
  /**
   * The bar, built the one way.
   *
   * Both the metric list and the standing block below drew their own, from
   * their own copy of the percentile expression. Nothing had drifted; the point
   * is that "nothing had drifted" was the entire guarantee that the card and
   * the country page agree about a country's rank.
   */
  const rankStripEl = (rank: number | null | undefined, total: number) => {
    const strip = el('span', 'map-country-metric-strip')
    const s = rankStrip(rank, total)
    if (rank != null && total > 1) {
      const fill = el('span', 'map-country-metric-fill')
      fill.style.setProperty('--fill', s.css)
      strip.append(fill)
    }
    strip.setAttribute('aria-hidden', 'true')
    return strip
  }

  const metricRow = (m: CountryMetric) => {
    const li = el('li', 'map-country-metric')
    li.append(
      el('span', 'map-country-metric-label', m.label),
      el('span', 'map-country-metric-value', String(m.value)),
    )
    // The percentile strip, from the arithmetic the country page uses — the
    // same module now, rather than the same expression written out again.
    // Rank 1 of 145 is a full bar, last is empty. A bar makes a column of
    // rankings scannable in a way that 26 pairs of numbers never is.
    li.append(rankStripEl(m.rank, m.total))
    // A rank is what turns a number into a comparison — "82 years" says
    // little, "82 years · 6 / 145" says where that sits in the world.
    li.append(el('span', 'map-country-metric-rank', m.rank != null ? fmt.rank(m.rank, m.total) : ''))
    return li
  }

  /**
   * Why this country is that colour.
   *
   * Led by a swatch of the country's own tone, taken from the same ramp the
   * land layer paints with, so the reader can hold the card against the map and
   * see they match. Then the metric's name, its figure, and the rank that turns
   * a figure into a comparison.
   *
   * A country the metric has no figure for gets the hatch and the words, not a
   * blank: the map already draws roughly thirty of them on a full metric and
   * eighty-odd on literacy, and "no figure" is a different fact from a low one.
   * Saying it here is the only place a reader can find out which they are
   * looking at.
   */
  const standingBlock = (s: CountryStanding) => {
    const box = el('div', 'map-country-standing')

    const head = el('div', 'map-country-standing-head')
    const swatch = el('span', 'map-country-standing-swatch')
    if (s.p == null) {
      swatch.dataset.nodata = '1'
    } else {
      swatch.style.setProperty('--c', rampColour(s.p))
    }
    head.append(
      swatch,
      el('span', 'map-country-standing-label', s.label),
      el('span', 'map-country-standing-value', s.value ?? 'no figure'),
    )
    box.append(head)

    if (s.value != null && s.rank != null && s.total > 1) {
      const foot = el('div', 'map-country-standing-foot')
      foot.append(
        rankStripEl(s.rank, s.total),
        el('span', 'map-country-metric-rank', fmt.rank(s.rank, s.total)),
      )
      box.append(foot)
    }

    // The scale's direction, which is the one thing a tone cannot state and the
    // reason this row exists at all — "0 = most free, 100 = no press freedom".
    if (s.description) box.append(el('p', 'map-country-standing-note', s.description))
    return box
  }

  const countryCard = (
    data: CountryProfile,
    standing: CountryStanding | null,
    expanded = false,
  ) => {
    const root = el('div', `map-popup-body map-popup-country${expanded ? ' is-expanded' : ''}`)

    const kicker = el('p', 'map-popup-kicker')
    kicker.append(data.region || 'country')
    root.append(kicker)

    const head = el('div', 'map-country-head')
    if (data.flag) head.append(el('span', 'map-country-flag', data.flag))
    head.append(el('h2', 'map-popup-title', data.name))
    root.append(head)

    if (data.metaLine) root.append(el('p', 'map-popup-meta', data.metaLine))

    // First, and above the highlights, because it is the question the reader
    // asked by clicking. The highlights are what else is interesting about the
    // country; this is what they were looking at.
    if (standing) root.append(standingBlock(standing))

    const shown = expanded ? (data.metrics ?? data.highlights) : data.highlights
    if (shown?.length) {
      // The shading metric is already stated above in full. Repeating it inside
      // the list would read as two different facts about the same country, and
      // on the expanded card it would sit twenty rows below the copy that
      // matters.
      const rows = shown.filter((m) => !standing || m.label !== standing.label)
      if (rows.length) {
        const list = el('ul', 'map-country-metrics')
        for (const m of rows) list.append(metricRow(m))
        root.append(list)
      }
    }

    if (data.coverage?.length) {
      root.append(el('p', 'map-country-section', 'Recent coverage'))
      const list = el('ul', 'map-country-coverage')
      for (const a of data.coverage.slice(0, expanded ? 20 : 5)) {
        const li = el('li')
        const link = el('a', undefined, a.title)
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
      const full = el('a', 'map-popup-link', 'Full profile →')
      full.href = `/country/${data.iso2}`
      full.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        const expandedCard = countryCard(data, standing, true)
        popup.setDOMContent(expandedCard)
        // The link that was just clicked sat at the bottom of the old content,
        // and the browser keeps the focused element in view — which lands the
        // reader at the *end* of the profile they just asked to see.
        expandedCard.scrollTop = 0
      })
      root.append(full)
    }

    // Shares the canonical profile either way — the expanded card and the
    // collapsed one are two views of `/country/{iso2}`, and that page is what
    // carries the country's own OG card.
    const row = el('div', 'map-popup-share')
    renderShare(row, { url: new URL(`/country/${data.iso2}`, location.origin).href, title: `${data.name} — zuhd.news` })
    root.append(row)
    return root
  }

  /**
   * The numbers a story is about, as a row of chips that open over the map.
   *
   * The article page has carried this strip for a long time and the map's card
   * never did — so on the one surface built for seeing how things connect, a
   * story about the strait of Hormuz sat a few hundred pixels from the Brent
   * series it is about with no route between them.
   *
   * A chip is an `<a href="/e/{id}">`, so it survives the bundle failing, a
   * middle click and a crawler — and the click handler opens the chart as a
   * modal instead, because on this surface navigating away means abandoning a
   * camera, a time slice, a set of filters and possibly an open card. The
   * `zuhd:mount-island` event is the loader's own hook for exactly this: the
   * map does not have to know that `entity-sheet` is a module, and the sheet
   * does not have to know it was opened from a map.
   */
  const entityStrip = (story: Story): Node[] => {
    const entities = story.entities ?? []
    if (!entities.length) return []
    const aside = el('aside', 'map-popup-entities')
    aside.setAttribute('aria-label', 'Indicators this story follows')
    aside.append(el('span', 'map-popup-entities-label', 'follows'))
    for (const e of entities) {
      const chip = el('a', 'map-entity-chip', e.label)
      chip.href = `/e/${encodeURIComponent(e.id)}`
      chip.addEventListener('click', (ev) => {
        // Modified clicks and the middle button keep the browser's own
        // behaviour, the same rule the wordmark and the rail rows follow.
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
        ev.preventDefault()
        document.dispatchEvent(
          new CustomEvent('zuhd:mount-island', {
            detail: { name: 'entity-sheet', props: { id: e.id } },
          }),
        )
      })
      aside.append(chip)
    }
    return [aside]
  }

  return {
    preview(p, leads, now) {
      // `n` has been on every map point since the endpoint was written and
      // nothing has ever read it. It belongs here rather than in a fifth visual
      // channel on the beacon — size, alpha and the ring are already spoken
      // for, and how many outlets we read is a fact to state, not a shape to
      // decode. The full card lists them by name, so this is the preview's job.
      const sourceCount = p.n > 0 ? `${p.n} ${p.n === 1 ? 'source' : 'sources'}` : null
      const root = shell(p, now, 'preview', sourceCount)
      const lead = leads[p.slug]
      if (lead) root.append(el('p', 'map-popup-lead', lead))
      root.append(el('p', 'map-popup-hint', 'Opening…'))
      popup.setLngLat([p.lng, p.lat]).setDOMContent(root)
      attach()
    },

    async open(p, now) {
      pending = p.slug
      const loading = shell(p, now, 'article')
      loading.append(el('p', 'map-popup-loading', 'Loading…'))
      popup.setLngLat([p.lng, p.lat]).setDOMContent(loading)
      attach()

      const story = await fetchStory(p.slug)
      if (pending !== p.slug) return

      const root = shell(p, now, 'article')
      if (story) {
        const body = el('div', 'map-popup-prose')
        // Trusted content: this HTML is produced by our own build from the
        // article markdown, the same string the /a/{slug} page renders.
        body.innerHTML = story.bodyHtml
        root.append(body)
        // Above the isnad, because the chain has to stay last — `about.md`
        // says every article ends with its sources, and this card is the
        // article on this surface.
        root.append(...entityStrip(story))
        root.append(...sourceBlock(story, p))
        // Only on a card that rendered. A story that failed to load is not one
        // the reader has read, so it must not count towards the app line and
        // there is nothing worth passing on.
        root.append(...cardFoot(`/a/${p.slug}`, story.title || p.title))
      } else {
        // Only when the card itself cannot render does the standalone page
        // become worth offering — otherwise it holds nothing this does not.
        root.append(el('p', 'map-popup-lead', 'Could not load this story.'))
        const link = el('a', 'map-popup-link', 'Open full page')
        link.href = `/a/${p.slug}`
        root.append(link)
      }
      popup.setDOMContent(root)
    },

    async openCountry(iso, at, standing = null) {
      const key = `country:${iso}`
      pending = key
      const loading = el('div', 'map-popup-body map-popup-country')
      loading.append(el('p', 'map-popup-loading', 'Loading…'))
      popup.setLngLat(at).setDOMContent(loading)
      attach()

      const data = await fetchCountry(iso)
      // The reader may have clicked elsewhere while this was in flight.
      if (pending !== key) return

      if (!data) {
        const miss = el('div', 'map-popup-body map-popup-country')
        miss.append(el('p', 'map-popup-lead', 'No profile for this territory.'))
        popup.setDOMContent(miss)
        return
      }
      popup.setDOMContent(countryCard(data, standing))
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
