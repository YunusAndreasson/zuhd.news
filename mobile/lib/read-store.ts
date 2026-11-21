import Storage from 'expo-sqlite/kv-store';
import { ANALYTICS_EVENTS } from '../constants/analytics';
import { analytics } from './analytics';
import { isReadMilestone } from './analytics-buckets';
import { claimFirst } from './firsts';
import { createSlugTimeStore } from './slug-time-store';

/** The stories the reader has seen: the one notion of it the screen has. A
 * story is read once it has been in front of the reader for `READ_DWELL_MS`,
 * at rest or open (`useReadTracking`), or at once when it is opened — its
 * light tapped, its card grown. The dock's track draws it as a hairline, the
 * globe as a hollow ring, and `caught up` counts it. Persisted locally, keeps
 * 600 historical records with live stories protected, and prunes only after
 * two weeks outside the live feed (`slug-time-store.ts`). */
const store = createSlugTimeStore('zuhd_read_v1', 600);

/** The set of stories opened, kept apart from this one until the globe's
 *  lights followed what was read. Nothing reads it now. */
const RETIRED_FOUND_KEY = 'zuhd_found_v1';

/** Remove the retired set from the device. Every launch asks, and so does an
 *  erase (`wipe.ts`); removing a key that is gone costs nothing. */
export function dropRetiredFound(): void {
  Storage.removeItem(RETIRED_FOUND_KEY).catch(() => {});
}

// ---------------------------------------------------------------------------
// A visit's reading: from launch, or from an open after five minutes away
// (`App Opened`), the stories newly read. Kept in memory only.
// ---------------------------------------------------------------------------

let visitReads = 0;
/** Whether this visit is the first in which the install read a story. */
let visitFirstTime = false;
const visitListeners = new Set<(count: number) => void>();

/** Returns true when this call marked the story read; false if it already was.
 *  A story newly read counts toward the visit's `Stories Read`. */
export function markRead(slug: string, now?: number): boolean {
  const newly = store.mark(slug, now);
  if (!newly) return false;
  visitReads += 1;
  if (visitReads === 1) visitFirstTime = claimFirst('read');
  if (isReadMilestone(visitReads)) {
    void analytics.track(ANALYTICS_EVENTS.STORIES_READ, {
      count: visitReads,
      first_time: visitFirstTime,
    });
  }
  for (const listener of visitListeners) listener(visitReads);
  return true;
}

/** A new visit (`App Opened`, warm): its count starts again. */
export function startReadingVisit(): void {
  visitReads = 0;
  visitFirstTime = false;
}

/** Told the visit's count each time a story is newly read. Returns the unsubscribe. */
export function onVisitRead(listener: (count: number) => void): () => void {
  visitListeners.add(listener);
  return () => {
    visitListeners.delete(listener);
  };
}

/** Drop read slugs that have left the feed and are older than two weeks. */
export const pruneRead = store.prune;
/** Erase all progress. Immediate, like `clearBookmarks`. */
export const clearRead = store.clear;
/** Flush any pending write — call from app-background transitions. */
export const flushRead = store.flush;
export const getSnapshot = store.getSnapshot;
export const useReadSlugs = store.useSlugs;
