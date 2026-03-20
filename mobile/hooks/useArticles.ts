import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../constants/theme';
import type { Article, FeedResponse, Category } from '../types';

type GroupedArticles = Record<Category, Article[]>;

const emptyGrouped: GroupedArticles = {
  politics: [],
  economy: [],
  science: [],
  tech: [],
};

export interface BriefingInfo {
  date: string;
  available: boolean;
}

export function useArticles() {
  const [grouped, setGrouped] = useState<GroupedArticles>(emptyGrouped);
  const [briefing, setBriefing] = useState<BriefingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevSlugsRef = useRef<Set<string>>(new Set());
  const lastGeneratedRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);

  const fetchFeed = useCallback(async (): Promise<number> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // Try new pre-grouped endpoint first, fall back to legacy
      let res = await fetch(`${API_BASE}/api/feed.json`, { signal: controller.signal });
      if (res.ok) {
        clearTimeout(timeout);
        const data: FeedResponse = await res.json();
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
      }

      // Fallback: legacy articles.json (pre-grouped endpoint not deployed yet)
      res = await fetch(`${API_BASE}/api/articles.json`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const legacy = await res.json();
      lastGeneratedRef.current = legacy.generated;

      const newGrouped: GroupedArticles = { politics: [], economy: [], science: [], tech: [] };
      for (const article of legacy.articles) {
        const cat = article.category as Category;
        if (cat in newGrouped) {
          // Convert legacy body to sentences if needed
          if (!article.sentences) {
            article.sentences = article.body.trim().split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
          }
          newGrouped[cat].push(article);
        }
      }

      const allSlugs: string[] = legacy.articles.map((a: any) => a.slug);
      const newSlugs = new Set(allSlugs);
      const addedCount = allSlugs.filter((s) => !prevSlugsRef.current.has(s)).length;
      prevSlugsRef.current = newSlugs;
      setGrouped(newGrouped);
      setError(null);
      return addedCount;
    } catch (e: unknown) {
      clearTimeout(timeout);
      throw e;
    }
  }, []);

  // Check meta.json first — if content hasn't changed, skip the full fetch
  const hasNewContent = useCallback(async (): Promise<boolean> => {
    if (!lastGeneratedRef.current) return true;
    try {
      const res = await fetch(`${API_BASE}/api/meta.json`, {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
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

  return { grouped, briefing, loading, error, refresh };
}
