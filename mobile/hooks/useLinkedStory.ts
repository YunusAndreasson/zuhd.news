import type { Category } from '@shared/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { categoryOf, type GroupedArticles } from './usePendingNotification';

/** Open a linked story once the feed is ready, then clear its route param. */
export function useLinkedStory(
  loading: boolean,
  grouped: GroupedArticles,
  onSelectArticle: (slug: string, category: Category) => void,
): void {
  const { story } = useLocalSearchParams<{ story?: string }>();

  useEffect(() => {
    if (loading || !story) return;
    onSelectArticle(story, categoryOf(story, grouped) ?? 'politics');
    router.setParams({ story: undefined });
  }, [loading, grouped, onSelectArticle, story]);
}
