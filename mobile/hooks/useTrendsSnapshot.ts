import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { isTrendsSnapshot } from '../lib/validate';
import type { Indicator } from '../types';

/** Fetches `/api/trends.json` once at mount. Returns a map keyed by indicator
 *  id for O(1) EntitySheet lookups. Graceful degrade: any failure leaves the
 *  map empty — tappable entity mentions simply won't find their indicator and
 *  the sheet stays closed. No retry; refreshed next app session. */
export function useTrendsSnapshot(): {
  byId: Map<string, Indicator>;
  indicators: Indicator[];
} {
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchJson(`${API_BASE}/api/trends.json`, isTrendsSnapshot, {
      signal: controller.signal,
    })
      .then((snapshot) => {
        if (!cancelled) setIndicators(snapshot.indicators);
      })
      .catch(() => {
        // Silent — an empty indicators list is a valid render path.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Indicator>();
    for (const ind of indicators) m.set(ind.id, ind);
    return m;
  }, [indicators]);

  return { byId, indicators };
}
