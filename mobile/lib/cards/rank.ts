import type { Article } from '@shared/types';
import type { Card, CardFigure, CardSeries } from './types';

/** The visual a full-screen data piece promises to the pager. */
export type CardVisualization =
  | { kind: 'trend'; series: CardSeries }
  | { kind: 'comparison'; rows: NonNullable<Extract<Card, { kind: 'comparison' }>['rows']> }
  | { kind: 'distribution'; figures: CardFigure[] }
  | { kind: 'timeline'; figures: CardFigure[] };

/** Ranking remains numeric and unformatted so unlike display units are never compared. */
export interface CardRanking {
  urgent: number;
  newsRelevance: number;
  normalizedMovement: number;
  editorialOrder: number;
}

export type SwipeCard = Card & {
  visualization: CardVisualization;
  explanation: string;
  ranking: CardRanking;
};

function visualizationFor(card: Card): CardVisualization | null {
  if ((card.kind === 'reading' || card.kind === 'belief') && card.series) {
    return { kind: 'trend', series: card.series };
  }
  if (card.kind === 'comparison' && card.rows.length > 0) {
    return { kind: 'comparison', rows: card.rows };
  }
  if (card.kind === 'condition') {
    if (card.rows && card.rows.length > 0) return { kind: 'comparison', rows: card.rows };
    if (card.figures && card.figures.length > 0) {
      return {
        kind: card.visualStyle === 'timeline' ? 'timeline' : 'distribution',
        figures: card.figures,
      };
    }
  }
  return null;
}

function explanationFor(card: Card): string | null {
  const explanation = card.why?.trim() || card.whatItIs?.trim() || card.changed?.trim();
  return explanation || null;
}

function normalizedSeriesMovement(series: CardSeries): number {
  const candidates = series.multi?.map((s) => s.values) ?? [series.values];
  let strongest = 0;
  for (const values of candidates) {
    if (values.length < 2) continue;
    const changes: number[] = [];
    for (let i = 1; i < values.length; i += 1) {
      const previous = values[i - 1];
      const current = values[i];
      if (
        previous == null ||
        current == null ||
        !Number.isFinite(previous) ||
        !Number.isFinite(current)
      )
        continue;
      changes.push(Math.abs(current - previous) / Math.max(Math.abs(previous), Number.EPSILON));
    }
    const latest = changes.at(-1) ?? 0;
    const history = changes.slice(0, -1).sort((a, b) => a - b);
    const median = history[Math.floor(history.length / 2)] ?? latest;
    const normalized = median > 0 ? latest / median : latest > 0 ? 1 : 0;
    strongest = Math.max(strongest, Math.min(normalized, 10));
  }
  return strongest;
}

function normalizedMovement(visualization: CardVisualization): number {
  if (visualization.kind === 'trend') return normalizedSeriesMovement(visualization.series);
  if (visualization.kind === 'comparison') {
    const weights = visualization.rows
      .map((row) => Math.abs(row.weight ?? 0))
      .filter((weight) => Number.isFinite(weight) && weight > 0)
      .sort((a, b) => a - b);
    if (weights.length === 0) return 0;
    const largest = weights.at(-1) ?? 0;
    const median = weights[Math.floor(weights.length / 2)] ?? largest;
    return median > 0 ? Math.min(largest / median, 10) : 0;
  }
  return 0;
}

function newsRelevance(card: Card, articles: Article[]): number {
  if (!card.related || card.related.length === 0) return 0;
  const bySlug = new Map(articles.map((article, index) => [article.slug, { article, index }]));
  const matches = card.related.flatMap((related) => {
    const match = bySlug.get(related.slug);
    if (!match) return [];
    // Coverage carries editorial weight; position rewards a tie to the top of
    // the already-ranked news river without allowing position to beat coverage.
    return [(match.article.eventCoverage ?? 0) * 100 + (articles.length - match.index)];
  });
  if (matches.length === 0) return 0;
  // Use the strongest live connection, not the sum. Aggregate cards carry far
  // more topic tags than single readings, so summing let breadth masquerade as
  // importance: three incidental country matches could bury the one card tied
  // to the lead story. A tiny breadth tie-break rewards multiple real links
  // without letting them overwhelm coverage or river position.
  return Math.max(...matches) * 10 + Math.min(matches.length, 9);
}

function compareRanked(a: SwipeCard, b: SwipeCard): number {
  const urgent = b.ranking.urgent - a.ranking.urgent;
  if (urgent !== 0) return urgent;
  const news = b.ranking.newsRelevance - a.ranking.newsRelevance;
  if (news !== 0) return news;
  const movement = b.ranking.normalizedMovement - a.ranking.normalizedMovement;
  if (movement !== 0) return movement;
  const editorial = a.ranking.editorialOrder - b.ranking.editorialOrder;
  if (editorial !== 0) return editorial;
  return a.id.localeCompare(b.id);
}

/** Keep a deck from turning into a hidden sub-tab. Two related pieces may
 * belong together; a third consecutive kicker makes vertical swiping feel as
 * though the reader entered a lane they did not choose. Promote the nearest
 * different subject, then resume the ranked order. */
function capConsecutiveKickers(ranked: SwipeCard[], max = 2): SwipeCard[] {
  const pool = [...ranked];
  const result: SwipeCard[] = [];
  let kicker = '';
  let run = 0;
  while (pool.length > 0) {
    let index = 0;
    if (run >= max) {
      const alternative = pool.findIndex((card) => card.kicker !== kicker);
      if (alternative >= 0) index = alternative;
    }
    const card = pool.splice(index, 1)[0];
    if (!card) break;
    if (card.kicker === kicker) run += 1;
    else {
      kicker = card.kicker;
      run = 1;
    }
    result.push(card);
  }
  return result;
}

/**
 * Turn editorial card drafts into the swipe deck the UI may render.
 *
 * A piece without both a meaningful visual and an explanation does not earn a
 * full screen. Sorting is lexicographic rather than a blended score so a large
 * market move can never bury a genuinely new event or a tie to today's lead.
 * A final de-clump prevents three cards of one subject becoming an accidental
 * lane while otherwise preserving the ranked order.
 */
export function prepareSwipeCards(cards: Card[], articles: Article[]): SwipeCard[] {
  const prepared: SwipeCard[] = [];
  cards.forEach((card, editorialOrder) => {
    const visualization = visualizationFor(card);
    const explanation = explanationFor(card);
    if (!visualization || !explanation) return;
    prepared.push({
      ...card,
      visualization,
      explanation,
      ranking: {
        urgent: card.lead ? 1 : 0,
        newsRelevance: newsRelevance(card, articles),
        normalizedMovement: normalizedMovement(visualization),
        editorialOrder,
      },
    });
  });
  return capConsecutiveKickers(prepared.sort(compareRanked));
}
