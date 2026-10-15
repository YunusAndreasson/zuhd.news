import { useQuery } from '@tanstack/react-query';
import { type ApiSnapshot, fetchSnapshot, snapshotData } from '../lib/api-snapshots';

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
 * Reconnects use the same coordinated arrival; failed query-owned loads are
 * included in its retry even when the feed build has not changed.
 */
export function useApiJson<T>(snapshot: ApiSnapshot<T>): T | null {
  const query = useQuery({
    queryKey: snapshot.queryKey,
    queryFn: ({ signal }) => fetchSnapshot(snapshot, { signal }),
    select: snapshotData<T>,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Persister roundtrip needs a structural-clone-safe payload; queryFn
    // returns plain JSON so no special serializer needed.
  });

  return query.data ?? null;
}
