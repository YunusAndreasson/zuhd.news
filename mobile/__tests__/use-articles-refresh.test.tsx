import { usePendingNotification } from '../hooks/usePendingNotification';
import type { Article, FeedResponse } from '@shared/types';
import {
  notifyManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import * as Network from 'expo-network';
import type { ReactNode } from 'react';
import { useArticles } from '../hooks/useArticles';
import { useOffline } from '../hooks/useOffline';
import { fetchArrival, probeGenerated, retryFailedSnapshots } from '../lib/arrival';
import { archiveStory, type Starter } from '../lib/opening-story';
import { downloadFeed, feedCache, fetchFeed } from '../lib/feed-source';

let mockResume: (awayMs: number) => Promise<void>;
let mockBackground: () => void;
let mockReconnect: (state: { isConnected: boolean }) => void;
jest.mock('../hooks/useAppResume', () => ({
  useAppResume: (resume: typeof mockResume, _after: number, background: typeof mockBackground) => {
    mockResume = resume;
    mockBackground = background;
  },
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true })),
  addNetworkStateListener: (callback: typeof mockReconnect) => {
    mockReconnect = callback;
    return { remove: jest.fn() };
  },
}));
jest.mock('../lib/arrival', () => ({
  ...jest.requireActual('../lib/arrival'),
  probeGenerated: jest.fn(),
  fetchArrival: jest.fn(),
  retryFailedSnapshots: jest.fn(async () => {}),
}));
jest.mock('../lib/api-snapshots', () => ({ fetchAllSnapshots: jest.fn(async () => []) }));
jest.mock('../lib/feed-source', () => ({
  downloadFeed: jest.fn(),
  saveFeed: jest.fn(),
  fetchFeed: jest.fn(),
  feedCache: { readSync: jest.fn(() => mockFeed('old', ['one'])) },
  readStarter: () => ({ previous: null, archiveWithdrawn: false }),
}));
jest.mock('../lib/storage', () => ({
  getLastSeenAt: jest.fn(async () => 0),
  saveLastSeenAt: jest.fn(),
}));
jest.mock('../lib/bookmark-store', () => ({ flushBookmarks: jest.fn() }));
jest.mock('../lib/read-store', () => ({ flushRead: jest.fn() }));
jest.mock('../lib/onboarding-store', () => ({ flushOnboarding: jest.fn() }));
jest.mock('../lib/fresh-store', () => ({ noteFeed: jest.fn(), flushKnown: jest.fn() }));

function mockFeed(generated: string, slugs: string[]): FeedResponse {
  return {
    generated,
    categories: { politics: slugs.map((slug) => ({ slug, addedAt: 0 }) as Article) },
    briefing: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function mount(onReturn = jest.fn(), firstLaunch = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const ref = { current: onReturn };
  return { ...renderHook(() => useArticles(ref, firstLaunch), { wrapper }), client, onReturn };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(probeGenerated).mockResolvedValue('old');
  notifyManager.setScheduler((cb) => cb());
});
afterEach(() => notifyManager.setScheduler((cb) => setTimeout(cb, 0)));

it('keeps the bundled starter on a returning offline launch until the feed arrives', async () => {
  jest.mocked(feedCache.readSync).mockReturnValue(null);
  onlineManager.setOnline(false);
  const hook = mount();
  try {
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.starter?.slug).toBe(archiveStory.slug);
    expect(hook.result.current.grouped.economy).toContainEqual(archiveStory);
    await act(async () => {
      hook.client.setQueryData(['feed'], mockFeed('return', ['one']));
    });
    expect(hook.result.current.starter).toBeNull();
    expect(hook.result.current.grouped.politics[0]?.slug).toBe('one');
  } finally {
    hook.unmount();
    onlineManager.setOnline(true);
    jest.mocked(feedCache.readSync).mockImplementation(() => mockFeed('old', ['one']));
  }
});

it('keeps the grouped stories when only the build stamp changes', async () => {
  const hook = mount();
  await act(async () => {});
  const before = hook.result.current.grouped;
  await act(async () => {
    hook.client.setQueryData(['feed'], mockFeed('new', ['one']));
  });
  expect(hook.result.current.generated).toBe('new');
  expect(hook.result.current.grouped).toBe(before);
});

it('a pull joins the launch check and receives its added stories', async () => {
  const probe = deferred<string>();
  jest.mocked(probeGenerated).mockReturnValue(probe.promise);
  const hook = mount();
  await act(async () => {});
  let pull!: ReturnType<typeof hook.result.current.refresh>;
  act(() => {
    pull = hook.result.current.refresh();
  });
  jest
    .mocked(fetchArrival)
    .mockResolvedValue({ feed: mockFeed('new', ['two', 'one']), snapshots: [] });
  await act(async () => {
    probe.resolve('new');
    expect((await pull).map((a) => a.slug)).toEqual(['two']);
  });
  expect(probeGenerated).toHaveBeenCalledTimes(1);
  expect(fetchArrival).toHaveBeenCalledTimes(1);
});

