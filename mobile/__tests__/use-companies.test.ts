jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

interface QueryResult {
  data?: { companies: unknown[] };
  isError?: boolean;
  fetchStatus?: 'idle' | 'fetching' | 'paused';
}
const mockUseQuery = jest.fn((_options: unknown): QueryResult => ({}));
const mockGetQueryData = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useQueryClient: () => ({ getQueryData: mockGetQueryData }),
}));

import { useCompanies } from '../hooks/useCompanies';
import { COMPANIES_SNAPSHOT } from '../lib/api-snapshots';

const optionsOf = () =>
  mockUseQuery.mock.calls.at(-1)?.[0] as {
    queryKey: unknown[];
    enabled: boolean;
    retry: boolean;
    refetchOnWindowFocus: boolean;
  };

beforeEach(() => {
  mockUseQuery.mockReset();
  mockUseQuery.mockReturnValue({});
});

describe('useCompanies', () => {
  it('asks for the list only while the menu wants it', () => {
    useCompanies(false);
    expect(optionsOf().enabled).toBe(false);
    expect(optionsOf().queryKey).toEqual(COMPANIES_SNAPSHOT.queryKey);
    useCompanies(true);
    expect(optionsOf().enabled).toBe(true);
  });

  it('tries once: a row saying it is loading must not say so for three timeouts', () => {
    useCompanies(true);
    expect(optionsOf().retry).toBe(false);
    expect(optionsOf().refetchOnWindowFocus).toBe(false);
  });

  it('waits for nothing while the menu is closed', () => {
    expect(useCompanies(false)).toEqual({ companies: null, wait: null });
  });

  it('says the first fetch is on its way', () => {
    mockUseQuery.mockReturnValue({ fetchStatus: 'fetching' });
    expect(useCompanies(true).wait).toBe('waiting');
    // The render the menu opens on, before the fetch has been started.
    mockUseQuery.mockReturnValue({ fetchStatus: 'idle' });
    expect(useCompanies(true).wait).toBe('waiting');
  });

  it('says so when the list did not arrive, and when nothing can be asked', () => {
    // Not null: the menu keeps the row either way. Dropped to null here, the
    // row gave its place up five seconds after the menu opened and every row
    // under it moved up one — a tap on it opened `straits`.
    mockUseQuery.mockReturnValue({ isError: true, fetchStatus: 'idle' });
    expect(useCompanies(true).wait).toBe('failed');
    // Offline: the query is paused and nothing is on its way.
    mockUseQuery.mockReturnValue({ fetchStatus: 'paused' });
    expect(useCompanies(true).wait).toBe('failed');
  });

  it('waits for nothing once it holds a copy, even one being refreshed or failing to', () => {
    const companies = [{ id: 'nvidia' }];
    mockUseQuery.mockReturnValue({ data: { companies }, fetchStatus: 'fetching' });
    expect(useCompanies(true)).toEqual({ companies, wait: null });
    mockUseQuery.mockReturnValue({ data: { companies }, isError: true, fetchStatus: 'idle' });
    expect(useCompanies(true)).toEqual({ companies, wait: null });
  });
});
