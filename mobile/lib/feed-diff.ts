import type { Article, FeedResponse } from '@shared/types';

/** A slow request or stale CDN edge must not roll the reader's feed back. */
export function isOlderFeed(feed: FeedResponse, current: FeedResponse | null | undefined): boolean {
  return !!current && Date.parse(feed.generated) < Date.parse(current.generated);
}

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
