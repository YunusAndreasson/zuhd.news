import type { FeedResponse } from '@shared/types';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { applyArrival, FEED_QUERY_KEY, fetchArrival, probeGenerated } from './arrival';
import { feedCache } from './feed-source';
import { flushKnown } from './fresh-store';
import { PERSIST_MAX_AGE_MS, persister, queryClient } from './query-client';
import { getLastSeenAt } from './storage';

const TASK_NAME = 'ZUHD_BACKGROUND_FETCH';

/**
 * Do a return's waiting while nobody is looking.
 *
 * It fetched the feed alone, to disk, and nothing read that copy but a cold
 * launch: a warm return downloaded the feed again, and every snapshot — the
 * strip, the straits, the marks — arrived after the stories, on the network,
 * with the reader watching. Now it takes the whole arrival (`lib/arrival.ts`)
 * and applies it to the app's own query client:
 *
 *   - **The app alive in the background**: the river reorders and the
 *     snapshots land while it is hidden; the return's probe finds the build
 *     already on screen, and only where the reader lands is left to decide.
 *   - **A headless run**: nothing is mounted, so the persisted cache is
 *     restored first — saving from an empty client would drop every other
 *     query in it — and saved after, and the next launch opens complete.
 *
 * Returns true when a new build was applied.
 */
async function applyNewBuild(): Promise<boolean> {
  let current = queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY);
  const headless = current === undefined;
  if (headless) {
    await persistQueryClientRestore({ queryClient, persister, maxAge: PERSIST_MAX_AGE_MS });
    current = queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY);
  }
  const onScreen = current?.generated ?? (await feedCache.read())?.generated;
  if ((await probeGenerated()) === onScreen) return false;

  // `fetchFeed` writes through to `feedCache` and resolves only once the
  // write has completed: the OS may suspend the runtime as soon as this task
  // resolves, so nothing here may be left to a later tick.
  const arrival = await fetchArrival(queryClient);
  applyArrival(queryClient, arrival, { lastSeenAt: await getLastSeenAt() });
  // The cache holds the data at once; the flush that notes which stories are
  // new runs on the next macrotask, and has to have run before it is saved.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await persistQueryClientSave({ queryClient, persister });
  flushKnown();
  return true;
}

// Must be called at module top level before React renders
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await applyNewBuild();
  } catch {
    // Offline or a failed fetch: the next run, return or pull tries again.
  }
  return BackgroundTask.BackgroundTaskResult.Success;
});

export async function registerBackgroundTask(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      // An hour, not four: the pipeline publishes five times a day at
      // irregular hours, and a four-hour interval routinely caught a cycle
      // hours late. A run with nothing new is one ~0.2KB probe, and the OS
      // still decides when a run actually happens.
      minimumInterval: 60,
    });
  } catch {
    // Background task not available (e.g. Expo Go)
  }
}
