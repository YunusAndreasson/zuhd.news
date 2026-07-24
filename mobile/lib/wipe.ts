import Storage from 'expo-sqlite/kv-store';
import { clearBookmarks } from './bookmark-store';
import { resetDataUsage } from './data-usage';
import { feedCache } from './feed-source';
import { resetOnboarding } from './onboarding-store';
import { queryClient } from './query-client';
import { resetReviewState } from './store-review';

/**
 * Erase everything the app has stored about this reader's use of it.
 *
 * The privacy page tells the reader that all of it lives on their device and
 * none of it is uploaded. This is the control that makes that inspectable
 * rather than merely stated: they can empty it and watch the app start over.
 *
 * Deliberately NOT erased: display preferences (appearance, text size,
 * haptics) and the notification setting. Those are the reader's choices about
 * how the app should look and behave, not a record of what they read — and
 * silently resetting someone's text size is a hostile way to honour a privacy
 * request. The copy on the erase control says so.
 *
 * Every key listed here is also documented in the privacy page's "on this
 * device" section. If you add persistent state, add it to both.
 */
const KEYS = [
  'zuhd_last_seen', // where the "caught up" line falls
  'zuhd_briefing_pos', // audio playback position
  'zuhd_briefing_date', // which briefing that position belongs to
  'zuhd_review_count', // article snaps since the last rating prompt
  'zuhd_review_prompted', // when the rating prompt was last shown
  'REACT_QUERY_OFFLINE_CACHE', // the persisted article cache
];

export async function eraseLocalData(): Promise<void> {
  // In-memory stores first, so nothing flushes itself back over the cleared
  // keys afterwards.
  clearBookmarks();
  resetOnboarding();
  resetReviewState();
  resetDataUsage();
  queryClient.clear();

  await Promise.all([feedCache.clear(), ...KEYS.map((k) => Storage.removeItem(k).catch(() => {}))]);
}
