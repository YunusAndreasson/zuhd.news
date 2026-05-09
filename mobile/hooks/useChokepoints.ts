import type { Chokepoint } from '@shared/types';
import { API_BASE } from '../constants/theme';
import { isChokepointSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

/** Fetches the ambient chokepoint snapshot. Cache-first so the layer is warm
 *  on relaunch; refreshes silently on app resume. Graceful degrade: any
 *  failure (network, malformed payload, missing endpoint) leaves the returned
 *  list empty — the globe simply skips the chokepoint layer. */
export function useChokepoints(): { chokepoints: Chokepoint[]; ready: boolean } {
  const { data, ready } = useFetchJson(`${API_BASE}/api/chokepoints.json`, isChokepointSnapshot, {
    cacheFilename: 'zuhd-chokepoints.json',
    refreshOnResume: true,
  });
  return { chokepoints: data?.chokepoints ?? [], ready };
}
