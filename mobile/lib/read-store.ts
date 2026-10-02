import { createSlugTimeStore } from './slug-time-store';

/** Read progress is separate from opening a story or finding its globe marker:
 * a story is read once it has been in front of the reader for
 * `READ_DWELL_MS`, at rest or open (`useReadTracking`), and the dock's track
 * draws it as a hairline. Persisted locally, bounded to 600 stories, and
 * pruned only after two weeks outside the live feed (`slug-time-store.ts`).
 * Never migrate found stories into this state. */
const store = createSlugTimeStore('zuhd_read_v1', 600);

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
