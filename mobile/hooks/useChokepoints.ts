import { useEffect, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from '../lib/fetch';
import { isChokepointSnapshot } from '../lib/validate';
import type { Chokepoint } from '../types';

/** Fetches the ambient chokepoint snapshot once at mount. Graceful degrade:
 *  any failure (network, malformed payload, missing endpoint) leaves the
 *  returned list empty — the globe simply skips the chokepoint layer. There's
 *  no retry; the data is refreshed on the next app session. */
export function useChokepoints(): { chokepoints: Chokepoint[] } {
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/chokepoints.json`, 5000, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: unknown = await res.json();
        if (!isChokepointSnapshot(raw)) throw new Error('Malformed chokepoint snapshot');
        if (!cancelled) setChokepoints(raw.chokepoints);
      } catch {
        // Silent — an empty chokepoint list is a valid render path.
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { chokepoints };
}
