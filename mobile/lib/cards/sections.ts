import type { Article } from '@shared/types';
import type { Section } from '../../constants/theme';
import type { InstrumentColumns } from './markets';
import { prepareSwipeCards, type SwipeCard } from './rank';
import type { Card } from './types';

type DataSection = Exclude<Section, 'news'>;

/** A primary data card must fulfil both promises: a real history and analysis
 * from the live pipeline. Editorial `whatItIs` copy remains builder fallback
 * metadata and deliberately cannot create a screen by itself. */
function hasGraphAndAnalysis(card: Card): boolean {
  if (card.kind !== 'reading' && card.kind !== 'belief') return false;
  if (!card.why?.trim() || !card.series) return false;

  const periods = card.series.periods.length;
  const validLine = (values: number[]) =>
    values.length === periods && values.filter(Number.isFinite).length >= 2;

  if (!validLine(card.series.values)) return false;
  return card.series.multi?.every((line) => validLine(line.values)) ?? true;
}

/**
 * Turn concrete payload pools into the three graph desks promised by the rail.
 *
 * Attention tables, calendars, humanitarian snapshots and currency comparison
 * tables do not enter these decks. Missing payloads simply shorten the
 * relevant deck rather than weakening the rule.
 */
export function buildSwipeSections(
  columns: InstrumentColumns,
  articles: Article[],
): Record<DataSection, SwipeCard[]> {
  return {
    markets: prepareSwipeCards(
      [...columns.markets, ...columns.currencies].filter(hasGraphAndAnalysis),
      articles,
    ),
    shipping: prepareSwipeCards(columns.straits.filter(hasGraphAndAnalysis), articles),
    outlook: prepareSwipeCards(columns.predictions.filter(hasGraphAndAnalysis), articles),
  };
}
