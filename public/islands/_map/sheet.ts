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
import { createSparkline } from './chart'
import * as fmt from './format'
import type {
  ConflictEvent,
  GdacsAlert,
  GdacsDetail,
  MapChokepoint,
  VesselField,
} from './types'

const APP_IOS = 'https://apps.apple.com/us/app/zuhd-news/id6760964753'
const APP_ANDROID = 'https://play.google.com/store/apps/details?id=news.zuhd.app'
const OPEN_COUNT_KEY = 'zuhd-map-opens'
/** Only mention the app once the map has clearly been found useful. */
const APP_PROMPT_AFTER = 4

export interface Sheet {
  element: HTMLDialogElement
  showGdacs(alert: GdacsAlert, detail: GdacsDetail | null, pinned: boolean): void
  showChokepoint(cp: MapChokepoint, pinned: boolean): void
  showConflict(event: ConflictEvent, window: string | null, pinned: boolean): void
  close(): void
  isOpen(): boolean
  isPinned(): boolean
  pin(): void
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

export function relativeTime(ts: number, now = Date.now()) {
  const mins = Math.round((now - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function bumpOpenCount(): number {
  try {
    const next = Number(localStorage.getItem(OPEN_COUNT_KEY) || '0') + 1
    localStorage.setItem(OPEN_COUNT_KEY, String(next))
    return next
  } catch {
    return 0
  }
}

function appLine(): HTMLElement | null {
  if (bumpOpenCount() < APP_PROMPT_AFTER) return null
  const p = el('p', 'map-sheet-app')
  p.append('Carry the map with you — ')
  const ios = el('a', undefined, 'iPhone') as HTMLAnchorElement
  ios.href = APP_IOS
  ios.rel = 'noopener'
  const android = el('a', undefined, 'Android') as HTMLAnchorElement
  android.href = APP_ANDROID
  android.rel = 'noopener'
  p.append(ios, ' · ', android)
  return p
}

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

  const closeForm = el('form', 'island-sheet-close-form') as HTMLFormElement
  closeForm.method = 'dialog'
  const closeBtn = el('button', 'island-sheet-close', '×') as HTMLButtonElement
  closeBtn.type = 'submit'
  closeBtn.setAttribute('aria-label', 'Close')
  closeForm.append(closeBtn)

  const inner = el('div', 'island-sheet-inner')
  dialog.append(closeForm, inner)
  document.body.append(dialog)

  let pinned = false
  dialog.addEventListener('close', () => {
    pinned = false
  })

  // Hover opens the sheet non-modally, so the map underneath stays live and
  // the pointer can move straight to the next beacon. Clicking promotes the
  // same sheet to a real modal — committed reading, backdrop and all. A
  // pinned sheet ignores hover entirely, so it never vanishes mid-read.
  const open = (pin: boolean): boolean => {
    if (pinned && !pin) return false
    if (pin) {
      if (dialog.open && !pinned) dialog.close()
      pinned = true
      dialog.classList.remove('is-peek')
      if (!dialog.open) dialog.showModal()
    } else {
      dialog.classList.add('is-peek')
      if (!dialog.open) dialog.show()
    }
    return true
  }

  const render = (nodes: Node[], pin: boolean) => {
    if (pinned && !pin) return
    // The app line used to hang off the story sheet, which the map no longer
    // opens — stories now read in a popup anchored to their own coordinate. It
    // belongs on whichever sheet the reader has actually committed to, and only
    // once they have opened enough of them to have found the map useful.
    if (pin) {
      const app = appLine()
      if (app) nodes = [...nodes, app]
    }
    inner.replaceChildren(...nodes)
    open(pin)
  }

  const kicker = (parts: Array<string | null | undefined>) =>
    el('p', 'map-sheet-kicker', parts.filter(Boolean).join(' · '))

  /** The focal number, with its supporting clause beside it. */
  const hero = (focal: string, secondary?: string) => {
    const p = el('p', 'map-sheet-hero')
    p.append(el('strong', 'map-sheet-hero-focal', focal))
    if (secondary) p.append(el('span', 'map-sheet-hero-note', secondary))
    return p
  }

  const readMore = (href: string, label: string) => {
    const a = el('a', 'map-sheet-link', label) as HTMLAnchorElement
    a.href = href
    return a
  }

  const relatedList = (items: Array<{ slug: string; title: string }>, label: string): Node[] => {
    if (!items.length) return []
    const list = el('ul', 'map-sheet-more')
    for (const a of items.slice(0, 5)) {
      const li = el('li')
      const link = el('a', undefined, a.title) as HTMLAnchorElement
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

    showChokepoint(cp, pin) {
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
        const noun = VESSEL_NOUN[field] ?? 'vessels'
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
        // it is a step change or the tail of a spike.
        const spark = createSparkline({
          values: cp.series?.total ?? [],
          periods: cp.series?.periods ?? [],
          reference: cp.baseline90Avg?.n_total,
          direction: delta,
          label: `Daily vessel transits at ${cp.name} over the last ${cp.series?.total?.length ?? 0} days`,
        })
        if (spark) {
          const figure = el('figure', 'map-sheet-figure')
          figure.append(spark)
          // The series is undifferentiated traffic — PortWatch publishes the
          // per-class split only as averages, never as a time series — so the
          // caption must stop it being read as the headline vessel class.
          figure.append(
            el(
              'figcaption',
              'map-sheet-figcaption',
              'All vessel traffic, daily · rule marks the 90-day average',
            ),
          )
          nodes.push(figure)
        }

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
      render(nodes, pin)
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

    close() {
      pinned = false
      if (dialog.open) dialog.close()
    },
    isOpen: () => dialog.open,
    isPinned: () => pinned,
    pin() {
      pinned = true
    },
    destroy() {
      dialog.remove()
    },
  }
}
