import type { ConflictEvent } from '@shared/types';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isConflictSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

const EMPTY_EVENTS: ConflictEvent[] = [];

/** Filter to events on the snapshot's most-recent calendar day. Anchored
 *  on the *snapshot's* max date rather than `Date.now()` because UCDP
 *  candidate trails real-time by 1-3 months — using "today" as the
 *  reference would yield an empty layer whenever the snapshot is more
 *  than a day stale. */
function filterToLastDay(events: ConflictEvent[]): ConflictEvent[] {
  if (events.length === 0) return EMPTY_EVENTS;
  let latestDate = '';
  for (const e of events) {
    if (e.eventDate > latestDate) latestDate = e.eventDate;
  }
  if (latestDate === '') return EMPTY_EVENTS;
  return events.filter((e) => e.eventDate === latestDate);
}

/** Fetches the pre-built UCDP conflict snapshot from /api/conflict.json.
 *  The pipeline pulls + filters UCDP candidate GED once per cycle (stage
 *  3.4c2) so every install reads one Cloudflare-cached blob instead of
 *  hitting ucdp.uu.se on launch. Cache-first + resume refresh. Graceful
 *  degrade: any failure leaves the conflict layer empty.
 *
 *  Server feeds a 7-day window for other potential consumers; mobile
 *  narrows to the most-recent calendar day to keep marker density
 *  readable at globe scale (~40 markers vs ~250). The filter runs once
 *  per snapshot reference change, not per render. */
export function useConflictEvents(): { events: ConflictEvent[]; ready: boolean } {
  const { data, ready } = useFetchJson(`${API_BASE}/api/conflict.json`, isConflictSnapshot, {
    cacheFilename: 'zuhd-conflict.json',
    refreshOnResume: true,
  });
  return useMemo(
    () => ({ events: data ? filterToLastDay(data.events) : EMPTY_EVENTS, ready }),
    [data, ready],
  );
}
