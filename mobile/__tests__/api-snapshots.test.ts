jest.mock('../lib/fetchJson', () => ({ fetchJsonIfChanged: jest.fn(), fetchJson: jest.fn() }));
jest.mock('../lib/feed-source', () => ({ fetchFeed: jest.fn() }));
jest.mock('../lib/fresh-store', () => ({ noteFeed: jest.fn() }));

import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import {
  API_SNAPSHOTS,
  fetchAllSnapshots,
  fetchSnapshot,
  snapshotData,
} from '../lib/api-snapshots';
import { fetchArrival } from '../lib/arrival';
import { fetchFeed } from '../lib/feed-source';
import { fetchJsonIfChanged } from '../lib/fetchJson';

const request = jest.mocked(fetchJsonIfChanged);
const trends = API_SNAPSHOTS.trends;
const sentTag = () => request.mock.calls.find(([url]) => url === trends.url)?.[2]?.etag;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ changed: true, data: { reading: 1 }, etag: 'v1' });
});

it('persists a tag with its payload and sends it after restoring that same payload', async () => {
  const client = new QueryClient();
  for (const entry of await fetchAllSnapshots(() => undefined)) {
    client.setQueryData(entry.queryKey, entry.data);
  }
  const restored = new QueryClient();
  hydrate(restored, JSON.parse(JSON.stringify(dehydrate(client))));
  request.mockClear();
  request.mockResolvedValue({ changed: false });
  expect(await fetchAllSnapshots((key) => restored.getQueryData(key))).toEqual([]);
  expect(sentTag()).toBe('v1');
  expect(snapshotData(restored.getQueryData(trends.queryKey))).toEqual({ reading: 1 });
});

it('does not advance tags when snapshots succeed but the feed fails', async () => {
  const client = new QueryClient();
  client.setQueryData(trends.queryKey, { snapshot: { reading: 0 }, etag: 'old' });
  jest.mocked(fetchFeed).mockRejectedValue(new Error('offline'));
  await expect(fetchArrival(client)).rejects.toThrow('offline');
  // Allow every parallel snapshot to finish after the feed's failure.
  await Promise.resolve();
  request.mockClear();
  await fetchAllSnapshots((key) => client.getQueryData(key));
  expect(sentTag()).toBe('old');
  expect(snapshotData(client.getQueryData(trends.queryKey))).toEqual({ reading: 0 });
});

it('reads old plain-payload caches without trusting an unrelated tag', async () => {
  const old = { reading: 0 };
  expect(snapshotData(old)).toBe(old);
  await fetchAllSnapshots(() => old);
  expect(sentTag()).toBeNull();
});

it('keeps the ETag on a query-owned initial load too', async () => {
  expect(await fetchSnapshot(trends)).toEqual({ snapshot: { reading: 1 }, etag: 'v1' });
});

it('retries a failed query-owned layer when reconnecting on the same feed build', async () => {
  request.mockRejectedValueOnce(new Error('connection lost'));
  await expect(fetchSnapshot(trends)).rejects.toThrow('connection lost');
  request.mockClear();
  const retried = await fetchAllSnapshots(() => undefined, true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(retried).toEqual([
    { queryKey: trends.queryKey, data: { snapshot: { reading: 1 }, etag: 'v1' } },
  ]);
});

it('retries only failed layers even when no new feed build exists', async () => {
  request.mockImplementation(async (url) => {
    if (url === trends.url) throw new Error('temporary');
    return { changed: true, data: {}, etag: 'v1' };
  });
  await fetchAllSnapshots(() => undefined);
  request.mockClear();
  request.mockResolvedValue({ changed: true, data: { reading: 2 }, etag: 'v2' });
  const retried = await fetchAllSnapshots(() => undefined, true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(retried).toEqual([
    { queryKey: trends.queryKey, data: { snapshot: { reading: 2 }, etag: 'v2' } },
  ]);
  request.mockClear();
  await fetchAllSnapshots(() => undefined, true);
  expect(request).not.toHaveBeenCalled();
});
