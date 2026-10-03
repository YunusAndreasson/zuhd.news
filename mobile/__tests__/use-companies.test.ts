jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
const mockUseQuery = jest.fn((_options: unknown) => ({ data: null }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

import { useCompanies } from '../hooks/useCompanies';
import { API_JSON_QUERY_KEY, API_SNAPSHOTS } from '../lib/api-snapshots';

describe('useCompanies', () => {
  it('reads the copy an arrival keeps current, under the shared prefix', () => {
    // The strip shows the companies from launch, so the list cannot wait for
    // the menu: it is one of the snapshots a new build arrives with.
    useCompanies();
    const options = mockUseQuery.mock.calls[0]?.[0] as unknown as { queryKey: unknown[] };
    expect(options.queryKey).toEqual(API_SNAPSHOTS.companies.queryKey);
    expect(options.queryKey[0]).toBe(API_JSON_QUERY_KEY[0]);
    expect(String(options.queryKey[1])).toContain('/api/companies.json');
  });
});