it('a pull joining a failed automatic check receives the failure', async () => {
  const probe = deferred<string>();
  jest.mocked(probeGenerated).mockReturnValue(probe.promise);
  const hook = mount();
  await act(async () => {});
  const pull = hook.result.current.refresh();
  const failure = expect(pull).rejects.toThrow('offline');
  await act(async () => {
    probe.reject(new Error('offline'));
    await failure;
  });
});

it('retries failed snapshots even on the current feed build', async () => {
  const hook = mount();
  await act(async () => {});
  jest.mocked(retryFailedSnapshots).mockClear();
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(retryFailedSnapshots).toHaveBeenCalledWith(hook.client);
  expect(fetchArrival).not.toHaveBeenCalled();
});

it('renders a known offline state on the first render of a new reader', async () => {
  mount();
  await act(async () => {
    mockReconnect({ isConnected: false });
  });
  const renders: boolean[] = [];
  renderHook(() => {
    renders.push(useOffline());
  });
  expect(renders[0]).toBe(true);
});

it('a reconnect checks for a coordinated arrival instead of fetching the feed alone', async () => {
  mount();
  await act(async () => {});
  jest.mocked(probeGenerated).mockResolvedValue('new');
  jest.mocked(fetchArrival).mockResolvedValue({ feed: mockFeed('new', ['two']), snapshots: [] });
  await act(async () => {
    mockReconnect({ isConnected: false });
    mockReconnect({ isConnected: true });
  });
  expect(fetchArrival).toHaveBeenCalledTimes(1);
  expect(fetchFeed).not.toHaveBeenCalled();
});

it('reports a resume exactly once, inside the arrival flush', async () => {
  const hook = mount();
  await act(async () => {});
  const scheduled: (() => void)[] = [];
  notifyManager.setScheduler((cb) => {
    scheduled.push(cb);
  });
  jest.mocked(probeGenerated).mockResolvedValue('new');
  jest.mocked(fetchArrival).mockResolvedValue({ feed: mockFeed('new', ['two']), snapshots: [] });
  await act(async () => {
    await mockResume(600_000);
  });
  expect(hook.onReturn).not.toHaveBeenCalled();
  act(() => {
    for (const callback of scheduled.splice(0)) callback();
  });
  expect(hook.onReturn).toHaveBeenCalledTimes(1);
});

it('recovers on the first online event after launching offline', async () => {
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({ isConnected: false } as never);
  mount();
  await act(async () => {});
  jest.mocked(probeGenerated).mockResolvedValue('new');
  jest.mocked(fetchArrival).mockResolvedValue({ feed: mockFeed('new', ['two']), snapshots: [] });
  await act(async () => {
    mockReconnect({ isConnected: true });
  });
  expect(fetchArrival).toHaveBeenCalledTimes(1);
});

it('recovers if the first online event beats a slow initial network-state read', async () => {
  const initial = deferred<Network.NetworkState>();
  jest.mocked(Network.getNetworkStateAsync).mockReturnValueOnce(initial.promise);
  jest.mocked(probeGenerated).mockRejectedValueOnce(new Error('offline'));
  mount();
  await act(async () => {});
  jest.mocked(probeGenerated).mockResolvedValue('new');
  jest.mocked(fetchArrival).mockResolvedValue({ feed: mockFeed('new', ['two']), snapshots: [] });
  await act(async () => {
    mockReconnect({ isConnected: true });
    initial.resolve({ isConnected: false } as Network.NetworkState);
  });
  expect(fetchArrival).toHaveBeenCalledTimes(1);
});

