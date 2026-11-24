// `lib/arrival` → `lib/api-snapshots` keeps its ETags in kv-store, which ships
// ES modules Jest does not transform; the suite failed to load without this.
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  addExpirationListener: jest.fn(() => ({ remove: jest.fn() })),
  registerTaskAsync: jest.fn(),
}));
jest.mock('@tanstack/react-query-persist-client', () => ({
  persistQueryClientRestore: jest.fn(() => Promise.resolve()),
  persistQueryClientSave: jest.fn(() => Promise.resolve()),
}));
jest.mock('../lib/query-client', () => {
  const { QueryClient } = require('@tanstack/react-query');
  return {
    queryClient: new QueryClient(),
    immediatePersister: {},
    PERSIST_MAX_AGE_MS: 1,
    PERSIST_BUSTER: 'b',
  };
});
jest.mock('../lib/arrival', () => ({
  ...jest.requireActual('../lib/arrival'),
  probeGenerated: jest.fn(),
  fetchArrival: jest.fn(),
}));
jest.mock('../lib/feed-source', () => ({
  feedCache: { read: jest.fn(() => Promise.resolve(null)) },
}));
jest.mock('../lib/fresh-store', () => ({ noteFeed: jest.fn(), flushKnown: jest.fn(() => true) }));
jest.mock('../lib/storage', () => ({ getLastSeenAt: jest.fn(() => Promise.resolve(0)) }));

import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { addExpirationListener } from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { FEED_QUERY_KEY, fetchArrival, probeGenerated } from '../lib/arrival';
import '../lib/background-fetch';
import { refreshWidget } from '../lib/widget-store';
jest.mock('../lib/widget-store', () => ({ refreshWidget: jest.fn() }));
import { flushKnown, noteFeed } from '../lib/fresh-store';
import { queryClient } from '../lib/query-client';

const task = jest.mocked(TaskManager.defineTask).mock
  .calls[0]?.[1] as unknown as () => Promise<unknown>;
const feed = (generated: string) =>
  ({ generated, categories: { politics: [], economy: [], science: [], tech: [] } }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
});

it('headless: restores the saved cache, applies the whole build, and saves it back', async () => {
  jest.mocked(probeGenerated).mockResolvedValue('new');
  jest.mocked(fetchArrival).mockResolvedValue({
    feed: feed('new'),
    snapshots: [{ queryKey: ['fetch-json', 'trends'], data: { t: 1 } }],
  });
  await task();
  // Saving from an empty client would have dropped every other saved query.
  expect(persistQueryClientRestore).toHaveBeenCalled();
  expect(queryClient.getQueryData(['fetch-json', 'trends'])).toEqual({ t: 1 });
  // The new-story note ran before the save and was written out.
  expect(noteFeed).toHaveBeenCalled();
  expect(persistQueryClientSave).toHaveBeenCalled();
  expect(jest.mocked(noteFeed).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(persistQueryClientSave).mock.invocationCallOrder[0] ?? 0,
  );
  expect(flushKnown).toHaveBeenCalled();
});

it('does nothing past the probe when the build on screen is current', async () => {
  queryClient.setQueryData(FEED_QUERY_KEY, feed('same'));
  jest.mocked(probeGenerated).mockResolvedValue('same');
  await task();
  expect(persistQueryClientRestore).not.toHaveBeenCalled();
  expect(fetchArrival).not.toHaveBeenCalled();
  expect(persistQueryClientSave).not.toHaveBeenCalled();
});

it('reports a failed download to the scheduler', async () => {
  jest.mocked(probeGenerated).mockRejectedValueOnce(new Error('offline'));
  expect(await task()).toBe(2);
  expect(persistQueryClientSave).not.toHaveBeenCalled();
});

it('keeps a completed build on expiry and returns success only after storage finishes', async () => {
  let complete!: () => void;
  let saving!: () => void;
  const writing = new Promise<void>((resolve) => {
    saving = resolve;
  });
  jest.mocked(persistQueryClientSave).mockImplementationOnce(() => {
    saving();
    return new Promise<void>((resolve) => {
      complete = resolve;
    });
  });
  jest.mocked(probeGenerated).mockResolvedValue('completed');
  jest.mocked(fetchArrival).mockResolvedValue({ feed: feed('completed'), snapshots: [] });
  let finished = false;
  const run = task().then((result) => {
    finished = true;
    return result;
  });
  await writing;
  jest.mocked(addExpirationListener).mock.lastCall?.[0]();
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(flushKnown).toHaveBeenCalledTimes(1);
  complete();
  expect(await run).toBe(1);
  expect(jest.mocked(addExpirationListener).mock.results.at(-1)?.value.remove).toHaveBeenCalled();
});

it('retries a failed write even when the probe now matches the in-memory build', async () => {
  jest.mocked(persistQueryClientSave).mockRejectedValueOnce(new Error('busy'));
  jest.mocked(probeGenerated).mockResolvedValue('completed');
  jest.mocked(fetchArrival).mockResolvedValue({ feed: feed('completed'), snapshots: [] });
  expect(await task()).toBe(2);
  expect(await task()).toBe(1);
  expect(persistQueryClientSave).toHaveBeenCalledTimes(2);
  expect(fetchArrival).toHaveBeenCalledTimes(1);
});

it('expires an unfinished probe without writing a partial build', async () => {
  jest.mocked(probeGenerated).mockImplementationOnce(
    (signal) =>
      new Promise<string>((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('expired')));
      }),
  );
  queryClient.setQueryData(FEED_QUERY_KEY, feed('old'));
  const pending = task();
  jest.mocked(addExpirationListener).mock.lastCall?.[0]();
  expect(await pending).toBe(2);
  expect(fetchArrival).not.toHaveBeenCalled();
  expect(persistQueryClientSave).not.toHaveBeenCalled();
});

it('recomputes an unchanged Android widget without writing another verified feed', async () => {
  const { Platform } = require('react-native');
  const os = Platform.OS;
  try {
    Platform.OS = 'android';
    queryClient.setQueryData(FEED_QUERY_KEY, feed('same'));
    jest.mocked(probeGenerated).mockResolvedValue('same');
    await task();
    expect(refreshWidget).toHaveBeenCalledWith();
    expect(fetchArrival).not.toHaveBeenCalled();
  } finally {
    Platform.OS = os;
  }
});
