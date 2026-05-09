import type { Indicator } from '@shared/types';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isTrendsSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

/** Fetches `/api/trends.json`. Cache-first so EntitySheet has an indicator
 *  catalog ready on launch; refreshes silently on resume. Returns a map
 *  keyed by indicator id for O(1) EntitySheet lookups. Graceful degrade:
 *  any failure leaves the map empty — tappable entity mentions simply
 *  won't find their indicator and the sheet stays closed. */
export function useTrendsSnapshot(): {
  byId: Map<string, Indicator>;
  indicators: Indicator[];
  ready: boolean;
} {
  const { data, ready } = useFetchJson(`${API_BASE}/api/trends.json`, isTrendsSnapshot, {
    cacheFilename: 'zuhd-trends.json',
    refreshOnResume: true,
  });
  const indicators = data?.indicators ?? [];

  const byId = useMemo(() => {
    const m = new Map<string, Indicator>();
    for (const ind of indicators) m.set(ind.id, ind);
    return m;
  }, [indicators]);

  return { byId, indicators, ready };
}