it('a reconnect after a return reports only what its own arrival adds', async () => {
  const hook = mount();
  await act(async () => {});
  // The reader leaves, and comes back to one new story.
  act(() => mockBackground());
  jest.mocked(probeGenerated).mockResolvedValue('new');
  jest
    .mocked(fetchArrival)
    .mockResolvedValue({ feed: mockFeed('new', ['one', 'two']), snapshots: [] });
  await act(async () => {
    await mockResume(600_000);
  });
  expect(hook.onReturn).toHaveBeenCalledTimes(1);
  expect(hook.onReturn.mock.calls[0][0].added.map((a: Article) => a.slug)).toEqual(['two']);
  hook.onReturn.mockClear();

  // The network drops and comes back with nothing newer: no second "1 new".
  await act(async () => {
    mockReconnect({ isConnected: false });
    mockReconnect({ isConnected: true });
  });
  expect(hook.onReturn).not.toHaveBeenCalled();

  // A reconnect that does bring a story reports that one alone.
  jest.mocked(probeGenerated).mockResolvedValue('newer');
  jest
    .mocked(fetchArrival)
    .mockResolvedValue({ feed: mockFeed('newer', ['one', 'two', 'three']), snapshots: [] });
  await act(async () => {
    mockReconnect({ isConnected: false });
    mockReconnect({ isConnected: true });
  });
  expect(hook.onReturn).toHaveBeenCalledTimes(1);
  expect(hook.onReturn.mock.calls[0][0].added.map((a: Article) => a.slug)).toEqual(['three']);
});

it('opens the durable feed without persisted queries and keeps it through a week offline', async () => {
  const clock = jest.spyOn(Date, 'now');
  const start = Date.now();
  jest.mocked(probeGenerated).mockRejectedValue(new Error('offline'));
  const hook = mount();
  try {
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.grouped.politics.map((a) => a.slug)).toEqual(['one']);
    await act(async () => {});
    act(() => mockBackground());
    clock.mockReturnValue(start + 7 * 86400000);
    await act(async () => {
      await mockResume(7 * 86400000);
    });
    expect(hook.result.current.generated).toBe('old');
    expect(hook.result.current.grouped.politics.map((a) => a.slug)).toEqual(['one']);
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBeNull();
  } finally {
    hook.unmount();
    clock.mockRestore();
  }
});

it('coalesces flapping reconnects, resume and a manual pull into one arrival', async () => {
  const hook = mount();
  await act(async () => {});
  act(() => mockBackground());
  jest.mocked(probeGenerated).mockClear().mockResolvedValue('new');
  const pending = deferred<Awaited<ReturnType<typeof fetchArrival>>>();
  jest.mocked(fetchArrival).mockReturnValue(pending.promise);
  await act(async () => {
    mockReconnect({ isConnected: false });
    mockReconnect({ isConnected: true });
  });
  let resume!: Promise<void>;
  let pull!: Promise<Article[]>;
  act(() => {
    resume = mockResume(7 * 86400000);
    pull = hook.result.current.refresh();
    for (let i = 0; i < 6; i++) {
      mockReconnect({ isConnected: false });
      mockReconnect({ isConnected: true });
    }
  });
  await act(async () => {
    pending.resolve({ feed: mockFeed('new', ['two', 'one']), snapshots: [] });
    expect((await pull).map((a) => a.slug)).toEqual(['two']);
    await resume;
  });
  expect(probeGenerated).toHaveBeenCalledTimes(1);
  expect(fetchArrival).toHaveBeenCalledTimes(1);
  expect(hook.onReturn).toHaveBeenCalledTimes(1);
});

it('keeps an explicitly opened older story when reconnect replaces the entire feed', async () => {
  const hook = mount();
  await act(async () => {});
  const selected = { slug: 'saved-outside-the-feed', addedAt: 0 } as Article;
  act(() => hook.result.current.injectArticle(selected, 'science'));
  jest.mocked(probeGenerated).mockResolvedValue('new');
  const slugs = Array.from({ length: 500 }, (_, i) => `new-${i}`);
  jest.mocked(fetchArrival).mockResolvedValue({ feed: mockFeed('new', slugs), snapshots: [] });
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.grouped.politics).toHaveLength(500);
  expect(hook.result.current.grouped.science).toEqual([selected]);
});

it('keeps cached news after an interrupted arrival and recovers on the next pull', async () => {
  const hook = mount();
  await act(async () => {});
  jest.mocked(probeGenerated).mockResolvedValue('new');
  jest.mocked(fetchArrival).mockRejectedValueOnce(new Error('connection lost'));
  await act(async () => {
    await expect(hook.result.current.refresh()).rejects.toThrow('connection lost');
  });
  expect(hook.result.current.generated).toBe('old');
  expect(hook.result.current.grouped.politics.map((a) => a.slug)).toEqual(['one']);
  jest.mocked(fetchArrival).mockResolvedValue({ feed: mockFeed('new', ['two']), snapshots: [] });
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.grouped.politics.map((a) => a.slug)).toEqual(['two']);
});

