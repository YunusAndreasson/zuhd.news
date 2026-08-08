// What a `follows` chip opens, wherever it is pressed.
//
// Two surfaces carry an indicator strip — the article page and the map's story
// card — and `_disclosure.ts` already made them agree about the *behaviour*.
// They still each built the panel's contents, in code that matched line for
// line down to the comments: the same fetch, the same cache, the same hero, the
// same twelve chart options, the same `full record →` second density, the same
// eight-row mention list. Only the class names and the mention row's link
// differed, which is exactly the split `_disclosure.ts` already makes — the
// rendering is a parameter, the thing being rendered is not.
//
// The chart options in particular were a hand-maintained invariant. Both call
// sites carried a comment promising that the series here and the one on
// `/e/{id}` "cannot disagree about what the rule marks or which direction is
// which", and nothing enforced it: the promise was two copies staying equal.
// There is one copy now, which is what makes it true rather than intended.

import { createChart } from './_chart'
import { moreLink, type Built } from './_disclosure'
import { el } from './_dom'

export interface EntityMention {
  slug: string
  title: string
  date: string
  dateFormatted: string
  source: string
}

/**
 * `/api/entity/{id}.json`.
 *
 * `mentions` is read only by the record's second density — the panel opens on
 * the chart alone, because "what is Brent crude doing?" is the whole of what a
 * chip is being asked.
 */
export interface EntityRecord {
  id: string
  label: string
  kind: string
  sourceLabel?: string | null
  unit?: string
  currentFormatted: string
  deltaLabel?: string | null
  deltaTone?: string | null
  caption?: string
  /**
   * The dispatch's prose, written once a day by `narrate-indicators.js`.
   *
   * `standing` is what the instrument is; `recent` is what has happened and
   * why; `citations` are the slugs `recent` was built from, a subset of
   * `mentions`. All optional — the build spreads them conditionally, so a
   * payload from before that stage carries none and every surface renders
   * exactly what it rendered before.
   */
  standing?: string
  recent?: string
  /**
   * The stories `recent` was written from, already resolved to rows.
   *
   * Not slugs to be looked up in `mentions`: a `wiki-*` or `poly-*` id appears
   * in no article's frontmatter, so those records have no `mentions` and the
   * lookup returned nothing on precisely the blocks this prose is for.
   */
  cited?: EntityMention[]
  /** The series filters non-finite points itself; `series-chart` declares the
   *  same shape against the same endpoint. */
  values: number[]
  periods: string[]
  /** The last observation's own date, which the chart's caption does not carry. */
  asOf?: string
  mentions?: EntityMention[]
}

/**
 * One cache per document rather than one per island.
 *
 * These were two Maps holding the same records under the same keys — a
 * module-level one in `entity-strip` and a closure-level one in `popup`. No
 * page mounts both today, so this changes nothing that ships; it is here
 * because a second cache is a second answer waiting to happen.
 */
const cache = new Map<string, EntityRecord>()

/** The record, or null. `force-cache` because the payload is build-time output
 *  and a chip pressed twice must not cost two round trips. */
export const fetchEntity = async (id: string): Promise<EntityRecord | null> => {
  const hit = cache.get(id)
  if (hit) return hit
  try {
    const res = await fetch(`/api/entity/${encodeURIComponent(id)}.json`, { cache: 'force-cache' })
    if (!res.ok) return null
    const record = (await res.json()) as EntityRecord
    cache.set(id, record)
    return record
  } catch {
    return null
  }
}

/** Whatever this surface already holds, for the no-wait path. */
export const cachedEntity = (id: string): EntityRecord | undefined => cache.get(id)

/**
 * The class names each surface paints the panel with. The map is dark chrome
 * and the article is the site palette, so nothing here can be shared — which is
 * the same reason `_disclosure.ts` takes its class names as arguments.
 */
export interface EntityPanelClasses {
  loading: string
  head: string
  hero: string
  value: string
  delta: string
  figure: string
  full: string
  more: string
  provenance: string
  /** The `recent` paragraph — the dispatch's account of what has happened. */
  recent: string
  section: string
  mentions: string
  /** The `<li>`. The article page's list needs no class of its own. */
  mention?: string
  mentionTime: string
}

