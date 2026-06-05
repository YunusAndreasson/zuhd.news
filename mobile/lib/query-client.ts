import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { AsyncStorage } from '@tanstack/query-persist-client-core';
import { QueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { DAY_MS } from './time';

const CACHE_FILE = new File(Paths.cache, 'query-cache.json');

// AsyncStorage shim over expo-file-system: a single in-memory map mirrored
// to one JSON file. The persister hands us the whole serialized client as a
// single string under one key, so the working set is one file write per
// throttle window. Swap for expo-sqlite/kv if cold-start hydration grows.
function createFileStorage(): AsyncStorage<string> {
  let cachePromise: Promise<Record<string, string>> | null = null;

  const load = (): Promise<Record<string, string>> => {
    if (cachePromise) return cachePromise;
    cachePromise = (async () => {
      try {
        if (!CACHE_FILE.exists) return {};
        const text = await CACHE_FILE.text();
        const parsed: unknown = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
      } catch {
        return {};
      }
    })();
    return cachePromise;
  };

  const flush = async (data: Record<string, string>) => {
    try {
      CACHE_FILE.write(JSON.stringify(data));
    } catch {}
  };

  return {
    getItem: async (key: string) => {
      const data = await load();
      return data[key] ?? null;
    },
    setItem: async (key: string, value: string) => {
      const data = await load();
      data[key] = value;
      await flush(data);
    },
    removeItem: async (key: string) => {
      const data = await load();
      delete data[key];
      await flush(data);
    },
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 5 minutes so rapid sheet open/close doesn't
      // trigger duplicate fetches. Matches the previous STALE_THRESHOLD.
      staleTime: 5 * 60 * 1000,
      // Keep evicted data around for a day so a back/forward navigation
      // still gets an instant render from cache.
      gcTime: DAY_MS,
      // Match the prior `fetchWithTimeout(5000)` failure mode: retry a few
      // times on transient network errors, then surface the error to UI.
      retry: 2,
      // Manual control over resume-refresh via useAppResume — disable
      // TanStack Query's window-focus / network-reconnect refetching.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: createFileStorage(),
  // Coalesce writes into one file flush per second. Without throttling,
  // every query result would trigger a full client serialization to disk.
  throttleTime: 1000,
});

export const PERSIST_MAX_AGE_MS = DAY_MS;
