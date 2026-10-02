import { createSlugTimeStore } from './slug-time-store';

/**
 * Which stories the reader has found.
 *
 * A story is found when it is opened from anywhere — its mark on the globe,
 * its row in the sheet, a page turned to in the reader. The globe stops
 * drawing a found story's mark, and that is the whole game: what is still lit
 * is what you have not seen yet.
 *
 * Kept, capped and pruned as `slug-time-store.ts` keeps every such set —
 * pruning is lazy there on purpose, so a partial payload cannot relight the
 * globe.
 */
const store = createSlugTimeStore('zuhd_found_v1', 600);

/** Returns true when this call found the story; false if it already was. */
export const markFound = store.mark;
/** Drop found slugs that have left the feed and are older than two weeks. */
export const pruneFound = store.prune;
/** Erase all progress. Immediate, like `clearBookmarks`. */
export const clearFound = store.clear;
/** Flush any pending write — call from app-background transitions. */
export const flushFound = store.flush;
export const getSnapshot = store.getSnapshot;
export const useFoundSlugs = store.useSlugs;
