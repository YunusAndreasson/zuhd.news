import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/fetchJson';

/**
 * Fetch JSON once on mount with automatic abort on unmount. Graceful degrade:
 * any failure leaves data as null — callers handle the empty state.
 *
 * Consolidates the identical AbortController + fetchJson + setState + cleanup
 * pattern that was duplicated across useChokepoints and useTrendsSnapshot.
 */
export function useFetchJson<T>(url: string, validate: (raw: unknown) => raw is T): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchJson(url, validate, { signal: controller.signal })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        // Silent — null data is a valid render path
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, validate]);

  return data;
}
