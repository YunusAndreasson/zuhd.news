import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { createDebouncedWrite, createListeners } from './store-plumbing';

/** Read progress is separate from opening a story or finding its globe marker.
 * Persisted locally, bounded to 600 stories, and pruned only after two weeks
 * outside the live feed. Never migrate opened stories into this state. */

const READ_KEY = 'zuhd_read_v1';
const MAX_READ = 600;
const PRUNE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

type ReadMap = Record<string, number>;

function isReadMap(value: unknown): value is ReadMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const v of Object.values(value)) if (typeof v !== 'number') return false;
  return true;
}

let read: ReadMap = {};
let snapshot: ReadonlySet<string> = new Set();
const listeners = createListeners();

try {
  const stored = Storage.getItemSync(READ_KEY);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (isReadMap(parsed)) read = parsed;
  }
} catch {
  read = {};
}
snapshot = new Set(Object.keys(read));

function emit() {
  snapshot = new Set(Object.keys(read));
  listeners.emit();
}

const persist = createDebouncedWrite(() => {
  Storage.setItemSync(READ_KEY, JSON.stringify(read));
}, 250);

/** Flush any pending write — call from app-background transitions. */
export const flushRead = persist.flush;

/** Returns true when this call marked the story read; false if it already was. */
export function markRead(slug: string, now = Date.now()): boolean {
  if (!slug || read[slug] != null) return false;
  read = { ...read, [slug]: now };
  const slugs = Object.keys(read);
  if (slugs.length > MAX_READ) {
    // Oldest out first.
    slugs.sort((a, b) => (read[a] ?? 0) - (read[b] ?? 0));
    const next: ReadMap = {};
    for (const s of slugs.slice(slugs.length - MAX_READ)) next[s] = read[s] ?? now;
    read = next;
  }
  emit();
  persist.later();
  return true;
}

/** Drop read slugs that have left the feed and are older than two weeks. */
export function pruneRead(liveSlugs: ReadonlySet<string>, now = Date.now()): void {
  let changed = false;
  const next: ReadMap = {};
  for (const [slug, at] of Object.entries(read)) {
    if (!liveSlugs.has(slug) && now - at > PRUNE_AFTER_MS) {
      changed = true;
      continue;
    }
    next[slug] = at;
  }
  if (!changed) return;
  read = next;
  emit();
  persist.later();
}

/** Erase all progress. Immediate, like `clearBookmarks`. */
export function clearRead(): void {
  read = {};
  emit();
  persist.now();
}

const subscribe = listeners.subscribe;

export function getSnapshot(): ReadonlySet<string> {
  return snapshot;
}

export function useReadSlugs(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
