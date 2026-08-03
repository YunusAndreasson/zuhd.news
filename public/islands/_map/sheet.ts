// The detail sheet.
//
// Reuses the site's existing native-<dialog> pattern (`.island-sheet` in
// style.css) rather than introducing a second modal system. Built imperatively
// with textContent throughout — this island stays off the Preact runtime the
// other islands use, and never interpolates content into innerHTML.
//
// ── Peek and pinned are two densities, not one card shown twice ────────────
//
// The sheet has always had two modes: hover opens it non-modally (`show()`),
// a click promotes it to a modal (`showModal()`). Until now both rendered the
// *same* nodes, so the mode carried nothing but modality and every fact had to
// justify itself against the shortest possible glance. That is why the layer
// payloads went mostly unread — there was no rung to put a second fact on.
//
// Now the mode picks the density. `peek` answers the one question a pointer
// resting on a marker is asking — how bad, how far off normal, how many dead —
// and stops. `pinned` is for a reader who has committed, and carries the rest:
// prose, provenance, the series behind the number, related coverage. This also
// keeps peek clear of `.map-sheet.is-peek`'s 55vh ceiling, above which content
// is clipped rather than scrolled.

import { displaySourceName, EVENT_TYPE_EYEBROW, parseSeverityHero } from '@shared/gdacs'
import { el } from '../_dom'
import { appPrompt } from '../_app-prompt'
import { createChart, type ChartOptions } from '../_chart'
import * as fmt from './format'
import { nisab, type TickerEntry } from './markets'
import { windowPoints } from './series-window'
import type {
  ConflictEvent,
  GdacsAlert,
  GdacsDetail,
  GenocideSituation,
  IpcArea,
  MapChokepoint,
  MapExchange,
  ThermalEvent,
  VesselField,
} from './types'
// Types only, so the painter is erased at build; `SKY_NOTE` comes from the
// DOM-free half deliberately, since that is the file the compression it
// describes actually lives in.
import type { BodyHit, StarHit } from './starfield'
import { SKY_NOTE } from './sky'

export interface Sheet {
  element: HTMLDialogElement
  showGdacs(alert: GdacsAlert, detail: GdacsDetail | null, pinned: boolean): void
  /**
   * `docked` opens the card as a box beside the rail instead of a modal.
   *
   * A backdrop makes the page inert and takes focus, which is the right
   * ceremony for a document and far too much for one series read off a row the
   * reader is still standing on — the same objection the markets panel already
   * makes about `showModal()`. It is the *origin* that decides: a card reached
   * from a mark on the map is a commitment and keeps its backdrop; a card
   * reached from the rail keeps the map live, because the rail row and the map
   * are the two halves of what the reader is doing.
   */
  showChokepoint(cp: MapChokepoint, pinned: boolean, docked?: boolean): void
  /**
   * `rangeDays` is the money rail's window, carried in so the card opens on the
   * period the reader was already looking at. Absent — a card opened from a map
   * mark rather than from the rail — means the whole published series, which is
   * what these cards have always drawn.
   */
  showMarket(exchange: MapExchange, pinned: boolean, rangeDays?: number, docked?: boolean): void
  showIndicator(entry: TickerEntry, pinned: boolean, rangeDays?: number, docked?: boolean): void
  showConflict(event: ConflictEvent, window: string | null, pinned: boolean): void
  showGenocide(situation: GenocideSituation, pinned: boolean): void
  showThermal(event: ThermalEvent, pinned: boolean): void
  showFamine(area: IpcArea, pinned: boolean): void
  showStar(star: StarHit, pinned: boolean): void
  showBody(body: BodyHit, hijri: string | null, pinned: boolean): void
  close(): void
  isOpen(): boolean
  isPinned(): boolean
  destroy(): void
}


/**
 * The shortest window a card is allowed to open on, in days.
 *
 * The rail's bottom rung is a single day, and a single day of daily closes is
 * two points — which is a legible *slope* in a 100×20 box beside a figure and
 * is not a chart. Given an axis, three date labels, rings on the extremes and a
 * y-gutter, two observations produce a diagonal in a large frame that looks
 * like a rendering fault.
 *
 * So the card floors at a week. The reader loses nothing by it: the hero above
 * the chart prints the day's move, which is the number they pressed, and the
 * shape underneath is the context a card is for.
 */
const CARD_MIN_DAYS = 7

/**
 * The rail's window, as the point count `createChart` takes.
 *
 * `0` — draw everything — when the rail has no opinion, which is a card opened
 * from a mark on the map rather than from a row of the money block.
 */
const cardWindow = (
  periods: string[] | undefined,
  asOf: string | undefined,
  rangeDays: number | undefined,
): number =>
  rangeDays === undefined ? 0 : windowPoints(periods, asOf, Math.max(rangeDays, CARD_MIN_DAYS))

/**
 * Fire radiative power, in the precision the figure deserves.
 *
 * FRP across a real snapshot runs from 5 MW to 17,000. A decimal is the whole
 * difference between two small fires and is noise on a large one, so the rule is
 * magnitude-based — the same argument `axisDecimals` makes for a chart's gutter.
 */
const thermalPower = (mw: number): string =>
  mw >= 100 ? fmt.grouped(Math.round(mw)) : mw.toFixed(1)

