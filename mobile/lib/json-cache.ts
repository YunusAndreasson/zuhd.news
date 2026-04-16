import { File, Paths } from 'expo-file-system';

export interface JsonCache<T> {
  read: () => Promise<T | null>;
  /** Deferred fire-and-forget write — returns immediately, writes on the next tick. */
  write: (data: T) => void;
}

/** File-backed JSON cache with deferred writes to keep I/O off the render frame. */
export function createJsonCache<T>(filename: string): JsonCache<T> {
  const file = new File(Paths.cache, filename);
  return {
    read: async () => {
      try {
        if (!file.exists) return null;
        return JSON.parse(await file.text()) as T;
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
