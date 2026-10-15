import type { Article, FeedResponse } from '@shared/types';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import * as Network from 'expo-network';
import type { ReactNode } from 'react';
import { useArticles } from '../hooks/useArticles';
import { fetchArrival, probeGenerated, retryFailedSnapshots } from '../lib/arrival';
import { fetchFeed } from '../lib/feed-source';

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
jest.mock('../lib/feed-source', () => ({
  fetchFeed: jest.fn(),
  feedCache: { readSync: () => mockFeed('old', ['one']) },
}));
jest.mock('../lib/storage', () => ({
  getLastSeenAt: jest.fn(async () => 0),
  saveLastSeenAt: jest.fn(),
}));
jest.mock('../lib/bookmark-store', () => ({ flushBookmarks: jest.fn() }));
jest.mock('../lib/found-store', () => ({ flushFound: jest.fn() }));
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
function mount(onReturn = jest.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const ref = { current: onReturn };
  return { ...renderHook(() => useArticles(ref), { wrapper }), client, onReturn };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(probeGenerated).mockResolvedValue('old');
  notifyManager.setScheduler((cb) => cb());
});
afterEach(() => notifyManager.setScheduler((cb) => setTimeout(cb, 0)));

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
