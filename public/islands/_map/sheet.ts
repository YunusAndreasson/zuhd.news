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
import { appPrompt } from '../_app-prompt'
import { createSparkline } from './chart'
import * as fmt from './format'
import type { TickerEntry } from './markets'
import type {
  ConflictEvent,
  GdacsAlert,
  GdacsDetail,
  GenocideSituation,
  MapChokepoint,
  MapExchange,
  VesselField,
} from './types'

export interface Sheet {
  element: HTMLDialogElement
  showGdacs(alert: GdacsAlert, detail: GdacsDetail | null, pinned: boolean): void
  showChokepoint(cp: MapChokepoint, pinned: boolean): void
  showMarket(exchange: MapExchange, pinned: boolean): void
  showIndicator(entry: TickerEntry, pinned: boolean): void
  showConflict(event: ConflictEvent, window: string | null, pinned: boolean): void
  showGenocide(situation: GenocideSituation, pinned: boolean): void
  close(): void
  isOpen(): boolean
  isPinned(): boolean
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
  const open = (pin: boolean) => {
    if (pin) {
      // `showModal` throws on an already-open dialog, so a peek has to be shut
      // before it can be promoted.
      if (dialog.open) dialog.close()
      pinned = true
      dialog.classList.remove('is-peek')
      dialog.showModal()
    } else {
      dialog.classList.add('is-peek')
      if (!dialog.open) dialog.show()
    }
  }

  const render = (nodes: Node[], pin: boolean) => {
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
    open(pin)
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

    showMarket(ex, pin) {
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

        // A quarter of closes, with a rule where the quarter started — the same
        // job the 90-day baseline does on a chokepoint. A day's move says
        // nothing about whether it is a blip or the shape of a decline.
        //
        // The tint follows the *window*, not the day. It used to take
        // `ex.changePct` while the rule sat at `values[0]`, which is two
        // different horizons in one chart: an index down 12% over the quarter
        // and up 0.3% today drew green, with its own line ending below its own
        // rule. The chart describes the line against the rule it draws, and the
        // hero above already states the day.
        const values = ex.series?.values ?? []
        const first = values[0]
        const last = values[values.length - 1]
        const windowPct =
          Number.isFinite(first) && Number.isFinite(last) && first !== 0
            ? ((last - first) / first) * 100
            : 0
        const spark = createSparkline({
          values,
          periods: ex.series?.periods ?? [],
          reference: first,
          direction: windowPct,
          palette: 'signed',
          label: `${ex.indexName} daily closes over the last ${values.length} sessions`,
        })
        if (spark) {
          const figure = el('figure', 'map-sheet-figure')
          figure.append(spark)
          // Both horizons named, each labelled, so neither has to be inferred
          // from a colour.
          const since = ex.series?.periods?.[0]
          figure.append(
            el(
              'figcaption',
              'map-sheet-figcaption',
              [
                'Daily closes',
                since ? `${fmt.pctChangeShort(windowPct)} since ${since}` : null,
                'rule marks the window’s open',
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          )
          nodes.push(figure)
        }

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
      render(nodes, pin)
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
    showIndicator(entry, pin) {
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
        const values = entry.values.filter((v) => Number.isFinite(v))
        const windowPct =
          values.length > 1 && values[0] !== 0
            ? ((values[values.length - 1] - values[0]) / values[0]) * 100
            : 0
        const spark = createSparkline({
          values: entry.values,
          periods: entry.periods,
          reference: entry.values[0],
          direction: windowPct,
          palette: 'signed',
          label: `${entry.name} over the last ${entry.values.length} days`,
        })
        if (spark) {
          const figure = el('figure', 'map-sheet-figure')
          figure.append(spark)
          const since = entry.periods[0]
          figure.append(
            el(
              'figcaption',
              'map-sheet-figcaption',
              [
                'Daily',
                since ? `${fmt.pctChangeShort(windowPct)} since ${since}` : null,
                'rule marks the window’s open',
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          )
          nodes.push(figure)
        }
        if (entry.sourceLabel) nodes.push(el('p', 'map-sheet-meta', entry.sourceLabel))
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

    close() {
      pinned = false
      if (dialog.open) dialog.close()
    },
    isOpen: () => dialog.open,
    isPinned: () => pinned,
    destroy() {
      dialog.remove()
    },
  }
}
