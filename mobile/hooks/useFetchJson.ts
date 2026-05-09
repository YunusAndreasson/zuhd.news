import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { STALE_THRESHOLD } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { createJsonCache } from '../lib/json-cache';
import { useAppResume } from './useAppResume';

interface Options {
  /** Disk cache filename. When set, the hook reads cache before network and writes on success. */
  cacheFilename?: string;
  /** Re-fetch when the app returns to the foreground after STALE_THRESHOLD. */
  refreshOnResume?: boolean;
}

interface Result<T> {
  data: T | null;
  /** True after the first cache or network attempt has completed. Use for splash gating. */
  ready: boolean;
}

/**
 * Fetch JSON once on mount with automatic abort on unmount. Graceful degrade:
 * any failure leaves data as null — callers handle the empty state.
 *
 * Optional disk cache + resume refresh keeps off-feed data fresh without
 * blocking the UI: cache hit shows immediately, network update applies
 * silently, and a foreground resume past STALE_THRESHOLD re-fetches.
 */
export function useFetchJson<T>(
  url: string,
  validate: (raw: unknown) => raw is T,
  options?: Options,
): Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const cacheFilename = options?.cacheFilename;
  const refreshOnResume = options?.refreshOnResume ?? false;

  // Cache instance is created once per filename. Callers should keep the
  // filename referentially stable (constant string is fine).
  const cacheRef = useRef<ReturnType<typeof createJsonCache<T>> | null>(null);
  if (cacheFilename && !cacheRef.current) {
    cacheRef.current = createJsonCache<T>(cacheFilename, validate);
  }

  const fetchAndCache = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const result = await fetchJson(url, validate, { signal });
      setData(result);
      cacheRef.current?.write(result);
    } catch {
      // Silent — null data is a valid render path
    }
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchAndCache is a stable useEffectEvent ref; url/validate identity is the intentional refetch trigger
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      const cache = cacheRef.current;
      if (cache) {
        const cached = await cache.read();
        if (cancelled) return;
        if (cached) {
          setData(cached);
          setReady(true);
          fetchAndCache(controller.signal); // background refresh
          return;
        }
      }
      await fetchAndCache(controller.signal);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, validate]);

  useAppResume(() => {
    if (refreshOnResume) fetchAndCache();
  }, STALE_THRESHOLD);

  return { data, ready };
}
