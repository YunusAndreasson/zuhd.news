import type { Article, Category, FeedResponse } from '@shared/types';
import { startTransition, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { API_BASE, STALE_THRESHOLD } from '../constants/theme';
import { flushBookmarks } from '../lib/bookmark-store';
import { fetchJson } from '../lib/fetchJson';
import { createJsonCache } from '../lib/json-cache';
import { getLastSeenAt, saveLastSeenAt } from '../lib/storage';
import { isFeedResponse, isMetaResponse } from '../lib/validate';
import { useAppResume } from './useAppResume';

const feedCache = createJsonCache<FeedResponse>('zuhd-feed.json', isFeedResponse);

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

export function useArticles(): ArticlesState {
  const [grouped, setGrouped] = useState<GroupedArticles>(emptyGrouped);
  const [briefing, setBriefing] = useState<BriefingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const prevSlugsRef = useRef<Set<string>>(new Set());
  const [generated, setGenerated] = useState<string | null>(null);
  const lastGeneratedRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);

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

  const applyFeed = useEffectEvent((data: FeedResponse, seedSlugs = false): number => {
    lastGeneratedRef.current = data.generated;
    const newGrouped: GroupedArticles = { ...emptyGrouped, ...data.categories };
    const allSlugs = Object.values(newGrouped)
      .flat()
      .map((a) => a.slug);
    const newSlugs = new Set(allSlugs);
    // On initial cache load, every slug is "already known" — counting them as
    // new would inflate the first post-boot refresh's addedCount.
    const addedCount = seedSlugs
      ? 0
      : [...newSlugs].filter((s) => !prevSlugsRef.current.has(s)).length;
    prevSlugsRef.current = newSlugs;

    startTransition(() => {
      setGenerated(data.generated);
      setBriefing(data.briefing);
      setGrouped(newGrouped);
      setError(null);
    });

    return addedCount;
  });

  const fetchFeed = useEffectEvent(async (): Promise<number> => {
    const raw = await fetchJson(`${API_BASE}/api/feed.json`, isFeedResponse, {
      timeoutMs: 10000,
      cache: 'no-store',
    });
    const addedCount = applyFeed(raw);
    try {
      feedCache.write(raw);
    } catch {}
    return addedCount;
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

  // Cache-first initial load
  useEffect(() => {
    (async () => {
      // Try disk cache first
      const cached = await feedCache.read();
      if (cached) {
        applyFeed(cached, true);
        setLoading(false);
        // Silent background check for fresher content. applyFeed updates
        // grouped data in place; the FlatList reconciles by slug without
        // remounting, so the user keeps their scroll position.
        try {
          const changed = await hasNewContent();
          if (changed) await fetchFeed();
        } catch {
          // cached data is fine; no UI surface for background refresh errors
        }
        return;
      }
      // No cache — network fetch (first launch)
      try {
        await fetchFeed();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — applyFeed/fetchFeed/hasNewContent are stable useEffectEvent refs

  // Foreground resume: refresh if away > 5 min. Tick is bumped only when
  // a real minute has elapsed since the last bump, so quick app-switches
  // don't force a full re-render of every visible cell. Feed updates
  // apply silently — no FlatList remount, no scroll reset.
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
        if (changed) await fetchFeed();
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
  });

  useAppResume(handleResume, STALE_THRESHOLD, handleBackground);

  const refresh = useCallback(async (): Promise<number> => {
    if (refreshingRef.current) return 0;
    refreshingRef.current = true;
    try {
      const changed = await hasNewContent();
      if (!changed) return 0;
      return await fetchFeed();
    } finally {
      refreshingRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — fetchFeed/hasNewContent are stable useEffectEvent refs

  const retry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchFeed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — fetchFeed is a stable useEffectEvent ref

  /** Inject an article into a category if it's not already present (e.g. bookmarked article that rotated out of the feed). */
  const injectArticle = useCallback((article: Article, category: Category) => {
    setGrouped((prev) => {
      const list = prev[category] ?? [];
      if (list.some((a) => a.slug === article.slug)) return prev;
      prevSlugsRef.current.add(article.slug);
      return { ...prev, [category]: [article, ...list] };
    });
  }, []);

  return {
    grouped,
    briefing,
    loading,
    error,
    lastSeenAt,
    refresh,
    retry,
    tick,
    generated,
    injectArticle,
  };
}
