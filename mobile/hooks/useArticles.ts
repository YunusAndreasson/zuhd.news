import type { Article, Category, FeedResponse } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { API_BASE, STALE_THRESHOLD } from '../constants/theme';
import { flushBookmarks } from '../lib/bookmark-store';
import { fetchJson } from '../lib/fetchJson';
import { flushOnboarding } from '../lib/onboarding-store';
import { getLastSeenAt, saveLastSeenAt } from '../lib/storage';
import { isFeedResponse, isMetaResponse } from '../lib/validate';
import { useAppResume } from './useAppResume';

type GroupedArticles = Record<Category, Article[]>;

const emptyGrouped: GroupedArticles = {
  politics: [],
  economy: [],
  science: [],
  tech: [],
};

interface BriefingInfo {
  date: string;
  available: boolean;
  duration?: number;
}

interface ArticlesState {
  grouped: GroupedArticles;
  briefing: BriefingInfo | null;
  loading: boolean;
  error: string | null;
  lastSeenAt: number;
  refresh: () => Promise<number>;
  retry: () => Promise<void>;
  tick: number;
  generated: string | null;
  injectArticle: (article: Article, category: Category) => void;
}

const FEED_QUERY_KEY = ['feed'] as const;

function slugSet(feed: FeedResponse): Set<string> {
  const all: string[] = [];
  for (const list of Object.values(feed.categories)) {
    for (const a of list) all.push(a.slug);
  }
  return new Set(all);
}

export function useArticles(): ArticlesState {
  const queryClient = useQueryClient();
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const prevSlugsRef = useRef<Set<string>>(new Set());
  const lastGeneratedRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);
  const seedDoneRef = useRef(false);

  // useQuery handles cache hydration from the persister + the initial network
  // fetch. The query key is stable; refresh()/retry() drive refetches.
  const query = useQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: ({ signal }) =>
      fetchJson(`${API_BASE}/api/feed.json`, isFeedResponse, {
        timeoutMs: 10000,
        signal,
      }),
  });

  // Seed prevSlugsRef + lastGeneratedRef on first data arrival (either from
  // persister hydration or network). Counting first-load slugs as "added"
  // would inflate the first post-boot refresh.
  useEffect(() => {
    if (!query.data || seedDoneRef.current) return;
    seedDoneRef.current = true;
    prevSlugsRef.current = slugSet(query.data);
    lastGeneratedRef.current = query.data.generated;
  }, [query.data]);

  // Load lastSeenAt from storage on mount
  useEffect(() => {
    getLastSeenAt().then(setLastSeenAt);
  }, []);

  // Track foreground returns to refresh time labels. Bumped at most once per
  // minute (formatTimeAgo's finest granularity) so resumes within a minute
  // don't spuriously re-render every visible cell.
  const [tick, setTick] = useState(0);
  const lastTickAtRef = useRef(0);
  const TICK_GRANULARITY_MS = 60_000;

  const refetchAndDiff = useEffectEvent(async (): Promise<number> => {
    const fresh = await queryClient.fetchQuery({
      queryKey: FEED_QUERY_KEY,
      queryFn: ({ signal }) =>
        fetchJson(`${API_BASE}/api/feed.json`, isFeedResponse, {
          timeoutMs: 10000,
          cache: 'no-store',
          signal,
        }),
      // Force the network request — refresh() bypasses staleTime.
      staleTime: 0,
    });
    const newSlugs = slugSet(fresh);
    const added = [...newSlugs].filter((s) => !prevSlugsRef.current.has(s)).length;
    prevSlugsRef.current = newSlugs;
    lastGeneratedRef.current = fresh.generated;
    return added;
  });

  const hasNewContent = useEffectEvent(async (): Promise<boolean> => {
    if (!lastGeneratedRef.current) return true;
    try {
      const meta = await fetchJson(`${API_BASE}/api/meta.json`, isMetaResponse, {
        cache: 'no-store',
      });
      return meta.generated !== lastGeneratedRef.current;
    } catch {
      return false; // network error or malformed meta — cached data is fine
    }
  });

  // Foreground resume: refresh if away > 5 min. Tick is bumped only when
  // a real minute has elapsed since the last bump, so quick app-switches
  // don't force a full re-render of every visible cell.
  const handleResume = useEffectEvent(async () => {
    const now = Date.now();
    if (now - lastTickAtRef.current >= TICK_GRANULARITY_MS) {
      lastTickAtRef.current = now;
      setTick((t) => t + 1);
    }
    if (!refreshingRef.current) {
      refreshingRef.current = true;
      try {
        const changed = await hasNewContent();
        if (changed) await refetchAndDiff();
      } catch {
        // silent — existing content is fine
      } finally {
        refreshingRef.current = false;
      }
    }
  });

  const handleBackground = useEffectEvent(() => {
    saveLastSeenAt(Date.now());
    flushBookmarks();
    flushOnboarding();
  });

  useAppResume(handleResume, STALE_THRESHOLD, handleBackground);

  const refresh = useCallback(async (): Promise<number> => {
    if (refreshingRef.current) return 0;
    refreshingRef.current = true;
    try {
      const changed = await hasNewContent();
      if (!changed) return 0;
      return await refetchAndDiff();
    } finally {
      refreshingRef.current = false;
    }
  }, []); // refetchAndDiff/hasNewContent are stable useEffectEvent refs

  const retry = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  /** Inject an article into a category if it's not already present (e.g.
   *  bookmarked article that rotated out of the feed). */
  const injectArticle = useCallback(
    (article: Article, category: Category) => {
      queryClient.setQueryData<FeedResponse>(FEED_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const list = prev.categories[category] ?? [];
        if (list.some((a) => a.slug === article.slug)) return prev;
        prevSlugsRef.current.add(article.slug);
        return {
          ...prev,
          categories: { ...prev.categories, [category]: [article, ...list] },
        };
      });
    },
    [queryClient],
  );

  const grouped = useMemo<GroupedArticles>(() => {
    if (!query.data) return emptyGrouped;
    return { ...emptyGrouped, ...query.data.categories };
  }, [query.data]);

  return {
    grouped,
    briefing: query.data?.briefing ?? null,
    // Surface loading only on the very first attempt — cache hydration from
    // the persister presents data instantly, so loading flips false as soon
    // as there's *anything* to render.
    loading: query.isPending && !query.data,
    error: query.error ? (query.error.message ?? 'Unknown error') : null,
    lastSeenAt,
    refresh,
    retry,
    tick,
    generated: query.data?.generated ?? null,
    injectArticle,
  };
}
