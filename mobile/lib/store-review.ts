import Storage from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';
import { readMigrated } from './legacy-store';
import { DAY_MS } from './time';

const COUNT_KEY = 'zuhd_review_count';
const PROMPTED_KEY = 'zuhd_review_prompted';

const ARTICLE_THRESHOLD = 20;
const COOLDOWN_MS = 90 * DAY_MS; // 90 days

// In-memory cache — loaded once from SQLite kv-store, then served from RAM.
type Counters = { count: number; promptedAt: number; requesting: boolean };
let counters: Promise<Counters> | undefined;

function hydrate(): Promise<Counters> {
  if (counters) return counters;
  const pending = Promise.all([
    readMigrated(COUNT_KEY, { secureKey: COUNT_KEY }),
    readMigrated(PROMPTED_KEY, { secureKey: PROMPTED_KEY }),
  ])
    .then(([count, prompted]) => ({
      count: Number.parseInt(count ?? '0', 10) || 0,
      promptedAt: Number.parseInt(prompted ?? '0', 10) || 0,
      requesting: false,
    }))
    .catch((error: unknown) => {
      if (counters === pending) counters = undefined;
      throw error;
    });
  counters = pending;
  return pending;
}

/** Drop the in-memory prompt counters. The caller is responsible for the
 *  persisted keys; without this the RAM copy would immediately write itself
 *  back over them. Used by the privacy page's erase control. */
export function resetReviewState(): void {
  counters = Promise.resolve({ count: 0, promptedAt: 0, requesting: false });
}

/**
 * Count one story swiped to. Nothing is asked here: the swipe is the middle
 * of reading, and a dialog over it interrupts the reader to talk about the
 * app.
 */
export async function recordStorySwipe(): Promise<void> {
  try {
    const pending = hydrate();
    const state = await pending;
    if (pending !== counters) return;
    state.count += 1;
    // Write-through: fire and forget — only the in-memory value matters for gating
    Storage.setItem(COUNT_KEY, String(state.count)).catch(() => {});
  } catch {}
}

/**
 * Ask for a rating where reading has stopped on its own: the end of the day's
 * stories. Only after `ARTICLE_THRESHOLD` swipes since the last ask, and at
 * most once per `COOLDOWN_MS`.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    const pending = hydrate();
    const state = await pending;
    if (pending !== counters || state.requesting || state.count < ARTICLE_THRESHOLD) return;
    if (state.promptedAt && Date.now() - state.promptedAt < COOLDOWN_MS) return;

    state.requesting = true;
    try {
      if (!(await StoreReview.hasAction()) || pending !== counters) return;
      await StoreReview.requestReview();
      if (pending !== counters) return;
      state.promptedAt = Date.now();
      state.count = 0;
      await Storage.multiSet([
        [PROMPTED_KEY, String(state.promptedAt)],
        [COUNT_KEY, '0'],
      ]);
    } finally {
      state.requesting = false;
    }
  } catch {}
}