/**
 * A pass time in Makkah, like every other time this map states.
 *
 * Mixing frames on one surface puts two different days on one card for most of
 * the world — see `MAKKAH_TZ` in `_map/format.ts`, and the header clock, the
 * scrubber readout and the Hijri date that all already answer to it.
 */
const makkahClock = (t: number): string =>
  `${new Date(t + fmt.zoneOffset(t, fmt.MAKKAH_TZ)).toISOString().slice(11, 16)} ${fmt.MAKKAH_LABEL}`

/** Which vessel class `primaryField` names, in words a reader can use. */
const VESSEL_NOUN: Record<VesselField, string> = {
  n_total: 'vessels',
  n_tanker: 'tankers',
  n_container: 'container ships',
  n_dry_bulk: 'dry-bulk carriers',
  n_cargo: 'cargo ships',
  n_general_cargo: 'general-cargo ships',
  n_roro: 'ro-ro ships',
}

/**
 * IPC's own 1–3 evidence rating, in words.
 *
 * Ascending in reliability, and stated rather than printed as a numeral: "2" on a
 * card is a number with no scale attached, and the reader has no way to know
 * whether it is two of three or two of ten.
 */
const FAMINE_CONFIDENCE: Record<number, string> = {
  1: 'limited',
  2: 'moderate',
  3: 'strong',
}

const WEATHER_PHRASE: Record<string, string> = {
  rough: 'rough seas',
  very_rough: 'very rough seas',
}

/**
 * The dyad.
 *
 * UCDP records an event as a pair: `actor1` is the party that acted, `actor2`
 * the party acted upon. The sheet used to title an event `"6 killed · JNIM"`,
 * dropping `actor2` entirely — which reads as though JNIM lost six people when
 * the six were civilians it killed. Both actors are on every event in the feed,
 * so there was never a reason for the card to name only one.
 */
const dyad = (e: ConflictEvent): string => (e.actor2 ? `${e.actor1} → ${e.actor2}` : e.actor1)

/**
 * `conflictName` is usually just the two actors joined by a hyphen
 * ("JNIM - Civilians"), in which case printing it under a title that already
 * names both is the same fact twice. It earns its line only when UCDP has
 * given the conflict a proper geopolitical name the dyad doesn't already say.
 */
const distinctConflictName = (e: ConflictEvent): string | null => {
  const name = e.conflictName?.trim()
  if (!name) return null
  const joined = e.actor2 ? `${e.actor1} - ${e.actor2}` : e.actor1
  return name.toLowerCase() === joined.toLowerCase() ? null : name
}

/** Fatalities, with the civilian share when UCDP broke it out. */
const casualtyLine = (e: ConflictEvent): string => {
  const dead = e.fatalities || 0
  if (dead <= 0) return e.subEvent.replace(/_/g, ' ')
  const civ = e.deathsCivilians ?? 0
  if (civ >= dead) return `${fmt.grouped(dead)} killed, all civilians`
  if (civ > 0)
    return `${fmt.grouped(dead)} killed, ${fmt.grouped(civ)} civilian${civ === 1 ? '' : 's'}`
  return `${fmt.grouped(dead)} killed`
}

