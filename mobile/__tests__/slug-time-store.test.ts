let mockKv: Map<string, string>;

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => mockKv.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      mockKv.set(key, value);
    }),
  },
}));

/** The calls every slug-time store answers, under each store's own names. */
interface Store {
  mark: (slug: string, now?: number) => boolean;
  prune: (live: ReadonlySet<string>, now?: number) => void;
  clear: () => void;
  flush: () => void;
  getSnapshot: () => ReadonlySet<string>;
}

/** A fresh module, as a launch would load it, so a reload reads the disk. */
function isolated<T>(load: () => T): T {
  let mod: T | undefined;
  jest.isolateModules(() => {
    mod = load();
  });
  if (!mod) throw new Error('store failed to load');
  return mod;
}

const STORES: { name: string; key: string; load: () => Store }[] = [
  {
    name: 'found-store',
    key: 'zuhd_found_v1',
    load: () => {
      const s: typeof import('../lib/found-store') = isolated(() => require('../lib/found-store'));
      return {
        mark: s.markFound,
        prune: s.pruneFound,
        clear: s.clearFound,
        flush: s.flushFound,
        getSnapshot: s.getSnapshot,
      };
    },
  },
  {
    name: 'read-store',
    key: 'zuhd_read_v1',
    load: () => {
      const s: typeof import('../lib/read-store') = isolated(() => require('../lib/read-store'));
      return {
        mark: s.markRead,
        prune: s.pruneRead,
        clear: s.clearRead,
        flush: s.flushRead,
        getSnapshot: s.getSnapshot,
      };
    },
  },
];

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  mockKv = new Map();
});

describe.each(STORES)('$name', ({ key, load }) => {
  it('marks a story once and persists it across a reload', () => {
    const store = load();
    expect(store.mark('a')).toBe(true);
    expect(store.mark('a')).toBe(false);
    expect(store.getSnapshot().has('a')).toBe(true);
    store.flush();
    expect(mockKv.has(key)).toBe(true);
    expect(load().getSnapshot().has('a')).toBe(true);
  });

  it('returns a new snapshot identity only when something changed', () => {
    const store = load();
    const before = store.getSnapshot();
    store.mark('a');
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    store.mark('a');
    expect(store.getSnapshot()).toBe(after);
    store.prune(new Set(['a']));
    expect(store.getSnapshot()).toBe(after);
  });

  it('prunes only stories that left the feed and are older than two weeks', () => {
    const store = load();
    const now = 100 * DAY;
    store.mark('old-gone', now - 20 * DAY);
    store.mark('old-live', now - 20 * DAY);
    store.mark('new-gone', now - 1 * DAY);
    store.prune(new Set(['old-live']), now);
    expect([...store.getSnapshot()].sort()).toEqual(['new-gone', 'old-live']);
  });

  it('caps the set, dropping the oldest', () => {
    const store = load();
    for (let i = 0; i < 605; i++) store.mark(`s${i}`, i);
    const snap = store.getSnapshot();
    expect(snap.size).toBe(600);
    expect(snap.has('s0')).toBe(false);
    expect(snap.has('s604')).toBe(true);
  });

  it('erases at once, without waiting for the debounce', () => {
    const store = load();
    store.mark('a');
    store.flush();
    store.clear();
    expect(store.getSnapshot().size).toBe(0);
    expect(mockKv.get(key)).toBe('{}');
  });

  it('starts empty when the stored value is malformed', () => {
    mockKv.set(key, '["not", "a map"]');
    expect(load().getSnapshot().size).toBe(0);
    mockKv.set(key, '{broken');
    expect(load().getSnapshot().size).toBe(0);
    mockKv.set(key, '{"a": "yesterday"}');
    expect(load().getSnapshot().size).toBe(0);
  });
});
