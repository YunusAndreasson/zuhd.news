import { File, Paths } from 'expo-file-system';

export interface JsonCache<T> {
  read: () => Promise<T | null>;
  /** Deferred fire-and-forget write — returns immediately, writes on the next tick. */
  write: (data: T) => void;
}

/**
 * File-backed JSON cache with deferred writes to keep I/O off the render frame.
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
      const json = JSON.stringify(data);
      setTimeout(() => {
        try {
          file.write(json);
        } catch {}
      }, 0);
    },
  };
}
