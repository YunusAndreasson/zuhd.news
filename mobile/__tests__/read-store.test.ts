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

type ReadStore = typeof import('../lib/read-store');

function loadStore(): ReadStore {
  let store: ReadStore | undefined;
  jest.isolateModules(() => {
    store = require('../lib/read-store');
  });
  if (!store) throw new Error('read store failed to load');
  return store;
}

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  mockKv = new Map();
});

describe('read-store', () => {
  it('marks a story once and persists it across a reload', () => {
    const store = loadStore();
    expect(store.markRead('a')).toBe(true);
    expect(store.markRead('a')).toBe(false);
    expect(store.getSnapshot().has('a')).toBe(true);
    store.flushRead();
    expect(loadStore().getSnapshot().has('a')).toBe(true);
  });

  it('returns a new snapshot identity only when something changed', () => {
    const store = loadStore();
    const before = store.getSnapshot();
    store.markRead('a');
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    store.markRead('a');
    expect(store.getSnapshot()).toBe(after);
  });

  it('prunes only stories that left the feed and are older than two weeks', () => {
    const store = loadStore();
    const now = 100 * DAY;
    store.markRead('old-gone', now - 20 * DAY);
    store.markRead('old-live', now - 20 * DAY);
    store.markRead('new-gone', now - 1 * DAY);
    store.pruneRead(new Set(['old-live']), now);
    expect([...store.getSnapshot()].sort()).toEqual(['new-gone', 'old-live']);
  });

  it('caps the set, dropping the oldest reads', () => {
    const store = loadStore();
    for (let i = 0; i < 605; i++) store.markRead(`s${i}`, i);
    const snap = store.getSnapshot();
    expect(snap.size).toBe(600);
    expect(snap.has('s0')).toBe(false);
    expect(snap.has('s604')).toBe(true);
  });

  it('starts empty when the stored value is malformed', () => {
    mockKv.set('zuhd_read_v1', '["not", "a map"]');
    expect(loadStore().getSnapshot().size).toBe(0);
    mockKv.set('zuhd_read_v1', '{broken');
    expect(loadStore().getSnapshot().size).toBe(0);
  });
});
