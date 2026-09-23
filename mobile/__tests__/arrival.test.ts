jest.mock('../lib/fresh-store', () => ({ noteFeed: jest.fn() }));
jest.mock('../lib/feed-source', () => ({ fetchFeed: jest.fn() }));
jest.mock('../lib/api-snapshots', () => ({ fetchAllSnapshots: jest.fn() }));

import type { Article, FeedResponse } from '@shared/types';
import { notifyManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { applyArrival, FEED_QUERY_KEY } from '../lib/arrival';
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

describe('applyArrival', () => {
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
