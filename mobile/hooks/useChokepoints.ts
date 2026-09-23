import type { Chokepoint } from '@shared/types';
import { API_SNAPSHOTS } from '../lib/api-snapshots';
import { useApiJson } from './useApiJson';

const EMPTY_CHOKEPOINTS: Chokepoint[] = [];

/** Fetches the ambient chokepoint snapshot. Cache-first so the layer is warm
 *  on relaunch; refreshes silently on app resume. Graceful degrade: any
 *  failure (network, malformed payload, missing endpoint) leaves the returned
 *  list empty — the globe simply skips the chokepoint layer. */
export function useChokepoints(): { chokepoints: Chokepoint[] } {
  const data = useApiJson(API_SNAPSHOTS.chokepoints);
  return { chokepoints: data?.chokepoints ?? EMPTY_CHOKEPOINTS };
}
