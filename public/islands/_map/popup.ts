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
import { signedPct } from '@shared/chart/series'
import { Popup, type LngLatLike, type Map as MapLibreMap, type PaddingOptions } from 'maplibre-gl'
import { appPrompt } from '../_app-prompt'
import { disclosure, growTo, moreLink, type Built, type Disclosure } from '../_disclosure'
import { el } from '../_dom'
import {
  buildEntityPanel,
  cachedEntity,
  type EntityPanelClasses,
  type EntityRecord,
  fetchEntity,
} from '../_entity-panel'
import { shareUrl } from '@shared/share'
import { conflictLine, formatCount, hungerLine, weekWindow, type ConflictCount, type HungerTotal } from '@shared/countries/country-facts'
import { TONE_LABELS, divergenceNote, toneOf } from '@shared/source-framing'
import { renderShare } from '../_share'
import { sparkline } from '../_spark'
import { CONTESTED_D, type MapPoint } from './types'
import type { StoryPlace } from './places'
import { CATEGORY_COLOUR, FALLBACK_CATEGORY_COLOUR, rampColour } from './style'
import * as fmt from './format'
import { pointsFigure } from './markets'

/**
 * Whether a story's `chart` id has a record at `/api/entity/{id}.json`.
 *
 * A company's (`co:`) and an AI lab's (`ai:`) are published on a story and
 * have a card in the app and no series file here. One test, for the block
 * that draws the series and the prefetch that warms it: they had one each,
 * and the prefetch had none.
 */
const hasSeriesRecord = (id: string): boolean => !/^(?:co|ai):/.test(id)

/**
 * The series a story's card draws under its title: the one it names
 * (`chart:`), else the first it follows that has a record. A story about the
 * Hormuz strait that named no chart still shows the strait's line; its other
 * series stay chips.
 */
const chartOf = (story: Story): string | null => {
  if (story.chart && hasSeriesRecord(story.chart)) return story.chart
  return story.entities?.find((e) => hasSeriesRecord(e.id))?.id ?? null
}

/** How the map paints the indicator panel. The article page's copy of this
 *  table is in `entity-strip.ts`; the panel itself is `_entity-panel.ts`. */
const ENTITY_CLASSES: EntityPanelClasses = {
  loading: 'map-popup-loading',
  head: 'map-popup-entity-head',
  hero: 'map-popup-entity-hero',
  value: 'map-popup-entity-value',
  delta: 'map-popup-entity-delta',
  figure: 'map-popup-entity-figure',
  full: 'map-popup-entity-full',
  more: 'map-popup-more',
  provenance: 'map-popup-meta',
  recent: 'map-popup-entity-recent',
  section: 'map-popup-section',
  mentions: 'map-popup-mentions',
  mention: 'map-popup-mention',
  mentionTime: 'map-country-coverage-time',
}

interface StorySource {
  name: string
  url: string
  country?: string | null
  sentiment?: number | null
  /** What this outlet brought that the others did not, in the writer's words. */
  angle?: string
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
  /** The one series the prose cites (`chart:` in frontmatter), by indicator id. */
  chart?: string
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
  /** From `/api/country-hazards.json`, joined on by `fetchCountry`. Absent where no source counts anything. */
  hazards?: CountryHazards
}

