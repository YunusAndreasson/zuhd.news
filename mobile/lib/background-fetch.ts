import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { API_BASE } from '../constants/theme';
import { feedCache, fetchFeed } from './feed-source';
import { fetchJson } from './fetchJson';
import { isMetaResponse } from './validate';

const TASK_NAME = 'ZUHD_BACKGROUND_FETCH';

/** Fetch feed if new content available. Returns true if cache was updated. */
async function fetchAndCacheIfNew(): Promise<boolean> {
  try {
    const meta = await fetchJson(`${API_BASE}/api/meta.json`, isMetaResponse, {
      cache: 'no-store',
    });
    const cached = await feedCache.read();
    if (cached?.generated === meta.generated) return false;
  } catch {
    return false;
  }

  try {
    // `fetchFeed` writes through to `feedCache` and only resolves once the
    // write has completed. That matters here: mobile operating systems may
    // suspend the JS runtime as soon as this task resolves, so a deferred
    // fire-and-forget write can be lost.
    await fetchFeed({ cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

// Must be called at module top level before React renders
TaskManager.defineTask(TASK_NAME, async () => {
  await fetchAndCacheIfNew();
  return BackgroundTask.BackgroundTaskResult.Success;
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
