import { GENOCIDE_MARKED, type GenocideSituation } from '@shared/genocide';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isGenocideSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

/**
 * Situations a named UN body has determined to be genocide.
 *
 * ── Why this fetches something it already has ──────────────────────────────
 *
 * `@shared/genocide` is a symlinked TypeScript record, already in the bundle,
 * costing nothing. Reading it directly would be simpler and would also mean a
 * new determination could not reach a single reader without an App Store
 * review — which is the wrong failure mode for precisely this layer. So the
 * hook fetches `/api/genocide.json` (630 bytes gzipped, two entries) and keeps
 * the bundled record as the floor.
 *
 * That makes the fallback the opposite of the one every other layer here
 * makes. GDACS, conflict and chokepoints all degrade to an *empty* list: a
 * disaster feed that cannot be reached is honestly drawn as no disasters
 * known. This one degrades to the last record we shipped, because the absence
 * of a network is not evidence that a genocide determination was withdrawn,
 * and a mark that silently disappears offline would say that it was.
 *
 * The two can only differ by whatever landed in `shared/genocide.ts` after the
 * running build was cut, and the endpoint is written from that same file by
 * `scripts/build.js` — so "newer, or else what we knew" is the whole rule.
 */
export function useGenocide(): { situations: GenocideSituation[]; ready: boolean } {
  const { data, ready } = useFetchJson(`${API_BASE}/api/genocide.json`, isGenocideSnapshot, {
    refreshOnResume: true,
  });
  return useMemo(() => ({ situations: data?.situations ?? GENOCIDE_MARKED, ready }), [data, ready]);
}
