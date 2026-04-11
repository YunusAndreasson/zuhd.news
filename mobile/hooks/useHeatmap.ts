import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from '../lib/fetch';
import { readHeatmapCache, writeHeatmapCache } from '../lib/heatmap-cache';
import type { HeatmapPoint } from '../types';
import { useAppResume } from './useAppResume';

const STALE_THRESHOLD = 5 * 60 * 1000;

export function useHeatmap(feedGenerated: string | null): HeatmapPoint[] {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const lastGenRef = useRef<string | null>(null);

  const fetchHeatmap = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/heatmap.json`, 8000, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data: { generated: string; points: HeatmapPoint[] } = await res.json();
      lastGenRef.current = data.generated;
      setPoints(data.points);
      try {
        writeHeatmapCache(data);
      } catch {}
    } catch {}
  }, []);

  // Cache-first initial load
  useEffect(() => {
    (async () => {
      const cached = await readHeatmapCache();
      if (cached) {
        lastGenRef.current = cached.generated;
        setPoints(cached.points);
      }
      await fetchHeatmap();
    })();
  }, [fetchHeatmap]);

  // Refetch when feed changes
  useEffect(() => {
    if (!feedGenerated) return;
    if (feedGenerated !== lastGenRef.current) {
      fetchHeatmap();
    }
  }, [feedGenerated, fetchHeatmap]);

  // Foreground resume
  useAppResume(fetchHeatmap, STALE_THRESHOLD);

  return points;
}
