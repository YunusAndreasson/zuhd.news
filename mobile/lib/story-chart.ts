import type { Article } from '@shared/types';
import type { SwipeCard } from './cards/rank';
import type { GraphCard } from './cards/types';
import { type CatalogInputs, instrumentCardFor } from './instrument-catalog';

/**
 * The chart each story carries, by slug: the one series its prose cites
 * (`Article.chart`), resolved to the card a press on it opens.
 *
 * Only stories that name one are looked up, each id once — the full catalog is
 * built only while the menu is open, and a river of forty stories names two or
 * three series at most. A story whose id resolves to nothing, or to a card
 * with no line to draw (a date), carries no chart; that is the whole fallback,
 * and the odds line stands where it would have.
 */
export function storyCharts(
  stories: readonly Article[],
  inputs: CatalogInputs,
): ReadonlyMap<string, GraphCard> {
  const out = new Map<string, GraphCard>();
  const byId = new Map<string, GraphCard | null>();
  for (const story of stories) {
    const id = story.chart;
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, graphOf(instrumentCardFor(id, inputs)));
    const card = byId.get(id);
    if (card) out.set(story.slug, card);
  }
  return out;
}

function graphOf(card: SwipeCard | null): GraphCard | null {
  if (!card) return null;
  if (card.kind === 'belief') return card;
  if (card.kind === 'reading' && card.series) return card as GraphCard;
  return null;
}
