import type { Article } from '@shared/types';
import type { Section } from '../../constants/theme';
import type { InstrumentColumns } from './markets';
import { prepareSwipeCards, type SwipeCard } from './rank';
import type { Card, DeckCard, GraphCard } from './types';

type DataSection = Exclude<Section, 'news'>;

/** A primary data card must fulfil both promises: a real history and analysis
 * from the live pipeline. Static definition copy cannot create a screen. */
function hasGraphAndAnalysis(card: Card): card is GraphCard {
  if (card.kind !== 'reading' && card.kind !== 'belief') return false;
  if (!card.why?.trim() || !card.series) return false;

  const periods = card.series.periods.length;
  const validLine = (values: number[]) =>
    values.length === periods && values.filter(Number.isFinite).length >= 2;

  if (!validLine(card.series.values)) return false;
  return card.series.multi?.every((line) => validLine(line.values)) ?? true;
}

/**
 * The one card kind admitted without a graph, and the exemption is narrow.
 *
 * A scheduled event has no history to draw — it has not happened. What it has
 * instead is the thing the graph rule was really asking for: something that
 * changes, that the desk has written about, and that a reader can check. The
 * date is the changing quantity and `why` is still mandatory, so the promise
 * "no card without live analysis" is unbroken. What is relaxed is only the
 * assumption that live analysis always comes attached to a line.
 */
function isScheduledWithAnalysis(card: Card): card is DeckCard {
  return card.kind === 'scheduled' && Boolean(card.why?.trim()) && Boolean(card.date);
}

const admitted = (card: Card): card is DeckCard =>
  hasGraphAndAnalysis(card) || isScheduledWithAnalysis(card);

/**
 * Turn concrete payload pools into the three graph desks promised by the rail.
 *
 * Missing payloads simply shorten the relevant deck rather than weakening the
 * rule.
 */
export function buildSwipeSections(
  columns: InstrumentColumns,
  articles: Article[],
): Record<DataSection, SwipeCard[]> {
  return {
    markets: prepareSwipeCards(columns.markets.filter(hasGraphAndAnalysis), articles),
    shipping: prepareSwipeCards(columns.straits.filter(hasGraphAndAnalysis), articles),
    // Prices first, then the dates that settle them — `prepareSwipeCards` may
    // reorder, but the editorial order it breaks ties on says a live market
    // outranks a calendar entry.
    outlook: prepareSwipeCards(
      [...columns.predictions, ...columns.scheduled].filter(admitted),
      articles,
    ),
  };
}
