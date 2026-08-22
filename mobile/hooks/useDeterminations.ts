import type { Determination } from '@shared/types';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { NEVER_PERSIST } from '../lib/query-client';
import { isGenocideSnapshot } from '../lib/validate';

/**
 * Fetches `/api/genocide.json` — situations where a named body has published a
 * named document reaching a genocide determination.
 *
 * Network-only, deliberately, and the one hook in the app that is. Everything
 * else here is cache-first because a reader on a train would rather see
 * yesterday's feed than a spinner. This payload is different: the card is a
 * citation, and rendering it from disk means restating a finding on a launch
 * where nothing confirmed it is still current. The layer shipped once
 * (`f960d983`), was reverted while chasing an unrelated launch abort
 * (`41732ffc`, root-caused later in `4d94dc9a`), and that revert note is
 * explicit about the terms of re-landing it: behind a network-only hook with
 * no synchronous fallback.
 *
 * So: `NEVER_PERSIST` keeps it off disk, `staleTime: 0` re-checks on every
 * mount, and there is no bundled fixture to fall back to. No network, no card.
 */
export function useDeterminations(): { determinations: Determination[]; ready: boolean } {
  const query = useQuery({
    queryKey: ['determinations'],
    queryFn: ({ signal }) =>
      fetchJson(`${API_BASE}/api/genocide.json`, isGenocideSnapshot, { signal }),
    meta: NEVER_PERSIST,
    staleTime: 0,
    gcTime: 0,
  });

  return { determinations: query.data?.situations ?? [], ready: query.isFetched };
}
