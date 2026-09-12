import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/**
 * Which stories the reader has found.
 *
 * A story is found when it is opened from anywhere — its mark on the globe,
 * its row in the sheet, a page turned to in the reader. The globe stops
 * drawing a found story's mark, and that is the whole game: what is still lit
 * is what you have not seen yet.
 *
 * Same shape as `bookmark-store.ts`: loaded synchronously on import, emitted
 * to `useSyncExternalStore`, persisted on a debounce and flushed when the app
 * backgrounds.
 *
 * **Pruning is deliberately lazy.** A slug is dropped only when it is both
 * absent from the live feed *and* older than `PRUNE_AFTER_MS`. Pruning on
 * absence alone would let one short or partial payload erase the reader's
 * progress, and every story would light up again on the next good one.
 */

const FOUND_KEY = 'zuhd_found_v1';
const MAX_FOUND = 600;
export const PRUNE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

type FoundMap = Record<string, number>;

function isFoundMap(value: unknown): value is FoundMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const v of Object.values(value)) if (typeof v !== 'number') return false;
  return true;
}

let found: FoundMap = {};
let snapshot: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

try {
  const stored = Storage.getItemSync(FOUND_KEY);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (isFoundMap(parsed)) found = parsed;
  }
} catch {
  found = {};
}
snapshot = new Set(Object.keys(found));

function emit() {
  snapshot = new Set(Object.keys(found));
  for (const fn of listeners) fn();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  try {
    Storage.setItemSync(FOUND_KEY, JSON.stringify(found));
  } catch {}
}

function persistDebounced() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
}

/** Flush any pending write — call from app-background transitions. */
export function flushFound(): void {
  if (persistTimer) persistNow();
}

/** Returns true when this call found the story; false if it already was. */
export function markFound(slug: string, now = Date.now()): boolean {
  if (!slug || found[slug] != null) return false;
  found = { ...found, [slug]: now };
  const slugs = Object.keys(found);
  if (slugs.length > MAX_FOUND) {
    // Oldest out first.
    slugs.sort((a, b) => (found[a] ?? 0) - (found[b] ?? 0));
    const next: FoundMap = {};
    for (const s of slugs.slice(slugs.length - MAX_FOUND)) next[s] = found[s] ?? now;
    found = next;
  }
  emit();
  persistDebounced();
  return true;
}

/** Drop found slugs that have left the feed and are older than two weeks. */
export function pruneFound(liveSlugs: ReadonlySet<string>, now = Date.now()): void {
  let changed = false;
  const next: FoundMap = {};
  for (const [slug, at] of Object.entries(found)) {
    if (!liveSlugs.has(slug) && now - at > PRUNE_AFTER_MS) {
      changed = true;
      continue;
    }
    next[slug] = at;
  }
  if (!changed) return;
  found = next;
  emit();
  persistDebounced();
}

/** Erase all progress. Immediate, like `clearBookmarks`. */
export function clearFound(): void {
  found = {};
  emit();
  persistNow();
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot(): ReadonlySet<string> {
  return snapshot;
}

export function useFoundSlugs(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
