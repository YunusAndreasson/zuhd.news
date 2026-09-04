import type { Article, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';
import { articleTime } from './article-utils';

/** A feed article with its original category retained for its kicker. */
export type RiverArticle = Article & { category: Category };

/** Newest story first, using the same timestamp as the visible dateline.
 * Slug breaks exact ties deterministically; coverage and category never
 * promote an older story above a newer one. */
export function compareNewsRecency(a: RiverArticle, b: RiverArticle): number {
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
