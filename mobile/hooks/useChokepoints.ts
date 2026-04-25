import type { Chokepoint } from '@shared/types';
import { API_BASE } from '../constants/theme';
import { isChokepointSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

/** Fetches the ambient chokepoint snapshot once at mount. Graceful degrade:
 *  any failure (network, malformed payload, missing endpoint) leaves the
 *  returned list empty — the globe simply skips the chokepoint layer. There's
 *  no retry; the data is refreshed on the next app session. */
export function useChokepoints(): { chokepoints: Chokepoint[] } {
  const snapshot = useFetchJson(`${API_BASE}/api/chokepoints.json`, isChokepointSnapshot);
  return { chokepoints: snapshot?.chokepoints ?? [] };
}
