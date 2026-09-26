import type { Category } from '@shared/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { categoryOf, type GroupedArticles } from './usePendingNotification';

/** A link into a story (`zuhd-news://a/{slug}`, rewritten to `/?story=` by
 *  `app/+native-intent.tsx`) opens it once the feed is ready, then clears the
 *  param so a later feed change cannot open it again. A slug the reader has no
 *  copy of still goes to `onSelectArticle`, which says it is gone. */
export function useLinkedStory(
  loading: boolean,
  grouped: GroupedArticles,
  onSelectArticle: (slug: string, category: Category) => void,
): void {
  const { story } = useLocalSearchParams<{ story?: string }>();

  useEffect(() => {
    if (loading || !story) return;
    // With no category the story is in neither the feed nor saved, and
    // `onSelectArticle` says so; the category it is handed goes unused.
    onSelectArticle(story, categoryOf(story, grouped) ?? 'politics');
    router.setParams({ story: undefined });
  }, [loading, grouped, onSelectArticle, story]);
}
