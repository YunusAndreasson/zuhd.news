import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { createDebouncedWrite, createListeners } from './store-plumbing';
import { loadStoredJson } from './stored-json';
import { DAY_MS } from './time';
import { isTimestampMap } from './validate';

/**
 * A set of slugs, each with when it joined, kept on the device: the stories a
 * reader has found (`found-store`) and the ones they have read (`read-store`).
 *
 * Those two were one file written twice — the same cap, the same prune, the
 * same load, write and subscription, line for line — and `fresh-store` held a
 * third copy of the validator and the prune rule. A rule that is the same for
 * all three is defined once here, so they cannot part.
 *
 * Loaded synchronously when created, so the first render has it; emitted to
 * `useSyncExternalStore`; written on a debounce and flushed when the app
 * backgrounds (`store-plumbing.ts`).
 */

/** How long a slug that has left the feed is kept. */
const PRUNE_AFTER_MS = 14 * DAY_MS;

/**
 * Whether a slug may be dropped. **Pruning is deliberately lazy:** only once
 * it has left the live feed *and* is two weeks old. Pruning on absence alone
 * would let one short or partial payload erase the reader's progress, and
 * every story would light up again on the next good one.
 */
export function isPrunable(
  slug: string,
  at: number,
  liveSlugs: ReadonlySet<string>,
  now: number,
): boolean {
  return !liveSlugs.has(slug) && now - at > PRUNE_AFTER_MS;
}

export interface SlugTimeStore {
  /** True when this call added the slug; false if it was already there. */
  mark(slug: string, now?: number): boolean;
  /** Drop the slugs `isPrunable` allows. */
  prune(liveSlugs: ReadonlySet<string>, now?: number): void;
  /** Erase it all, written at once: a promise to delete should not sit in a
   *  timer if the app is killed a moment later. */
  clear(): boolean;
  /** Write any pending change — call from app-background transitions. */
  flush(): void;
  /** The slugs, as one set whose identity changes only when they do. */
  getSnapshot(): ReadonlySet<string>;
  useSlugs(): ReadonlySet<string>;
}

/** `max` caps old history, dropping the oldest first. Live stories stay read
 * even if the feed itself exceeds the cap. */
export function createSlugTimeStore(key: string, max: number): SlugTimeStore {
  const initial = loadStoredJson(key, isTimestampMap);
  let loaded = initial.loaded;
  let times: Record<string, number> = initial.value ?? {};
  let snapshot: ReadonlySet<string> = new Set(Object.keys(times));
  let live: ReadonlySet<string> = new Set();
  const listeners = createListeners();

  const bounded = (next: Record<string, number>): Record<string, number> => {
    const slugs = Object.keys(next);
    let excess = slugs.length - max;
    if (excess <= 0) return next;
    slugs.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
    for (const slug of slugs) {
      if (excess <= 0) break;
      if (live.has(slug)) continue;
      delete next[slug];
      excess--;
    }
    return next;
  };

  const restore = (): boolean => {
    if (loaded) return true;
    const saved = loadStoredJson(key, isTimestampMap);
    if (!saved.loaded) return false;
    loaded = true;
    times = bounded({ ...saved.value, ...times });
    const slugs = Object.keys(times);
    if (slugs.length !== snapshot.size || slugs.some((slug) => !snapshot.has(slug))) {
      snapshot = new Set(slugs);
      listeners.emit();
    }
    return true;
  };

  const persist = createDebouncedWrite(() => {
    // A temporary launch read failure must never let new progress replace
    // history that is still on disk. Keep the write pending until it recovers.
    if (!restore()) throw new Error('Progress storage is temporarily unavailable');
    Storage.setItemSync(key, JSON.stringify(times));
  }, 250);

  const commit = (next: Record<string, number>, write: 'later' | 'now'): void => {
    times = next;
    snapshot = new Set(Object.keys(times));
    listeners.emit();
    persist[write]();
  };

  const getSnapshot = (): ReadonlySet<string> => snapshot;
  const subscribe = (listener: () => void): (() => void) => {
    const unsubscribe = listeners.subscribe(listener);
    // Retry an unavailable launch read when a reader mounts. Subscription
    // runs after render; getSnapshot itself stays free of storage and writes.
    restore();
    return unsubscribe;
  };

  return {
    mark(slug, now = Date.now()) {
      restore();
      if (!slug || times[slug] != null) return false;
      commit(bounded({ ...times, [slug]: now }), 'later');
      return true;
    },
    prune(liveSlugs, now = Date.now()) {
      live = liveSlugs;
      if (!restore()) return;
      let changed = false;
      const next: Record<string, number> = {};
      for (const [slug, at] of Object.entries(times)) {
        if (isPrunable(slug, at, liveSlugs, now)) changed = true;
        else next[slug] = at;
      }
      if (changed) commit(next, 'later');
    },
    clear() {
      // An explicit erase supersedes any history we could not read at launch.
      loaded = true;
      times = {};
      snapshot = new Set();
      listeners.emit();
      return persist.now();
    },
    flush() {
      restore();
      persist.flush();
    },
    getSnapshot,
    useSlugs() {
      return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    },
  };
}
