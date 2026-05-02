import { useEffect, useState } from 'react';
import { fetchGdacsDetail, type GdacsAlert, type GdacsDetail } from '../lib/gdacs';

// Process-lifetime cache. GDACS event-detail responses don't churn (the
// fields we read — population estimates — are computed once per event
// and updated rarely), so a single Map serves every sheet open without
// TTL management. Negative entries are stored as `null` so a 404 / parse
// fail doesn't retry on every re-open. Bounded by event volume — a few
// dozen entries per session at most.
const cache = new Map<string, GdacsDetail | null>();

/** Lazy fetch of richer per-event detail when an alert sheet opens.
 *  Currently dispatches per event type: EQ pulls population from
 *  `earthquakedetails`; TC chains a second request through the JTWC
 *  buffer impact endpoint to read `POP_AFFECTED`. Other event types
 *  resolve to `null` (FL/WF/DR/VO publish their relevant scale via
 *  `severityText` already; no equivalent population block at this
 *  endpoint). Returns `null` while loading, on any failure, or when
 *  GDACS publishes nothing meaningful for this alert. */
export function useGdacsDetail(alert: GdacsAlert | null): GdacsDetail | null {
  const [detail, setDetail] = useState<GdacsDetail | null>(null);

  useEffect(() => {
    if (!alert || (alert.eventtype !== 'EQ' && alert.eventtype !== 'TC')) {
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
    fetchGdacsDetail(alert, controller.signal)
      .then((parsed) => {
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
