import type { Article } from '@shared/types';

let mockFiles: Map<string, string>;
let mockKv: Map<string, string>;

jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc' },
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
  },
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => mockKv.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      mockKv.set(key, value);
    }),
  },
}));

type BookmarkStore = typeof import('../lib/bookmark-store');

function loadStore(): BookmarkStore {
  let store: BookmarkStore | undefined;
  jest.isolateModules(() => {
    store = require('../lib/bookmark-store');
  });
  if (!store) throw new Error('bookmark store failed to load');
  return store;
}

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

beforeEach(() => {
  jest.useFakeTimers();
  mockFiles = new Map();
  mockKv = new Map();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('bookmark SQLite persistence', () => {
  it('migrates even an empty valid legacy file so migration is one-time', () => {
    mockFiles.set('/doc/zuhd-bookmarks.json', '[]');
    expect(loadStore().getSnapshot()).toEqual([]);
    expect(mockKv.get('zuhd_bookmarks')).toBe('[]');
  });

  it('prefers SQLite over stale legacy file contents', () => {
    const current = [{ article: article('current'), category: 'tech', savedAt: 2 }];
    const stale = [{ article: article('stale'), category: 'politics', savedAt: 1 }];
    mockKv.set('zuhd_bookmarks', JSON.stringify(current));
    mockFiles.set('/doc/zuhd-bookmarks.json', JSON.stringify(stale));

    expect(
      loadStore()
        .getSnapshot()
        .map((entry) => entry.article.slug),
    ).toEqual(['current']);
  });

  it('rejects malformed persisted entries instead of exposing them to UI', () => {
    mockKv.set(
      'zuhd_bookmarks',
      JSON.stringify([{ article: { slug: 'broken' }, category: 'tech', savedAt: 1 }]),
    );
    expect(loadStore().getSnapshot()).toEqual([]);
  });

  it('notifies subscribers and flushes add/remove changes to SQLite', () => {
    const store = loadStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.toggle(article('saved'), 'science')).toBe(true);
    store.flushBookmarks();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockKv.get('zuhd_bookmarks') as string)[0]).toEqual(
      expect.objectContaining({
        category: 'science',
        article: expect.objectContaining({ slug: 'saved' }),
      }),
    );

    expect(store.toggle(article('saved'), 'science')).toBe(false);
    store.flushBookmarks();
    expect(JSON.parse(mockKv.get('zuhd_bookmarks') as string)).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.toggle(article('other'), 'tech');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
