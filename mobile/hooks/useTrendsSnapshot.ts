import type { Indicator } from '@shared/types';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isTrendsSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

/** Fetches `/api/trends.json` once at mount. Returns a map keyed by indicator
 *  id for O(1) EntitySheet lookups. Graceful degrade: any failure leaves the
 *  map empty — tappable entity mentions simply won't find their indicator and
 *  the sheet stays closed. No retry; refreshed next app session. */
export function useTrendsSnapshot(): {
  byId: Map<string, Indicator>;
  indicators: Indicator[];
} {
  const snapshot = useFetchJson(`${API_BASE}/api/trends.json`, isTrendsSnapshot);
  const indicators = snapshot?.indicators ?? [];

  const byId = useMemo(() => {
    const m = new Map<string, Indicator>();
    for (const ind of indicators) m.set(ind.id, ind);
    return m;
  }, [indicators]);

  return { byId, indicators };
}
