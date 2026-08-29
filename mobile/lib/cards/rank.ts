import type { Article } from '@shared/types';
import type { CardSeries, GraphCard } from './types';

/** Ranking remains numeric and unformatted so unlike display units are never compared. */
interface CardRanking {
  urgent: number;
  newsRelevance: number;
  normalizedMovement: number;
  editorialOrder: number;
}

export type SwipeCard = GraphCard;

type RankedCard = { card: GraphCard; ranking: CardRanking };

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

function newsRelevance(card: GraphCard, articles: Article[]): number {
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

function compareRanked(a: RankedCard, b: RankedCard): number {
  const urgent = b.ranking.urgent - a.ranking.urgent;
  if (urgent !== 0) return urgent;
  const news = b.ranking.newsRelevance - a.ranking.newsRelevance;
  if (news !== 0) return news;
  const movement = b.ranking.normalizedMovement - a.ranking.normalizedMovement;
  if (movement !== 0) return movement;
  const editorial = a.ranking.editorialOrder - b.ranking.editorialOrder;
  if (editorial !== 0) return editorial;
  return a.card.id.localeCompare(b.card.id);
}

/** Keep a deck from turning into a hidden sub-tab. Two related pieces may
 * belong together; a third consecutive kicker makes vertical swiping feel as
 * though the reader entered a lane they did not choose. Promote the nearest
 * different subject, then resume the ranked order. */
function capConsecutiveKickers(ranked: RankedCard[], max = 2): RankedCard[] {
  const pool = [...ranked];
  const result: RankedCard[] = [];
  let kicker = '';
  let run = 0;
  while (pool.length > 0) {
    let index = 0;
    if (run >= max) {
      const alternative = pool.findIndex(({ card }) => (card.kicker ?? '') !== kicker);
      if (alternative >= 0) index = alternative;
    }
    const card = pool.splice(index, 1)[0];
    if (!card) break;
    if ((card.card.kicker ?? '') === kicker) run += 1;
    else {
      kicker = card.card.kicker ?? '';
      run = 1;
    }
    result.push(card);
  }
  return result;
}

/**
 * Turn editorial card drafts into the swipe deck the UI may render.
 *
 * The section boundary has already guaranteed a meaningful graph. A piece
 * without explanatory copy still does not earn a full screen. Sorting is
 * lexicographic rather than a blended score so a large
 * market move can never bury a genuinely new event or a tie to today's lead.
 * A final de-clump prevents three cards of one subject becoming an accidental
 * lane while otherwise preserving the ranked order.
 */
export function prepareSwipeCards(cards: GraphCard[], articles: Article[]): SwipeCard[] {
  const prepared: RankedCard[] = [];
  cards.forEach((card, editorialOrder) => {
    if (!card.why?.trim() && !card.changed?.trim()) return;
    prepared.push({
      card,
      ranking: {
        urgent: card.lead ? 1 : 0,
        newsRelevance: newsRelevance(card, articles),
        normalizedMovement: normalizedSeriesMovement(card.series),
        editorialOrder,
      },
    });
  });
  return capConsecutiveKickers(prepared.sort(compareRanked)).map(({ card }) => card);
}
