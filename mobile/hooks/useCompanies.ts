import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COMPANIES_SNAPSHOT, fetchSnapshotIfChanged } from '../lib/api-snapshots';
import type { CompaniesSnapshot, Company } from '../lib/companies';

/** Where the list stands while the app holds no copy of it. */
export type CompaniesWait = 'waiting' | 'failed';

export interface CompaniesState {
  /** Null until the list has been fetched once. */
  companies: Company[] | null;
  /**
   * Set while the menu is open with no copy to show: the first fetch is on
   * its way, or it did not arrive. Either way the menu keeps the list's row —
   * see `buildInstrumentCatalog`.
   */
  wait: CompaniesWait | null;
}

/**
 * The menu's company list, fetched when the menu opens (`wanted`) and not
 * before (`COMPANIES_SNAPSHOT` says why it is not part of an arrival).
 *
 * Reopened inside the client's five-minute `staleTime` it asks nothing; after
 * that it asks whether the file changed, and an unchanged one costs a 304.
 * One attempt, no retries: three timeouts is fifteen seconds of a row saying
 * it is loading. The next opening of the menu asks again, and so does the
 * connection coming back while the menu is open.
 */
export function useCompanies(wanted: boolean): CompaniesState {
  const queryClient = useQueryClient();
  const query = useQuery<CompaniesSnapshot, Error>({
    queryKey: COMPANIES_SNAPSHOT.queryKey,
    queryFn: ({ signal }) =>
      fetchSnapshotIfChanged(
        COMPANIES_SNAPSHOT,
        queryClient.getQueryData<CompaniesSnapshot>(COMPANIES_SNAPSHOT.queryKey),
        { signal },
      ),
    enabled: wanted,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
  const held = query.data !== undefined;
  return {
    companies: query.data?.companies ?? null,
    wait:
      held || !wanted
        ? null
        : // Paused is offline: nothing is on its way.
          query.isError || query.fetchStatus === 'paused'
          ? 'failed'
          : 'waiting',
  };
}