export function createSheet(): Sheet {
  const dialog = document.createElement('dialog')
  dialog.className = 'island-sheet map-sheet'

  const closeForm = el('form', 'island-sheet-close-form')
  closeForm.method = 'dialog'
  const closeBtn = el('button', 'island-sheet-close', '×')
  closeBtn.type = 'submit'
  closeBtn.setAttribute('aria-label', 'Close')
  closeForm.append(closeBtn)

  const inner = el('div', 'island-sheet-inner')
  dialog.append(closeForm, inner)
  document.body.append(dialog)

  let pinned = false
  /** Whether the open card is the non-modal, rail-anchored kind. */
  let isDocked = false
  // `close` is *queued*, not dispatched synchronously — so a bare
  // `pinned = false` here fired one task after the promotion below had already
  // set `pinned = true`, and silently unpinned a sheet the reader had just
  // clicked. The symptom was that pinning did nothing: the sheet still
  // dismissed itself 260ms after the pointer left the marker, because the
  // island's `isPinned()` said it was still a hover peek. Reading the dialog's
  // own state is what makes this event mean "the sheet is shut" rather than
  // "a close call happened at some point".
  dialog.addEventListener('close', () => {
    if (!dialog.open) pinned = false
  })

  // Hover opens the sheet non-modally, so the map underneath stays live and
  // the pointer can move straight to the next beacon. Clicking promotes the
  // same sheet to a real modal — committed reading, backdrop and all. A
  // pinned sheet ignores hover entirely, so it never vanishes mid-read.
  const open = (pin: boolean, docked = false) => {
    if (pin) {
      // `showModal` throws on an already-open dialog, so a peek has to be shut
      // before it can be promoted.
      if (dialog.open) dialog.close()
      pinned = true
      isDocked = docked
      dialog.classList.remove('is-peek')
      dialog.classList.toggle('is-docked', docked)
      // `show()` leaves the map live and the page interactive; the platform
      // then stops doing three things for us, and they are wired below.
      if (docked) dialog.show()
      else dialog.showModal()
    } else {
      isDocked = false
      dialog.classList.remove('is-docked')
      dialog.classList.add('is-peek')
      if (!dialog.open) dialog.show()
    }
  }

  /**
   * Escape and the light dismiss, which `show()` does not give us.
   *
   * Registered once at construction rather than per open, and both no-ops
   * unless a docked card is up. `stopPropagation` on Escape is load-bearing:
   * the island listens for the same key to reset the camera, and a reader
   * shutting a card has not asked to be sent back to the whole world. Same
   * ordering the markets panel relies on — registered earlier, so it runs
   * first.
   *
   * The dismiss is `pointerdown` in the capture phase. It cannot close the card
   * that is being opened, because at the pointerdown that precedes that click
   * the dialog is not yet open and the guard returns; pressing a *different*
   * row while one is up closes the first and opens the second, which is the
   * behaviour a column of peers should have.
   */
  const onDocKey = (e: KeyboardEvent) => {
    if (!isDocked || !dialog.open || e.key !== 'Escape') return
    e.stopPropagation()
    dialog.close()
  }
  const onDocDown = (e: Event) => {
    if (!isDocked || !dialog.open) return
    const t = e.target
    if (t instanceof Node && dialog.contains(t)) return
    dialog.close()
  }
  document.addEventListener('keydown', onDocKey)
  document.addEventListener('pointerdown', onDocDown, true)

  const render = (nodes: Node[], pin: boolean, docked = false) => {
    if (pinned && !pin) return
    // The app line used to hang off the story sheet, which the map no longer
    // opens — stories now read in a popup anchored to their own coordinate. It
    // belongs on whichever sheet the reader has actually committed to, and only
    // once they have opened enough of them to have found the map useful. The
    // counter it reads is shared with the story card (`_app-prompt.ts`), so
    // four overlay sheets and four stories are the same four opens rather than
    // two independent tallies both waiting to fire.
    if (pin) {
      const app = appPrompt()
      if (app) nodes = [...nodes, app]
    }
    inner.replaceChildren(...nodes)
    open(pin, docked)
  }

  const kicker = (parts: Array<string | null | undefined>) =>
    el('p', 'map-sheet-kicker', parts.filter(Boolean).join(' · '))

  /** The focal number, with its supporting clause beside it. */
  const hero = (focal: string, secondary?: string, tone?: 'pos' | 'neg') => {
    const p = el('p', 'map-sheet-hero')
    p.append(el('strong', `map-sheet-hero-focal${tone ? ` is-${tone}` : ''}`, focal))
    if (secondary) p.append(el('span', 'map-sheet-hero-note', secondary))
    return p
  }

  const readMore = (href: string, label: string) => {
    const a = el('a', 'map-sheet-link', label)
    a.href = href
    return a
  }

  /**
   * A chart on a card.
   *
   * The three sheets that draw one built their own `<figure>` and
   * `<figcaption>` around a bare SVG; the chart now owns both, because the
   * caption is one of the things the range control changes the meaning of and
   * a caption the chart cannot see is a caption that goes stale. Returns an
   * empty list for a series too short to draw, which is what keeps a
   * single-observation exchange from rendering an empty box.
   */
  const chartFigure = (opts: ChartOptions): Node[] => {
    const chart = createChart({ ...opts, className: 'map-sheet-figure' })
    return chart ? [chart.element] : []
  }

  const relatedList = (items: Array<{ slug: string; title: string }>, label: string): Node[] => {
    if (!items.length) return []
    const list = el('ul', 'map-sheet-more')
    for (const a of items.slice(0, 5)) {
      const li = el('li')
      const link = el('a', undefined, a.title)
      link.href = `/a/${a.slug}`
      li.append(link)
      list.append(li)
    }
    return [el('p', 'map-sheet-more-label', label), list]
  }

  return {
    element: dialog,

    showGdacs(alert, detail, pin) {
      const nodes: Node[] = []
      // The event type was previously spent only on the marker glyph, leaving
      // the kicker to say "disaster" — a word that adds nothing to a reader who
      // has just moused over the disaster layer.
      const type = EVENT_TYPE_EYEBROW[alert.eventtype]?.toLowerCase() ?? 'disaster'
      const others = (alert.affectedCountries?.length ?? 0) - 1
      const where = alert.country
        ? others > 0
          ? `${alert.country} +${others}`
          : alert.country
        : null
      nodes.push(kicker([type, alert.alertlevel?.toLowerCase(), where]))
      nodes.push(el('h2', 'island-sheet-title', alert.name || 'Disaster alert'))

      const { focal, secondary } = parseSeverityHero(alert)
      if (focal) nodes.push(hero(focal, secondary))

      // Exposure, from the `details` map the map downloaded on every load and
      // never opened. Only EQ and TC carry one, so this is silent on the
      // wildfires that make up most of the feed — absent, not broken.
      const population =
        detail?.criticalPopulation && detail.criticalPopulation > 0
          ? { n: detail.criticalPopulation, clause: detail.criticalClause }
          : detail?.widerPopulation && detail.widerPopulation > 0
            ? { n: detail.widerPopulation, clause: detail.widerClause }
            : null

      // A narrative already inlines these figures in prose, so on a pinned
      // sheet it replaces the exposure line rather than repeating it. Peek is
      // too short a glance for three sentences, and takes the number instead.
      if (pin && alert.narrative) {
        nodes.push(el('p', 'map-sheet-lead', alert.narrative))
      } else if (population) {
        const p = el('p', 'map-sheet-stat')
        p.append(
          el('strong', undefined, `≈${fmt.population(population.n)}`),
          ` people ${population.clause}`,
        )
        nodes.push(p)
      }

      if (pin) {
        if ((alert.affectedCountries?.length ?? 0) > 1) {
          nodes.push(el('p', 'map-sheet-meta', `Affects ${alert.affectedCountries.join(', ')}`))
        }
        nodes.push(
          el(
            'p',
            'map-sheet-meta',
            [displaySourceName(alert.source), fmt.shortDate(alert.fromDate)]
              .filter(Boolean)
              .join(' · '),
          ),
        )
        if (alert.reportUrl) {
          const a = readMore(alert.reportUrl, 'GDACS report')
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          nodes.push(a)
        }
      }
      render(nodes, pin)
    },

    showChokepoint(cp, pin, docked) {
      const nodes: Node[] = []
      const field = cp.primaryField
      const delta = cp.delta7vs90?.[field]
      nodes.push(kicker(['chokepoint', typeof delta === 'number' ? fmt.deltaLabel(delta) : null]))
      nodes.push(el('h2', 'island-sheet-title', cp.name))

      // The ratio alone says how far from normal without ever saying what is
      // moving. These are the counts it was computed from.
      const recent = cp.last7Avg?.[field]
      const base = cp.baseline90Avg?.[field]
      if (typeof recent === 'number') {
        const noun = VESSEL_NOUN[field]
        nodes.push(
          hero(
            `${fmt.vessels(recent)} ${noun}/day`,
            typeof base === 'number' ? `${fmt.vessels(base)} on the 90-day baseline` : undefined,
          ),
        )
      }

      if (pin) {
        if (cp.blurb) nodes.push(el('p', 'map-sheet-lead', cp.blurb))

        // 86 days of daily transits, with the baseline drawn across them. The
        // sheet could already state the delta; the line is what shows whether
        // it is a step change or the tail of a spike — and the cursor is what
        // lets a reader put a number on the day it turned.
        nodes.push(
          ...chartFigure({
            values: cp.series?.total ?? [],
            periods: cp.series?.periods ?? [],
            reference: cp.baseline90Avg?.n_total,
            referenceLabel: 'the 90-day average',
            direction: delta,
            palette: 'straits',
            unit: 'vessels',
            step: 'days',
            label: `Daily vessel transits at ${cp.name}`,
            // The series is undifferentiated traffic — PortWatch publishes the
            // per-class split only as averages, never as a time series — so the
            // caption must stop it being read as the headline vessel class.
            caption: 'All vessel traffic, daily · rule marks the 90-day average',
          }),
        )

        const phrase = cp.weather?.alert ? WEATHER_PHRASE[cp.weather.alert] : null
        if (phrase && cp.weather) {
          nodes.push(
            el(
              'p',
              'map-sheet-meta',
              `${phrase} — peak ${cp.weather.maxWave24hM} m in the past 24h`,
            ),
          )
        }

        nodes.push(
          el(
            'p',
            'map-sheet-meta',
            ['IMF PortWatch', fmt.shortDate(cp.asOf), fmt.lagLabel(cp.asOf)]
              .filter(Boolean)
              .join(' · '),
          ),
        )
        nodes.push(...relatedList(cp.relatedArticles ?? [], 'Related coverage'))
      }
      render(nodes, pin, docked)
    },

    showMarket(ex, pin, rangeDays, docked) {
      const nodes: Node[] = []
      // The kicker carries freshness, because on a world map that is the first
      // ambiguity: at any given moment most exchanges are shut, and "+0.8%"
      // means something different twenty minutes into a session than it does
      // fourteen hours after one.
      nodes.push(kicker(['markets', fmt.sessionLabel(ex), ex.stale ? 'cached' : null]))
      nodes.push(el('h2', 'island-sheet-title', ex.name))
      // The day's move is the focal, not the level.
      //
      // It was the other way round, and the card was contradicting its own map:
      // the mark is drawn from `changePct` and nothing else, so the reader
      // clicked a percentage and was answered with an index level. `level`
      // spans 1,086 to 3,319,522 across twenty-one currencies and is comparable
      // with nothing — including its own past, unless you already know the
      // index. `changePct` is the only cross-comparable figure on the card. So
      // Seoul's +4.40%, the largest single-day move on earth that day, was set
      // in small grey type beside the index name while `7,096.89 KRW` took the
      // headline. Tinted with the same pair as the tick that opened it.
      nodes.push(
        hero(
          fmt.pctChange(ex.changePct),
          `${ex.indexName} · ${fmt.indexLevel(ex.level, ex.currency)}`,
          ex.changePct < 0 ? 'neg' : 'pos',
        ),
      )

      if (pin) {
        if (ex.blurb) nodes.push(el('p', 'map-sheet-lead', ex.blurb))

        // A quarter of closes, with a rule where the drawn window started — the
        // same job the 90-day baseline does on a chokepoint. A day's move says
        // nothing about whether it is a blip or the shape of a decline.
        //
        // The tint follows the *window*, not the day. It used to take
        // `ex.changePct` while the rule sat at `values[0]`, which is two
        // different horizons in one chart: an index down 12% over the quarter
        // and up 0.3% today drew green, with its own line ending below its own
        // rule. The chart describes the line against the rule it draws, and the
        // hero above already states the day.
        //
        // `'open'` and `'window'` rather than the two figures, because the range
        // control moves what "the window" means. Computing them here would pin
        // both to the full quarter and leave a 30-session view drawing a rule at
        // a price outside its own domain, under a caption still claiming it was
        // the open.
        const values = ex.series?.values ?? []
        nodes.push(
          ...chartFigure({
            values,
            periods: ex.series?.periods ?? [],
            window: cardWindow(ex.series?.periods, ex.asOf, rangeDays),
            reference: 'open',
            referenceLabel: 'the window’s open',
            direction: 'window',
            palette: 'signed',
            // The same unit the hero prints beside the level, so the readout
            // and the card agree about what a number on this chart is.
            unit: ex.currency,
            step: 'sessions',
            label: `${ex.indexName} daily closes`,
            // The window's change and its dates used to be spelled out here.
            // Both moved to the readout and the axis, which state them for
            // whatever is actually drawn — a caption cannot, and a caption that
            // is wrong about the chart above it is worse than no caption.
            caption: 'Daily closes · rule marks the window’s open',
          }),
        )

        nodes.push(
          el(
            'p',
            'map-sheet-meta',
            [ex.city, ex.sourceLabel, fmt.shortDate(ex.asOf), fmt.lagLabel(ex.asOf)]
              .filter(Boolean)
              .join(' · '),
          ),
        )
        nodes.push(...relatedList(ex.relatedArticles ?? [], 'Related coverage'))
      }
      render(nodes, pin, docked)
    },

    /**
     * A currency, a metal or a coin from the ribbon.
     *
     * The ribbon can only afford a three-letter code, and a three-letter code is
     * not something most readers can place — PKR and IDR least of all. So the
     * card does the naming: it leads with what the thing is actually called, and
     * carries the quarter of closes behind the day's move, which is the only way
     * to tell a blip from a slide. Same shape as the exchange card, because it
     * is the same kind of fact.
     */
    showIndicator(entry, pin, rangeDays, docked) {
      const nodes: Node[] = []
      nodes.push(kicker([entry.group, entry.asOf ? fmt.shortDate(entry.asOf) : null]))
      nodes.push(el('h2', 'island-sheet-title', `${entry.flag} ${entry.name}`.trim()))
      nodes.push(
        hero(
          fmt.pctChange(entry.pct),
          [entry.label, Number.isFinite(entry.level) ? fmt.indexLevel(entry.level) : null, entry.unit]
            .filter(Boolean)
            .join(' · '),
          entry.pct < 0 ? 'neg' : 'pos',
        ),
      )

      if (pin) {
        nodes.push(
          ...chartFigure({
            values: entry.values,
            periods: entry.periods,
            window: cardWindow(entry.periods, entry.asOf, rangeDays),
            reference: 'open',
            referenceLabel: 'the window’s open',
            direction: 'window',
            palette: 'signed',
            // Without this the readout said "4,057.62" and the hero two lines
            // above said "$/oz" — the card naming the unit once and then
            // quoting thirty values that could have been anything.
            unit: entry.unit,
            step: 'days',
            label: entry.name,
            caption: 'Daily · rule marks the window’s open',
          }),
        )

        // On the metals, the threshold the price is actually being read for.
        // Nothing else on this card answers it, and the arithmetic is already
        // sitting in the hero figure directly above.
        const n = nisab(entry)
        if (n) {
          nodes.push(
            el(
              'p',
              'map-sheet-meta',
              `Zakat nisab · $${fmt.grouped(n.value[0])} – $${fmt.grouped(n.value[1])}`,
            ),
          )
          nodes.push(
            el(
              'p',
              'map-sheet-note',
              `The ${n.grams[0]}–${n.grams[1]} g of ${n.metal} at which zakat falls due. ` +
                'The spread is the schools’ conversions of the classical weight, not a market range.',
            ),
          )
        }

        if (entry.sourceLabel) nodes.push(el('p', 'map-sheet-meta', entry.sourceLabel))
      }
      render(nodes, pin, docked)
    },

    showConflict(event, windowLabel, pin) {
      const nodes: Node[] = []
      nodes.push(
        kicker(['conflict', event.subEvent?.replace(/_/g, ' ') || null, event.country || null]),
      )
      nodes.push(el('h2', 'island-sheet-title', dyad(event)))
      nodes.push(hero(casualtyLine(event)))

      if (pin) {
        const proper = distinctConflictName(event)
        if (proper) nodes.push(el('p', 'map-sheet-meta', proper))
        if (event.notes) nodes.push(el('p', 'map-sheet-lead', event.notes))
        const sources = event.numSources ?? 0
        const meta: Array<string | null> = ['UCDP', event.eventDate, event.location || null]
        if (sources > 0) meta.push(`${sources} source${sources === 1 ? '' : 's'}`)
        if (windowLabel) meta.push(windowLabel)
        nodes.push(el('p', 'map-sheet-meta', meta.filter(Boolean).join(' · ')))
        // The conflict feed trails real time by months. Saying so in the sheet is
        // the difference between a dated record and a false "now".
        nodes.push(el('p', 'map-sheet-note', 'Conflict records publish on a lag and are not live.'))
      }
      render(nodes, pin)
    },

    /**
     * The genocide card.
     *
     * Different from every other sheet here in one way that matters: there is
     * no number. The others open on a magnitude — dead, displaced, vessels a
     * day, percent off baseline — because the reader's first question is how
     * big. Here the reader's first question is *who says so*, and answering it
     * with a casualty figure would put the map in the position of arguing the
     * case rather than reporting a finding. So the hero line is the body that
     * made the determination, the card carries the document, the date and the
     * finding in the body's own terms, and the link goes to where it can be
     * read in full. The map asserts nothing it did not source.
     */
    showGenocide(situation, pin) {
      const nodes: Node[] = []
      nodes.push(kicker(['genocide', `UN finding · ${fmt.fullDate(situation.date)}`]))
      nodes.push(el('h2', 'island-sheet-title', situation.name))
      // Not `hero()`. That treatment is sized for a figure — three characters
      // and a unit — and the body's name is thirteen words, which at h2 became
      // the largest thing on a card whose subject is the place. It is still
      // the first line after the title, because who made the finding is the
      // first question; it just does not have to be set in display type to be.
      nodes.push(el('p', 'map-sheet-authority', situation.body))
      nodes.push(
        el('p', 'map-sheet-meta', `Ongoing since ${fmt.monthLabel(situation.since)}`),
      )

      if (pin) {
        nodes.push(el('p', 'map-sheet-lead', situation.summary))
        nodes.push(el('p', 'map-sheet-meta', situation.document))
        const links = el('p', 'map-sheet-links')
        links.append(readMore(situation.url, 'Read the finding'))
        if (situation.iso2 && situation.profile) {
          links.append(readMore(`/country/${situation.iso2}`, `${situation.profile} in profile`))
        }
        nodes.push(links)
      }
      render(nodes, pin)
    },

    /**
     * A thermal anomaly.
     *
     * The card's whole job is to state what the instrument saw and stop, because
     * the one thing a thermal detection cannot tell you is what was burning. A
     * strike, a wildfire, a crop fire and a refinery flare are the same reading —
     * so the mark is drawn only where a story stands beside it, and the card says
     * how far away that story is rather than implying the two are the same thing.
     *
     * Peek answers what a resting pointer is asking: how hot, how far, how long.
     * Pinned adds the caveat, the provenance, and a route to the pass itself, so
     * a reader can check the claim against NASA's own map rather than taking it
     * from us.
     */
    showThermal(event, pin) {
      const nodes: Node[] = []
      nodes.push(
        kicker([
          'thermal',
          event.daynight === 'N' ? 'night pass' : 'day pass',
          `${event.confidence} confidence`,
        ]),
      )
      nodes.push(
        el(
          'h2',
          'island-sheet-title',
          event.near?.loc ? `Heat near ${event.near.loc}` : 'Heat signature',
        ),
      )

      // Radiative power is the figure, and the pixel count is what makes it
      // legible: 40 MW over one pixel and over twenty are very different fires.
      const pixels = `${fmt.grouped(event.pixels)} pixel${event.pixels === 1 ? '' : 's'}`
      const distance = event.near ? `${event.near.km} km from the story` : null
      nodes.push(hero(`${thermalPower(event.frp)} MW`, [pixels, distance].filter(Boolean).join(' · ')))

      // How long this place has been alight. "First seen on this pass" is the
      // common case and worth saying outright — it is the difference between a
      // new event and something the map has been watching for days.
      const spell = el('p', 'map-sheet-stat')
      if (event.persistDays <= 1) {
        spell.append(el('strong', undefined, 'First seen'), ' on this pass')
      } else {
        spell.append(
          el('strong', undefined, `${event.persistDays} days`),
          event.escalating ? ' alight, and burning well above its own baseline' : ' alight',
        )
      }
      nodes.push(spell)

      if (pin) {
        nodes.push(
          el(
            'p',
            'map-sheet-lead',
            'A satellite pass measured infrared radiance above the background here. ' +
              'The instrument records heat, not its cause: a strike, a wildfire, ' +
              'burning cropland and an industrial flare are the same reading. ' +
              'Places alight steadily for days are filtered out as installations, ' +
              'which is why this one is drawn — and why a fire the satellite has ' +
              'watched all week only appears once it burns harder than it has been.',
          ),
        )
        nodes.push(
          el(
            'p',
            'map-sheet-meta',
            [
              'NASA FIRMS',
              event.satellites?.length ? `VIIRS/${event.satellites.join(', ')}` : 'VIIRS',
              '375 m pixels',
              `${makkahClock(event.t)} · ${fmt.relativeTime(event.t)}`,
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        )
        // The pass itself, on NASA's own map, so the reader can check us. Zoomed
        // in enough to see the individual detections this event was clustered
        // from rather than the region they sit in.
        const link = readMore(
          `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${event.lng},${event.lat},9z`,
          'This pass on FIRMS',
        )
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        nodes.push(link)
        // The stories that make this mark publishable. The nearest one's distance
        // is already in the hero, which is the calibration that matters — the
        // join is 75 km wide and the card has to admit it.
        nodes.push(...relatedList(event.relatedArticles ?? [], 'Reported near here'))
      }
      render(nodes, pin)
    },

    /**
     * An IPC-classified area.
     *
     * Two things make this card different from every other one here, and both are
     * about the gap between what the mark says and what the reader will assume.
     *
     * **It leads with the classification, then immediately dates it.** Every other
     * overlay on this map is a statement about now — a strait running today, an
     * exchange that moved this morning, a pass a satellite made this afternoon.
     * This is a determination made on a month that can be eleven months back, and
     * a reader who takes "Emergency" as current without knowing that is reading
     * the mark wrong. So the vintage is not provenance filed at the bottom; it is
     * the line under the figure.
     *
     * **And where the phase and the caseload disagree, the caseload leads.** Gaza's
     * four areas classify at Phase 3 while the same analysis counts tens of
     * thousands of people in Phase 5 — because an area phase is a threshold on the
     * whole population, so a district can hold a Catastrophe caseload and classify
     * at Crisis. That is a correct use of the scale and it is the single most
     * misleading thing this card could print without comment, since a mark drawn
     * for its Catastrophe caseload would otherwise read as the mildest on the
     * layer. `publishable` in `scripts/lib/ipc.js` carries the same argument for
     * why the mark exists at all.
     */
    showFamine(area, pin) {
      const nodes: Node[] = []
      const catastrophe = area.pop?.p5 ?? 0
      nodes.push(
        kicker([
          'famine',
          // "IPC Phase 4", not "IPC emergency" — lowercasing the phase name turns
          // a classification into a description, and "IPC emergency" reads as an
          // emergency *at* the IPC. The name in full is on the line below.
          `IPC Phase ${area.phase}`,
          // Not "8.9 months" — the analysis is published to the month, so a
          // decimal claims a precision the source does not have.
          `analysis ${area.vintage}`,
        ]),
      )
      nodes.push(el('h2', 'island-sheet-title', area.area))

      // The hero is the caseload the mark is really about, which is not always the
      // one the phase names. Where the IPC counts anyone in Catastrophe that is
      // the figure; otherwise it is the Emergency caseload the phase refers to.
      if (catastrophe > 0) {
        nodes.push(
          hero(fmt.grouped(catastrophe), `in Phase 5 · Catastrophe — of ${
            fmt.grouped(area.pop?.total ?? 0)
          } assessed`),
        )
      } else if ((area.pop?.p4 ?? 0) > 0) {
        nodes.push(
          hero(fmt.grouped(area.pop.p4 ?? 0), `in Phase 4 · Emergency — of ${
            fmt.grouped(area.pop?.total ?? 0)
          } assessed`),
        )
      }

      // The classification, and the window it describes. Printed together because
      // apart they are each half a fact: "Emergency" with no window is undated,
      // and a window with no phase is a date range with nothing in it.
      const standing = el('p', 'map-sheet-stat')
      standing.append(
        el('strong', undefined, `Phase ${area.phase} · ${area.phaseName}`),
        area.from && area.to ? ` for ${fmt.monthLabel(area.from)} – ${fmt.monthLabel(area.to)}` : '',
      )
      nodes.push(standing)

      if (pin) {
        // The sentence that stops the mark being misread. Only where the two
        // disagree — printing it everywhere would make the exception look like the
        // rule, and on a Phase 4 area with no Catastrophe caseload it says nothing.
        if (catastrophe > 0 && area.phase < 5) {
          nodes.push(
            el(
              'p',
              'map-sheet-lead',
              `The IPC classifies this area at Phase ${area.phase} — an area phase is a ` +
                'threshold on the whole assessed population, so a place can hold a ' +
                'Catastrophe caseload and still classify below it. This area is drawn ' +
                'because of that caseload, not because of its phase.',
            ),
          )
        }
        nodes.push(
          el(
            'p',
            'map-sheet-lead',
            'A national IPC Technical Working Group classified this area from ' +
              'evidence it publishes. The classification describes the window above ' +
              'and stands until the next analysis replaces it — it is not a reading ' +
              'taken today.',
          ),
        )
        // Whether the same analysis has a forward statement covering now. This is
        // the difference between a classification that ran out and one that was
        // extended, which is exactly what a reader weighing an old vintage needs.
        const forward = el('p', 'map-sheet-stat')
        if (area.supersededBy) {
          forward.append(
            el('strong', undefined, 'Projected'),
            ` through ${fmt.monthLabel(area.supersededBy.to)} by the same analysis`,
          )
        } else {
          forward.append(
            el('strong', undefined, 'No current projection'),
            ' — the last window this analysis published has closed',
          )
        }
        nodes.push(forward)

        nodes.push(
          el(
            'p',
            'map-sheet-meta',
            [
              'IPC / Cadre Harmonisé, via OCHA HDX',
              area.level1 || null,
              // IPC's own 1–3 evidence rating, in words. A bare "2" on a card is a
              // number with no scale attached to it.
              area.confidence ? `${FAMINE_CONFIDENCE[area.confidence] ?? '—'} evidence` : null,
              area.prolongedCrisis ? 'protracted crisis' : null,
              `${area.ageMonths < 1 ? 'under a month' : `${Math.round(area.ageMonths)} months`} old`,
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        )
        const links = el('p', 'map-sheet-links')
        const ipcLink = readMore(
          `https://www.ipcinfo.org/ipc-country-analysis/en/?country=${area.iso3}`,
          'This analysis on IPC',
        )
        ipcLink.target = '_blank'
        ipcLink.rel = 'noopener noreferrer'
        links.append(ipcLink)
        if (area.iso2) links.append(readMore(`/country/${area.iso2}`, 'Country in profile'))
        nodes.push(links)
      }
      render(nodes, pin)
    },

    /**
     * A star.
     *
     * Peek answers what a resting pointer is asking — which one is that, and
     * how far — and stops. Pinned adds the thing that is worth a click on this
     * site in particular: **where the name came from.** Roughly a hundred of
     * the 138 IAU names on stars brighter than magnitude 3 arrived in every
     * European language through Arabic, usually as a fragment of a longer
     * phrase and occasionally as a copyist's slip preserved for eight
     * centuries. That is the one thing a mark on a star can say that a picture
     * of a star cannot, and `shared/star-lore.ts` is where the claims live.
     *
     * A star with no proper name still gets a card, because it still takes the
     * click: the designation, the constellation, the magnitude and the
     * distance. A card that cannot answer the gesture that opened it is the
     * empty-container failure the cluster numeral was deleted for.
     */
    showStar(star, pin) {
      const nodes: Node[] = []
      nodes.push(kicker(['star', star.name ? star.designation : null, star.constellation || null]))
      nodes.push(el('h2', 'island-sheet-title', star.name ?? star.designation))

      // Magnitude runs backwards — brighter is smaller, and Sirius is negative
      // — so the number is given the word that fixes its direction. Distance is
      // the secondary because it is the fact that makes a point of light a
      // place: two stars a finger apart can be ten and a thousand light years
      // away, and nothing on the sky says so.
      nodes.push(
        hero(
          `mag ${fmt.magnitude(star.magnitude)}`,
          star.lightYears
            ? `${fmt.grouped(Math.round(star.lightYears))} light years away`
            : 'distance not measured',
        ),
      )

      if (pin) {
        if (star.lore) {
          const p = el('p', 'map-sheet-lead')
          p.append(
            el('strong', undefined, `${star.lore.lang}`),
            star.lore.from ? ` ${star.lore.from} — ` : ' — ',
            star.lore.meaning,
          )
          nodes.push(p)
        }
        // The source and nothing else. The designation and the constellation
        // are already the kicker, which is on both densities of this card — a
        // provenance line that restates the heading is the second copy this
        // file's other cards are careful not to make.
        nodes.push(el('p', 'map-sheet-meta', star.source))
        nodes.push(el('p', 'map-sheet-note', SKY_NOTE))
      }
      render(nodes, pin)
    },

    /**
     * The sun or the moon.
     *
     * The hero is the **sub-point** — where the body is directly overhead —
     * because that is the fact that ties the thing in the sky to the map under
     * it: the sun's is the pole of the terminator already drawn, and saying so
     * is what makes the two one statement rather than two decorations.
     *
     * The moon's phase carries the Hijri date beside it, and that is not a
     * flourish. This site keeps a Makkah clock and an Umm al-Qura calendar
     * (`_map/hijri.ts`), and the crescent is the fact underneath both — the one
     * place on the map where an astronomical drawing and a calendar the site
     * already publishes are the same object seen twice.
     */
    showBody(body, hijri, pin) {
      const nodes: Node[] = []
      const isMoon = body.kind === 'moon'
      nodes.push(kicker([isMoon ? 'the moon' : 'the sun', isMoon ? body.phase?.name : null]))
      nodes.push(el('h2', 'island-sheet-title', isMoon ? 'The moon' : 'The sun'))

      nodes.push(
        hero(
          fmt.coordinate(body.sub.lat, body.sub.lng),
          isMoon ? 'directly overhead there now' : 'directly overhead there now — the sun is at its zenith',
        ),
      )

      if (isMoon && body.phase) {
        const p = el('p', 'map-sheet-stat')
        p.append(
          el('strong', undefined, `${Math.round(body.phase.fraction * 100)}% lit`),
          hijri ? ` · ${hijri}` : '',
        )
        nodes.push(p)
      }

      if (pin) {
        nodes.push(
          el(
            'p',
            'map-sheet-lead',
            isMoon
              ? 'The moon is drawn at its true angular size and in its true phase, ' +
                  'with the lit limb turned toward where the sun actually is. It goes ' +
                  'behind the earth, and comes back, at the moment it really does.'
              : 'The terminator across the globe is this point’s own edge: the line ' +
                  'where the sun is exactly on the horizon. The sun is only in frame ' +
                  'when the centre of the map is in night — in daylight it is behind ' +
                  'you, which is why the earth in front of you is lit.',
          ),
        )
        nodes.push(
          el(
            'p',
            'map-sheet-meta',
            `${fmt.grouped(Math.round(body.km))} km from the earth’s centre`,
          ),
        )
        nodes.push(el('p', 'map-sheet-note', SKY_NOTE))
      }
      render(nodes, pin)
    },

    close() {
      pinned = false
      if (dialog.open) dialog.close()
    },
    isOpen: () => dialog.open,
    isPinned: () => pinned,
    destroy() {
      // The two the docked mode wired by hand. `show()` gave us the card
      // without the platform's Escape or light dismiss, and a listener left on
      // `document` outlives the island that needed it.
      document.removeEventListener('keydown', onDocKey)
      document.removeEventListener('pointerdown', onDocDown, true)
      dialog.remove()
    },
  }
}
