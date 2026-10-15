jest.mock('../lib/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

const mockCacheWrite = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve());
const mockCacheRead = jest.fn<Promise<unknown>, []>(() => Promise.resolve(null));
const mockCacheReadSync = jest.fn<unknown, []>(() => null);
// Delegate lazily rather than handing the spies over directly: the factory
// runs while `feed-source` is initialising, before these consts are assigned,
// so a direct reference captures `undefined`.
jest.mock('../lib/json-cache', () => ({
  createJsonCache: () => ({
    read: () => mockCacheRead(),
    readSync: () => mockCacheReadSync(),
    write: (data: unknown) => mockCacheWrite(data),
  }),
}));

import type { FeedResponse } from '@shared/types';
import { fetchWithTimeout } from '../lib/fetch';
import { fetchFeed } from '../lib/feed-source';

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

const feed = (generated: string): FeedResponse => ({
  generated,
  categories: {
    politics: [
      {
        slug: 's',
        title: 't',
        date: '2026-07-24',
        addedAt: 1,
        source: null,
        sourceUrl: null,
        sources: [],
        concepts: [],
        eventCoverage: null,
        location: null,
        lat: null,
        lng: null,
        sentences: ['One.'],
      },
    ],
  },
  briefing: null,
});

function ok(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}
function notFound() {
  return {
    ok: false,
    status: 404,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve('null'),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockCacheWrite.mockClear();
  mockCacheRead.mockClear();
  mockCacheReadSync.mockReset().mockReturnValue(null);
});

describe('fetchFeed', () => {
  it('keeps a newer durable feed when an old CDN response arrives after reconnecting', async () => {
    mockCacheReadSync.mockReturnValue(feed('2026-10-15T12:00:00Z'));
    mockFetch.mockResolvedValueOnce(ok(feed('2026-10-14T12:00:00Z')));
    await expect(fetchFeed()).rejects.toThrow(/older/i);
    expect(mockCacheWrite).not.toHaveBeenCalled();
  });

  it('does not let an interrupted older request overwrite a newer completed download', async () => {
    let finish!: (response: Response) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mockFetch.mockResolvedValueOnce(ok(feed('2026-10-15T12:00:00Z')));
    mockCacheWrite.mockImplementationOnce(async (value) => {
      mockCacheReadSync.mockReturnValue(value);
    });
    const old = fetchFeed();
    await fetchFeed();
    finish(ok(feed('2026-10-14T12:00:00Z')));
    await expect(old).rejects.toThrow(/older/i);
    expect(mockCacheWrite).toHaveBeenCalledTimes(1);
  });

  it('prefers the lite endpoint', async () => {
    mockFetch.mockResolvedValueOnce(ok(feed('2026-07-24T00:00:00.000Z')));
    const result = await fetchFeed();
    expect(result.generated).toBe('2026-07-24T00:00:00.000Z');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toMatch(/feed-lite\.json$/);
  });

  // Deploy ordering must not be able to strand an app build: an update can
  // ship before the site that serves the lite endpoint does.
  it('falls back to the full feed when the lite endpoint is missing', async () => {
    mockFetch.mockResolvedValueOnce(notFound());
    mockFetch.mockResolvedValueOnce(ok(feed('2026-07-24T00:00:00.000Z')));
    const result = await fetchFeed();
    expect(result.generated).toBe('2026-07-24T00:00:00.000Z');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]?.[0]).toMatch(/\/feed\.json$/);
  });

  it('surfaces the error when both endpoints fail', async () => {
    mockFetch.mockResolvedValueOnce(notFound());
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchFeed()).rejects.toThrow(/offline/);
  });

  // A cancelled query must not spend a second request on the fallback.
  it('does not retry the fallback when the caller aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    await expect(fetchFeed({ signal: controller.signal })).rejects.toThrow(/Aborted/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // The whole point of the background task: the durable copy must be written,
  // and awaited, before the caller (and therefore the OS task) resolves.
  it('writes the durable cache before resolving', async () => {
    let written = false;
    mockCacheWrite.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            written = true;
            resolve();
          }, 0);
        }),
    );
    mockFetch.mockResolvedValueOnce(ok(feed('2026-07-24T00:00:00.000Z')));
    await fetchFeed();
    expect(written).toBe(true);
    expect(mockCacheWrite).toHaveBeenCalledTimes(1);
  });

  it('does not write the cache when the fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(notFound());
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchFeed()).rejects.toThrow();
    expect(mockCacheWrite).not.toHaveBeenCalled();
  });
});