it('still reports a long return when a slower arrival has already been superseded', async () => {
  const hook = mount();
  await act(async () => {});
  act(() => mockBackground());
  jest.mocked(probeGenerated).mockResolvedValue('2026-10-14T12:00:00Z');
  const pending = deferred<Awaited<ReturnType<typeof fetchArrival>>>();
  jest.mocked(fetchArrival).mockReturnValue(pending.promise);
  let returning!: Promise<void>;
  act(() => {
    returning = mockResume(7 * 86400000);
  });
  await act(async () => {});
  await act(async () => {
    // A concurrent background/foreground load finishes first.
    hook.client.setQueryData(['feed'], mockFeed('2026-10-15T12:00:00Z', ['latest']));
    pending.resolve({ feed: mockFeed('2026-10-14T12:00:00Z', ['old-response']), snapshots: [] });
    await returning;
  });
  expect(hook.result.current.generated).toBe('2026-10-15T12:00:00Z');
  expect(hook.onReturn).toHaveBeenCalledTimes(1);
  expect(hook.onReturn.mock.calls[0][0].added.map((a: Article) => a.slug)).toEqual(['latest']);
});

it('a foreground probe accepts a build that the background task finished while it waited', async () => {
  const hook = mount();
  await act(async () => {});
  const probe = deferred<string>();
  jest.mocked(probeGenerated).mockReturnValueOnce(probe.promise);
  await act(async () => {
    const resume = mockResume(600_000);
    hook.client.setQueryData(['feed'], mockFeed('new', ['two']));
    probe.resolve('new');
    await resume;
  });
  expect(fetchArrival).not.toHaveBeenCalled();
});

it('pins a flagged first opener through feed arrivals, uses corrections and falls back on withdrawal', async () => {
  const article: Starter = {
    ...archiveStory,
    slug: 'live',
    publishedAt: archiveStory.publishedAt! + 86400000,
  };
  const feed = (rows: Starter[]): FeedResponse => ({
    generated: '2026-11-23',
    categories: { economy: rows },
    briefing: null,
  });
  jest.mocked(feedCache.readSync).mockReturnValueOnce(feed([article]));
  const hook = mount(jest.fn(), true);
  await act(async () => {});
  expect(hook.result.current.starter?.slug).toBe('live');
  const revised = { ...article, title: 'Corrected reading' };
  const newer = { ...article, slug: 'newer', publishedAt: article.publishedAt! + 86400000 };
  await act(async () => {
    hook.client.setQueryData(['feed'], feed([newer, revised]));
  });
  expect(hook.result.current.starter?.title).toBe('Corrected reading');
  await act(async () => {
    hook.client.setQueryData(['feed'], feed([newer]));
  });
  expect(hook.result.current.starter?.title).toBe('Corrected reading');
  await act(async () => {
    hook.client.setQueryData(['feed'], feed([{ ...revised, starterEligible: false }]));
  });
  expect(hook.result.current.starter?.slug).toBe(archiveStory.slug);
});

