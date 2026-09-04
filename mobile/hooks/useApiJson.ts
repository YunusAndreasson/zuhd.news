import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';

/**
 * Read-only API JSON hook over `useQuery`. Cache-first via TanStack Query's
 * persister (configured in `lib/query-client.ts`): hydrated from disk on
 * startup, refetched on mount if stale, persisted across launches.
 *
 * Graceful degrade: any failure leaves `data` as null — callers handle the
 * empty state. API snapshots consistently refresh on reconnect and resume.
 */
export function useApiJson<T>(
  path: `/api/${string}`,
  validate: (raw: unknown) => raw is T,
): T | null {
  const url = `${API_BASE}${path}`;
  const query = useQuery<T, Error>({
    queryKey: ['fetch-json', url],
    queryFn: ({ signal }) => fetchJson<T>(url, validate, { signal }),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Persister roundtrip needs a structural-clone-safe payload; queryFn
    // returns plain JSON so no special serializer needed.
  });

  return query.data ?? null;
}
