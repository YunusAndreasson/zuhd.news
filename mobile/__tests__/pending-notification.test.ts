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

  it('keeps a briefing response pending until a player callback exists', () => {
    mockLastResponse = response({ kind: 'briefing' });
    const onSelect = jest.fn();
    const onPlay = jest.fn();
    const { rerender } = renderHook(
      ({ callback }) =>
        usePendingNotification(false, emptyGrouped, onSelect, callback ? onPlay : undefined),
      { initialProps: { callback: false } },
    );
    expect(mockClearResponse).not.toHaveBeenCalled();

    rerender({ callback: true });
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
  });

  it('consumes responses with no routable app data', () => {
    mockLastResponse = response({ unrelated: true });
    renderHook(() => usePendingNotification(false, emptyGrouped, jest.fn()));
    expect(mockClearResponse).toHaveBeenCalledTimes(1);
  });

  it('each tap is a Notification Opened of its kind, never with its story or date', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ kind: 'briefing', date: '2026-11-21' }, 'briefing'],
      [{ slug: 'story' }, 'breaking'],
      [{ unrelated: true }, 'other'],
    ];
    for (const [data, type] of cases) {
      mockTrack.mockClear();
      mockLastResponse = response(data);
      renderHook(() => usePendingNotification(false, emptyGrouped, jest.fn(), jest.fn()));
      expect(mockTrack.mock.calls).toEqual([['Notification Opened', { type }]]);
    }
  });

  it('a briefing tap waiting for its player is sent once, when it plays', () => {
    mockLastResponse = response({ kind: 'briefing' });
    const { rerender } = renderHook(
      ({ callback }) =>
        usePendingNotification(false, emptyGrouped, jest.fn(), callback ? jest.fn() : undefined),
      { initialProps: { callback: false } },
    );
    expect(mockTrack).not.toHaveBeenCalled();
    rerender({ callback: true });
    rerender({ callback: true });
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});
