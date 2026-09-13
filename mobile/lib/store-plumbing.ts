/**
 * The two halves every local store here repeats.
 *
 * `bookmark-store`, `found-store` and `onboarding-store` each carried their own
 * copy of both — a listener set for `useSyncExternalStore` and a debounced
 * synchronous write flushed when the app backgrounds — and `found-store`'s
 * header said "same shape as `bookmark-store.ts`" instead of sharing it.
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
 * is pending; call it from app-background transitions. A failed write is
 * dropped: the in-memory state stays authoritative for the session.
 */
export function createDebouncedWrite(write: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const now = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      write();
    } catch {}
  };
  return {
    now,
    later(): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(now, delayMs);
    },
    flush(): void {
      if (timer) now();
    },
  };
}
