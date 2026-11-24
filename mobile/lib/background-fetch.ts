import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import {
  applyArrival,
  arrivalGeneration,
  FEED_QUERY_KEY,
  fetchArrival,
  probeGenerated,
} from './arrival';
import { flushKnown } from './fresh-store';
import {
  immediatePersister,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  queryClient,
} from './query-client';
import { getLastSeenAt } from './storage';
import { refreshWidget } from './widget-store';

const TASK_NAME = 'ZUHD_BACKGROUND_FETCH';
let unsavedGeneration: number | undefined;

async function saveCompletedBuild() {
  const noted = flushKnown();
  await persistQueryClientSave({
    queryClient,
    persister: immediatePersister,
    buster: PERSIST_BUSTER,
  });
  if (!noted) throw new Error('Could not persist known stories');
  unsavedGeneration = undefined;
}

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
async function applyNewBuild(controller: AbortController): Promise<boolean> {
  const generation = arrivalGeneration();
  if (unsavedGeneration === generation) await saveCompletedBuild();
  if (queryClient.getQueryData(FEED_QUERY_KEY) === undefined) {
    await persistQueryClientRestore({
      queryClient,
      persister: immediatePersister,
      maxAge: PERSIST_MAX_AGE_MS,
      buster: PERSIST_BUSTER,
    });
  }
  // A feed file alone may have landed before an interrupted layer download.
  // Only a complete query cache can satisfy the probe.
  const build = await probeGenerated(controller.signal);
  if (build === queryClient.getQueryData(FEED_QUERY_KEY)?.generated) {
    if (
      Platform.OS === 'android' &&
      !controller.signal.aborted &&
      generation === arrivalGeneration()
    )
      await refreshWidget();
    return false;
  }
  const lastSeenAt = await getLastSeenAt();
  if (controller.signal.aborted) throw new Error('Background refresh expired');
  if (generation !== arrivalGeneration()) return false;

  // A completed arrival writes through to `feedCache` and resolves only once the
  // write has completed: the OS may suspend the runtime as soon as this task
  // resolves, so nothing here may be left to a later tick.
  const arrival = await fetchArrival(queryClient, build, controller.signal);
  if (generation !== arrivalGeneration()) return false;
  applyArrival(queryClient, arrival, { lastSeenAt, background: true });
  unsavedGeneration = generation;
  await saveCompletedBuild();
  return true;
}

// Must be called at module top level before React renders
TaskManager.defineTask(TASK_NAME, async () => {
  const controller = new AbortController();
  const expiry =
    Platform.OS === 'ios'
      ? BackgroundTask.addExpirationListener(() => controller.abort())
      : undefined;
  try {
    await applyNewBuild(controller);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // Offline or a failed fetch: the next run, return or pull tries again.
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    expiry?.remove();
  }
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
