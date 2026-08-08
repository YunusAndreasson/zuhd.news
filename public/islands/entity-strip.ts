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
// The mechanism is `_disclosure` and the contents are `_entity-panel`, both
// shared with the map's story card. That is the point: the strip is the same
// row on both surfaces and used to behave — and then render — differently on
// each, and the surface a reader happens to be on is not a reason for a chip to
// mean something else. What is left in this file is what is genuinely this
// page's: the class names, and the fact that a mention row here is an ordinary
// link, because the reader is on an article page and another article page is
// where it leads.
//
// `/e/{id}` is untouched and still canonical — the chip's `href` is real, so a
// modified click, a crawler and a JS-less browser all still reach the page that
// carries the mentions and the whole record. Nothing routes a reader there by
// an ordinary click any more.

import { disclosure, type Built } from './_disclosure'
import { el } from './_dom'
import {
  buildEntityPanel,
  cachedEntity,
  type EntityPanelClasses,
  type EntityRecord,
  fetchEntity,
} from './_entity-panel'

const CLASSES: EntityPanelClasses = {
  loading: 'article-entity-loading',
  head: 'article-entity-head',
  hero: 'article-entity-hero',
  value: 'article-entity-value',
  delta: 'article-entity-delta',
  figure: 'article-entity-figure',
  full: 'article-entity-full',
  more: 'article-entity-more',
  provenance: 'article-entity-provenance',
  recent: 'article-entity-recent',
  section: 'article-entity-section',
  mentions: 'article-entity-mentions',
  mentionTime: 'article-entity-mention-time',
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

  const build = (record: EntityRecord | null, id: string): Built =>
    buildEntityPanel({
      record,
      id,
      classes: CLASSES,
      box: panel.panel,
      mentionLink: (m) => {
        const link = el('a', 'article-entity-mention-title', m.title)
        link.href = `/a/${m.slug}`
        return link
      },
    })

  for (const chip of chips) {
    const id = chip.dataset.id
    if (!id) continue
    panel.bind(
      id,
      chip,
      async () => build(await fetchEntity(id), id),
      () => {
        const hit = cachedEntity(id)
        return hit ? build(hit, id) : null
      },
    )
  }

  return () => panel.destroy()
}
