import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/fetchJson';
import {
  featureToDetail,
  type GdacsAlert,
  type GdacsDetail,
  gdacsEventDetailUrl,
  isGdacsDetailFeature,
} from '../lib/gdacs';

// Process-lifetime cache. GDACS event-detail responses don't churn (the
// fields we read — population estimates — are computed once per event and
// updated rarely), so a single Map serves every sheet open without TTL
// management. Negative entries are stored as `null` so a 404 / parse fail
// doesn't retry on every re-open. Bounded by event volume — a few dozen
// entries per session at most.
const cache = new Map<string, GdacsDetail | null>();

/** Lazy fetch of richer per-event detail when an alert sheet opens. EQ-only
 *  for now — only earthquakes publish population estimates at this endpoint
 *  (verified against live FL/WF/DR responses). Returns `null` while loading,
 *  on failure, or for non-EQ events. The sheet renders the population stat
 *  only when at least one of the two numbers is present. */
export function useGdacsDetail(alert: GdacsAlert | null): GdacsDetail | null {
  const [detail, setDetail] = useState<GdacsDetail | null>(null);

  useEffect(() => {
    if (!alert || alert.eventtype !== 'EQ') {
      setDetail(null);
      return;
    }

    const key = `${alert.eventtype}:${alert.eventid}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      setDetail(cached);
      return;
    }

    const controller = new AbortController();
    fetchJson(gdacsEventDetailUrl(alert.eventtype, alert.eventid), isGdacsDetailFeature, {
      signal: controller.signal,
      timeoutMs: 6000,
    })
      .then((feature) => {
        const parsed = featureToDetail(feature);
        cache.set(key, parsed);
        setDetail(parsed);
      })
      .catch(() => {
        // Negative cache — failures don't retry on re-open within the session.
        cache.set(key, null);
        setDetail(null);
      });

    return () => controller.abort();
  }, [alert]);

  return detail;
}
