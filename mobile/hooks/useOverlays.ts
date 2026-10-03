import { useMemo } from 'react';
import { API_SNAPSHOTS } from '../lib/api-snapshots';
import { famineTotalsOf } from '../lib/famine-totals';
import type {
  FamineArea,
  FamineCountryTotal,
  GenocideSituation,
  ThermalEvent,
} from '../lib/overlays';
import { useApiJson } from './useApiJson';

/**
 * The three hazard layers, fetched the way every other overlay is: one
 * Cloudflare-cached blob each through `useApiJson`, so a pull on the sheet
 * refetches them with everything else. Any failure leaves the layer empty —
 * a missing layer is a supported state, not an error.
 */

const EMPTY_FAMINE: FamineArea[] = [];
const EMPTY_THERMAL: ThermalEvent[] = [];
const EMPTY_GENOCIDE: GenocideSituation[] = [];

export function useFamineAreas(): FamineArea[] {
  const data = useApiJson(API_SNAPSHOTS.famine);
  return data?.areas ?? EMPTY_FAMINE;
}

/**
 * Each country's caseload, largest first — every analysed area's people, not
 * only the areas grave enough to be marks. Empty on a site that publishes
 * none; kept by the snapshot, so an arrival that changes nothing changes
 * nothing here.
 */
export function useFamineTotals(): FamineCountryTotal[] {
  const data = useApiJson(API_SNAPSHOTS.famine);
  return useMemo(() => famineTotalsOf(data?.totals), [data]);
}

export function useThermalEvents(): ThermalEvent[] {
  const data = useApiJson(API_SNAPSHOTS.thermal);
  return data?.events ?? EMPTY_THERMAL;
}

/**
 * Only `determination` reaches the map. `risk` findings are in the payload so
 * that promoting one is a data edit, but the layer says "as determined by the
 * UN" and a warning is not that statement — see `shared/genocide.ts`.
 */
export function useGenocideSituations(): GenocideSituation[] {
  const data = useApiJson(API_SNAPSHOTS.genocide);
  return useMemo(
    () => data?.situations.filter((s) => s.finding === 'determination') ?? EMPTY_GENOCIDE,
    [data],
  );
}
