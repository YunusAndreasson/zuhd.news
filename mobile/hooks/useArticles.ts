import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from '../constants/theme';
import { getLastSeenAt, saveLastSeenAt } from '../lib/storage';
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
}

export function useArticles() {
  const [grouped, setGrouped] = useState<GroupedArticles>(emptyGrouped);
  const [briefing, setBriefing] = useState<BriefingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const prevSlugsRef = useRef<Set<string>>(new Set());
  const lastGeneratedRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);

  // Load lastSeenAt from storage on mount
  useEffect(() => {
    getLastSeenAt().then(setLastSeenAt);
  }, []);

  // Track foreground returns to refresh time labels
  const [tick, setTick] = useState(0);

  // Save lastSeenAt on background, bump tick on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') saveLastSeenAt(Date.now());
      if (state === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  const fetchFeed = useCallback(async (): Promise<number> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}/api/feed.json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: FeedResponse = await res.json();
    lastGeneratedRef.current = data.generated;
    setBriefing(data.briefing);

    const newGrouped = data.categories as GroupedArticles;
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

  // Check meta.json first — if content hasn't changed, skip the full fetch
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

  useEffect(() => {
    fetchFeed()
      .catch((e) => setError(e?.message ?? 'Unknown error'))
      .finally(() => setLoading(false));
  }, [fetchFeed]);

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

  return { grouped, briefing, loading, error, lastSeenAt, refresh, retry, tick };
}
