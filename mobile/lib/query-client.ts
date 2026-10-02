import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';
import { deleteLegacyFile } from './store-plumbing';
import { DAY_MS } from './time';

// TanStack Query's browser focus/network listeners do not exist in React
// Native. Bridge the native sources once so every query gets consistent
// pause, retry, focus-refetch, and reconnect behavior.
focusManager.setEventListener((setFocused) => {
  setFocused(AppState.currentState === 'active');
  const subscription = AppState.addEventListener('change', (state) => {
    setFocused(state === 'active');
  });
  return () => subscription.remove();
});

onlineManager.setEventListener((setOnline) => {
  let receivedEvent = false;
  const subscription = Network.addNetworkStateListener((state) => {
    receivedEvent = true;
    setOnline(!!state.isConnected);
  });
  void Network.getNetworkStateAsync()
    .then((state) => {
      if (!receivedEvent) setOnline(!!state.isConnected);
    })
    .catch(() => {});
  return () => subscription.remove();
});

const CACHE_FILE = new File(Paths.cache, 'query-cache.json');
const QUERY_CACHE_KEY = 'REACT_QUERY_OFFLINE_CACHE';

// One-time migration from the previous file-backed AsyncStorage shim. The
// shim stored the persister's already-serialized value inside a JSON object.
//
// The file is asked about first and deleted once moved. The other order read
// the whole persisted cache — the feed and every snapshot — synchronously at
// import, before the first frame, on every launch, to learn whether a
// migration that had already happened was needed; and the file, never
// deleted, kept the question open and outlived the privacy page's erase.
try {
  if (CACHE_FILE.exists) {
    try {
      if (Storage.getItemSync(QUERY_CACHE_KEY) === null) {
        const parsed: unknown = JSON.parse(CACHE_FILE.textSync());
        const legacy =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)[QUERY_CACHE_KEY]
            : undefined;
        if (typeof legacy === 'string') Storage.setItemSync(QUERY_CACHE_KEY, legacy);
      }
    } finally {
      // Moved or unreadable, it is never asked about again: it is a cache.
      deleteLegacyFile(CACHE_FILE);
    }
  }
} catch {}

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
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: Storage,
  // Coalesce persistence writes. Without throttling, every query result would
  // trigger a full client serialization into the SQLite-backed KV store.
  throttleTime: 1000,
});

export const PERSIST_MAX_AGE_MS = DAY_MS;
