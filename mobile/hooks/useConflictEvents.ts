import type { ConflictEvent } from '@shared/types';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isConflictSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

const EMPTY_EVENTS: ConflictEvent[] = [];

/** Fetches the pre-built UCDP conflict snapshot from /api/conflict.json.
 *  The pipeline pulls + filters UCDP candidate GED once per cycle (stage
 *  3.4c2) so every install reads one Cloudflare-cached blob instead of
 *  hitting ucdp.uu.se on launch. Graceful degrade: any failure leaves
 *  the conflict layer empty. */
export function useConflictEvents(): { events: ConflictEvent[] } {
  const snapshot = useFetchJson(`${API_BASE}/api/conflict.json`, isConflictSnapshot);
  return useMemo(() => ({ events: snapshot?.events ?? EMPTY_EVENTS }), [snapshot]);
}
