import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from '../constants/theme';
import { readFeedCache, writeFeedCache } from '../lib/feed-cache';
import { fetchWithTimeout } from '../lib/fetch';
import { getLastSeenAt, saveLastSeenAt } from '../lib/storage';

import type { Article, Category, FeedResponse, MetaResponse } from '../types';

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

const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

interface ArticlesState {
  grouped: GroupedArticles;
  briefing: BriefingInfo | null;
  loading: boolean;
  error: string | null;
  lastSeenAt: number;
  refresh: () => Promise<number>;
  retry: () => Promise<void>;
  tick: number;
  resetKey: number;
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
  const lastActiveRef = useRef(Date.now());
  const [resetKey, setResetKey] = useState(0);

  // Load lastSeenAt from storage on mount
  useEffect(() => {
    getLastSeenAt().then(setLastSeenAt);
  }, []);

  // Track foreground returns to refresh time labels
  const [tick, setTick] = useState(0);

  const applyFeed = useCallback((data: FeedResponse): number => {
    lastGeneratedRef.current = data.generated;
    setGenerated(data.generated);
    setBriefing(data.briefing);
    const newGrouped = { ...emptyGrouped, ...data.categories } as GroupedArticles;
    const allSlugs = Object.values(newGrouped)
      .flat()
      .map((a) => a.slug);
    const newSlugs = new Set(allSlugs);
    const addedCount = [...newSlugs].filter((s) => !prevSlugsRef.current.has(s)).length;
    prevSlugsRef.current = newSlugs;
    setGrouped(newGrouped);
    setError(null);

    return addedCount;
  }, []);

  const fetchFeed = useCallback(async (): Promise<number> => {
    const res = await fetchWithTimeout(`${API_BASE}/api/feed.json`, 10000, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: FeedResponse = await res.json();
    const addedCount = applyFeed(data);
    try {
      writeFeedCache(data);
    } catch {}
    return addedCount;
  }, [applyFeed]);

  const hasNewContent = useCallback(async (): Promise<boolean> => {
    if (!lastGeneratedRef.current) return true;
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/meta.json`, 5000, {
        cache: 'no-store',
      });
      if (!res.ok) return false; // network issue — cached data is fine
      const meta: MetaResponse = await res.json();
      return meta.generated !== lastGeneratedRef.current;
    } catch {
      return false; // network error — don't trigger a doomed fetchFeed
    }
  }, []);

  // Cache-first initial load
  useEffect(() => {
    (async () => {
      // Try disk cache first
      const cached = await readFeedCache();
      if (cached) {
        applyFeed(cached);
        setLoading(false);
        // Silent background check for fresher content
        try {
          const changed = await hasNewContent();
          if (changed) {
            await fetchFeed();
            // No resetKey bump — user is already at scroll position 0 on fresh launch,
            // and applyFeed already updated grouped data so FlatList re-renders in place.
          }
        } catch {} // cached data is fine
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
  }, [applyFeed, fetchFeed, hasNewContent]);

  // Foreground resume: refresh if away > 5 min
  const handleResume = useEffectEvent(async () => {
    setTick((t) => t + 1);
    const away = Date.now() - lastActiveRef.current;
    if (away > STALE_THRESHOLD && !refreshingRef.current) {
      refreshingRef.current = true;
      try {
        const changed = await hasNewContent();
        if (changed) {
          await fetchFeed();
          setResetKey((k) => k + 1);
        }
      } catch {
      } finally {
        // silent — existing content is fine
        refreshingRef.current = false;
      }
    }
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        saveLastSeenAt(Date.now());
        lastActiveRef.current = Date.now();
      }
      if (state === 'active') {
        handleResume();
      }
    });
    return () => sub.remove();
  }, []);

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
  }, [fetchFeed, hasNewContent]);

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
  }, [fetchFeed]);

  /** Inject an article into a category if it's not already present (e.g. bookmarked article that rotated out of the feed). */
  const injectArticle = useCallback((article: Article, category: Category) => {
    setGrouped((prev) => {
      const list = prev[category] ?? [];
      if (list.some((a) => a.slug === article.slug)) return prev;
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
    resetKey,
    generated,
    injectArticle,
  };
}
