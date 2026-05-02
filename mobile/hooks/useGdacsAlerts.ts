import type { GdacsAlert, GdacsDetail } from '@shared/types';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isGdacsSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

const EMPTY_ALERTS: GdacsAlert[] = [];
const EMPTY_DETAILS: Record<string, GdacsDetail> = {};

/** Fetches the pre-built GDACS snapshot from /api/gdacs.json. The pipeline
 *  pulls EVENTS4APP + EQ/TC population details once per cycle (stage 3.4c)
 *  so every install reads one Cloudflare-cached blob instead of hitting
 *  gdacs.org on launch + every disaster sheet open. Graceful degrade: any
 *  failure leaves the disaster layer empty. */
export function useGdacsAlerts(): {
  alerts: GdacsAlert[];
  details: Record<string, GdacsDetail>;
} {
  const snapshot = useFetchJson(`${API_BASE}/api/gdacs.json`, isGdacsSnapshot);
  return useMemo(
    () => ({
      alerts: snapshot?.alerts ?? EMPTY_ALERTS,
      details: snapshot?.details ?? EMPTY_DETAILS,
    }),
    [snapshot],
  );
}
