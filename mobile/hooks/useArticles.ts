import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from '../constants/theme';
import { type FeedInfo, readFeedCache, readFeedInfoSync, writeFeedCache } from '../lib/feed-cache';
import { getLastSeenAt, resetReadingPositions, saveLastSeenAt } from '../lib/storage';
import type { Article, Category, FeedResponse } from '../types';

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

export function useArticles() {
  const [grouped, setGrouped] = useState<GroupedArticles>(emptyGrouped);
  const [briefing, setBriefing] = useState<BriefingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [feedInfo, setFeedInfo] = useState<FeedInfo | null>(null);
  const prevSlugsRef = useRef<Set<string>>(new Set());
  const lastGeneratedRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);
  const lastActiveRef = useRef(Date.now());

  // Load lastSeenAt from storage on mount
  useEffect(() => {
    getLastSeenAt().then(setLastSeenAt);
  }, []);

  // Track foreground returns to refresh time labels
  const [tick, setTick] = useState(0);

  const applyFeed = useCallback((data: FeedResponse): number => {
    lastGeneratedRef.current = data.generated;
    setBriefing(data.briefing);
    const newGrouped = data.categories as GroupedArticles;
    const allSlugs = Object.values(newGrouped).flat().map((a) => a.slug);
    const newSlugs = new Set(allSlugs);
    const addedCount = [...newSlugs].filter((s) => !prevSlugsRef.current.has(s)).length;
    prevSlugsRef.current = newSlugs;
    setGrouped(newGrouped);
    setError(null);
    return addedCount;
  }, []);

  const fetchFeed = useCallback(async (): Promise<number> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${API_BASE}/api/feed.json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: FeedResponse = await res.json();
    const addedCount = applyFeed(data);
    // Write-through to disk cache
    const articles = Object.values(data.categories).flat();
    const words = articles.reduce((sum, a) => sum + a.sentences.join(' ').split(/\s+/).length, 0);
    setFeedInfo({ total: articles.length, readMins: Math.max(1, Math.ceil(words / 238)) });
    writeFeedCache(data).catch(() => {});
    return addedCount;
  }, [applyFeed]);

  const hasNewContent = useCallback(async (): Promise<boolean> => {
    if (!lastGeneratedRef.current) return true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}/api/meta.json`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      if (!res.ok) return true;
      const meta = await res.json();
      return meta.generated !== lastGeneratedRef.current;
    } catch {
      return true;
    }
  }, []);

  // Cache-first initial load
  useEffect(() => {
    (async () => {
      // Try disk cache first
      const cached = await readFeedCache();
      if (cached) {
        applyFeed(cached.feed);
        setFeedInfo(cached.info);
        setLoading(false);
        // Silent background check for fresher content
        try {
          const changed = await hasNewContent();
          if (changed) {
            await fetchFeed();
            await resetReadingPositions();
          }
        } catch {} // cached data is fine
        return;
      }
      // No cache — network fetch (first launch)
      try {
        await fetchFeed();
      } catch (e: unknown) {
        setError((e as Error)?.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, [applyFeed, fetchFeed, hasNewContent]);

  // Foreground resume: refresh if away > 5 min
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') {
        saveLastSeenAt(Date.now());
        lastActiveRef.current = Date.now();
      }
      if (state === 'active') {
        setTick((t) => t + 1);
        // Check if background task updated cache while we were away
        const info = readFeedInfoSync();
        if (info) setFeedInfo(info);

        const away = Date.now() - lastActiveRef.current;
        if (away > STALE_THRESHOLD) {
          try {
            const changed = await hasNewContent();
            if (changed) {
              await fetchFeed();
              await resetReadingPositions();
            }
          } catch {} // silent — existing content is fine
        }
      }
    });
    return () => sub.remove();
  }, [fetchFeed, hasNewContent]);

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
      setError((e as Error)?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fetchFeed]);

  return { grouped, briefing, loading, error, lastSeenAt, refresh, retry, tick, feedInfo };
}
