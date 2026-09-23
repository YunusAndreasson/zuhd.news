jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1 },
  registerTaskAsync: jest.fn(),
}));
jest.mock('@tanstack/react-query-persist-client', () => ({
  persistQueryClientRestore: jest.fn(() => Promise.resolve()),
  persistQueryClientSave: jest.fn(() => Promise.resolve()),
}));
jest.mock('../lib/query-client', () => {
  const { QueryClient } = require('@tanstack/react-query');
  return { queryClient: new QueryClient(), persister: {}, PERSIST_MAX_AGE_MS: 1 };
});
jest.mock('../lib/arrival', () => ({
  ...jest.requireActual('../lib/arrival'),
  probeGenerated: jest.fn(),
  fetchArrival: jest.fn(),
}));
jest.mock('../lib/feed-source', () => ({
  feedCache: { read: jest.fn(() => Promise.resolve(null)) },
}));
jest.mock('../lib/fresh-store', () => ({ noteFeed: jest.fn(), flushKnown: jest.fn() }));
jest.mock('../lib/storage', () => ({ getLastSeenAt: jest.fn(() => Promise.resolve(0)) }));

import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import * as TaskManager from 'expo-task-manager';
import { FEED_QUERY_KEY, fetchArrival, probeGenerated } from '../lib/arrival';
import '../lib/background-fetch';
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
