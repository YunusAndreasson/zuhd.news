import type { Article, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';
import { articleTime } from './article-utils';
import { DAY_MS } from './time';

/** A feed article with its original category retained for its kicker. */
export type RiverArticle = Article & { category: Category };

/** Newest story first, using the same timestamp as the visible dateline.
 * Slug breaks exact ties deterministically; coverage and category never
 * promote an older story above a newer one. */
function compareNewsRecency(a: RiverArticle, b: RiverArticle): number {
  const recency = articleTime(b) - articleTime(a);
  if (recency !== 0) return recency;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/** Flatten every category into one chronological news column. */
export function orderNewsRiver(grouped: Record<Category, Article[]>): RiverArticle[] {
  const flat: RiverArticle[] = [];
  for (const category of CATEGORIES) {
    for (const article of grouped[category] ?? []) flat.push({ ...article, category });
  }
  return flat.sort(compareNewsRecency);
}

/** How much of the river the app shows: one day of news. */
export const RIVER_WINDOW_MS = DAY_MS;

/**
 * The last day of the river, newest first.
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
  const newest = river[0] ? articleTime(river[0]) : now;
  const anchor = newest >= now - RIVER_WINDOW_MS ? now : newest;
  const from = anchor - RIVER_WINDOW_MS;
  return river.filter((a) => articleTime(a) >= from || keep.has(a.slug));
}
