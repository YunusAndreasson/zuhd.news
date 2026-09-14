import type { Article, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';
import { articleTime } from './article-utils';
import { DAY_MS } from './time';

/** A feed article with its original category retained for its kicker. */
export type RiverArticle = Article & { category: Category };

/** Newest story first, using the same timestamp as the visible dateline.
 * Slug breaks exact ties deterministically; coverage never changes recency. */
function compareNewsRecency(a: RiverArticle, b: RiverArticle): number {
  const recency = articleTime(b) - articleTime(a);
  if (recency !== 0) return recency;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/** Contiguous category bands for the scrubber, newest first within each band. */
export function orderNewsRiver(grouped: Record<Category, Article[]>): RiverArticle[] {
  const flat: RiverArticle[] = [];
  for (const category of CATEGORIES) {
    const stories = (grouped[category] ?? []).map((article) => ({ ...article, category }));
    flat.push(...stories.sort(compareNewsRecency));
  }
  return flat;
}

/** How much of the river the app shows: one day of news. */
export const RIVER_WINDOW_MS = DAY_MS;

/**
 * The last day of the river, preserving its category and time order.
 *
 * The feed carries several days of stories, and swiping, the globe's lights,
 * the found ring and the list all read the same river, so a story from three
 * days ago was one more card to swipe past and one more light to find. The
 * window is measured on the dateline's own timestamp (`articleTime`).
 *
 * Two exceptions, both so the screen never lies by omission:
 * - **A stalled pipeline does not empty the globe.** When nothing is inside the
 *   window, it is anchored on the newest story instead — the last day the desk
 *   published, each card still dated by its kicker.
 * - **A story a reader asked for is kept** (`keep`): a saved story, a
 *   notification, a related story from another sheet. It is outside the day,
 *   but it was requested by name, and the deck can only show what the river
 *   holds.
 */
export function recentRiver(
  river: readonly RiverArticle[],
  now: number,
  keep: ReadonlySet<string> = new Set(),
): RiverArticle[] {
  // The first category need not contain the newest story in the feed.
  const newest = river.reduce(
    (latest, article) => Math.max(latest, articleTime(article)),
    -Infinity,
  );
  const anchor = newest >= now - RIVER_WINDOW_MS ? now : newest;
  const from = anchor - RIVER_WINDOW_MS;
  return river.filter((a) => articleTime(a) >= from || keep.has(a.slug));
}
