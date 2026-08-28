import type { Article } from '@shared/types';
import type { Section } from '../../constants/theme';
import type { InstrumentColumns } from './markets';
import { prepareSwipeCards, type SwipeCard } from './rank';
import type { Card } from './types';

type DataSection = Exclude<Section, 'news'>;

/** VIX measures the price of expected volatility over the coming month. Its
 * provider files it as a market series, but the reader-facing deck is about
 * what the reading means, so it belongs with beliefs and scheduled events. */
const isForwardMarket = (card: Card) => card.id === 'vix';

/**
 * Consolidate the concrete card pools into substantial swipe decks.
 *
 * Keeping a tab for every payload family produced one- and two-card columns,
 * a rail wider than the phone, and seven destinations that changed length
 * dramatically with ordinary missing data. `now` and `next` remain truthful
 * when a pool is absent, while giving the vertical gesture enough material to
 * feel like the news river instead of a detail screen.
 */
export function buildSwipeSections(
  columns: InstrumentColumns,
  conditions: Card[],
  articles: Article[],
): Record<DataSection, SwipeCard[]> {
  const currentMarkets = columns.markets.filter((card) => !isForwardMarket(card));
  const forwardMarkets = columns.markets.filter(isForwardMarket);

  return {
    now: prepareSwipeCards(
      [
        ...conditions,
        ...columns.straits,
        ...columns.attention,
        ...currentMarkets,
        ...columns.currencies,
      ],
      articles,
    ),
    next: prepareSwipeCards(
      [...columns.predictions, ...forwardMarkets, ...columns.calendar],
      articles,
    ),
  };
}
