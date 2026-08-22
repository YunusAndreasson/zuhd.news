import type { Article, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';

/**
 * The order of the news river.
 *
 * The app used to be four vertical lists behind four horizontal tabs, one per
 * category. The horizontal axis now carries sections (news / markets /
 * conditions), so news is a single column — and a single column has to answer
 * a question four columns never asked: which story is first?
 *
 * Answer: the one the most newsrooms thought mattered. `eventCoverage` is a
 * count of outlets that covered the same event, so it is a measure of
 * newsworthiness we did not have to invent, and one the reader can feel even
 * without being told. Recency breaks ties.
 *
 * Category survives as a kicker on each card, not as a lane. Keeping lanes
 * would have meant thirty swipes to reach a tech story; ordering by merit puts
 * the tech story that earned it near the top.
 */

/** A feed article with its real category attached. The feed groups by
 *  category, so the field is free here and guessing it back from concept tags
 *  (which never name a category) is what the old related-story rows had to do. */
export type RiverArticle = Article & { category: Category };

/**
 * How many consecutive cards may share a category before the river forces a
 * change of subject. Two, not one: a genuine pair — the strike and the
 * response — belongs together, and alternating every single card would shuffle
 * that pair apart. Three in a row is where a river starts reading as a lane.
 */
export const MAX_SAME_CATEGORY_RUN = 2;

/** Newsworthiness first, recency second, slug last so the order is total and
 *  a re-sort of identical input can never reshuffle the column under a reader. */
export function compareNewsworthiness(a: RiverArticle, b: RiverArticle): number {
  const coverage = (b.eventCoverage ?? 0) - (a.eventCoverage ?? 0);
  if (coverage !== 0) return coverage;
  const recency = b.addedAt - a.addedAt;
  if (recency !== 0) return recency;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/**
 * Greedy de-clumping: walk the ranked list and, whenever the run cap is hit,
 * promote the nearest article of a different category instead of the next one.
 * Everything else keeps its rank, so a promoted article never jumps more than
 * the length of the clump it broke.
 *
 * O(n²) on a 40-item feed, deliberately — the alternative is a bucketed merge
 * that is harder to read and reason about for no measurable gain at this size.
 */
export function capConsecutive(
  ranked: RiverArticle[],
  max = MAX_SAME_CATEGORY_RUN,
): RiverArticle[] {
  if (max < 1) return [...ranked];
  const pool = [...ranked];
  const out: RiverArticle[] = [];
  let runCategory: Category | null = null;
  let runLength = 0;

  while (pool.length > 0) {
    let index = 0;
    if (runLength >= max) {
      const alternative = pool.findIndex((a) => a.category !== runCategory);
      // -1 means every remaining article shares the category; the cap has
      // nothing left to trade with, so the tail runs long rather than stalling.
      if (alternative >= 0) index = alternative;
    }
    const picked = pool.splice(index, 1)[0];
    if (!picked) break;
    if (picked.category === runCategory) {
      runLength += 1;
    } else {
      runCategory = picked.category;
      runLength = 1;
    }
    out.push(picked);
  }

  return out;
}

/** Flatten the category-grouped feed into the ordered river. */
export function orderNewsRiver(grouped: Record<Category, Article[]>): RiverArticle[] {
  const flat: RiverArticle[] = [];
  for (const category of CATEGORIES) {
    for (const article of grouped[category] ?? []) flat.push({ ...article, category });
  }
  flat.sort(compareNewsworthiness);
  return capConsecutive(flat);
}
