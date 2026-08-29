import type { Indicator, TrendsSnapshot } from '@shared/types';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isTrendsSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

const EMPTY_INDICATORS: Indicator[] = [];

/** Fetches `/api/trends.json`. Cache-first so EntitySheet has an indicator
 *  catalog ready on launch; refreshes silently on resume. Returns a map
 *  keyed by indicator id for O(1) EntitySheet lookups. Graceful degrade:
 *  any failure leaves the map empty — tappable entity mentions simply
 *  won't find their indicator and the sheet stays closed. */
export function useTrendsSnapshot(): {
  byId: Map<string, Indicator>;
  indicators: Indicator[];
  /** The whole snapshot — `events`, `releaseCalendar` and all. The market
   *  card builder needs more than the indicator list, and the payload was
   *  already being downloaded whole. */
  snapshot: TrendsSnapshot | null;
  ready: boolean;
} {
  const { data, ready } = useFetchJson(`${API_BASE}/api/trends.json`, isTrendsSnapshot, {
    refreshOnResume: true,
  });
  const indicators = data?.indicators ?? EMPTY_INDICATORS;

  const byId = useMemo(() => {
    const m = new Map<string, Indicator>();
    for (const ind of indicators) m.set(ind.id, ind);
    return m;
  }, [indicators]);

  return { byId, indicators, snapshot: data, ready };
}
