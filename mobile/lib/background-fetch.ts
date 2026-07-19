import type { FeedResponse } from '@shared/types';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { API_BASE } from '../constants/theme';
import { fetchJson } from './fetchJson';
import { createJsonCache } from './json-cache';
import { isFeedResponse, isMetaResponse } from './validate';

const TASK_NAME = 'ZUHD_BACKGROUND_FETCH';
const feedCache = createJsonCache<FeedResponse>('zuhd-feed.json', isFeedResponse);

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
    const feed = await fetchJson(`${API_BASE}/api/feed.json`, isFeedResponse, {
      timeoutMs: 10000,
      cache: 'no-store',
    });
    // Do not report task success until the cache is actually durable. Mobile
    // operating systems may suspend the JS runtime as soon as this task
    // resolves, so a deferred fire-and-forget write can be lost.
    await feedCache.write(feed);
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
