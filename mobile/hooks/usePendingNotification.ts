import type { Article, Category } from '@shared/types';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { CATEGORIES } from '../constants/theme';
import { getSnapshot as getBookmarks } from '../lib/bookmark-store';

export type GroupedArticles = Record<Category, Article[]>;

/** Dispatch each notification tap once after the feed is ready. Missing stories
 * are resolved by the opener through the per-story endpoint. */
export function usePendingNotification(
  loading: boolean,
  grouped: GroupedArticles,
  onSelectArticle: (slug: string, category: Category) => void,
  onPlayBriefing?: () => void,
): void {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<typeof response>(null);

  useEffect(() => {
    if (loading || !response || handled.current === response) return;
    const data = response.notification.request.content.data;
    if (data?.kind === 'briefing') {
      if (onPlayBriefing) {
        handled.current = response;
        onPlayBriefing();
        Notifications.clearLastNotificationResponse();
      }
      return;
    }

    const slug = typeof data?.slug === 'string' ? data.slug : null;
    if (slug) {
      handled.current = response;
      onSelectArticle(slug, categoryOf(slug, grouped) ?? 'politics');
      Notifications.clearLastNotificationResponse();
    } else {
      handled.current = response;
      // The response is not routable by this app; consume it so it cannot be
      // replayed on a later launch.
      Notifications.clearLastNotificationResponse();
    }
  }, [loading, grouped, onSelectArticle, onPlayBriefing, response]);
}

/** The live feed's category for `slug`, else a saved story's, else null.
 *  Try the live feed first; if the article rotated out, fall back to the
 *  bookmark store (which carries its own category and lets `onSelectArticle`
 *  inject it). Without this fallback, taps on older breaking-news pushes
 *  silently did nothing once the article scrolled out of the feed window. */
export function categoryOf(slug: string, grouped: GroupedArticles): Category | null {
  for (const cat of CATEGORIES) {
    if (grouped[cat].some((a) => a.slug === slug)) return cat;
  }
  return getBookmarks().find((b) => b.article.slug === slug)?.category ?? null;
}
