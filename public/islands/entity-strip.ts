// The article page's `follows` strip, answered under itself.
//
// A chip used to open `entity-sheet`: a 44rem `<dialog>` with a scrim and a
// backdrop blur over the article being read, carrying the indicator's header,
// its chart, "Mentioned in · 30" and a link to `/e/{id}`. The chart was the
// only part of that anyone had asked for. What a chip is actually asked is
// narrow — *this story is about Brent crude; what is Brent crude doing?* — and
// the panel that answers it belongs where the question was asked, not over the
// top of the sentence that raised it.
//
// This is the same mechanism the map's story card uses (`_disclosure`), which
// is the point: the strip is the same row on both surfaces and behaved
// differently on each, and the surface a reader happens to be on is not a
// reason for a chip to mean something else.
//
// `/e/{id}` is untouched and still canonical — the chip's `href` is real, so a
// modified click, a crawler and a JS-less browser all still reach the page that
// carries the mentions and the whole record. Nothing routes a reader there by
// an ordinary click any more.

import { createChart } from './_chart'
import { disclosure, el, moreLink, type Built } from './_disclosure'

interface Mention {
  slug: string
  title: string
  date: string
  dateFormatted: string
  source: string
}

/** `/api/entity/{id}.json` — the same payload `/e/{id}` is generated from. */
interface EntityRecord {
  id: string
  label: string
  kind: string
  sourceLabel?: string | null
  unit?: string
  currentFormatted: string
  deltaLabel?: string | null
  deltaTone?: string | null
  caption?: string
  values: number[]
  periods: string[]
  asOf?: string
  mentions?: Mention[]
}

const cache = new Map<string, EntityRecord>()

const fetchEntity = async (id: string): Promise<EntityRecord | null> => {
  const hit = cache.get(id)
  if (hit) return hit
  try {
    const res = await fetch(`/api/entity/${encodeURIComponent(id)}.json`, {
      cache: 'force-cache',
    })
    if (!res.ok) return null
    const record = (await res.json()) as EntityRecord
    cache.set(id, record)
    return record
  } catch {
    return null
  }
}

export function mount(container: HTMLElement): () => void {
  const chips = Array.from(
    container.querySelectorAll<HTMLAnchorElement>('.article-entity-chip[data-id]'),
  )
  if (!chips.length) return () => {}

  // One panel for the strip rather than one per chip: two charts stacked would
  // push the first out of view as the second arrived, and the reader asked
  // about one indicator.
  //
  // No `scrollIntoView`: the map's card is capped at 50vh so a panel there
  // opens below a fold the reader cannot see, but this one opens in ordinary
  // document flow directly under the chip that was pressed. Scrolling would be
  // the page lurching for no reason.
  const panel = disclosure('article-entity-panel', {
    loadingClass: 'article-entity-loading',
  })
  container.append(panel.panel)

  const build = (record: EntityRecord | null, id: string): Built => {
    const body = document.createDocumentFragment()
    if (!record) {
      body.append(el('p', 'article-entity-loading', 'Could not load this series.'))
      return { node: body }
    }

    body.append(
      el('p', 'article-entity-head', [record.kind, record.sourceLabel].filter(Boolean).join(' · ')),
    )
    const hero = el('p', 'article-entity-hero')
    hero.append(el('span', 'article-entity-value', record.currentFormatted))
    if (record.deltaLabel) {
      const tone = record.deltaTone === 'pos' || record.deltaTone === 'neg' ? record.deltaTone : ''
      hero.append(el('span', `article-entity-delta ${tone}`.trim(), record.deltaLabel))
    }
    body.append(hero)

    // The options `/e/{id}` and the map's card both hand the chart, so the
    // series a reader sees on any of the three cannot disagree about what the
    // rule marks or which direction is which.
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
      className: 'article-entity-figure',
    })
    if (chart) body.append(chart.element)

    // The rest of the record, under the chart rather than at `/e/{id}` — the
    // provenance of the last observation and the stories that cite it. On this
    // surface those rows are ordinary links: the reader is already on an
    // article page, and another article page is where they lead.
    const mentions = record.mentions ?? []
    const asOf = record.asOf ? `as of ${record.asOf}` : null
    if (mentions.length || asOf) {
      body.append(
        ...moreLink({
          labels: ['full record →', 'less ↑'],
          href: `/e/${encodeURIComponent(id)}`,
          box: panel.panel,
          linkClass: 'article-entity-full',
          moreClass: 'article-entity-more',
          fill: (into) => {
            const provenance = [asOf, record.sourceLabel || null].filter(Boolean).join(' · ')
            if (provenance) into.append(el('p', 'article-entity-provenance', provenance))
            if (!mentions.length) return
            into.append(el('p', 'article-entity-section', `Cited in · ${mentions.length}`))
            const list = el('ul', 'article-entity-mentions')
            for (const m of mentions.slice(0, 8)) {
              const li = el('li')
              const link = el('a', 'article-entity-mention-title', m.title)
              link.href = `/a/${m.slug}`
              li.append(link, el('time', 'article-entity-mention-time', m.dateFormatted))
              list.append(li)
            }
            into.append(list)
          },
        }),
      )
    }

    // The chart registers listeners on nodes it created; the panel owns their
    // lifetime and hands them back when it is replaced or closed.
    return { node: body, dispose: () => chart?.destroy() }
  }

  for (const chip of chips) {
    const id = chip.dataset.id
    if (!id) continue
    panel.bind(
      id,
      chip,
      async () => build(await fetchEntity(id), id),
      () => {
        const hit = cache.get(id)
        return hit ? build(hit, id) : null
      },
    )
  }

  return () => panel.destroy()
}
