let mockFiles: Map<string, string>;
let mockKv: Map<string, string>;

jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc', cache: '/cache' },
  File: class MockFile {
    path: string;
    constructor(dir: string, name: string) {
      this.path = `${dir}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    textSync() {
      const value = mockFiles.get(this.path);
      if (value == null) throw new Error(`missing file ${this.path}`);
      return value;
    }
    text() {
      return Promise.resolve(mockFiles.get(this.path) ?? '');
    }
    write(value: string) {
      mockFiles.set(this.path, value);
    }
    delete() {
      mockFiles.delete(this.path);
    }
  },
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => mockKv.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      mockKv.set(key, value);
    }),
    getItem: jest.fn((key: string) => Promise.resolve(mockKv.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockKv.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockKv.delete(key);
      return Promise.resolve();
    }),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined' })),
}));

// query-client.ts wires RN focus/network state at import; neither has a jsdom
// implementation. The real QueryClient is kept — the erase path has to prove it
// actually empties the cache, not that it called a spy.
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(() => Promise.resolve(false)),
  requestReview: jest.fn(() => Promise.resolve()),
}));

import type { Article, Category } from '@shared/types';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { getCardHistory, markCardViewed } from '../lib/card-history';
import { getSnapshot as getDataUsage, recordBytes } from '../lib/data-usage';
import { queryClient } from '../lib/query-client';
import { eraseLocalData } from '../lib/wipe';

const article = (slug: string): Article => ({
  slug,
  title: 'T',
  date: '2026-07-25',
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
});

beforeEach(() => {
  mockFiles = new Map();
  mockKv = new Map();
});

describe('eraseLocalData', () => {
  it('clears every kind of stored state it promises to', async () => {
    // Something of each kind: a bookmark, the persisted keys, a cached feed
    // file, a live query, and a non-zero data meter.
    toggleBookmark(article('a'), 'politics' as Category);
    markCardViewed('outlook', {
      id: 'event',
      kind: 'scheduled',
      date: '2026-09-04',
      title: 'Event',
      reading: 'Today',
    });
    mockKv.set('zuhd_last_seen', '123');
    mockKv.set('zuhd_briefing_pos', '42');
    mockKv.set('zuhd_briefing_date', '2026-07-25');
    mockKv.set('zuhd_review_count', '19');
    mockKv.set('zuhd_review_prompted', '1700000000');
    mockKv.set('REACT_QUERY_OFFLINE_CACHE', '{"clientState":{}}');
    mockFiles.set('/cache/zuhd-feed.json', '{"generated":"x"}');
    queryClient.setQueryData(['feed'], { generated: 'x' });
    recordBytes(4096);

    expect(getBookmarks()).toHaveLength(1);
    expect(getDataUsage()).toBe(4096);

    await eraseLocalData();

    expect(getBookmarks()).toEqual([]);
    expect(getCardHistory()).toEqual({});
    expect(JSON.parse(mockKv.get('zuhd_card_history_v1') ?? 'null')).toEqual({});
    expect(getDataUsage()).toBe(0);
    expect(queryClient.getQueryData(['feed'])).toBeUndefined();
    expect(mockFiles.has('/cache/zuhd-feed.json')).toBe(false);
    for (const key of [
      'zuhd_last_seen',
      'zuhd_briefing_pos',
      'zuhd_briefing_date',
      'zuhd_review_count',
      'zuhd_review_prompted',
      'REACT_QUERY_OFFLINE_CACHE',
    ]) {
      expect(mockKv.has(key)).toBe(false);
    }
  });

  // The erase copy promises display settings survive. Wiping someone's text
  // size because they asked about privacy would be a hostile reading of the
  // request, so it's pinned here rather than left to a future refactor.
  it('leaves display preferences and the notification choice alone', async () => {
    mockKv.set('zuhd_preferences_v2', '{"fontSize":"large","appearance":"light"}');
    mockKv.set('zuhd_notif_asked', '1');

    await eraseLocalData();

    expect(mockKv.get('zuhd_preferences_v2')).toBe('{"fontSize":"large","appearance":"light"}');
    expect(mockKv.get('zuhd_notif_asked')).toBe('1');
  });

  it('is safe to run twice', async () => {
    await eraseLocalData();
    await expect(eraseLocalData()).resolves.toBeUndefined();
    expect(getBookmarks()).toEqual([]);
  });
});
