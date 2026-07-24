import { File, Paths } from 'expo-file-system';

export interface JsonCache<T> {
  read: () => Promise<T | null>;
  /** Resolves after the serialized value has been written (or the write fails quietly). */
  write: (data: T) => Promise<void>;
  /** Delete the backing file. Used by the privacy page's erase control, which
   *  promises that nothing the app downloaded is left on the device. */
  clear: () => Promise<void>;
}

/**
 * File-backed JSON cache with completion-aware writes for background tasks.
 * A `validate` guard is required — without it, stale cache from an older app
 * version can flow into the app as a malformed T and crash far from the source.
 * If validation fails, `read` returns null (treat as cache miss).
 */
export function createJsonCache<T>(
  filename: string,
  validate: (value: unknown) => value is T,
): JsonCache<T> {
  const file = new File(Paths.cache, filename);
  return {
    read: async () => {
      try {
        if (!file.exists) return null;
        const parsed: unknown = JSON.parse(await file.text());
        return validate(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    write: (data) => {
      try {
        file.write(JSON.stringify(data));
      } catch {}
      return Promise.resolve();
    },
    clear: () => {
      try {
        if (file.exists) file.delete();
      } catch {}
      return Promise.resolve();
    },
  };
}
