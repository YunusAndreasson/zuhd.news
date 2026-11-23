import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { act, renderHook, waitFor } from '@testing-library/react';
import Storage from 'expo-sqlite/kv-store';
import { useState, type ReactNode } from 'react';
import { useHeatmap } from '../hooks/useHeatmap';
import { fetchJsonIfChanged } from '../lib/fetchJson';
import {
  getLaunchQueryClient,
  immediatePersister,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  queryClient,
} from '../lib/query-client';

const mockDisk = new Map<string, string>();
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => mockDisk.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, update: (previous: string | null) => string) => {
      mockDisk.set(key, update(mockDisk.get(key) ?? null));
    }),
    getItem: jest.fn(async (key: string) => mockDisk.get(key) ?? null),
    multiSet: async (pairs: [string, string][]) => {
      for (const [key, value] of pairs) mockDisk.set(key, value);
    },
    multiRemove: async (keys: string[]) => {
      for (const key of keys) mockDisk.delete(key);
    },
    removeItem: async (key: string) => mockDisk.delete(key),
  },
}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '/cache' } }));
jest.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove() {} }),
  getNetworkStateAsync: async () => ({ isConnected: true }),
}));
jest.mock('../lib/fetchJson', () => ({ fetchJsonIfChanged: jest.fn() }));

const oldBuild = '2026-11-21T12:00:00Z';
const newBuild = '2026-11-22T12:00:00Z';
const points = [{ lat: 42, lng: 4, c: 3, t: Date.parse(oldBuild), l: 'one' }];
const heat = { generated: oldBuild, points };
const tagged = { snapshot: heat, etag: 'old-tag' };
const fullCacheKey = 'REACT_QUERY_OFFLINE_CACHE';

function saved(data: unknown = tagged) {
  const lastSession = new QueryClient();
  lastSession.setQueryData(['heatmap'], data, { updatedAt: Date.now() - 10_000 });
  lastSession.setQueryData(['other layer'], { payload: 'not needed for first frame' });
  return { timestamp: Date.now(), buster: PERSIST_BUSTER, clientState: dehydrate(lastSession) };
}

beforeEach(() => {
  mockDisk.clear();
  queryClient.clear();
  jest.clearAllMocks();
});

function LaunchProvider({ children }: { children: ReactNode }) {
  const [client] = useState(getLaunchQueryClient);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ buster: PERSIST_BUSTER, persister: immediatePersister }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

it('supplies cached points on the first render while bulk restore is pending, then refreshes a different build', async () => {
  const previous = saved();
  await immediatePersister.persistClient(previous);
  let finishRestore!: () => void;
  const restore = new Promise<void>((resolve) => {
    finishRestore = resolve;
  });
  const fresh = { generated: newBuild, points: [{ ...points[0], c: 9 }] };
  jest
    .mocked(fetchJsonIfChanged)
    .mockResolvedValue({ changed: true, data: fresh, etag: 'new-tag' });
  jest.mocked(Storage.getItem).mockImplementationOnce(async (key) => {
    await restore;
    return mockDisk.get(key) ?? null;
  });
  const { result } = renderHook(() => useHeatmap(newBuild), { wrapper: LaunchProvider });
  expect(result.current).toEqual({ points, ready: true });
  expect(queryClient.getQueryData(['other layer'])).toBeUndefined();
  expect(Storage.getItemSync).not.toHaveBeenCalledWith(fullCacheKey);
  expect(mockDisk.get('REACT_QUERY_LAUNCH_HEAT')).not.toContain('other layer');
  expect(fetchJsonIfChanged).not.toHaveBeenCalled();
  await act(async () => finishRestore());
  await waitFor(() => expect(result.current.points).toEqual(fresh.points));
  expect(fetchJsonIfChanged).toHaveBeenCalledTimes(1);
  expect(fetchJsonIfChanged).toHaveBeenCalledWith(
    expect.stringContaining('/heatmap.json'),
    expect.any(Function),
    expect.objectContaining({ etag: 'old-tag' }),
  );
});

