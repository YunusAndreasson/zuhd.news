import type { GdacsAlert, GdacsDetail } from '@shared/types';

/** Synchronous lookup into the GdacsSnapshot.details map. Detail (population
 *  estimates) is now pre-fetched server-side per cycle and shipped with the
 *  alert list, so the disaster sheet renders the population row instantly
 *  on open instead of waiting on a lazy network call. Returns null when no
 *  detail exists for this event — true for FL/VO/DR/WF (they surface their
 *  scale through severityText), and for any EQ/TC where the cycle's detail
 *  fetch happened to fail. */
export function useGdacsDetail(
  alert: GdacsAlert | null,
  details: Record<string, GdacsDetail>,
): GdacsDetail | null {
  if (!alert) return null;
  if (alert.eventtype !== 'EQ' && alert.eventtype !== 'TC') return null;
  return details[`${alert.eventtype}:${alert.eventid}`] ?? null;
}
