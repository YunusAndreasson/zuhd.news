import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, STALE_THRESHOLD } from '../constants/theme';
import { fetchWithTimeout } from '../lib/fetch';
import { readHeatmapCache, writeHeatmapCache } from '../lib/heatmap-cache';
import { isHeatmapResponse } from '../lib/validate';
import type { HeatmapPoint } from '../types';
import { useAppResume } from './useAppResume';

export function useHeatmap(feedGenerated: string | null): HeatmapPoint[] {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const lastGenRef = useRef<string | null>(null);

  const fetchHeatmap = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/heatmap.json`, 8000, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const raw: unknown = await res.json();
      if (!isHeatmapResponse(raw)) return;
      lastGenRef.current = raw.generated;
      setPoints(raw.points);
      try {
        writeHeatmapCache(raw);
      } catch {}
    } catch {}
  }, []);

  // Cache-first initial load
  const didInitialFetch = useRef(false);
  useEffect(() => {
    if (didInitialFetch.current) return;
    didInitialFetch.current = true;
    (async () => {
      const cached = await readHeatmapCache();
      if (cached) {
        lastGenRef.current = cached.generated;
        setPoints(cached.points);
      }
      await fetchHeatmap();
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

  return points;
}
