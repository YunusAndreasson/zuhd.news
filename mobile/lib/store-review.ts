import Storage from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';
import { readMigrated } from './legacy-store';
import { DAY_MS } from './time';

const COUNT_KEY = 'zuhd_review_count';
const PROMPTED_KEY = 'zuhd_review_prompted';

const ARTICLE_THRESHOLD = 20;
const COOLDOWN_MS = 90 * DAY_MS; // 90 days

// In-memory cache — loaded once from SQLite kv-store, then served from RAM.
let memCount = -1; // -1 = not yet loaded
let memPromptedAt = 0;
let hydrated = false;

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    // The earlier encrypted store kept each under the same name. Each key
    // migrates on its own, so a partial SQLite write cannot hide the other
    // legacy value. These counters are UX state, not secrets.
    const [countStr, promptedStr] = await Promise.all([
      readMigrated(COUNT_KEY, { secureKey: COUNT_KEY }),
      readMigrated(PROMPTED_KEY, { secureKey: PROMPTED_KEY }),
    ]);
    memCount = parseInt(countStr ?? '0', 10) || 0;
    memPromptedAt = parseInt(promptedStr ?? '0', 10) || 0;
  } catch {
    memCount = 0;
  }
}

/** Drop the in-memory prompt counters. The caller is responsible for the
 *  persisted keys; without this the RAM copy would immediately write itself
 *  back over them. Used by the privacy page's erase control. */
export function resetReviewState(): void {
  memCount = 0;
  memPromptedAt = 0;
  hydrated = true; // nothing left to hydrate; don't re-read the cleared keys
}

/**
 * Count one story swiped to. Nothing is asked here: the swipe is the middle
 * of reading, and a dialog over it interrupts the reader to talk about the
 * app.
 */
export async function recordStorySwipe(): Promise<void> {
  try {
    await hydrate();
    memCount += 1;
    // Write-through: fire and forget — only the in-memory value matters for gating
    Storage.setItem(COUNT_KEY, String(memCount)).catch(() => {});
  } catch {}
}

/**
 * Ask for a rating where reading has stopped on its own: the end of the day's
 * stories. Only after `ARTICLE_THRESHOLD` swipes since the last ask, and at
 * most once per `COOLDOWN_MS`.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    await hydrate();

    if (memCount < ARTICLE_THRESHOLD) return;

    // Cooldown check
    if (memPromptedAt && Date.now() - memPromptedAt < COOLDOWN_MS) return;

    if (!(await StoreReview.hasAction())) return;

    await StoreReview.requestReview();
    memPromptedAt = Date.now();
    memCount = 0;
    await Promise.all([
      Storage.setItem(PROMPTED_KEY, String(memPromptedAt)),
      Storage.setItem(COUNT_KEY, '0'),
    ]);
  } catch {}
}
