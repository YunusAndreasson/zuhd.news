let mockKv: Map<string, string>;

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => mockKv.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      mockKv.set(key, value);
    }),
    removeItemSync: jest.fn((key: string) => mockKv.delete(key)),
  },
}));

type FreshStore = typeof import('../lib/fresh-store');

function loadStore(): FreshStore {
  let store: FreshStore | undefined;
  jest.isolateModules(() => {
    store = require('../lib/fresh-store');
  });
  if (!store) throw new Error('fresh store failed to load');
  return store;
}

const DAY = 24 * 60 * 60 * 1000;
const feed = (...slugs: string[]) => slugs.map((slug) => ({ slug, addedAt: 1000 }));
const fresh = (store: FreshStore) => [...store.getFreshState().fresh].sort();

beforeEach(() => {
  mockKv = new Map();
});

describe('fresh-store', () => {
  it('calls nothing new on a first launch', () => {
    const store = loadStore();
    store.noteFeed('g1', feed('a', 'b'));
    expect(fresh(store)).toEqual([]);
  });

  it('calls a story new when it was not in a feed the reader already had', () => {
    const store = loadStore();
    store.noteFeed('g1', feed('a', 'b'));
    store.noteFeed('g2', feed('c', 'a', 'b'));
    expect(fresh(store)).toEqual(['c']);
  });

  it('ignores addedAt: a rewritten file that reads as just published is not new', () => {
    const store = loadStore();
    store.noteFeed('g1', [{ slug: 'yesterday', addedAt: 1000 }]);
    store.noteFeed('g2', [{ slug: 'yesterday', addedAt: 9_000_000 }]);
    expect(fresh(store)).toEqual([]);
  });

  it('notes a feed once, so handing the same one back changes nothing', () => {
    const store = loadStore();
    store.noteFeed('g1', feed('a'));
    store.noteFeed('g2', feed('b', 'a'));
    const before = store.getFreshState();
    // A bookmark injected into the same feed.
    store.noteFeed('g2', feed('b', 'a', 'saved'));
    expect(store.getFreshState()).toBe(before);
    expect(fresh(store)).toEqual(['b']);
  });

  it('keeps a landed story new until the next feed, then knows it', () => {
    const store = loadStore();
    store.noteFeed('g1', feed('a'));
    store.noteFeed('g2', feed('b', 'c', 'a'));
    store.markLanded('b');
    expect(fresh(store)).toEqual(['b', 'c']);
    expect([...store.getFreshState().landed]).toEqual(['b']);
    store.noteFeed('g3', feed('d', 'b', 'c', 'a'));
    // The skipped story is still new to the reader; the landed one is not.
    expect(fresh(store)).toEqual(['c', 'd']);
    expect(store.getFreshState().landed.size).toBe(0);
  });

  it('only lands stories that are new', () => {
    const store = loadStore();
    store.noteFeed('g1', feed('a'));
    const before = store.getFreshState();
    store.markLanded('a');
    store.markLanded('not-in-feed');
    expect(store.getFreshState()).toBe(before);
  });

  it('carries what was landed and what was skipped across a restart', () => {
    const store = loadStore();
    store.noteFeed('g1', feed('a'));
    store.noteFeed('g2', feed('b', 'c', 'a'));
    store.markLanded('b');
    store.flushKnown();
    const next = loadStore();
    next.noteFeed('g2', feed('b', 'c', 'a'));
    expect(fresh(next)).toEqual(['c']);
  });

  it('gives an install upgrading from lastSeenAt one session of the clock', () => {
    const store = loadStore();
    store.noteFeed(
      'g1',
      [
        { slug: 'before', addedAt: 1000 },
        { slug: 'after', addedAt: 5000 },
      ],
      2000,
    );
    expect(fresh(store)).toEqual(['after']);
  });

  it('prunes only slugs that left the feed and are two weeks old', () => {
    const store = loadStore();
    const now = 100 * DAY;
    store.noteFeed('g1', feed('old-gone', 'old-live'), 0, now - 20 * DAY);
    store.noteFeed('g2', feed('recent-gone', 'old-live'), 0, now - 1 * DAY);
    store.markLanded('recent-gone');
    store.noteFeed('g3', feed('old-live'), 0, now);
    store.flushKnown();
    const stored = JSON.parse(mockKv.get('zuhd_known_v1') ?? '{}');
    expect(Object.keys(stored).sort()).toEqual(['old-live', 'recent-gone']);
  });

  it('forgets everything on erase, and the next feed is a first launch', () => {
    const store = loadStore();
    store.noteFeed('g1', feed('a'));
    store.noteFeed('g2', feed('b', 'a'));
    store.clearKnown();
    expect(mockKv.has('zuhd_known_v1')).toBe(false);
    store.noteFeed('g2', feed('b', 'a'));
    expect(fresh(store)).toEqual([]);
  });

  it('starts from a first launch when the stored value is malformed', () => {
    mockKv.set('zuhd_known_v1', '["a"]');
    const store = loadStore();
    store.noteFeed('g1', feed('a', 'b'));
    expect(fresh(store)).toEqual([]);
  });
});
