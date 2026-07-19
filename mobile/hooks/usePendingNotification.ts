import type { Article, Category } from '@shared/types';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { CATEGORIES } from '../constants/theme';
import { getSnapshot as getBookmarks } from '../lib/bookmark-store';

type GroupedArticles = Record<Category, Article[]>;

/** When a push-notification tap stashed an intent before the JS bundle loaded,
 *  wait until the feed is ready, then dispatch it to the right callback and
 *  clear it. Runs at most once per stashed intent. Two intents are tracked
 *  independently — article slug (breaking-news push) and briefing (daily
 *  briefing push) — so a tap on one doesn't clobber a still-pending other. */
export function usePendingNotification(
  loading: boolean,
  grouped: GroupedArticles,
  onSelectArticle: (slug: string, category: Category) => void,
  onPlayBriefing?: () => void,
): void {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (loading || !response) return;
    const data = response.notification.request.content.data;
    if (data?.kind === 'briefing') {
      if (onPlayBriefing) {
        onPlayBriefing();
        Notifications.clearLastNotificationResponse();
      }
      return;
    }

    const slug = typeof data?.slug === 'string' ? data.slug : null;
    if (slug) {
      // Try the live feed first; if the article rotated out, fall back to the
      // bookmark store (which carries its own category and lets `onSelectArticle`
      // inject it). Without this fallback, taps on older breaking-news pushes
      // silently did nothing once the article scrolled out of the feed window.
      let category: Category | null = null;
      for (const cat of CATEGORIES) {
        if (grouped[cat].some((a) => a.slug === slug)) {
          category = cat;
          break;
        }
      }
      if (!category) {
        const bookmark = getBookmarks().find((b) => b.article.slug === slug);
        if (bookmark) category = bookmark.category;
      }
      // Keep an unresolved intent around: the first feed attempt may have
      // failed, and a retry can still supply the requested article.
      if (category) {
        onSelectArticle(slug, category);
        Notifications.clearLastNotificationResponse();
      }
    } else {
      // The response is not routable by this app; consume it so it cannot be
      // replayed on a later launch.
      Notifications.clearLastNotificationResponse();
    }
  }, [loading, grouped, onSelectArticle, onPlayBriefing, response]);
}
