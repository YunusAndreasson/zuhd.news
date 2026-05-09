import type { HeatmapPoint } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, STALE_THRESHOLD } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { createJsonCache } from '../lib/json-cache';
import { type HeatmapResponse, isHeatmapResponse } from '../lib/validate';
import { useAppResume } from './useAppResume';

const heatmapCache = createJsonCache<HeatmapResponse>('zuhd-heatmap.json', isHeatmapResponse);

interface HeatmapResult {
  points: HeatmapPoint[];
  /** True after the first cache or network attempt has completed. Splash gate. */
  ready: boolean;
}

export function useHeatmap(feedGenerated: string | null): HeatmapResult {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [ready, setReady] = useState(false);
  const lastGenRef = useRef<string | null>(null);

  const fetchHeatmap = useCallback(async () => {
    try {
      const raw = await fetchJson(`${API_BASE}/api/heatmap.json`, isHeatmapResponse, {
        timeoutMs: 8000,
        cache: 'no-store',
      });
      lastGenRef.current = raw.generated;
      setPoints(raw.points);
      try {
        heatmapCache.write(raw);
      } catch {}
    } catch {}
  }, []);

  // Cache-first initial load
  const didInitialFetch = useRef(false);
  useEffect(() => {
    if (didInitialFetch.current) return;
    didInitialFetch.current = true;
    (async () => {
      const cached = await heatmapCache.read();
      if (cached) {
        lastGenRef.current = cached.generated;
        setPoints(cached.points);
        setReady(true);
        // Background refresh — don't await, don't gate splash on it
        fetchHeatmap();
        return;
      }
      await fetchHeatmap();
      setReady(true);
    })();
  }, [fetchHeatmap]);

  // Refetch when feed rotates — only after the initial fetch has settled so
  // we don't race the cache-load path.
  useEffect(() => {
    if (!feedGenerated) return;
    if (!lastGenRef.current) return;
    if (feedGenerated !== lastGenRef.current) {
      fetchHeatmap();
    }
  }, [feedGenerated, fetchHeatmap]);

  // Foreground resume
  useAppResume(fetchHeatmap, STALE_THRESHOLD);

  return { points, ready };
}
