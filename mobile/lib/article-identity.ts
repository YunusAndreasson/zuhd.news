import type { Article, FeedResponse } from '@shared/types';

/** A feed may repeat the same article in another section. Conflicting rows
 * cannot share a link, since a slug alone cannot say which body it opens. */
export function ambiguousArticleSlugs(
  categories: FeedResponse['categories'],
  requested?: string,
): ReadonlySet<string> {
  const first = new Map<string, Article>();
  const ambiguous = new Set<string>();
  for (const articles of Object.values(categories)) {
    for (const article of articles ?? []) {
      if (requested !== undefined && article.slug !== requested) continue;
      const previous = first.get(article.slug);
      if (!previous) first.set(article.slug, article);
      else if (
        previous.title !== article.title ||
        previous.location !== article.location ||
        previous.lat !== article.lat ||
        previous.lng !== article.lng ||
        previous.sentences.length !== article.sentences.length ||
        previous.sentences.some((sentence, index) => sentence !== article.sentences[index])
      )
        ambiguous.add(article.slug);
    }
  }
  return ambiguous;
}

/** Apply the same check to a cached feed, an arrival and the widget snapshot. */
export function withoutAmbiguousArticles(feed: FeedResponse): FeedResponse {
  const ambiguous = ambiguousArticleSlugs(feed.categories);
  if (!ambiguous.size) return feed;
  const categories = Object.fromEntries(
    Object.entries(feed.categories).map(([category, articles]) => [
      category,
      articles.filter((article) => !ambiguous.has(article.slug)),
    ]),
  );
  return { ...feed, categories };
}
