import type { Article } from '@shared/types';
import type { SettledMapContext } from '../hooks/useSettledMapContext';
import { type CountryCurrencies, linkedGaugeIds, STRIP_SLOTS, type StripItem } from './now';

/** The globe's mark for a gauge. A market signal is drawn as its exchange. */
const markIdOf = (id: string) =>
  id.startsWith('market-signal:') ? id.slice('market-signal:'.length) : id;

/** Per cent over the week. Under it a gauge has not moved in a way a reader
 *  would notice, and where it stands in view is no reason to print it. */
const NOTABLE_WEEK = 0.5;

/**
 * What the map is not already saying:
 *
 *   the settled story's gauges, a currency it names among them
 *   then what is in view and not printed on the globe, largest move first:
 *     the currencies of the countries whose capital is in view (money has no
 *     place on the globe, so the map can never show it), and the gauges the
 *     globe could not name (`marksInView`)
 *
 * A mark the globe names is left to the globe, so no number is printed twice.
 * What is in view takes a slot only for a move worth reading (`NOTABLE_WEEK`):
 * a row of pounds and indices that stood still would stand in for the week's
 * largest moves. Those are what the row shows with none of these, less the
 * ones the globe is naming: the largest moves the reader cannot already see.
 * A story's own gauges are exempt from both: the story is why they are there.
 */
export function contextualStrip(
  items: StripItem[],
  article: Pick<Article, 'slug' | 'entities'> | undefined,
  context: SettledMapContext | null,
  currencies?: CountryCurrencies,
): StripItem[] {
  const story = context && !context.exploring ? article : undefined;
  const regional = context !== null && context.clip < 60;
  const named = new Set(story?.entities?.map((entity) => entity.indicatorId));
  const inView = new Set(regional ? context.countries : []);
  const held = new Map(items.map((item) => [item.id, item]));
  // A currency the pool holds keeps the pool's slot, so the slot, its card and
  // its number stay one thing; `linkedGaugeIds` finds that one by itself.
  const told: StripItem[] = [];
  const local: StripItem[] = [];
  for (const indicator of currencies?.indicators ?? []) {
    const isNamed = named.has(indicator.id);
    if (!isNamed && !indicator.countryTags?.some((country) => inView.has(country))) continue;
    const pooled = held.get(`${indicator.id}-mover`) ?? held.get(indicator.id);
    const slot = pooled ?? currencies?.slot(indicator);
    if (!slot) continue;
    if (!isNamed) local.push(slot);
    else if (!pooled) told.push(slot);
  }
  const linked = linkedGaugeIds(items, story);
  const relevant = [...items.filter((item) => linked.has(item.id)), ...told];
  if (regional) {
    const taken = new Set(relevant.map((item) => item.id));
    const unnamed = new Set(context.unnamed);
    // One comparison across both kinds: each is a percentage over the week.
    const here = [...local, ...items.filter((item) => unnamed.has(markIdOf(item.id)))]
      .filter((item) => (item.delta.size ?? 0) >= NOTABLE_WEEK)
      .sort((a, b) => (b.delta.size ?? 0) - (a.delta.size ?? 0));
    for (const slot of here) {
      if (taken.has(slot.id)) continue;
      taken.add(slot.id);
      relevant.push(slot);
    }
  }
  if (relevant.length) return relevant.slice(0, STRIP_SLOTS);
  const printed = new Set(context?.named);
  return items.filter((item) => !printed.has(markIdOf(item.id))).slice(0, STRIP_SLOTS);
}

/**
 * The row in the order it was built, the story's links ahead of everything. A
 * slot that stays does not hold its place against a larger move that arrives:
 * the row opens at its start whenever it changes, and the start is what is
 * read. It used to keep survivors where they were and append the rest, which
 * put a lira that moved 0.4% ahead of an index that fell 2.7%.
 */
export function linksFirst(next: StripItem[], priority?: ReadonlySet<string>): StripItem[] {
  if (!priority?.size) return next;
  return [
    ...next.filter((item) => priority.has(item.id)),
    ...next.filter((item) => !priority.has(item.id)),
  ];
}