/** A country's row of `/api/country-hazards.json` (`lib/country-hazards.js`). */
interface CountryHazards {
  hunger?: HungerTotal
  conflict?: ConflictCount & { windowStart: string; windowEnd: string }
  alerts: Array<{ level: 'Red' | 'Orange'; name: string }>
  lowerAlerts: number
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
  /**
   * The country the card is about, or null once it is about none. Told only
   * on a change; the island outlines that country on the map.
   */
  onCountry?: (iso: string | null) => void
  /**
   * Where a country stands on the metric currently shading the land.
   *
   * The island owns the metric, so the card has to ask. Without it an inline
   * country panel would open on `highlights` — that country's best-ranked
   * numbers, sorted flattering-first — regardless of what the reader was
   * looking at, which is the exact failure the map's own country card was
   * fixed for.
   */
  standingFor?: (iso: string) => CountryStanding | null
  /**
   * Open another story's card on the map, from a list inside this one.
   *
   * The card holds two lists of other stories — a country's recent coverage,
   * and the articles that cite an indicator — and both were rows of
   * `/a/{slug}` links, which is the same navigation the chips and the tags
   * were fixed for wearing different clothes. A story already on the map is
   * one the map can simply fly to, so the row becomes a map gesture.
   *
   * Returns false when that slug is outside the loaded window — a story from
   * five months ago is genuinely not on this map, and the honest answer there
   * is the link the row already is. The island owns the point set, so only it
   * can tell.
   */
  openStory?: (slug: string) => boolean
  /**
   * The stories at one place, newest first.
   *
   * The place card needs headlines and times, and `StoryPlace` carries only
   * slugs — the island holds `pointBySlug`, so it resolves them. No fetch is
   * involved anywhere in this card: everything it prints is already in memory,
   * which is why `openPlace` is the one card here that is not async.
   */
  storiesAt?: (place: StoryPlace) => MapPoint[]
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
  /**
   * Everything at one place.
   *
   * What `expandCluster` was pretending to offer. Coordinates in this corpus are
   * city-level and 445 of 705 stories share one exactly, so a pile could never be
   * separated by zooming — descending into it moved the camera and gave the
   * reader nothing to read, and on a phone, where there is no hover, tapping one
   * produced no text at all. This names the place and lists what happened there.
   *
   * Anchored where the reader clicked and it does **not** fly, for the reason the
   * country card does not: the answer appears where the question was asked. Rows
   * fly, one story at a time, through `openStory`.
   */
  openPlace(place: StoryPlace, now: number): void
  /**
   * The edges a card must keep off: the rails and the timeline float over the
   * canvas, and MapLibre otherwise fits the card to the canvas alone.
   */
  setPadding(padding: PaddingOptions): void
  /** Take the keyboard into the card, so its links are the next Tab. */
  focus(): void
  /** Whether a node is inside the card. */
  contains(node: Node): boolean
  close(): void
  isOpen(): boolean
  destroy(): void
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
 * One outlet: who, where it files from, how it leaned, and what it brought.
 *
 * The lean is a word and only where there is one. Seven sources in ten read
 * neutral, and a word on every row is a tic, not information; the number
 * behind it is a machine estimate and is not printed. In ink, not in the
 * market's green and red: a lean is not a verdict.
 *
 * The angle is the writer's own sentence about this outlet, a lower-case
 * predicate ("emphasizes…") that reads on from the name above it.
 */
const sourceRow = (s: StorySource): HTMLElement => {
  const li = el('li', 'map-popup-source')
  li.append(sourceName(s))
  if (s.country) li.append(el('span', 'map-popup-source-cc', s.country))
  const tone = toneOf(s.sentiment)
  if (tone && tone !== 'neutral') li.append(el('span', 'map-popup-source-tone', TONE_LABELS[tone]))
  if (s.angle) li.append(el('p', 'map-popup-source-angle', s.angle))
  return li
}

/**
 * Attribution, and how each outlet framed the story, in one line.
 *
 * The card is for the story, so its foot takes one line: `Sources` and the
 * outlets' names, then `how each framed it` where an angle is recorded or the
 * map has ringed the story. The line is the summary of a fold holding the
 * outlets' rows (linked, with country, lean and angle), the sentence a
 * contested story earns (`divergenceNote`), and the date, coverage and where
 * the reporting was filed from. It used to be three lines and a rule: a
 * section heading, the names and the date.
 *
 * The rows are never open when the card opens, a contested story's and a
 * single outlet's included. A ringed story's rows are ordered by lean, so the
 * spread reads down the list. The words are the article page's
 * (`article-chain.js`), so the same story reads the same on both.
 *
 * The names in the summary are plain text: a link inside a `<summary>` is a
 * control inside a control. They are links in the rows.
 */
const sourceBlock = (story: Story, p: MapPoint): Node[] => {
  const sources = story.sources ?? []
  if (!sources.length) return [el('p', 'map-popup-meta', story.dateFormatted)]

  const divergence = story.sentimentDivergence ?? p.d ?? 0
  const rated = sources.filter((s) => typeof s.sentiment === 'number')
  const contested = divergence >= CONTESTED_D && rated.length >= 2
  const framed = sources.some((s) => s.angle)

  const details = document.createElement('details')
  details.className = 'map-popup-framing'
  const summary = el('summary', 'map-popup-sources-flat')
  summary.append(
    el('span', 'map-popup-sources-label', 'Sources'),
    // One name per outlet: the rows below keep each article.
    el('span', 'map-popup-sources-names', [...new Set(sources.map((s) => s.name))].join(', ')),
  )
  if (framed || contested) summary.append(el('span', 'map-popup-sources-more', 'how each framed it'))
  details.append(summary)

  const note = contested ? divergenceNote(divergence, sources.length) : null
  if (note) details.append(el('p', 'map-popup-framing-note', note))
  // By lean, most favourable first, so the spread reads down the list
  // rather than needing to be reconstructed. An unrated outlet goes last.
  const lean = (s: StorySource) => (typeof s.sentiment === 'number' ? s.sentiment : -Infinity)
  const ul = el('ul', 'map-popup-sources')
  for (const s of contested ? [...sources].sort((a, b) => lean(b) - lean(a)) : sources) {
    ul.append(sourceRow(s))
  }
  details.append(ul)

  // `eventCoverage` is a different number from the list above — how many
  // outlets carried the event at all, against the handful we read — and it is
  // what the beacon's radius encodes, so the card is where that channel gets
  // decoded.
  const meta = [story.dateFormatted]
  if (story.eventCoverage > 0) meta.push(`${story.eventCoverage} outlets covering`)
  // Where the reporting was filed from: three wires filing from one country
  // is a different account from three outlets in three countries, and it is
  // often nowhere near the dateline.
  const filedFrom = [...new Set(sources.map((s) => s.country).filter(Boolean))]
  if (filedFrom.length) meta.push(`filed from ${filedFrom.join(', ')}`)
  details.append(el('p', 'map-popup-meta', meta.join(' · ')))

  // The card is capped and this block sits at its foot, so the rows open
  // below a fold the reader has no reason to think is there.
  //
  // Only when the reader opened it: a `toggle` that no press preceded is
  // not theirs, and a card that scrolled itself past its title and its
  // prose to show its sources is what this guard was written against.
  let pressed = false
  summary.addEventListener('click', () => {
    pressed = true
  })
  details.addEventListener('toggle', () => {
    if (pressed && details.open) details.scrollIntoView?.({ block: 'nearest' })
    pressed = false
  })
  return [details]
}

/**
 * The card's foot: pass it on, and — occasionally — where the alerts are.
 *
 * The map deliberately never changes its URL, which is right for the view and
 * wrong for the story: a reader who wants to send this one to someone has
 * nothing to copy, because the address bar says `/` and always has. So the share
 * targets `shareUrl(slug)` — `/s/{slug}`, which opens this same map with this
 * same card already up, and which carries the article's generated OG card so
 * what arrives at the other end is still the headline over its own patch of
 * globe. `/a/{slug}` stays canonical underneath it.
 */
const cardFoot = (url: string, title: string): Node[] => {
  const nodes: Node[] = []
  const row = document.createElement('div')
  row.className = 'map-popup-share'
  renderShare(row, { url: new URL(url, location.origin).href, title })
  nodes.push(row)
  const prompt = appPrompt()
  if (prompt) nodes.push(prompt)
  return nodes
}

const kickerFor = (p: MapPoint, now: number, extra?: string | null) => {
  const kicker = el('p', 'map-popup-kicker')
  const dot = el('span', 'map-popup-dot')
  dot.style.background = CATEGORY_COLOUR[p.cat] ?? FALLBACK_CATEGORY_COLOUR
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
    /**
     * MapLibre's default autofocuses "the first focusable element in tree
     * order" on every `setDOMContent`. The close button is appended to
     * `._content` *after* the card's own children (`_createCloseButton` runs
     * post-append), so in tree order it comes last despite sitting top-right
     * by CSS — the walk lands on the first Sources link instead, leaving a
     * visible focus ring boxing "protothemanews.com" and blotting out the
     * comma after it on every card open, on every viewport.
     */
    focusAfterOpen: false,
    /**
     * Hide the card when its story is on the far side of the planet.
     *
     * A popup is DOM, positioned over the canvas — it has no idea the world is
     * round, so on the sphere a card anchored to Santiago while the reader is
     * looking at the Levant renders *in front of* the Earth, pointing at a
     * beacon that is not there. MapLibre knows (`isLocationOccluded`, the same
     * clipping plane that culls the marks) and this is how it tells the card.
     *
     * Zero rather than a low alpha, because a half-visible card is the worse of
     * the two failures: the mark it names is fully absent, so anything left on
     * screen is a label for nothing. The card is not closed, only hidden — turn
     * the globe back and it is still open, still the same story, which is what
     * makes rotating away from a card recoverable instead of destructive.
     */
    locationOccludedOpacity: 0,
  })

  const cache = new Map<string, Story>()
  // Guards against a slow fetch for a story the reader has already moved past.
  let pending: string | null = null

  /**
   * Swap the card's contents, growing rather than jumping.
   *
   * A preview and a full article are two densities of one card, and the step
   * between them is the size of the article — measured on a 1440x900 desktop,
   * 202px to 336px. `setDOMContent` applies that in a single frame, and
   * MapLibre's `_update` re-runs its anchor arithmetic against the *new*
   * `offsetHeight` at the same moment, so the card is repositioned and
   * resized together: a 233px jolt with nothing connecting the two states. It
   * reads as a repaint, not as a card opening.
   *
   * So the height is animated from what it was to what it becomes. The
   * position is already final when the animation starts — that is what makes
   * this work rather than fight MapLibre. A `bottom`-anchored card (the
   * ordinary case, since the card opens above its beacon) is pinned by its
   * foot, so a shorter box means a lower top edge and the card unfurls upward
   * from the tip; a `top`-anchored one is pinned by its head and unfurls down.
   * Either way the growth starts where the reader was already looking.
   */
  const contentBox = () =>
    (popup.getElement()?.querySelector('.maplibregl-popup-content') as HTMLElement | null) ?? null

  /**
   * A card hidden on the far side has to stop taking the pointer, not just stop
   * being seen.
   *
   * `locationOccludedOpacity` is the whole of MapLibre's occlusion handling —
   * `_updateOpacity` writes `container.style.opacity` and touches nothing else.
   * But `opacity: 0` is a paint instruction, not a hit-testing one: the element
   * is still there, still laid out, still first in line for every click. And the
   * container's own `pointer-events: none` (MapLibre's stylesheet) does not save
   * it, because `.maplibregl-popup-content` turns them back on — that is how the
   * card is clickable in the first place.
   *
   * So an occluded card leaves an **invisible 524×440 block sitting over the
   * globe** (measured at 1896×913 with the Cali story hidden), and inside it, at
   * a spot the reader cannot see, a 24×24 close button. Clicking a story mark
   * under that rectangle does nothing; one click in the wrong 24px of it
   * *destroys* the card — which is precisely the outcome
   * `locationOccludedOpacity`'s comment above promises cannot happen, since
   * "not closed, only hidden" is only true while nothing can close it. Found by
   * spinning the globe away from an open card and clicking empty ocean near
   * Tunis: the card was gone from the DOM, and no longer came back when the
   * globe did.
   *
   * Mirrored off the inline opacity rather than re-deriving it, because the
   * predicate is `transform.isLocationOccluded` — private, and a second copy of
   * a clipping test is a second thing to disagree. `move` carries the change and
   * `moveend` guarantees the settled state: our listener is registered before
   * MapLibre's own (it binds `_update` in `addTo`/`setLngLat`, both later), so
   * during a drag this reads one event behind, and the last `move` before
   * `moveend` is what makes that harmless.
   */
  const syncOccludedPointer = () => {
    const root = popup.getElement()
    const box = contentBox()
    if (!root || !box) return
    const want = root.style.opacity === '0' ? 'none' : ''
    if (box.style.pointerEvents !== want) box.style.pointerEvents = want
  }
  map.on('move', syncOccludedPointer)
  map.on('moveend', syncOccludedPointer)

  /**
   * The card's cap, sized to the room it actually has.
   *
   * The flat cap was half the map, because MapLibre picks `top` or `bottom`
   * from the card's height and never checks that the side it picked fits
   * either: half is the one height that fits on whichever side it picks,
   * wherever the beacon is. But the beacon is rarely mid-map. The flight lands
   * it below the centre, so the room above it is most of the map, and the half
   * cap scrolled nearly every article in it: at 1440×900, 398px of card for
   * 430–600px of story, with 520px free over the beacon.
   *
   * The larger of the two sides keeps the guarantee and gives up the waste. A
   * card that fits above is not taller than the room above, so MapLibre keeps
   * `bottom`; one that does not fits below, which is where `top` puts it. Its
   * listener is registered before MapLibre binds `_update` (on `addTo`), so on
   * a pan the cap is written before the card is measured against it.
   *
   * Written on the map's container, which outlives the popup's own elements:
   * `setDOMContent` replaces `.maplibregl-popup-content` every time.
   */
  let padding: Required<PaddingOptions> = { top: 0, bottom: 0, left: 0, right: 0 }
  const fit = (at: LngLatLike | null = popup.isOpen() ? popup.getLngLat() : null) => {
    if (!at) return
    const { y } = map.project(at)
    const h = map.getCanvas().clientHeight
    // MapLibre weighs the whole popup, the 7px tip included, against the
    // room past its 14px offset: 4px short of that and it flips a card that
    // fits above to below, off the canvas. The padding keeps 8px off the chrome.
    const above = y - padding.top - 26
    const below = h - padding.bottom - y - 26
    map.getContainer().style.setProperty('--map-card-fit', `${Math.round(Math.max(above, below))}px`)
  }
  map.on('move', () => fit())

  const swap = (root: HTMLElement) => {
    const before = popup.isOpen() ? contentBox() : null
    const from = before?.getBoundingClientRect().height ?? 0
    if (!before || from < 1) {
      popup.setDOMContent(root)
      return
    }
    growTo(before, from, () => {
      popup.setDOMContent(root)
    })
  }

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
   *
   * Better still is not to re-add at all. An already-open popup needs nothing
   * from `addTo`: `setDOMContent` has already run `_update` and moved focus.
   * What `addTo` adds is the remove-and-recreate — MapLibre drops `_container`
   * and builds a new one — which tears the card out of the document and puts
   * it back a frame later, cancelling any animation running on it. So this is
   * a no-op while the card is up, and the flag stays for the case that still
   * re-attaches: a card the reader closed between the preview and the story.
   */
  let reattaching = false
  const attach = () => {
    if (popup.isOpen()) return
    reattaching = true
    try {
      popup.addTo(map)
    } finally {
      reattaching = false
    }
  }

  let country: string | null = null
  const about = (iso: string | null) => {
    if (iso === country) return
    country = iso
    opts.onCountry?.(iso)
  }

  // Fires for the × button and for a real `popup.remove()` alike, so the island
  // is told even when it is the one doing the closing — that is harmless, it
  // clears state that is already being cleared, and it is the only way to hear
  // about the button, which lives inside MapLibre's own DOM.
  popup.on('close', () => {
    if (reattaching) return
    pending = null
    about(null)
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

  /**
   * Every country's hazards, fetched once, on the first card. Its own file
   * because `/api/country/*` is cached for a day and an alert is fifteen
   * minutes old. A failure is no hazards, never no card.
   */
  let hazards: Promise<Record<string, CountryHazards>> | null = null
  const fetchHazards = () =>
    (hazards ??= fetch('/api/country-hazards.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((j: { countries?: Record<string, CountryHazards> } | null) => j?.countries ?? {})
      .catch((): Record<string, CountryHazards> => ({})))

  const fetchCountry = async (iso: string): Promise<CountryProfile | null> => {
    const hit = countryCache.get(iso)
    if (hit) return hit
    try {
      const [res, byCountry] = await Promise.all([
        fetch(`/api/country/${encodeURIComponent(iso)}.json`, { cache: 'force-cache' }),
        fetchHazards(),
      ])
      if (!res.ok) return null
      const data = (await res.json()) as CountryProfile
      const h = byCountry[iso]
      if (h) data.hazards = h
      countryCache.set(iso, data)
      return data
    } catch {
      return null
    }
  }

  /**
   * What the hazard sources count in the country, as its page states it
   * (`hazardsHtml`, `scripts/build/country-pages.js`), in the same words
   * (`shared/countries/country-facts.ts`). These are the figures no mark on the
   * map gives: the famine marks are areas and the conflict marks are events,
   * and neither says that 19.5 million Sudanese are in crisis or worse.
   *
   * Orange and Red alerts by name; Green is counted beside them and never
   * makes the block on its own. Nothing at all where nothing is counted: a
   * heading over the absence of a famine says nothing.
   */
  const hazardBlock = (h: CountryHazards | undefined): HTMLElement | null => {
    if (!h) return null
    const list = el('ul', 'map-country-facts')
    const fact = (label: string, title: string, detail: string) => {
      const li = el('li', 'map-country-fact')
      li.append(el('span', 'map-country-fact-label', label), el('span', 'map-country-fact-title', title))
      if (detail) li.append(el('span', 'map-country-fact-detail', detail))
      list.append(li)
    }
    if (h.hunger) {
      const line = hungerLine(h.hunger)
      fact('hunger', line.title, line.detail)
    }
    if (h.conflict) {
      fact(
        'conflict',
        conflictLine(h.conflict),
        `${weekWindow(h.conflict.windowStart, h.conflict.windowEnd)}, the latest week from UCDP`,
      )
    }
    if (h.alerts.length) {
      const lower = h.lowerAlerts ? `and ${formatCount(h.lowerAlerts)} at the lowest level` : ''
      fact(
        'alerts',
        h.alerts.map((a) => `${a.name} (${a.level.toLowerCase()})`).join(' · '),
        [lower, 'GDACS'].filter(Boolean).join(' · '),
      )
    }
    return list.childElementCount ? list : null
  }

  /**
   * A row naming another story, which opens on the map rather than instead of it.
   *
   * Both lists of other stories in this card — a country's recent coverage and
   * the articles citing an indicator — were rows of `/a/{slug}` links, so the
   * two panels that had just been taught to answer in place still ended in a
   * list whose every row left. The map already draws these stories; a row that
   * names one should fly to it.
   *
   * Where the island cannot — a story outside the loaded fortnight is not on
   * this map, and pretending otherwise would be a click that does nothing —
   * the row stays exactly what it is, a link to the page that does hold it.
   */
  const storyLink = (slug: string, title: string): HTMLAnchorElement => {
    const a = el('a', 'map-popup-story-link', title)
    a.href = `/a/${slug}`
    if (!opts.openStory) return a
    a.addEventListener('click', (ev) => {
      const e = ev as MouseEvent
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      // Only swallow the navigation if the map actually took it.
      if (!opts.openStory?.(slug)) return
      e.preventDefault()
      e.stopPropagation()
    })
    return a
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
      el('span', 'map-country-metric-label', fmt.metricName(m.label)),
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
      el('span', 'map-country-standing-label', fmt.metricName(s.label)),
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

    // Before the rankings: what is happening to the country now outranks where
    // it sits on a table of slow figures.
    const facts = hazardBlock(data.hazards)
    if (facts) root.append(facts)

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
        li.append(storyLink(a.slug, a.title), el('time', 'map-country-coverage-time', a.dateFormatted))
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
   * How many rows a place card shows before it has to be asked for more.
   *
   * Five is what the country card shows of its recent coverage, and this is the
   * same kind of list on the same surface. Washington holds 62 over a fortnight,
   * so most of the tail is genuinely a second density.
   */
  const PLACE_ROWS = 5

  const placeCard = (place: StoryPlace, now: number, expanded = false) => {
    const root = el('div', `map-popup-body map-popup-place${expanded ? ' is-expanded' : ''}`)
    const stories = opts.storiesAt?.(place) ?? []

    // The kicker says what kind of thing this card is about, the way the story
    // card's says the category and the country card's says the region.
    root.append(el('p', 'map-popup-kicker', 'place'))
    root.append(el('h2', 'map-popup-title', place.loc))
    // The count is the fact the numeral on the map stated; this is the sentence
    // that makes it checkable, and it is the only place the exact figure is
    // guaranteed — the numeral itself may be dropped under collision.
    root.append(
      el(
        'p',
        'map-popup-meta',
        [
          `${fmt.grouped(place.count)} ${place.count === 1 ? 'story' : 'stories'}`,
          stories[0] ? `latest ${fmt.relativeTime(stories[0].t, now)}` : null,
          place.contested ? 'sources disagree' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    )

    if (stories.length) {
      const list = el('ul', 'map-country-coverage')
      for (const p of stories.slice(0, expanded ? 40 : PLACE_ROWS)) {
        const li = el('li')
        li.append(
          storyLink(p.slug, p.title),
          el('time', 'map-country-coverage-time', fmt.relativeTime(p.t, now)),
        )
        list.append(li)
      }
      root.append(list)
    }

    // The rest opens here, like the country card's full profile. There is no
    // canonical page for a place, so this is a button rather than a link with its
    // navigation suppressed — nothing is being withheld from a crawler.
    if (!expanded && stories.length > PLACE_ROWS) {
      const more = el('button', 'map-popup-link', `All ${fmt.grouped(stories.length)} →`)
      more.type = 'button'
      more.addEventListener('click', () => {
        const grown = placeCard(place, now, true)
        popup.setDOMContent(grown)
        grown.scrollTop = 0
      })
      root.append(more)
    }

    return root
  }

  /**
   * The country tags in the prose, answered in the card.
   *
   * `build.js` renders every `/country/{ISO2}` link in an article as
   * `<a class="country-link" data-island="country-preview">`, and the loader
   * listens on the document for exactly that — so inside the map's story card
   * a tag opened the `country-preview` sheet: a `.island-sheet` on the *site*
   * palette, over a scrim, covering the map. The same mistake the `follows`
   * chips were making, from a different direction, and worse here because the
   * sheet does not even commit to the map's dark chrome.
   *
   * So the tag becomes a disclosure over the same payload the sheet fetches.
   * The `href` is untouched — a modified click and a crawler still reach the
   * full profile, and this is still the only route to it from the map.
   *
   * It leads with the metric currently shading the land, for the same reason
   * the map's own country card does: a reader who shaded the world by press
   * freedom and clicked Egypt to find out why it looked that way must not be
   * shown Egypt's six proudest numbers instead.
   *
   * `coverage` is deliberately dropped. It is a list of other stories to go and
   * read, offered at the moment the reader is reading one, on a map where those
   * stories are already beacons — the same judgement that keeps "Cited in" out
   * of the series panel's first density.
   */
  const countryTags = (prose: HTMLElement, folds: Disclosure[]): HTMLElement => {
    const tags = fold(folds)
    const seen = new Set<string>()
    for (const node of prose.querySelectorAll<HTMLAnchorElement>('a.country-link[data-iso]')) {
      const iso = node.dataset.iso
      if (!iso) continue
      // The same country can be tagged more than once in one article, and both
      // tags should drive the one panel.
      const id = `country:${iso}`
      tags.bind(id, node, async () => {
        const data = await fetchCountry(iso)
        return { node: countryInline(data, iso, tags.panel) }
      })
      seen.add(iso)
    }
    return tags.panel
  }

  const countryInline = (data: CountryProfile | null, iso: string, box: HTMLElement): Node => {
    const body = document.createDocumentFragment()
    if (!data) {
      body.append(el('p', 'map-popup-loading', 'No profile for this territory.'))
      return body
    }
    body.append(el('p', 'map-popup-entity-head', data.region || 'country'))
    const head = el('p', 'map-popup-country-inline')
    if (data.flag) head.append(el('span', 'map-country-flag', data.flag))
    head.append(el('span', 'map-popup-country-inline-name', data.name))
    body.append(head)
    if (data.metaLine) body.append(el('p', 'map-popup-meta', data.metaLine))

    const standing = opts.standingFor?.(iso) ?? null
    if (standing) body.append(standingBlock(standing))
    const facts = hazardBlock(data.hazards)
    if (facts) body.append(facts)

    // Four, not the full 27: this is an aside inside a story, and the rest is
    // one press away in the same panel for a reader who wants the table.
    const notStanding = (m: CountryMetric) => !standing || m.label !== standing.label
    const shown = (data.highlights ?? []).filter(notStanding).slice(0, 4)
    if (shown.length) {
      const list = el('ul', 'map-country-metrics')
      for (const m of shown) list.append(metricRow(m))
      body.append(list)
    }

    /**
     * The rest of the profile, under the four — not at `/country/{ISO2}`.
     *
     * The four highlights are an aside inside a story and the twenty-seven are
     * the profile; a reader who wants the second was being sent off the map to
     * get it, which is the disclosure this panel *is* undone at its own last
     * line. `coverage` stays out of it for the reason it was dropped from the
     * panel in the first place: it is a list of other stories to go and read,
     * offered while the reader is reading one, on a map already drawing them.
     *
     * The remainder rather than the whole table, so the four the panel opened
     * on are not restated four rows below themselves.
     */
    const seen = new Set(shown.map((m) => m.label))
    const rest = (data.metrics ?? []).filter(notStanding).filter((m) => !seen.has(m.label))
    if (rest.length) {
      body.append(
        ...moreLink({
          labels: ['full profile →', 'less ↑'],
          href: `/country/${encodeURIComponent(iso)}`,
          box,
          linkClass: 'map-popup-entity-full',
          moreClass: 'map-popup-more',
          fill: (into) => {
            const list = el('ul', 'map-country-metrics')
            for (const m of rest) list.append(metricRow(m))
            into.append(list)
          },
        }),
      )
    }
    return body
  }


  /**
   * One of the card's folds: a panel that opens in place.
   *
   * A card can hold three: the chart under the title, the country tags in the
   * prose and the strip under it. Opening one shuts the others: the card is
   * capped at half the screen, and two panels open in it is the crowding "one
   * panel per strip" exists to prevent, one level up.
   */
  const fold = (folds: Disclosure[]): Disclosure => {
    const mine: Disclosure = disclosure('map-popup-entity-panel', {
      scrollIntoView: true,
      onExpand: () => {
        for (const other of folds) if (other !== mine) other.close()
      },
    })
    folds.push(mine)
    return mine
  }

  /** The series panel, built into one fold. */
  const entityPanelIn =
    (into: Disclosure) =>
    (record: EntityRecord | null, id: string): Built =>
      buildEntityPanel({
        record,
        id,
        classes: ENTITY_CLASSES,
        box: into.panel,
        // A mention row flies the map rather than leaving it, which is the one
        // way this panel differs from the article page's copy of it.
        mentionLink: (m) => storyLink(m.slug, m.title),
      })

  /**
   * The chart a story names, under its title.
   *
   * 63 of the fortnight's 794 stories say which one series they are about
   * (`chart:` in frontmatter): a strait, an oil price, a policy rate. The app
   * draws it between the title and the hook. Here it is one line of type (what
   * it is, where it stands, how far it has moved) over a line with its first
   * and last dates under it. The move is the drawn line's own, last against
   * first, so the figure and the picture cannot describe different periods.
   *
   * A sparkline, not `createChart` with its controls switched off: see the
   * head of `_spark.ts` for what that shrink cannot remove. The full figure is
   * one press away: the block is the trigger of a fold holding the same series
   * panel a `follows` chip opens, and a link to `/e/{id}` for everything that
   * is not a plain click.
   *
   * The series is drawn as published. A strait's is already its week's mean
   * (`build.js`): a day's ship count is noise.
   *
   * The block is in the card from the first frame at its final height and is
   * filled when the record lands, so nothing below it moves. It goes only when
   * there turns out to be nothing to draw.
   */
  const storyChart = (
    story: Story,
    folds: Disclosure[],
    stillOpen: () => boolean,
    /** Called once the block has its line, at once or when the record lands. */
    onDrawn: () => void,
  ): Node[] => {
    // A company and an AI lab have a card in the app and no series page here:
    // `/api/entity/co:*.json` does not exist. Asked for anyway, the block held
    // its height, the fetch failed on every open, and the prose jumped up.
    const id = chartOf(story)
    if (!id) return []

    const block = el('a', 'map-popup-chart')
    block.href = `/e/${encodeURIComponent(id)}`
    const chartFold = fold(folds)
    const build = entityPanelIn(chartFold)

    const fill = (record: EntityRecord | null): boolean => {
      if (!record) return false
      const values = record.values
      const spark = sparkline({ values, window: values.length })
      if (!spark) return false

      // A series quoted in percent moves in points: a yield going 4.62 to 5.22
      // rose 0.60, not 13%.
      const points = record.unit === '%'
      const delta = points ? spark.ends[1] - spark.ends[0] : spark.windowPct
      block.classList.toggle('is-pos', delta > 0)
      block.classList.toggle('is-neg', delta < 0)

      const head = el('span', 'map-popup-chart-head')
      head.append(
        el('span', 'map-popup-chart-label', record.label),
        el('span', 'map-popup-chart-reading', record.currentFormatted),
        // To the hundredth, as a rate is published: rounded to a whole point
        // a cut of 1.25 read `−1 pts` beside a line that fell further.
        el(
          'span',
          'map-popup-chart-move',
          points ? pointsFigure(delta, Math.abs(delta) >= 10 ? 1 : 2) : signedPct(delta),
        ),
      )

      // The dates the line runs between, which is the period the move is over.
      const dated = record.periods.filter((_, i) => Number.isFinite(values[i]))
      const span = el('span', 'map-popup-chart-span')
      span.append(el('span', '', dated[0] ?? ''), el('span', '', dated[dated.length - 1] ?? ''))

      block.replaceChildren(head, spark.element, span)
      return true
    }

    chartFold.bind(
      id,
      block,
      async () => build(await fetchEntity(id), id),
      () => {
        const hit = cachedEntity(id)
        return hit ? build(hit, id) : null
      },
    )

    const nodes: Node[] = [block, chartFold.panel]
    const drop = () => {
      block.remove()
      chartFold.panel.remove()
    }
    // Warm from `preview`'s prefetch on the ordinary path. `onDrawn` is what
    // lets the strip give up this series' chip, and it is called only when the
    // line is there: a chip dropped for a chart that then failed to arrive is a
    // series the card can no longer reach at all.
    const hit = cachedEntity(id)
    if (hit) {
      if (!fill(hit)) return []
      onDrawn()
      return nodes
    }
    void fetchEntity(id).then((record) => {
      if (!stillOpen()) return
      if (fill(record)) onDrawn()
      else drop()
    })
    return nodes
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
   * middle click and a crawler — and the click handler unfolds the series
   * *inside this card* instead, because on this surface navigating away means
   * abandoning a camera, a time slice, a set of filters and an open story.
   *
   * It used to open the `entity-sheet` dialog, and that solved the navigation
   * and then did the same damage a different way: a 640x810 card over a scrim,
   * which on a 900px viewport dims the map out entirely and puts the story the
   * reader clicked from behind a curtain. Sixty percent of that panel was
   * "Mentioned in · 30" — a list of other stories to go and read, offered at
   * the exact moment the reader is reading one, on a map where those stories
   * are already drawn as beacons. What the chip is actually being asked is
   * narrower than that: *this story is about Brent crude — what is Brent crude
   * doing?* The chart answers it, so the chart is what unfolds, in place,
   * under the strip.
   *
   * The mentions are not gone, they are one press further in: `full record →`
   * opens them here rather than at `/e/{id}`, as rows that fly the map. The
   * ordering is the judgement — the question the chip was asked is answered
   * first, and the question it was not is available to a reader who turns out
   * to have it.
   *
   * The card is capped at 50vh, so a long article plus a chart will overflow
   * it and scroll. That is the right trade: the reader chose to spend the
   * card's height on this.
   */
  const entityStrip = (
    story: Story,
    folds: Disclosure[],
  ): { nodes: Node[]; without(id: string): void } => {
    const entities = story.entities ?? []
    if (!entities.length) return { nodes: [], without() {} }

    const aside = el('aside', 'map-popup-entities')
    aside.setAttribute('aria-label', 'Indicators this story follows')
    aside.append(el('span', 'map-popup-entities-label', 'follows'))

    // One panel for the strip rather than one per chip: two indicators open at
    // once would be two charts stacked in a card that has room for neither,
    // and the second would push the first out of view as it arrived.
    const strip = fold(folds)
    const build = entityPanelIn(strip)

    const chips = new Map<string, HTMLElement>()
    for (const e of entities) {
      const chip = el('a', 'map-entity-chip', e.label)
      chip.href = `/e/${encodeURIComponent(e.id)}`
      chips.set(e.id, chip)
      strip.bind(
        e.id,
        chip,
        async () => build(await fetchEntity(e.id), e.id),
        // Warm from `preview`'s prefetch on the ordinary path, so the chip
        // opens in one step with no waiting line.
        () => {
          const hit = cachedEntity(e.id)
          return hit ? build(hit, e.id) : null
        },
      )
      aside.append(chip)
    }

    const nodes: Node[] = [aside, strip.panel]
    return {
      nodes,
      /**
       * Give up one series' chip, and the strip with it when it was the last:
       * a label over no chips is a heading for nothing. For the series the
       * story's chart draws under its title, once it is drawn.
       */
      without(id) {
        const chip = chips.get(id)
        if (!chip) return
        chips.delete(id)
        if (chip.getAttribute('aria-expanded') === 'true') strip.close()
        chip.remove()
        if (!chips.size) {
          aside.remove()
          strip.panel.remove()
          // And out of what is still to be placed, when the chart was drawn
          // before the strip was.
          nodes.length = 0
        }
      },
    }
  }

  return {
    preview(p, leads, now) {
      about(null)
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
      fit([p.lng, p.lat])
      popup.setLngLat([p.lng, p.lat]).setDOMContent(root)
      attach()

      // The flight is 1150ms and the fetch is one small same-origin JSON, so
      // asking for it now means the article is in hand before the camera
      // lands. Waiting until `moveend` — which is what this did — put a
      // "Loading…" card between the preview and the story: a third state, and
      // the one that looked worst, because the article shell with a single
      // line in it is *shorter* than the preview it replaced. The card grew
      // wide, collapsed to half its height, then doubled. This is the same
      // request either way; only its timing changed.
      // And the series a story charts, behind it: the card draws that under
      // the title, and a block filled a moment after the card opens is a block
      // the reader watched arrive.
      // Only a series with a record behind it, as `storyChart` draws: a
      // company's or a lab's id is published on a story and has no
      // `/api/entity` file, so asking was a 404 on every preview.
      void fetchStory(p.slug).then((story) => {
        const id = story ? chartOf(story) : null
        if (id) void fetchEntity(id)
      })
    },

    async open(p, now) {
      about(null)
      pending = p.slug
      fit([p.lng, p.lat])
      popup.setLngLat([p.lng, p.lat])

      // Warm from `preview`'s prefetch on the ordinary path, so the preview
      // becomes the article in one step. `fetchStory` resolves from the same
      // cache; the loading card is only for the fetch that has not landed.
      let story = cache.get(p.slug) ?? null
      if (!story) {
        const loading = shell(p, now, 'article')
        loading.append(el('p', 'map-popup-loading', 'Loading…'))
        swap(loading)
        attach()
        story = await fetchStory(p.slug)
        if (pending !== p.slug) return
      }

      const root = shell(p, now, 'article')
      if (story) {
        const folds: Disclosure[] = []
        // Between the title and the prose, where the app has it: the series is
        // what the story is about, and the prose reads against it.
        // The strip is built further down, after the prose it sits under, and
        // the chart may be drawn before or after it is: whichever comes second
        // gives up the chip.
        let charted = false
        let strip: ReturnType<typeof entityStrip> | null = null
        const chartId = chartOf(story)
        root.append(
          ...storyChart(story, folds, () => pending === p.slug, () => {
            charted = true
            if (chartId) strip?.without(chartId)
          }),
        )
        const body = el('div', 'map-popup-prose')
        // Trusted content: this HTML is produced by our own build from the
        // article markdown, the same string the /a/{slug} page renders.
        body.innerHTML = story.bodyHtml
        // And because it is that same string, it opens with the article's own
        // `City — ` dateline, which `.map-popup-prose` restyles onto a line of
        // its own exactly as the article page does — directly under a kicker
        // that has already printed the place. Measured on the built map: the
        // card said `economy · Ranchi · 3h ago`, then the headline, then
        // **RANCHI** again two lines later. `mapLeads` strips the same prefix
        // out of the preview's lead sentence for the same reason (`build.js`,
        // `DATELINE_RE`); the pinned card renders the whole article and so
        // never went through that path, which is why the fix reached one of the
        // two cards and not the other.
        //
        // Removed rather than hidden, so it leaves the accessibility tree with
        // the pixels — a screen reader was hearing the place twice too. And
        // only when the kicker really does carry it: `kickerFor` drops `loc`
        // when a story has none, and there the body's dateline is the card's
        // only statement of where this happened.
        if (p.loc) body.querySelector('.article-dateline')?.remove()
        root.append(body)
        // Directly under the prose, because that is where the tags are. A
        // disclosure that opens somewhere else is a navigation.
        root.append(countryTags(body, folds))
        // Above the isnad, because the chain has to stay last — `about.md`
        // says every article ends with its sources, and this card is the
        // article on this surface.
        strip = entityStrip(story, folds)
        if (charted && chartId) strip.without(chartId)
        root.append(...strip.nodes)
        root.append(...sourceBlock(story, p))
        // Only on a card that rendered. A story that failed to load is not one
        // the reader has read, so it must not count towards the app line and
        // there is nothing worth passing on.
        root.append(...cardFoot(shareUrl(p.slug), story.title || p.title))
      } else {
        // Only when the card itself cannot render does the standalone page
        // become worth offering — otherwise it holds nothing this does not.
        root.append(el('p', 'map-popup-lead', 'Could not load this story.'))
        const link = el('a', 'map-popup-link', 'Open full page')
        link.href = `/a/${p.slug}`
        root.append(link)
      }
      swap(root)
      attach()
    },

    async openCountry(iso, at, standing = null) {
      const key = `country:${iso}`
      pending = key
      about(iso)
      const loading = el('div', 'map-popup-body map-popup-country')
      loading.append(el('p', 'map-popup-loading', 'Loading…'))
      fit(at)
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

    openPlace(place, now) {
      about(null)
      // Nothing to await, so nothing to race — but `pending` still has to be
      // claimed, or a story fetch already in flight would land on top of this
      // card when it resolves.
      pending = `place:${place.key}`
      fit([place.lng, place.lat])
      popup.setLngLat([place.lng, place.lat]).setDOMContent(placeCard(place, now))
      attach()
    },

    setPadding(edges) {
      padding = { ...padding, ...edges }
      popup.setPadding(edges)
      fit()
    },
    focus() {
      const box = contentBox()
      if (!box) return
      box.tabIndex = -1
      box.focus({ preventScroll: true })
    },
    contains: (node) => popup.getElement()?.contains(node) ?? false,
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
