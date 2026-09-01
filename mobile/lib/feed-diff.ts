import type { Article, FeedResponse } from '@shared/types';

/** Return each genuinely new story once, even if a malformed/upstream feed
 * happens to place the same slug in more than one category. */
export function collectNewArticles(
  fresh: FeedResponse,
  previousSlugs: ReadonlySet<string>,
): Article[] {
  const added = new Map<string, Article>();
  for (const list of Object.values(fresh.categories)) {
    for (const article of list) {
      if (!previousSlugs.has(article.slug) && !added.has(article.slug)) {
        added.set(article.slug, article);
      }
    }
  }
  return [...added.values()];
}
