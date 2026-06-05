import { getItemAsync, setItemAsync } from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';
import { DAY_MS } from './time';

const COUNT_KEY = 'zuhd_review_count';
const PROMPTED_KEY = 'zuhd_review_prompted';

const ARTICLE_THRESHOLD = 20;
const COOLDOWN_MS = 90 * DAY_MS; // 90 days

// In-memory cache — loaded once from SecureStore, then served from RAM.
// Avoids encrypted storage reads on every article snap.
let memCount = -1; // -1 = not yet loaded
let memPromptedAt = 0;
let hydrated = false;

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const [countStr, promptedStr] = await Promise.all([
      getItemAsync(COUNT_KEY),
      getItemAsync(PROMPTED_KEY),
    ]);
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
    setItemAsync(COUNT_KEY, String(memCount)).catch(() => {});

    if (memCount < ARTICLE_THRESHOLD) return;

    // Cooldown check
    if (memPromptedAt && Date.now() - memPromptedAt < COOLDOWN_MS) return;

    if (!(await StoreReview.hasAction())) return;

    await StoreReview.requestReview();
    memPromptedAt = Date.now();
    memCount = 0;
    await Promise.all([
      setItemAsync(PROMPTED_KEY, String(memPromptedAt)),
      setItemAsync(COUNT_KEY, '0'),
    ]);
  } catch {}
}