const mockResponse = {
  notification: { request: { content: { data: { kind: 'briefing', date: '2026-11-23' } } } },
};
const mockClear = jest.fn();
jest.mock('expo-notifications', () => ({
  useLastNotificationResponse: () => mockResponse,
  clearLastNotificationResponse: () => mockClear(),
}));
function renderBriefingTap(
  hook: ReturnType<typeof mount>,
  play: jest.Mock,
  unavailable: jest.Mock,
) {
  return renderHook(() => {
    const { grouped, loading, generated, verifyNotificationFeed } = hook.result.current;
    usePendingNotification(loading, grouped, jest.fn(), {
      verify: verifyNotificationFeed,
      generated,
      play,
      unavailable,
    });
  });
}
it('a briefing tap survives the first-launch splash deadline until the addressed feed arrives', async () => {
  jest.mocked(feedCache.readSync).mockReturnValue(null);
  const download = deferred<FeedResponse>();
  jest.mocked(probeGenerated).mockResolvedValue('2026-11-23T05:00:00Z');
  jest.mocked(fetchFeed).mockReturnValue(download.promise);
  const h = mount(jest.fn(), true);
  const play = jest.fn(),
    unavailable = jest.fn();
  const pending = renderBriefingTap(h, play, unavailable);
  expect(mockClear).not.toHaveBeenCalled();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1400));
  });
  expect(h.result.current.generated).toBeNull();
  pending.rerender();
  expect(mockClear).not.toHaveBeenCalled();
  expect(unavailable).not.toHaveBeenCalled();
  await act(async () => {
    download.resolve({
      ...mockFeed('2026-11-23T05:00:00Z', ['one']),
      briefing: { available: true, date: '2026-11-23' },
    });
  });
  pending.rerender();
  expect(h.result.current.briefing?.available).toBe(true);
  expect(play).toHaveBeenCalledTimes(1);
  expect(mockClear).toHaveBeenCalledTimes(1);
});
it('a pinned chart-only opener loses its place when its chart disappears outside the feed window', async () => {
  const article: Starter = {
    ...archiveStory,
    slug: 'chart-only',
    starterEvidence: 'chart',
    sentences: ['Series 4 chips arrive.'],
    publishedAt: archiveStory.publishedAt! + 86400000,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const initial = { ...mockFeed('old', []), categories: { economy: [article] } };
  jest.mocked(feedCache.readSync).mockReturnValue(initial);
  const h = renderHook(({ usable }) => useArticles({ current: jest.fn() }, true, () => usable), {
    wrapper,
    initialProps: { usable: true },
  });
  await act(async () => {});
  expect(h.result.current.starter?.slug).toBe(article.slug);
  await act(async () => {
    client.setQueryData(['feed'], mockFeed('new', []));
  });
  h.rerender({ usable: false });
  expect(h.result.current.starter?.slug).toBe(archiveStory.slug);
});
it('a cached empty feed waits for the matching briefing on a warm launch', async () => {
  const probe = deferred<string>();
  jest.mocked(probeGenerated).mockReturnValue(probe.promise);
  jest.mocked(feedCache.readSync).mockReturnValue(mockFeed('2026-11-22T05:00:00Z', ['one']));
  const today = {
    ...mockFeed('2026-11-23T05:00:00Z', ['two']),
    briefing: { available: true, date: '2026-11-23', generated: '2026-11-23T05:00:00Z' },
  };
  jest.mocked(fetchArrival).mockResolvedValue({ feed: today, snapshots: [] });
  const h = mount();
  const play = jest.fn(),
    unavailable = jest.fn();
  const p = renderBriefingTap(h, play, unavailable);
  expect(unavailable).not.toHaveBeenCalled();
  expect(mockClear).not.toHaveBeenCalled();
  await act(async () => {
    probe.resolve(today.generated);
  });
  p.rerender();
  expect(h.result.current.briefing?.date).toBe('2026-11-23');
  expect(play).toHaveBeenCalledTimes(1);
  expect(mockClear).toHaveBeenCalledTimes(1);
});

it('keeps a briefing tap pending when the feed edge still serves a same-day build older than meta', async () => {
  const old = mockFeed('2026-11-23T04:00:00Z', ['one']);
  const published = '2026-11-23T05:00:00Z';
  jest.mocked(feedCache.readSync).mockReturnValue(old);
  jest.mocked(probeGenerated).mockResolvedValue(published);
  jest.mocked(downloadFeed).mockResolvedValue(old);
  const arrival = jest.requireActual<typeof import('../lib/arrival')>('../lib/arrival');
  jest.mocked(fetchArrival).mockImplementation(arrival.fetchArrival);
  const h = mount();
  const play = jest.fn();
  const unavailable = jest.fn();
  renderBriefingTap(h, play, unavailable);
  await act(async () => {});
  expect(downloadFeed).toHaveBeenCalled();
  expect(unavailable).not.toHaveBeenCalled();
  expect(mockClear).not.toHaveBeenCalled();
});

it('verifies a cold same-day empty feed against the advertised recording in one mounted screen', async () => {
  notifyManager.setScheduler((fn) => setTimeout(fn, 0));
  const old = mockFeed('2026-11-23T04:00:00Z', ['one']);
  const latest = {
    ...mockFeed('2026-11-23T05:00:00Z', ['two']),
    briefing: { date: '2026-11-23', available: true, generated: '2026-11-23T05:00:00Z' },
  };
  const first = deferred<FeedResponse>();
  jest.mocked(feedCache.readSync).mockReturnValue(null);
  jest.mocked(fetchFeed).mockReturnValue(first.promise);
  jest.mocked(probeGenerated).mockResolvedValue(latest.generated);
  jest.mocked(fetchArrival).mockResolvedValue({ feed: latest, snapshots: [] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const play = jest.fn(),
    unavailable = jest.fn(),
    select = jest.fn();
  const h = renderHook(
    () => {
      const feed = useArticles(undefined, true);
      usePendingNotification(feed.loading, feed.grouped, select, {
        verify: feed.verifyNotificationFeed,
        generated: feed.generated,
        play,
        unavailable,
      });
      return feed;
    },
    { wrapper },
  );
  await act(async () => {
    first.resolve(old);
    await new Promise((r) => setTimeout(r, 40));
  });
  await act(async () => {
    await h.result.current.refresh();
    await new Promise((r) => setTimeout(r, 40));
  });
  expect(h.result.current.briefing?.date).toBe(latest.briefing.date);
  expect(unavailable).not.toHaveBeenCalled();
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledWith(latest.briefing);
});