it('opens an older cache at its real query time, including a bare payload', () => {
  const previous = saved(heat);
  mockDisk.set(fullCacheKey, JSON.stringify(previous));
  const client = getLaunchQueryClient();
  expect(client.getQueryData(['heatmap'])).toEqual(heat);
  expect(client.getQueryState(['heatmap'])?.dataUpdatedAt).toBe(
    previous.clientState.queries[0]?.state.dataUpdatedAt,
  );
  expect(client.getQueryData(['other layer'])).toBeUndefined();
});

it('keeps a headless arrival already in memory', async () => {
  await immediatePersister.persistClient(saved());
  const live = { snapshot: { generated: newBuild, points: [] }, etag: 'new-tag' };
  queryClient.setQueryData(['heatmap'], live);
  expect(getLaunchQueryClient().getQueryData(['heatmap'])).toBe(live);
  expect(Storage.getItemSync).not.toHaveBeenCalled();
});

it('keeps the same points through bulk restore and accepts a newer persisted heatmap', async () => {
  const previous = saved();
  await immediatePersister.persistClient(previous);
  const client = getLaunchQueryClient();
  const first = client.getQueryData(['heatmap']);
  expect(first).toEqual(tagged);
  hydrate(client, previous.clientState);
  expect(client.getQueryData(['heatmap'])).toBe(first);
  const newer = new QueryClient();
  const empty = { snapshot: { generated: newBuild, points: [] }, etag: 'empty' };
  newer.setQueryData(['heatmap'], empty);
  hydrate(client, dehydrate(newer));
  expect(client.getQueryData(['heatmap'])).toEqual(empty);
});

it('honours expiry, buster, payload validation and removal on the early read', async () => {
  const good = saved();
  for (const bad of [
    { ...good, timestamp: Date.now() - PERSIST_MAX_AGE_MS - 1 },
    { ...good, buster: 'retired' },
    saved({ snapshot: { generated: oldBuild, points: [{}] }, etag: null }),
  ]) {
    await immediatePersister.persistClient(bad);
    expect(getLaunchQueryClient().getQueryData(['heatmap'])).toBeUndefined();
  }
  await immediatePersister.persistClient(good);
  const removal = immediatePersister.removeClient();
  // An activity can remount after the memory cache was cleared but before
  // the queued SQLite transaction has deleted its two keys.
  expect(getLaunchQueryClient().getQueryData(['heatmap'])).toBeUndefined();
  await removal;
  expect(mockDisk.size).toBe(0);
  expect(getLaunchQueryClient().getQueryData(['heatmap'])).toBeUndefined();
});

it('migrates a legacy launch once even when the reader closes before any query changes', async () => {
  const previous = saved();
  mockDisk.set(fullCacheKey, JSON.stringify(previous));
  expect(getLaunchQueryClient().getQueryData(['heatmap'])).toEqual(tagged);
  await waitFor(() => expect(mockDisk.has('REACT_QUERY_LAUNCH_HEAT')).toBe(true));
  expect(mockDisk.get('REACT_QUERY_LAUNCH_HEAT')).not.toContain('other layer');
  queryClient.clear();
  jest.mocked(Storage.getItemSync).mockClear();
  expect(getLaunchQueryClient().getQueryData(['heatmap'])).toEqual(tagged);
  expect(Storage.getItemSync).not.toHaveBeenCalledWith(fullCacheKey);
});

it('keeps a newer save queued ahead of legacy migration and an erase queued behind it', async () => {
  mockDisk.set(fullCacheKey, JSON.stringify(saved()));
  const fresh = { snapshot: { generated: newBuild, points: [] }, etag: 'new-tag' };
  const save = immediatePersister.persistClient(saved(fresh));
  expect(getLaunchQueryClient().getQueryData(['heatmap'])).toEqual(tagged);
  await save;
  await waitFor(() => expect(Storage.setItemAsync).toHaveBeenCalled());
  queryClient.clear();
  expect(getLaunchQueryClient().getQueryData(['heatmap'])).toEqual(fresh);

  mockDisk.delete('REACT_QUERY_LAUNCH_HEAT');
  queryClient.clear();
  getLaunchQueryClient();
  await immediatePersister.removeClient();
  expect(mockDisk.size).toBe(0);
});
