import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from '../constants/theme';
import { readHeatmapCache, writeHeatmapCache } from '../lib/heatmap-cache';
import { fetchWithTimeout } from '../lib/fetch';
import type { HeatmapPoint } from '../types';

const STALE_THRESHOLD = 5 * 60 * 1000;

export function useHeatmap(feedGenerated: string | null): HeatmapPoint[] {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const lastGenRef = useRef<string | null>(null);
  const lastActiveRef = useRef(Date.now());

  const fetchHeatmap = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/heatmap.json`, 8000);
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
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        lastActiveRef.current = Date.now();
      }
      if (state === 'active') {
        const away = Date.now() - lastActiveRef.current;
        if (away > STALE_THRESHOLD) fetchHeatmap();
      }
    });
    return () => sub.remove();
  }, [fetchHeatmap]);

  return points;
}
