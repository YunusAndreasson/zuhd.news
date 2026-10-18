import type { File } from 'expo-file-system';

/**
 * What every local store here repeats.
 *
 * The bookmark, onboarding and story-set stores each carried their own copy of
 * a listener set for `useSyncExternalStore` and a debounced synchronous write
 * flushed when the app backgrounds, one header saying "same shape as
 * `bookmark-store.ts`" instead of sharing it. Deleting the file
 * an older build kept a store in joined them for the same reason.
 *
 * **Nothing here imports at run time**, and that is load-bearing: the data
 * meter takes its listeners from here, every test that reaches the fetch
 * layer loads it, and a runtime import of the kv store (`stored-json.ts`)
 * failed four suites that do not mock it.
 */

/** Listeners for `useSyncExternalStore`: `subscribe` is its first argument. */
export function createListeners() {
  const listeners = new Set<() => void>();
  return {
    emit(): void {
      for (const fn of listeners) fn();
    },
    subscribe(callback: () => void): () => void {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}

/**
 * A write that runs `delayMs` after the last change, or at once.
 *
 * `now` is for promises the reader was made — an erase should not sit in a
 * timer if the app is killed a moment later. `flush` writes only when a change
 * is pending; call it from app-background transitions. A failed write stays
 * pending so the next flush or change can retry it.
 */
export function createDebouncedWrite(write: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  const now = (): boolean => {
    if (timer) clearTimeout(timer);
    timer = null;
    dirty = true;
    try {
      write();
      dirty = false;
      return true;
    } catch {
      return false;
    }
  };
  return {
    now,
    later(): void {
      dirty = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(now, delayMs);
    },
    flush(): void {
      if (dirty) now();
    },
  };
}

/**
 * Delete a file an older build kept a store in, once its contents have moved
 * into the kv store (`legacy-store.ts`) — quietly: one that is already gone is
 * the goal. Migration loaders keep the default best-effort cleanup; explicit
 * erasure passes strict so a failure cannot be reported as success.
 */
export function deleteLegacyFile(file: File, strict = false): void {
  try {
    if (file.exists) file.delete();
  } catch (error) {
    if (strict) throw error;
  }
}
