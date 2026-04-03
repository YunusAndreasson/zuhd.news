import { getItemAsync, setItemAsync } from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

const COUNT_KEY = 'zuhd_review_count';
const PROMPTED_KEY = 'zuhd_review_prompted';

const ARTICLE_THRESHOLD = 20;
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Call after a "signature interaction" (e.g. article snap).
 * Increments a counter and prompts for review once the threshold is met,
 * respecting a 90-day cooldown between prompts.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    const [countStr, promptedStr] = await Promise.all([
      getItemAsync(COUNT_KEY),
      getItemAsync(PROMPTED_KEY),
    ]);

    const count = (parseInt(countStr ?? '0', 10) || 0) + 1;
    await setItemAsync(COUNT_KEY, String(count));

    if (count < ARTICLE_THRESHOLD) return;

    // Cooldown check
    if (promptedStr) {
      const lastPrompted = parseInt(promptedStr, 10) || 0;
      if (Date.now() - lastPrompted < COOLDOWN_MS) return;
    }

    if (!(await StoreReview.hasAction())) return;

    await StoreReview.requestReview();
    await setItemAsync(PROMPTED_KEY, String(Date.now()));
    // Reset counter so the next prompt requires another 20 articles
    await setItemAsync(COUNT_KEY, '0');
  } catch {}
}
