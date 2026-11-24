import type { Article, Category } from '@shared/types';
import { act, renderHook } from '@testing-library/react';
import { usePendingNotification } from '../hooks/usePendingNotification';

let mockLastResponse: unknown = null;
let mockBookmarks: Array<{ article: Article; category: Category; savedAt: number }> = [];
const mockClearResponse = jest.fn();

jest.mock('expo-notifications', () => ({
  useLastNotificationResponse: () => mockLastResponse,
  clearLastNotificationResponse: (...args: unknown[]) => mockClearResponse(...args),
}));

jest.mock('../lib/bookmark-store', () => ({
  getSnapshot: () => mockBookmarks,
}));

const mockTrack = jest.fn();
jest.mock('../lib/analytics', () => ({
  analytics: { track: (...args: unknown[]) => mockTrack(...args) },
}));

function article(slug: string): Article {
  return {
    slug,
    title: slug,
    date: '2026-07-19',
    addedAt: 1,
    source: null,
    sourceUrl: null,
    sources: [],
    concepts: [],
    eventCoverage: null,
    location: null,
    lat: null,
    lng: null,
    sentences: ['Body'],
  };
}

function response(data: Record<string, unknown>) {
  return { notification: { request: { content: { data } } } };
}

const emptyGrouped: Record<Category, Article[]> = {
  politics: [],
  economy: [],
  science: [],
  tech: [],
};

function briefingTap(available: boolean, date = '2026-11-21') {
  const generated = `${date}T12:00:00Z`;
  return {
    generated,
    play: jest.fn(),
    unavailable: jest.fn(),
    verify: async () => ({
      categories: {},
      generated,
      briefing: available ? { date, available, generated } : null,
    }),
  };
}

beforeEach(() => {
  mockLastResponse = null;
  mockBookmarks = [];
  mockClearResponse.mockClear();
  mockTrack.mockClear();
});

describe('notification response routing', () => {
  it('waits for the feed before consuming an article response', () => {
    mockLastResponse = response({ slug: 'story' });
    const onSelect = jest.fn();
    renderHook(() => usePendingNotification(true, emptyGrouped, onSelect));

    expect(onSelect).not.toHaveBeenCalled();
    expect(mockClearResponse).not.toHaveBeenCalled();
  });

  it('routes a feed article and clears only after handing it off', () => {
    mockLastResponse = response({ slug: 'story' });
    const onSelect = jest.fn();
    const grouped = { ...emptyGrouped, science: [article('story')] };
    renderHook(() => usePendingNotification(false, grouped, onSelect));

    expect(onSelect).toHaveBeenCalledWith('story', 'science');
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
    const routedAt = onSelect.mock.invocationCallOrder[0];
    const clearedAt = mockClearResponse.mock.invocationCallOrder[0];
    expect(routedAt).toBeDefined();
    expect(clearedAt).toBeDefined();
    expect(routedAt as number).toBeLessThan(clearedAt as number);
  });

  it('hands missing stories to the archive opener once, even when the feed changes', () => {
    mockLastResponse = response({ slug: 'late-story' });
    const onSelect = jest.fn();
    const { rerender } = renderHook(
      ({ grouped }) => usePendingNotification(false, grouped, onSelect),
      { initialProps: { grouped: emptyGrouped } },
    );
    expect(onSelect).toHaveBeenCalledWith('late-story', 'politics');

    act(() => {
      rerender({ grouped: { ...emptyGrouped, tech: [article('late-story')] } });
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
  });

  it('routes an article that has rotated out of the feed via its bookmark category', () => {
    mockLastResponse = response({ slug: 'saved-story' });
    mockBookmarks = [{ article: article('saved-story'), category: 'economy', savedAt: 1 }];
    const onSelect = jest.fn();
    renderHook(() => usePendingNotification(false, emptyGrouped, onSelect));

    expect(onSelect).toHaveBeenCalledWith('saved-story', 'economy');
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
  });

  it('consumes an unavailable hydrated briefing so a future edition never autoplays', async () => {
    mockLastResponse = response({ kind: 'briefing', date: '2026-11-21' });
    const empty = briefingTap(false);
    const { rerender } = renderHook(
      ({ tap }) => usePendingNotification(false, emptyGrouped, jest.fn(), tap),
      { initialProps: { tap: empty } },
    );
    await act(async () => {});
    expect(empty.unavailable).toHaveBeenCalledTimes(1);
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
    const later = briefingTap(true, '2026-11-22');
    rerender({ tap: later });
    await act(async () => {});
    expect(later.play).not.toHaveBeenCalled();
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
  });

  it('consumes responses with no routable app data', () => {
    mockLastResponse = response({ unrelated: true });
    renderHook(() => usePendingNotification(false, emptyGrouped, jest.fn()));
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
  });

  it('each tap is a Notification Opened of its kind, never with its story or date', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ kind: 'briefing', date: '2026-11-21' }, 'briefing'],
      [{ slug: 'story' }, 'breaking'],
      [{ unrelated: true }, 'other'],
    ];
    for (const [data, type] of cases) {
      mockTrack.mockClear();
      mockLastResponse = response(data);
      const tap = briefingTap(true);
      const h = renderHook(() => usePendingNotification(false, emptyGrouped, jest.fn(), tap));
      await act(async () => {});
      h.unmount();
      expect(mockTrack.mock.calls).toEqual([['Notification Opened', { type }]]);
    }
  });

  it('a briefing tap waiting for feed hydration is sent once, when it plays', async () => {
    mockLastResponse = response({ kind: 'briefing' });
    const tap = briefingTap(true);
    const { rerender } = renderHook(
      ({ callback }) =>
        usePendingNotification(!callback, emptyGrouped, jest.fn(), callback ? tap : undefined),
      { initialProps: { callback: false } },
    );
    expect(mockTrack).not.toHaveBeenCalled();
    rerender({ callback: true });
    rerender({ callback: true });
    await act(async () => {});
    expect(tap.play).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});

it('an undated tap on an empty offline edition cannot start the next edition', async () => {
  const feed = briefingTap(false);
  const failed = jest.fn(async () => {
    throw Error('offline');
  });
  const opened = { ...feed, verify: failed };
  mockLastResponse = response({ kind: 'briefing' });
  const h = renderHook(({ tap }) => usePendingNotification(false, emptyGrouped, jest.fn(), tap), {
    initialProps: { tap: opened as ReturnType<typeof briefingTap> },
  });
  await act(async () => {});
  expect(mockClearResponse).not.toHaveBeenCalled();
  const later = briefingTap(true, '2026-11-22');
  h.rerender({ tap: later });
  await act(async () => {});
  expect(later.play).not.toHaveBeenCalled();
  expect(later.unavailable).toHaveBeenCalledTimes(1);
  expect(mockClearResponse).toHaveBeenCalledTimes(1);
});

it.each([1, 1000])(
  'an undated delivered notification uses its native timestamp on a cold launch (%s)',
  async (scale) => {
    const date = '2026-11-21';
    const delivered = response({ kind: 'briefing' });
    mockLastResponse = {
      notification: { ...delivered.notification, date: Date.parse(date) / scale },
    };
    const tap = { ...briefingTap(true, date), generated: null };
    renderHook(() => usePendingNotification(false, emptyGrouped, jest.fn(), tap));
    await act(async () => {});
    expect(tap.play).toHaveBeenCalledWith(expect.objectContaining({ date }));
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
  },
);
