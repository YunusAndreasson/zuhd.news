import { type QueryClient, useQuery } from '@tanstack/react-query';
import { API_JSON_QUERY_KEY, type ApiSnapshot, fetchSnapshot } from '../lib/api-snapshots';

export { API_JSON_QUERY_KEY };

/**
 * Mark every API snapshot stale, so each mounted one refetches.
 *
 * A return to the app no longer goes through this: an arrival fetches every
 * snapshot and applies them with the feed in one commit (`useArticles`).
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
 * probe on resume, and an arrival carries these with it (`lib/api-snapshots.ts`).
 * Reconnects still refetch: they are rare, and `staleTime` still gates them.
 */
export function useApiJson<T>(snapshot: ApiSnapshot<T>): T | null {
  const query = useQuery<T, Error>({
    queryKey: snapshot.queryKey,
    queryFn: ({ signal }) => fetchSnapshot(snapshot, { signal }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // Persister roundtrip needs a structural-clone-safe payload; queryFn
    // returns plain JSON so no special serializer needed.
  });

  return query.data ?? null;
}
