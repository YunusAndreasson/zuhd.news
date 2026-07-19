import { getItemAsync } from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';
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
    let [countStr, promptedStr] = await Promise.all([
      Storage.getItem(COUNT_KEY),
      Storage.getItem(PROMPTED_KEY),
    ]);
    // One-time migration from the earlier encrypted store. Migrate each key
    // independently so a partial SQLite write cannot hide the other legacy
    // value. These counters are UX state, not secrets.
    if (countStr === null || promptedStr === null) {
      const [legacyCount, legacyPrompted] = await Promise.all([
        countStr === null ? getItemAsync(COUNT_KEY) : Promise.resolve(null),
        promptedStr === null ? getItemAsync(PROMPTED_KEY) : Promise.resolve(null),
      ]);
      countStr ??= legacyCount;
      promptedStr ??= legacyPrompted;
      await Promise.all([
        legacyCount === null ? Promise.resolve() : Storage.setItem(COUNT_KEY, legacyCount),
        legacyPrompted === null ? Promise.resolve() : Storage.setItem(PROMPTED_KEY, legacyPrompted),
      ]);
    }
    memCount = parseInt(countStr ?? '0', 10) || 0;
    memPromptedAt = parseInt(promptedStr ?? '0', 10) || 0;
  } catch {
    memCount = 0;
  }
}

/**
 * Call after a "signature interaction" (e.g. article snap).
 * Increments a counter and prompts for review once the threshold is met,
 * respecting a 90-day cooldown between prompts.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    await hydrate();

    memCount += 1;
    // Write-through: fire and forget — only the in-memory value matters for gating
    Storage.setItem(COUNT_KEY, String(memCount)).catch(() => {});

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
