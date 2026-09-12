import { useMemo } from 'react';
import type { FamineArea, GenocideSituation, ThermalEvent } from '../lib/overlays';
import { isFamineSnapshot, isGenocideSnapshot, isThermalSnapshot } from '../lib/validate';
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
  const data = useApiJson('/api/ipc.json', isFamineSnapshot);
  return data?.areas ?? EMPTY_FAMINE;
}

export function useThermalEvents(): ThermalEvent[] {
  const data = useApiJson('/api/firms.json', isThermalSnapshot);
  return data?.events ?? EMPTY_THERMAL;
}

/**
 * Only `determination` reaches the map. `risk` findings are in the payload so
 * that promoting one is a data edit, but the layer says "as determined by the
 * UN" and a warning is not that statement — see `shared/genocide.ts`.
 */
export function useGenocideSituations(): GenocideSituation[] {
  const data = useApiJson('/api/genocide.json', isGenocideSnapshot);
  return useMemo(
    () => data?.situations.filter((s) => s.finding === 'determination') ?? EMPTY_GENOCIDE,
    [data],
  );
}
