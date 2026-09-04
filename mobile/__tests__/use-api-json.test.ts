const mockUseQuery = jest.fn((_options: unknown) => ({ data: null }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

import { API_JSON_QUERY_KEY, invalidateApiJson, useApiJson } from '../hooks/useApiJson';

const isAnything = (raw: unknown): raw is { ok: true } => raw !== undefined;

describe('useApiJson', () => {
  it('does not refetch on focus, and keys every query under the shared prefix', () => {
    // Every foreground return after five minutes used to re-download ~150KB of
    // snapshots whether or not the site had been rebuilt. The feed's meta
    // probe decides that now, through `invalidateApiJson`, and the prefix is
    // the contract between the two files.
    useApiJson('/api/trends.json', isAnything);
    const options = mockUseQuery.mock.calls[0]?.[0] as unknown as {
      queryKey: unknown[];
      refetchOnWindowFocus: boolean;
      refetchOnReconnect: boolean;
    };
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchOnReconnect).toBe(true);
    expect(options.queryKey[0]).toBe(API_JSON_QUERY_KEY[0]);
    expect(String(options.queryKey[1])).toContain('/api/trends.json');
  });

  it('invalidates by that prefix and nothing narrower', async () => {
    const invalidateQueries = jest.fn(() => Promise.resolve());
    await invalidateApiJson({ invalidateQueries } as never);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: API_JSON_QUERY_KEY });
  });
});
