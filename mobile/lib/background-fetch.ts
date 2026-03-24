import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { API_BASE } from '../constants/theme';
import { readCachedGenerated, writeFeedCache } from './feed-cache';
import { fetchWithTimeout } from './fetch';

const TASK_NAME = 'ZUHD_BACKGROUND_FETCH';

/** Fetch feed if new content available. Returns true if cache was updated. */
export async function fetchAndCacheIfNew(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/meta.json`, 5000, {
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const meta = await res.json();
    const cached = readCachedGenerated();
    if (cached === meta.generated) return false;
  } catch {
    return false;
  }

  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/feed.json`, 10000);
    if (!res.ok) return false;
    const feed = await res.json();
    writeFeedCache(feed);
    return true;
  } catch {
    return false;
  }
}

// Must be called at module top level before React renders
TaskManager.defineTask(TASK_NAME, async () => {
  const updated = await fetchAndCacheIfNew();
  return updated
    ? BackgroundTask.BackgroundTaskResult.Success
    : BackgroundTask.BackgroundTaskResult.Failed;
});

export async function registerBackgroundTask(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      minimumInterval: 240, // 4 hours in minutes — matches ~5 cycles/day
    });
  } catch {
    // Background task not available (e.g. Expo Go)
  }
}
