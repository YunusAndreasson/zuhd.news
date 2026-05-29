import type { HeatmapPoint } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { API_BASE, STALE_THRESHOLD } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { isHeatmapResponse } from '../lib/validate';
import { useAppResume } from './useAppResume';

const EMPTY_POINTS: HeatmapPoint[] = [];
const HEATMAP_QUERY_KEY = ['heatmap'] as const;

interface HeatmapResult {
  points: HeatmapPoint[];
  /** True after the first cache or network attempt has completed. Splash gate. */
  ready: boolean;
}

/** Fetches `/api/heatmap.json` with TanStack Query persistence. Refetches
 *  silently when the feed's `generated` timestamp rotates (so the heatmap
 *  matches whatever's on screen). Graceful degrade: any failure leaves the
 *  layer empty. */
export function useHeatmap(feedGenerated: string | null): HeatmapResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: HEATMAP_QUERY_KEY,
    queryFn: ({ signal }) =>
      fetchJson(`${API_BASE}/api/heatmap.json`, isHeatmapResponse, {
        timeoutMs: 8000,
        signal,
      }),
  });

  // Refetch when feed rotates — `generated` tagged on the snapshot lets us
  // skip refetching when the snapshot is still aligned with the current feed.
  const lastInvalidatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!feedGenerated) return;
    const dataGenerated = query.data?.generated ?? null;
    if (!dataGenerated) return;
    if (dataGenerated === feedGenerated) return;
    if (lastInvalidatedRef.current === feedGenerated) return;
    lastInvalidatedRef.current = feedGenerated;
    queryClient.invalidateQueries({ queryKey: HEATMAP_QUERY_KEY });
  }, [feedGenerated, query.data?.generated, queryClient]);

  useAppResume(() => {
    queryClient.invalidateQueries({ queryKey: HEATMAP_QUERY_KEY });
  }, STALE_THRESHOLD);

  return {
    points: query.data?.points ?? EMPTY_POINTS,
    ready: query.isFetched,
  };
}
