import { useEffect } from 'react';
import { CATEGORIES } from '../../constants/theme';
import { clear as clearPendingSlug, get as getPendingSlug } from '../../lib/pending-notification';
import type { Article, Category } from '../../types';

type GroupedArticles = Record<Category, Article[]>;

/** When a push-notification tap stashed a slug before the JS bundle loaded,
 *  wait until the feed is ready, then hand the slug to the navigation callback
 *  and clear it. Runs at most once per stashed slug. */
export function usePendingNotification(
  loading: boolean,
  grouped: GroupedArticles,
  onSelectArticle: (slug: string, category: Category) => void,
): void {
  useEffect(() => {
    if (loading) return;
    const slug = getPendingSlug();
    if (!slug) return;
    clearPendingSlug();
    for (const cat of CATEGORIES) {
      if (grouped[cat].some((a) => a.slug === slug)) {
        onSelectArticle(slug, cat);
        break;
      }
    }
  }, [loading, grouped, onSelectArticle]);
}
