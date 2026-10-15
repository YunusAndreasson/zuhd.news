jest.mock('../lib/fresh-store', () => ({ noteFeed: jest.fn() }));
jest.mock('../lib/feed-source', () => ({ fetchFeed: jest.fn() }));
jest.mock('../lib/api-snapshots', () => ({ fetchAllSnapshots: jest.fn() }));

import type { Article, FeedResponse } from '@shared/types';
import { notifyManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { applyArrival, FEED_QUERY_KEY, retryFailedSnapshots } from '../lib/arrival';
import { fetchAllSnapshots } from '../lib/api-snapshots';
import { noteFeed } from '../lib/fresh-store';

function feed(generated: string, slugs: string[]): FeedResponse {
  return {
    generated,
    categories: {
      politics: slugs.map((slug) => ({ slug, addedAt: 0 }) as unknown as Article),
      economy: [],
      science: [],
      tech: [],
    },
  } as unknown as FeedResponse;
}

it('does not let a slow layer retry replace data recovered by a concurrent arrival', async () => {
  const client = new QueryClient();
  const key = ['heatmap'];
  const otherKey = ['fetch-json', 'trends'];
  client.setQueryData(key, { version: 'cached' });
  client.setQueryData(otherKey, { version: 'cached' });
  let finish!: (value: Awaited<ReturnType<typeof fetchAllSnapshots>>) => void;
  jest.mocked(fetchAllSnapshots).mockImplementationOnce((cached) => {
    cached(key);
    cached(otherKey);
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const retry = retryFailedSnapshots(client);
  client.setQueryData(key, { version: 'newer-arrival' });
  finish([
    { queryKey: key, data: { version: 'slow-retry' } },
    { queryKey: otherKey, data: { version: 'recovered' } },
  ]);
  await retry;
  expect(client.getQueryData(key)).toEqual({ version: 'newer-arrival' });
  expect(client.getQueryData(otherKey)).toEqual({ version: 'recovered' });
});

describe('applyArrival', () => {
  it('does not announce a superseded arrival when a newer build lands before its queued flush', () => {
    const queued: (() => void)[] = [];
    notifyManager.setScheduler((callback) => {
      queued.push(callback);
    });
    const client = new QueryClient();
    const olderReport = jest.fn();
    const latestReport = jest.fn();
    jest.mocked(noteFeed).mockClear();
    applyArrival(
      client,
      { feed: feed('2026-10-14T12:00:00Z', ['old']), snapshots: [] },
      { lastSeenAt: 0, alsoInFlush: olderReport },
    );
    applyArrival(
      client,
      { feed: feed('2026-10-15T12:00:00Z', ['new']), snapshots: [] },
      { lastSeenAt: 0, alsoInFlush: latestReport },
    );
    for (const callback of queued) callback();
    expect(olderReport).not.toHaveBeenCalled();
    expect(latestReport).toHaveBeenCalledTimes(1);
    expect(noteFeed).toHaveBeenCalledTimes(1);
    expect(jest.mocked(noteFeed).mock.calls[0]?.[0]).toBe('2026-10-15T12:00:00Z');
  });
  it('keeps the newer feed and layers when an older arrival was delayed by a slow snapshot', () => {
    notifyManager.setScheduler((callback) => callback());
    const client = new QueryClient();
    const latest = feed('2026-10-15T12:00:00Z', ['current']);
    client.setQueryData(FEED_QUERY_KEY, latest);
    client.setQueryData(['heatmap'], { generation: 'current' });
    const report = jest.fn();
    jest.mocked(noteFeed).mockClear();
    expect(
      applyArrival(
        client,
        {
          feed: feed('2026-10-14T12:00:00Z', ['old']),
          snapshots: [{ queryKey: ['heatmap'], data: { generation: 'old' } }],
        },
        { lastSeenAt: 0, alsoInFlush: report },
      ),
    ).toEqual([]);
    expect(client.getQueryData(FEED_QUERY_KEY)).toEqual(latest);
    expect(client.getQueryData(['heatmap'])).toEqual({ generation: 'current' });
    expect(noteFeed).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  afterEach(() => {
    notifyManager.setScheduler((cb) => setTimeout(cb, 0));
  });

  it('puts the feed, every snapshot and the new-story note on screen in one flush', () => {
    const flushes: (() => void)[] = [];
    notifyManager.setScheduler((cb) => {
      flushes.push(cb);
    });
    const client = new QueryClient();
    client.setQueryData(FEED_QUERY_KEY, feed('a', ['one']));
    const seen: string[] = [];
    for (const key of [FEED_QUERY_KEY, ['fetch-json', 'trends'], ['heatmap']]) {
      // How `useQuery` subscribes: through `batchCalls`, so a change reaches
      // React on the notify flush, not when the cache changes.
      new QueryObserver(client, { queryKey: key, enabled: false }).subscribe(
        notifyManager.batchCalls(() => {
          seen.push(String(key[0]));
        }),
      );
    }
    flushes.length = 0;

    const order: string[] = [];
    jest.mocked(noteFeed).mockImplementation(() => {
      order.push('note');
    });
    const added = applyArrival(
      client,
      {
        feed: feed('b', ['two', 'one']),
        snapshots: [
          { queryKey: ['fetch-json', 'trends'], data: { t: 1 } },
          { queryKey: ['heatmap'], data: { h: 1 } },
        ],
      },
      { lastSeenAt: 0, alsoInFlush: () => order.push('report') },
    );

    expect(added.map((a) => a.slug)).toEqual(['two']);
    // Nothing has reached a subscriber yet, and everything waits on one flush.
    expect(seen).toEqual([]);
    expect(order).toEqual([]);
    expect(flushes).toHaveLength(1);
    flushes[0]?.();
    expect(order).toEqual(['note', 'report']);
    expect(seen.sort()).toEqual(['feed', 'fetch-json', 'heatmap']);
    expect(client.getQueryData(['fetch-json', 'trends'])).toEqual({ t: 1 });
  });

  it('leaves the note to useArticles while lastSeenAt is still loading', () => {
    notifyManager.setScheduler((cb) => cb());
    jest.mocked(noteFeed).mockClear();
    const client = new QueryClient();
    applyArrival(client, { feed: feed('c', ['x']), snapshots: [] }, { lastSeenAt: null });
    expect(noteFeed).not.toHaveBeenCalled();
    expect(client.getQueryData<FeedResponse>(FEED_QUERY_KEY)?.generated).toBe('c');
  });
});

it('does not apply an arrival completed before an erase, or a queued pre-erase note', async () => {
  const { cancelArrivals, fetchArrival } = jest.requireActual(
    '../lib/arrival',
  ) as typeof import('../lib/arrival');
  const { fetchFeed } = require('../lib/feed-source') as typeof import('../lib/feed-source');
  const { fetchAllSnapshots } =
    require('../lib/api-snapshots') as typeof import('../lib/api-snapshots');
  jest.mocked(fetchFeed).mockResolvedValue(feed('new', ['story']));
  jest.mocked(fetchAllSnapshots).mockResolvedValue([]);
  const client = new QueryClient();
  const arrival = await fetchArrival(client);
  cancelArrivals();
  applyArrival(client, arrival, { lastSeenAt: 0 });
  expect(client.getQueryData(FEED_QUERY_KEY)).toBeUndefined();

  const queued: (() => void)[] = [];
  notifyManager.setScheduler((callback) => {
    queued.push(callback);
  });
  jest.mocked(noteFeed).mockClear();
  applyArrival(client, { feed: feed('other', ['story']), snapshots: [] }, { lastSeenAt: 0 });
  cancelArrivals();
  client.clear();
  for (const callback of queued) callback();
  expect(noteFeed).not.toHaveBeenCalled();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});
