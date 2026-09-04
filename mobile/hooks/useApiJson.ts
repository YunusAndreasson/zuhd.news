import { type QueryClient, useQuery } from '@tanstack/react-query';
import { API_BASE } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';

/** The prefix every `useApiJson` query shares, so one invalidation reaches
 *  all of them. `invalidateApiJson` is the only thing that should refetch
 *  these on a foreground return — see below. */
export const API_JSON_QUERY_KEY = ['fetch-json'] as const;

/**
 * Mark every API snapshot stale, so each mounted one refetches.
 *
 * Called by the feed's resume path when its `/api/meta.json` probe says the
 * site was rebuilt. Every payload here is a build output, so `generated`
 * moving is the one honest signal that any of them changed.
 */
export function invalidateApiJson(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: API_JSON_QUERY_KEY });
}

/**
 * Read-only API JSON hook over `useQuery`. Cache-first via TanStack Query's
 * persister (configured in `lib/query-client.ts`): hydrated from disk on
 * startup, refetched on mount if stale, persisted across launches.
 *
 * Graceful degrade: any failure leaves `data` as null — callers handle the
 * empty state.
 *
 * Not refetched on focus. With the default, every foreground return after
 * five minutes re-downloaded trends, chokepoints and analysis — ~150KB — on
 * an app whose central claim is that it barely uses data, whether or not the
 * site had been rebuilt. The feed already answers that question with a 0.2KB
 * probe on resume; `invalidateApiJson` lets these ride the same answer.
 * Reconnects still refetch: they are rare, and `staleTime` still gates them.
 */
export function useApiJson<T>(
  path: `/api/${string}`,
  validate: (raw: unknown) => raw is T,
): T | null {
  const url = `${API_BASE}${path}`;
  const query = useQuery<T, Error>({
    queryKey: [...API_JSON_QUERY_KEY, url],
    queryFn: ({ signal }) => fetchJson<T>(url, validate, { signal }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // Persister roundtrip needs a structural-clone-safe payload; queryFn
    // returns plain JSON so no special serializer needed.
  });

  return query.data ?? null;
}
