import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { API_BASE } from '../constants/theme';
import { readCachedGenerated, writeFeedCache } from './feed-cache';
import { resetReadingPositions } from './storage';

const TASK_NAME = 'ZUHD_BACKGROUND_FETCH';

/** Fetch feed if new content available. Returns true if cache was updated. */
export async function fetchAndCacheIfNew(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${API_BASE}/api/meta.json`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const meta = await res.json();
    const cached = readCachedGenerated();
    if (cached === meta.generated) return false;
  } catch {
    clearTimeout(timeout);
    return false;
  }

  const controller2 = new AbortController();
  const timeout2 = setTimeout(() => controller2.abort(), 10000);
  try {
    const res = await fetch(`${API_BASE}/api/feed.json`, { signal: controller2.signal });
    clearTimeout(timeout2);
    if (!res.ok) return false;
    const feed = await res.json();
    writeFeedCache(feed);
    await resetReadingPositions();
    return true;
  } catch {
    clearTimeout(timeout2);
    return false;
  }
}

// Must be called at module top level before React renders
TaskManager.defineTask(TASK_NAME, async () => {
  const updated = await fetchAndCacheIfNew();
  return updated
    ? BackgroundFetch.BackgroundFetchResult.NewData
    : BackgroundFetch.BackgroundFetchResult.NoData;
});

export async function registerBackgroundFetch(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: 4 * 60 * 60, // 4 hours — matches ~5 cycles/day
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background fetch not available (e.g. Expo Go)
  }
}
