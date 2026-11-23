import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, hashKey, onlineManager, QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import * as Updates from 'expo-updates';
import { AppState } from 'react-native';
import { API_SNAPSHOTS, snapshotData } from './api-snapshots';
import { markLaunch } from './launch-timing';
import { subscribeConnectivity } from './network';
import { deleteLegacyFile, orderStorageWork } from './store-plumbing';
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

onlineManager.setEventListener((setOnline) => subscribeConnectivity((online) => setOnline(online)));

const CACHE_FILE = new File(Paths.cache, 'query-cache.json');
const QUERY_CACHE_KEY = 'REACT_QUERY_OFFLINE_CACHE';
const HEAT_CACHE_KEY = 'REACT_QUERY_LAUNCH_HEAT';
const HEATMAP = API_SNAPSHOTS.heatmap;
const HEAT_HASH = hashKey(HEATMAP.queryKey);

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

// Keep the existing SQLite key and TanStack serialization across upgrades.
const disk = createAsyncStoragePersister({ storage: Storage, throttleTime: 1000 });
let pending: PersistedClient | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let removal = 0;
let completedRemoval = 0;

function cancelPendingSave() {
  clearTimeout(timer);
  timer = undefined;
  pending = undefined;
}

function launchHeat(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.filter((query) => query.queryHash === HEAT_HASH);
  return { ...client, clientState: { queries, mutations: [] } };
}

function saveNow(client: PersistedClient) {
  cancelPendingSave();
  return orderStorageWork(() => {
    // Both foreground and headless saves commit the small first-frame read
    // with the full restore, including when this save drops the heat query.
    return Storage.multiSet([
      [QUERY_CACHE_KEY, JSON.stringify(client)],
      [HEAT_CACHE_KEY, JSON.stringify(launchHeat(client))],
    ]);
  });
}

// A completed background task needs the actual write's promise. TanStack's
// async throttle can resolve a caller while a previous save is still scheduled.
export const immediatePersister: Persister = {
  persistClient: saveNow,
  async restoreClient() {
    const before = removal;
    const client = await orderStorageWork(async () => disk.restoreClient());
    return before === removal ? client : undefined;
  },
  removeClient() {
    const generation = ++removal;
    cancelPendingSave();
    return orderStorageWork(async () => {
      await Storage.multiRemove([QUERY_CACHE_KEY, HEAT_CACHE_KEY]);
      completedRemoval = generation;
    });
  },
};

export const persister: Persister = {
  ...immediatePersister,
  persistClient(client) {
    pending = client;
    if (timer === undefined) {
      timer = setTimeout(() => {
        if (pending) void saveNow(pending).catch(() => {});
      }, 1000);
    }
  },
};

export const PERSIST_MAX_AGE_MS = DAY_MS;

/** The persisted cache belongs to the code that wrote it. A restored layer
 *  reaches the screen without its validator (`snapshotData`), so after an
 *  update that changed what a validator accepts, the old shape reached the UI
 *  for up to a day; now an update starts the cache over, at one full download
 *  of the layers. Pass it wherever the cache is restored or saved, or each
 *  side discards the other's. */
export const PERSIST_BUSTER = Updates.updateId ?? 'embedded';

/** Seed just the globe's heat before its first observer mounts. The rest of
 *  the cache restores asynchronously. Its own update time lets a newer
 *  restore win and avoids a second redraw for the same points. */
export function getLaunchQueryClient(): QueryClient {
  // A remounted activity can reach here while erasure is draining an older save.
  if (removal !== completedRemoval || queryClient.getQueryData(HEATMAP.queryKey) !== undefined) {
    return queryClient;
  }
  markLaunch('heat-read-start');
  try {
    const compact = Storage.getItemSync(HEAT_CACHE_KEY);
    const raw = compact ?? Storage.getItemSync(QUERY_CACHE_KEY);
    markLaunch('heat-read-complete');
    if (!raw) return queryClient;
    const client: PersistedClient = JSON.parse(raw);
    if (
      client.buster !== PERSIST_BUSTER ||
      !Number.isFinite(client.timestamp) ||
      client.timestamp <= 0 ||
      Date.now() - client.timestamp > PERSIST_MAX_AGE_MS
    )
      return queryClient;
    if (compact === null) {
      // An unchanged feed may never trigger a save. Migrate the old launch
      // once, behind any pending save, without overwriting a newer heat entry.
      const heat = launchHeat(client);
      void orderStorageWork(() =>
        Storage.setItemAsync(HEAT_CACHE_KEY, (previous) => previous ?? JSON.stringify(heat)),
      ).catch(() => {});
    }
    const state = client.clientState.queries.find((query) => query.queryHash === HEAT_HASH)?.state;
    if (
      state?.status === 'success' &&
      Number.isFinite(state.dataUpdatedAt) &&
      HEATMAP.validate(snapshotData(state.data))
    ) {
      queryClient.setQueryData(HEATMAP.queryKey, state.data, { updatedAt: state.dataUpdatedAt });
      markLaunch('heat-seeded');
    }
  } catch {
    // Missing or damaged cache: normal query restore/fetch and splash grace.
  } finally {
    markLaunch('heat-read-end');
  }
  return queryClient;
}
