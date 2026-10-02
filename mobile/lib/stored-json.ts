import Storage from 'expo-sqlite/kv-store';

/**
 * A store's saved value, read synchronously at import so the first render has
 * it: parsed, and kept only if it is the shape the store expects. Null when
 * nothing is saved, the JSON is unreadable or the shape is wrong — the store
 * starts empty then, rather than with a value that crashes a render.
 *
 * The slug-time stores, the fresh store and the snapshot fetcher's ETag map
 * each wrote this out. Its own module, not `store-plumbing`'s, which must
 * import nothing at run time.
 */
export function readStoredJson<T>(key: string, isValid: (v: unknown) => v is T): T | null {
  try {
    const stored = Storage.getItemSync(key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
