jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
const mockUseQuery = jest.fn((_options: unknown) => ({ data: null }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

import { useApiJson } from '../hooks/useApiJson';
import { API_JSON_QUERY_KEY, API_SNAPSHOTS } from '../lib/api-snapshots';

describe('useApiJson', () => {
  it('does not refetch on focus, and keys every query under the shared prefix', () => {
    // Every foreground return after five minutes used to re-download ~150KB of
    // snapshots whether or not the site had been rebuilt. An arrival carries
    // them now (`lib/arrival.ts`), and the prefix keys every one of them.
    useApiJson(API_SNAPSHOTS.trends);
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
});
