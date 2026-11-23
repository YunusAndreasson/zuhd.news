const mockFocusListener = jest.fn();
const mockOnlineListener = jest.fn();
const mockQueryClient = jest.fn((options: unknown) => ({ options }));
const mockCreatePersister = jest.fn((options: unknown) => ({ options }));
const mockNetworkListener = jest.fn();
const mockGetNetworkState = jest.fn();
const mockAppStateListener = jest.fn();
const mockStorage = {
  getItemSync: jest.fn(() => null),
  setItemSync: jest.fn(),
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  focusManager: {
    setEventListener: (...args: unknown[]) => mockFocusListener(...args),
  },
  onlineManager: {
    setEventListener: (...args: unknown[]) => mockOnlineListener(...args),
  },
  QueryClient: function QueryClient(options: unknown) {
    return mockQueryClient(options);
  },
}));

jest.mock('@tanstack/query-async-storage-persister', () => ({
  createAsyncStoragePersister: (options: unknown) => mockCreatePersister(options),
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: (...args: unknown[]) => mockNetworkListener(...args),
  getNetworkStateAsync: (...args: unknown[]) => mockGetNetworkState(...args),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: { hairlineWidth: 0.5 },
  AppState: {
    currentState: 'active',
    addEventListener: (...args: unknown[]) => mockAppStateListener(...args),
  },
}));

const mockLegacyFile = { exists: false, text: '' };
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: class MockFile {
    get exists() {
      return mockLegacyFile.exists;
    }
    textSync() {
      return mockLegacyFile.text;
    }
    delete() {
      mockLegacyFile.exists = false;
    }
  },
}));

jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: mockStorage }));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNetworkState.mockResolvedValue({ isConnected: true });
  mockLegacyFile.exists = false;
  mockLegacyFile.text = '';
});

describe('the cache an older build kept in a file', () => {
  it('costs a launch nothing once it is gone', () => {
    // Asked about first, the kv store read the whole persisted cache — the
    // feed and every snapshot — synchronously, before the first frame.
    jest.isolateModules(() => require('../lib/query-client'));
    expect(mockStorage.getItemSync).not.toHaveBeenCalled();
  });

  it('is moved once and deleted', () => {
    mockLegacyFile.exists = true;
    mockLegacyFile.text = JSON.stringify({ REACT_QUERY_OFFLINE_CACHE: '{"clientState":{}}' });
    jest.isolateModules(() => require('../lib/query-client'));
    expect(mockStorage.setItemSync).toHaveBeenCalledWith(
      'REACT_QUERY_OFFLINE_CACHE',
      '{"clientState":{}}',
    );
    expect(mockLegacyFile.exists).toBe(false);
  });

  it('is deleted unread when it cannot be read, rather than asked about every launch', () => {
    mockLegacyFile.exists = true;
    mockLegacyFile.text = '{broken';
    jest.isolateModules(() => require('../lib/query-client'));
    expect(mockStorage.setItemSync).not.toHaveBeenCalled();
    expect(mockLegacyFile.exists).toBe(false);
  });
});

describe('TanStack Query native lifecycle configuration', () => {
  it('bridges AppState transitions to focusManager and cleans up', () => {
    const remove = jest.fn();
    let appStateChange: ((state: string) => void) | undefined;
    mockAppStateListener.mockImplementation((_event: string, callback: (state: string) => void) => {
      appStateChange = callback;
      return { remove };
    });
    jest.isolateModules(() => require('../lib/query-client'));

    const install = mockFocusListener.mock.calls[0][0] as (
      setFocused: (v: boolean) => void,
    ) => () => void;
    const setFocused = jest.fn();
    const cleanup = install(setFocused);
    expect(setFocused).toHaveBeenCalledWith(true);

    appStateChange?.('background');
    appStateChange?.('active');
    expect(setFocused.mock.calls.map(([value]) => value)).toEqual([true, false, true]);
    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('bridges network events and ignores a stale initial probe after an event', async () => {
    const remove = jest.fn();
    let networkChange: ((state: { isConnected: boolean }) => void) | undefined;
    let resolveInitial: ((state: { isConnected: boolean }) => void) | undefined;
    mockGetNetworkState.mockReturnValue(
      new Promise((resolve) => {
        resolveInitial = resolve;
      }),
    );
    mockNetworkListener.mockImplementation((callback: typeof networkChange) => {
      networkChange = callback;
      return { remove };
    });
    jest.isolateModules(() => require('../lib/query-client'));

    const install = mockOnlineListener.mock.calls[0][0] as (
      setOnline: (v: boolean) => void,
    ) => () => void;
    const setOnline = jest.fn();
    const cleanup = install(setOnline);
    networkChange?.({ isConnected: false });
    resolveInitial?.({ isConnected: true });
    await Promise.resolve();

    expect(setOnline).toHaveBeenCalledTimes(1);
    expect(setOnline).toHaveBeenCalledWith(false);
    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('prefers internet reachability and ignores an initial result after cleanup', async () => {
    mockGetNetworkState.mockResolvedValue({ isConnected: true });
    mockNetworkListener.mockReturnValue({ remove: jest.fn() });
    jest.isolateModules(() => require('../lib/query-client'));
    const install = mockOnlineListener.mock.calls[0][0];
    const online = jest.fn();
    const cleanup = install(online);
    const event = mockNetworkListener.mock.calls[0][0];
    event({});
    expect(online).not.toHaveBeenCalled();
    event({ isConnected: true, isInternetReachable: false });
    expect(online).toHaveBeenLastCalledWith(false);
    cleanup();
    const cleanupPending = install(online);
    cleanupPending();
    await Promise.resolve();
    expect(online).toHaveBeenCalledTimes(1);
  });

  it('shares a native listener and replays its current state to a later subscriber', () => {
    const remove = jest.fn();
    mockNetworkListener.mockReturnValue({ remove });
    jest.isolateModules(() => require('../lib/query-client'));
    const install = mockOnlineListener.mock.calls[0][0];
    const first = install(jest.fn());
    mockNetworkListener.mock.calls[0][0]({ isInternetReachable: false });
    const online = jest.fn();
    const second = install(online);
    expect(online).toHaveBeenCalledWith(false);
    expect(mockNetworkListener).toHaveBeenCalledTimes(1);
    expect(mockGetNetworkState).toHaveBeenCalledTimes(1);
    first();
    expect(remove).not.toHaveBeenCalled();
    second();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('enables focus/reconnect refetch and gives the persister the SQLite adapter', () => {
    jest.isolateModules(() => require('../lib/query-client'));

    expect(mockQueryClient).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultOptions: expect.objectContaining({
          queries: expect.objectContaining({
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          }),
        }),
      }),
    );
    expect(mockCreatePersister).toHaveBeenCalledWith(
      expect.objectContaining({ storage: mockStorage, throttleTime: 1000 }),
    );
  });
});
