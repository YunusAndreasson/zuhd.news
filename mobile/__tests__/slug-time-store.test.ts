import { act, renderHook } from '@testing-library/react';
import { createSlugTimeStore } from '../lib/slug-time-store';

let mockKv: Map<string, string>;
let mockReadUnavailable = false;
let mockWriteFailures = 0;

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => {
      if (mockReadUnavailable) throw new Error('database temporarily unavailable');
      return mockKv.get(key) ?? null;
    }),
    setItemSync: jest.fn((key: string, value: string) => {
      if (mockWriteFailures > 0) {
        mockWriteFailures--;
        throw new Error('database temporarily unavailable');
      }
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
  jest.useFakeTimers();
  mockKv = new Map();
  mockReadUnavailable = false;
  mockWriteFailures = 0;
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
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

  it('retries a failed debounced save when the app flushes on background', () => {
    const store = load();
    store.mark('read-before-closing', 123);
    mockWriteFailures = 2;
    jest.advanceTimersByTime(250);
    expect(mockKv.has(key)).toBe(false);
    store.flush();
    expect(mockKv.has(key)).toBe(false);
    store.flush();
    expect(load().getSnapshot().has('read-before-closing')).toBe(true);
  });

  it('recovers earlier progress before a new story overwrites a failed launch read', () => {
    mockKv.set(key, JSON.stringify({ earlier: 123 }));
    mockReadUnavailable = true;
    const store = load();
    mockReadUnavailable = false;
    store.mark('new-arrival', 456);
    store.prune(new Set(['earlier', 'new-arrival']));
    store.flush();
    expect([...store.getSnapshot()].sort()).toEqual(['earlier', 'new-arrival']);
    expect([...load().getSnapshot()].sort()).toEqual(['earlier', 'new-arrival']);
  });

  it('keeps disk progress intact until an unavailable launch read can recover', () => {
    mockKv.set(key, JSON.stringify({ earlier: 123 }));
    mockReadUnavailable = true;
    const store = load();
    store.mark('new-arrival', 456);
    store.flush();
    expect(JSON.parse(mockKv.get(key) ?? '{}')).toEqual({ earlier: 123 });
    mockReadUnavailable = false;
    store.flush();
    expect(JSON.parse(mockKv.get(key) ?? '{}')).toEqual({ earlier: 123, 'new-arrival': 456 });
  });

  it('honors an explicit erase even if the launch read failed', () => {
    mockKv.set(key, JSON.stringify({ earlier: 123 }));
    mockReadUnavailable = true;
    const store = load();
    store.mark('new-arrival', 456);
    store.clear();
    mockReadUnavailable = false;
    store.flush();
    expect([...load().getSnapshot()]).toEqual([]);
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

  it('never evicts an already-read story still in the feed to make room for newer progress', () => {
    const store = load();
    store.mark('still-in-feed', 1);
    store.prune(new Set(['still-in-feed']), 2);
    for (let i = 0; i < 605; i++) store.mark(`past-${i}`, i + 2);
    store.flush();
    expect(store.getSnapshot().size).toBe(600);
    expect(store.getSnapshot().has('still-in-feed')).toBe(true);
    expect(load().getSnapshot().has('still-in-feed')).toBe(true);
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
it('recovers a failed launch read when the reader subscribes', () => {
  const key = 'read-hook-mount-test';
  mockKv.set(key, JSON.stringify({ earlier: 123 }));
  mockReadUnavailable = true;
  const store = createSlugTimeStore(key, 600);
  mockReadUnavailable = false;
  const { result } = renderHook(() => store.useSlugs());
  expect([...result.current]).toEqual(['earlier']);
});

it('updates a mounted reader when earlier progress can be restored', () => {
  const key = 'read-hook-test';
  mockKv.set(key, JSON.stringify({ earlier: 123 }));
  mockReadUnavailable = true;
  const store = createSlugTimeStore(key, 600);
  const { result } = renderHook(() => store.useSlugs());
  act(() => {
    store.mark('new-arrival', 456);
  });
  expect([...result.current]).toEqual(['new-arrival']);
  mockReadUnavailable = false;
  act(() => store.flush());
  expect([...result.current].sort()).toEqual(['earlier', 'new-arrival']);
});
