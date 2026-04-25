import type { Article, Category } from '@shared/types';
import { useEffect } from 'react';
import { CATEGORIES } from '../constants/theme';
import {
  clearBriefing as clearPendingBriefing,
  clear as clearPendingSlug,
  getBriefing as getPendingBriefing,
  get as getPendingSlug,
} from '../lib/pending-notification';

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
  briefingAvailable?: boolean,
): void {
  useEffect(() => {
    if (loading) return;
    const slug = getPendingSlug();
    if (slug) {
      clearPendingSlug();
      for (const cat of CATEGORIES) {
        if (grouped[cat].some((a) => a.slug === slug)) {
          onSelectArticle(slug, cat);
          break;
        }
      }
    }
    if (getPendingBriefing() && briefingAvailable && onPlayBriefing) {
      clearPendingBriefing();
      onPlayBriefing();
    }
  }, [loading, grouped, onSelectArticle, onPlayBriefing, briefingAvailable]);
}
