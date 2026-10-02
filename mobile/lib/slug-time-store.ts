import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { createDebouncedWrite, createListeners } from './store-plumbing';
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
  clear(): void;
  /** Write any pending change — call from app-background transitions. */
  flush(): void;
  /** The slugs, as one set whose identity changes only when they do. */
  getSnapshot(): ReadonlySet<string>;
  useSlugs(): ReadonlySet<string>;
}

/** `max` caps the set, dropping the oldest first. */
export function createSlugTimeStore(key: string, max: number): SlugTimeStore {
  let times: Record<string, number> = {};
  try {
    const stored = Storage.getItemSync(key);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isTimestampMap(parsed)) times = parsed;
    }
  } catch {
    times = {};
  }
  let snapshot: ReadonlySet<string> = new Set(Object.keys(times));
  const listeners = createListeners();
  const persist = createDebouncedWrite(() => {
    Storage.setItemSync(key, JSON.stringify(times));
  }, 250);

  const commit = (next: Record<string, number>, write: 'later' | 'now'): void => {
    times = next;
    snapshot = new Set(Object.keys(times));
    listeners.emit();
    persist[write]();
  };

  const getSnapshot = (): ReadonlySet<string> => snapshot;

  return {
    mark(slug, now = Date.now()) {
      if (!slug || times[slug] != null) return false;
      let next = { ...times, [slug]: now };
      const slugs = Object.keys(next);
      if (slugs.length > max) {
        // Oldest out first.
        slugs.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
        const kept: Record<string, number> = {};
        for (const s of slugs.slice(slugs.length - max)) kept[s] = next[s] ?? now;
        next = kept;
      }
      commit(next, 'later');
      return true;
    },
    prune(liveSlugs, now = Date.now()) {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [slug, at] of Object.entries(times)) {
        if (isPrunable(slug, at, liveSlugs, now)) changed = true;
        else next[slug] = at;
      }
      if (changed) commit(next, 'later');
    },
    clear() {
      commit({}, 'now');
    },
    flush: persist.flush,
    getSnapshot,
    useSlugs() {
      return useSyncExternalStore(listeners.subscribe, getSnapshot, getSnapshot);
    },
  };
}
