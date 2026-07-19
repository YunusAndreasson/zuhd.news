import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/fetchJson';

interface Options {
  /** Re-fetch when the app returns to the foreground after STALE_THRESHOLD.
   *  Implemented by invalidating the query so the next observation re-fetches. */
  refreshOnResume?: boolean;
}

interface Result<T> {
  data: T | null;
  /** True after the first cache or network attempt has completed. Use for splash gating. */
  ready: boolean;
}

/**
 * Read-only GET-once hook over `useQuery`. Cache-first via TanStack Query's
 * persister (configured in `lib/query-client.ts`): hydrated from disk on
 * startup, refetched on mount if stale, persisted across launches.
 *
 * Graceful degrade: any failure leaves `data` as null — callers handle the
 * empty state. Matches the previous useFetchJson contract.
 */
export function useFetchJson<T>(
  url: string,
  validate: (raw: unknown) => raw is T,
  options?: Options,
): Result<T> {
  const refreshOnResume = options?.refreshOnResume ?? false;
  const query = useQuery<T, Error>({
    queryKey: ['fetch-json', url],
    queryFn: ({ signal }) => fetchJson<T>(url, validate, { signal }),
    refetchOnWindowFocus: refreshOnResume,
    refetchOnReconnect: refreshOnResume,
    // Persister roundtrip needs a structural-clone-safe payload; queryFn
    // returns plain JSON so no special serializer needed.
  });

  return {
    data: query.data ?? null,
    ready: query.isFetched,
  };
}
