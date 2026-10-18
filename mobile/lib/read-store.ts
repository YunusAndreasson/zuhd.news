import Storage from 'expo-sqlite/kv-store';
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

/** Returns true when this call marked the story read; false if it already was. */
export const markRead = store.mark;
/** Drop read slugs that have left the feed and are older than two weeks. */
export const pruneRead = store.prune;
/** Erase all progress. Immediate, like `clearBookmarks`. */
export const clearRead = store.clear;
/** Flush any pending write — call from app-background transitions. */
export const flushRead = store.flush;
export const getSnapshot = store.getSnapshot;
export const useReadSlugs = store.useSlugs;