export interface EntityPanelOptions {
  record: EntityRecord | null
  id: string
  classes: EntityPanelClasses
  /** The disclosure's own panel, which `moreLink` grows. */
  box: HTMLElement
  /**
   * One row of the mention list.
   *
   * The article page returns a plain `<a href="/a/{slug}">`, because the reader
   * is on an article page and another article page is where the row leads. The
   * map returns `storyLink`, which flies the camera instead of throwing away
   * the view the reader built. Same list, two different meanings of "go there".
   */
  mentionLink: (m: EntityMention) => Node
}

/**
 * The panel's contents, as a `Built` for `disclosure().bind`.
 *
 * `dispose` is the chart's: it registers listeners on nodes it created, and the
 * panel owns their lifetime and hands them back when it is replaced or closed.
 */
export const buildEntityPanel = ({
  record,
  id,
  classes,
  box,
  mentionLink,
}: EntityPanelOptions): Built => {
  const body = document.createDocumentFragment()
  if (!record) {
    body.append(el('p', classes.loading, 'Could not load this series.'))
    return { node: body }
  }

  body.append(el('p', classes.head, [record.kind, record.sourceLabel].filter(Boolean).join(' · ')))

  const hero = el('p', classes.hero)
  hero.append(el('span', classes.value, record.currentFormatted))
  if (record.deltaLabel) {
    const tone = record.deltaTone === 'pos' || record.deltaTone === 'neg' ? record.deltaTone : ''
    hero.append(el('span', `${classes.delta} ${tone}`.trim(), record.deltaLabel))
  }
  body.append(hero)

  // The one copy of the options. `/e/{id}` is generated from the same record by
  // `scripts/build/entity-pages.js`, so what a reader sees on the article page,
  // on the map and on the indicator's own page is one chart of one series.
  const chart = createChart({
    values: record.values ?? [],
    periods: record.periods ?? [],
    reference: 'open',
    referenceLabel: 'the window’s open',
    direction: 'window',
    palette: 'signed',
    unit: record.unit,
    step: record.kind === 'MONTHLY' ? 'months' : 'days',
    label: record.label,
    caption: record.caption,
    className: classes.figure,
  })
  if (chart) body.append(chart.element)

  /**
   * What has happened, under the chart it is about.
   *
   * The question a chip is asked is *this story is about Brent crude — what is
   * Brent crude doing?*, and until now the whole answer was a line and a
   * percentage: the reader could see the shape and had no way to learn what
   * made it. One sentence of cause is the difference between a chart and an
   * explanation, and it costs one paragraph in a panel that already opens.
   *
   * `standing` is deliberately **not** rendered here. On the map the row that
   * opened this panel already carries it as its `title`, and on the article page
   * the chip sits inside a sentence that has just named the thing — so printing
   * a definition would be the panel answering a question the reader did not ask
   * before the one they did. It stays on `/e/{id}`, where a reader has come for
   * the whole record.
   */
  if (record.recent) body.append(el('p', classes.recent, record.recent))

  // The record's second density, under the chart rather than at `/e/{id}`.
  //
  // The panel opens on the chart alone because that is what the chip is being
  // asked, and "Mentioned in · 30" answered a question nobody had put yet. But a
  // reader who then puts it was being sent off to the entity page for the
  // answer — the same navigation this panel exists to stop making. So the rest
  // of the record opens here: when the last observation was taken, who
  // publishes it, and the stories that cite it.
  const mentions = record.mentions ?? []
  const asOf = record.asOf ? `as of ${record.asOf}` : null
  if (mentions.length || asOf) {
    body.append(
      ...moreLink({
        labels: ['full record →', 'less ↑'],
        href: `/e/${encodeURIComponent(id)}`,
        box,
        linkClass: classes.full,
        moreClass: classes.more,
        fill: (into) => {
          const provenance = [asOf, record.sourceLabel || null].filter(Boolean).join(' · ')
          if (provenance) into.append(el('p', classes.provenance, provenance))
          if (!mentions.length) return
          into.append(el('p', classes.section, `Cited in · ${mentions.length}`))
          const list = el('ul', classes.mentions)
          // Eight. On the map the panel sits inside a card capped at 50vh, and
          // thirty rows is a scroll with no bottom; the article page follows it
          // so the two lists are the same list.
          for (const m of mentions.slice(0, 8)) {
            const li = el('li', classes.mention)
            li.append(mentionLink(m), el('time', classes.mentionTime, m.dateFormatted))
            list.append(li)
          }
          into.append(list)
        },
      }),
    )
  }

  return { node: body, dispose: () => chart?.destroy() }
}
