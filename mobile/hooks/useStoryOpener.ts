import type { Article, Category, GroupedArticles } from '@shared/types';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { API_BASE, CATEGORIES } from '../constants/theme';
import { getSnapshot as getBookmarks } from '../lib/bookmark-store';
import { fetchJson, HttpError } from '../lib/fetchJson';
import { articleFromStory, isStoryPayload } from '../lib/story-payload';

/** Resolve the exact requested story, including stories outside the feed. */
export function useStoryOpener(
  groupedRef: RefObject<GroupedArticles>,
  onOpen: (slug: string, article?: Article, category?: Category) => void,
  /** Handed the slug, so the reader can be offered the same open again, and
   *  whether the site has no such story (a 404), when again would not help. */
  onError: (slug: string, missing: boolean) => void,
) {
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  return useCallback(
    async (slug: string) => {
      request.current?.abort();
      for (const category of CATEGORIES) {
        const article = groupedRef.current[category].find((a) => a.slug === slug);
        if (article) {
          onOpen(slug, article, category);
          return;
        }
      }
      const saved = getBookmarks().find((b) => b.article.slug === slug);
      if (saved) {
        onOpen(slug, saved.article, saved.category);
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      try {
        const story = await fetchJson(
          `${API_BASE}/api/story/${encodeURIComponent(slug)}.json`,
          isStoryPayload,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const resolved = articleFromStory(story);
        if (story.slug !== slug || !resolved) throw new Error('Unexpected story');
        onOpen(slug, resolved.article, resolved.category);
      } catch (error) {
        if (!controller.signal.aborted)
          onError(slug, error instanceof HttpError && error.status === 404);
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [groupedRef, onOpen, onError],
  );
}
